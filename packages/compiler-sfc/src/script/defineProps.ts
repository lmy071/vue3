/**
 * defineProps.ts —— defineProps 编译处理
 *
 * ## 功能概述
 * 处理 `<script setup>` 中的 `defineProps()` 和 `withDefaults()` 宏。
 *
 * ## defineProps 调用形式
 *
 * ```
 * // 运行时声明
 * defineProps({ msg: String, count: { type: Number, required: true } })
 *
 * // 纯类型声明
 * defineProps<{ msg: string; count: number }>()
 *
 * // 类型 + withDefaults
 * const props = withDefaults(defineProps<Props>(), { count: 0 })
 *
 * // 解构（Vue 3.5+）
 * const { msg, count = 0 } = defineProps<{ msg: string; count?: number }>()
 * ```
 *
 * ## 核心流程
 *
 * ### processDefineProps
 * 1. 检测 `defineProps(...)` 调用
 * 2. 区分类型声明 vs 运行时声明（互斥）
 * 3. 从运行时声明提取 prop keys → 注册为 PROPS 绑定
 * 4. 调用 processPropsDestructure 处理解构
 *
 * ### processWithDefaults
 * 1. 检测 `withDefaults()` 包装
 * 2. 内部递归调用 processDefineProps
 * 3. 提取默认值表达式
 * 4. 警告解构 + withDefaults 同时使用（互斥）
 *
 * ### genRuntimeProps（代码生成）
 * - **运行时声明**：直接使用原始声明，接入 mergeDefaults + mergeModels
 * - **类型声明**：从类型推断运行时 prop 声明（extractRuntimeProps）
 * - **解构默认值**：生成 factory wrapper（如 `() => (value)`）
 *
 * ### extractRuntimeProps
 * 从 TS 类型声明推断运行时 props：
 * - resolveTypeElements → 解析类型元素
 * - inferRuntimeType → 映射到运行时类型（String/Number/Boolean…）
 * - genRuntimePropFromType → 生成单个 prop 的运行时声明
 *
 * ## Prop 声明生成策略
 *
 * | 条件 | 开发环境 | 生产环境 |
 * |------|----------|----------|
 * | 无默认值 | `{ type: [...], required: true }` | `{}` |
 * | Boolean 类型 | 保留 type | 保留 type（#4783） |
 * | Function + 默认值 | 保留 type | 保留 type（#7111） |
 * | CustomElement | 保留 type | 保留 type（#8989） |
 *
 * ## mergeDefaults / mergeModels
 *
 * - **mergeDefaults**：合并解构默认值或 withDefaults 到 props 声明
 * - **mergeModels**：合并 defineModel 生成的 props 到 props 声明
 *
 * ## hasStaticWithDefaults
 *
 * 判断 withDefaults 的参数是否是纯静态对象字面量。
 * 是 → 可直接生成默认值声明（优化）
 * 否 → 需回退到运行时 mergeDefaults
 */

import type {
  Expression,
  LVal,
  Node,
  ObjectExpression,
  ObjectMethod,
  ObjectProperty,
} from '@babel/types'
import { BindingTypes, isFunctionType, unwrapTSNode } from '@vue/compiler-dom'
import type { ScriptCompileContext } from './context'
import {
  type TypeResolveContext,
  inferRuntimeType,
  resolveTypeElements,
} from './resolveType'
import {
  UNKNOWN_TYPE,
  concatStrings,
  getEscapedPropName,
  isCallOf,
  isLiteralNode,
  resolveObjectKey,
  toRuntimeTypeString,
} from './utils'
import { genModelProps } from './defineModel'
import { getObjectOrArrayExpressionKeys } from './analyzeScriptBindings'
import { processPropsDestructure } from './definePropsDestructure'

export const DEFINE_PROPS = 'defineProps'
export const WITH_DEFAULTS = 'withDefaults'

export interface PropTypeData {
  key: string
  type: string[]
  required: boolean
  skipCheck: boolean
}

export type PropsDestructureBindings = Record<
  string, // public prop key
  {
    local: string // local identifier, may be different
    default?: Expression
  }
>

export function processDefineProps(
  ctx: ScriptCompileContext,
  node: Node,
  declId?: LVal,
  isWithDefaults = false,
): boolean {
  if (!isCallOf(node, DEFINE_PROPS)) {
    return processWithDefaults(ctx, node, declId)
  }

  if (ctx.hasDefinePropsCall) {
    ctx.error(`duplicate ${DEFINE_PROPS}() call`, node)
  }
  ctx.hasDefinePropsCall = true
  ctx.propsRuntimeDecl = node.arguments[0]

  // 注册 props 绑定
  if (ctx.propsRuntimeDecl) {
    for (const key of getObjectOrArrayExpressionKeys(ctx.propsRuntimeDecl)) {
      if (!(key in ctx.bindingMetadata)) {
        ctx.bindingMetadata[key] = BindingTypes.PROPS
      }
    }
  }

  // 有类型参数 → 从类型推断运行时类型
  if (node.typeParameters) {
    if (ctx.propsRuntimeDecl) {
      ctx.error(
        `${DEFINE_PROPS}() cannot accept both type and non-type arguments ` +
          `at the same time. Use one or the other.`,
        node,
      )
    }
    ctx.propsTypeDecl = node.typeParameters.params[0]
  }

  // 处理 props 解构
  if (!isWithDefaults && declId && declId.type === 'ObjectPattern') {
    processPropsDestructure(ctx, declId)
  }

  ctx.propsCall = node
  ctx.propsDecl = declId

  return true
}

function processWithDefaults(
  ctx: ScriptCompileContext,
  node: Node,
  declId?: LVal,
): boolean {
  if (!isCallOf(node, WITH_DEFAULTS)) {
    return false
  }
  if (
    !processDefineProps(
      ctx,
      node.arguments[0],
      declId,
      true /* isWithDefaults */,
    )
  ) {
    ctx.error(
      `${WITH_DEFAULTS}' first argument must be a ${DEFINE_PROPS} call.`,
      node.arguments[0] || node,
    )
  }

  if (ctx.propsRuntimeDecl) {
    ctx.error(
      `${WITH_DEFAULTS} can only be used with type-based ` +
        `${DEFINE_PROPS} declaration.`,
      node,
    )
  }
  if (declId && declId.type === 'ObjectPattern') {
    ctx.warn(
      `${WITH_DEFAULTS}() is unnecessary when using destructure with ${DEFINE_PROPS}().\n` +
        `Reactive destructure will be disabled when using withDefaults().\n` +
        `Prefer using destructure default values, e.g. const { foo = 1 } = defineProps(...). `,
      node.callee,
    )
  }
  ctx.propsRuntimeDefaults = node.arguments[1]
  if (!ctx.propsRuntimeDefaults) {
    ctx.error(`The 2nd argument of ${WITH_DEFAULTS} is required.`, node)
  }
  ctx.propsCall = node

  return true
}

export function genRuntimeProps(ctx: ScriptCompileContext): string | undefined {
  let propsDecls: undefined | string

  if (ctx.propsRuntimeDecl) {
    propsDecls = ctx.getString(ctx.propsRuntimeDecl).trim()
    if (ctx.propsDestructureDecl) {
      const defaults: string[] = []
      for (const key in ctx.propsDestructuredBindings) {
        const d = genDestructuredDefaultValue(ctx, key)
        const finalKey = getEscapedPropName(key)
        if (d)
          defaults.push(
            `${finalKey}: ${d.valueString}${
              d.needSkipFactory ? `, __skip_${finalKey}: true` : ``
            }`,
          )
      }
      if (defaults.length) {
        propsDecls = `/*@__PURE__*/${ctx.helper(
          `mergeDefaults`,
        )}(${propsDecls}, {\n  ${defaults.join(',\n  ')}\n})`
      }
    }
  } else if (ctx.propsTypeDecl) {
    propsDecls = extractRuntimeProps(ctx)
  }

  const modelsDecls = genModelProps(ctx)

  if (propsDecls && modelsDecls) {
    return `/*@__PURE__*/${ctx.helper(
      'mergeModels',
    )}(${propsDecls}, ${modelsDecls})`
  } else {
    return modelsDecls || propsDecls
  }
}

/**
 * 从 TS 类型声明推断运行时 props 声明
 */
export function extractRuntimeProps(
  ctx: TypeResolveContext,
): string | undefined {
  const props = resolveRuntimePropsFromType(ctx, ctx.propsTypeDecl!)
  if (!props.length) {
    return
  }

  const propStrings: string[] = []
  const hasStaticDefaults = hasStaticWithDefaults(ctx)

  for (const prop of props) {
    propStrings.push(genRuntimePropFromType(ctx, prop, hasStaticDefaults))
    // 注册绑定
    if ('bindingMetadata' in ctx && !(prop.key in ctx.bindingMetadata)) {
      ctx.bindingMetadata[prop.key] = BindingTypes.PROPS
    }
  }

  let propsDecls = `{
    ${propStrings.join(',\n    ')}\n  }`

  if (ctx.propsRuntimeDefaults && !hasStaticDefaults) {
    propsDecls = `/*@__PURE__*/${ctx.helper(
      'mergeDefaults',
    )}(${propsDecls}, ${ctx.getString(ctx.propsRuntimeDefaults)})`
  }

  return propsDecls
}

/**
 * 从 TS 类型解析运行时 prop 类型数据
 */
function resolveRuntimePropsFromType(
  ctx: TypeResolveContext,
  node: Node,
): PropTypeData[] {
  const props: PropTypeData[] = []
  const elements = resolveTypeElements(ctx, node)
  for (const key in elements.props) {
    const e = elements.props[key]
    let type = inferRuntimeType(ctx, e)
    let skipCheck = false
    // 包含 Unknown 类型 → 特殊处理
    if (type.includes(UNKNOWN_TYPE)) {
      if (type.includes('Boolean') || type.includes('Function')) {
        type = type.filter(t => t !== UNKNOWN_TYPE)
        skipCheck = true
      } else {
        type = ['null']
      }
    }
    props.push({
      key,
      required: !e.optional,
      type: type || [`null`],
      skipCheck,
    })
  }
  return props
}

/**
 * 从类型数据生成单个 prop 的运行时声明
 */
function genRuntimePropFromType(
  ctx: TypeResolveContext,
  { key, required, type, skipCheck }: PropTypeData,
  hasStaticDefaults: boolean,
): string {
  let defaultString: string | undefined
  const destructured = genDestructuredDefaultValue(ctx, key, type)
  if (destructured) {
    defaultString = `default: ${destructured.valueString}${
      destructured.needSkipFactory ? `, skipFactory: true` : ``
    }`
  } else if (hasStaticDefaults) {
    const prop = (ctx.propsRuntimeDefaults as ObjectExpression).properties.find(
      node => {
        if (node.type === 'SpreadElement') return false
        return resolveObjectKey(node.key, node.computed) === key
      },
    ) as ObjectProperty | ObjectMethod
    if (prop) {
      if (prop.type === 'ObjectProperty') {
        // 静态默认值
        defaultString = `default: ${ctx.getString(prop.value)}`
      } else {
        // 方法形式的默认值
        let paramsString = ''
        if (prop.params.length) {
          const start = prop.params[0].start
          const end = prop.params[prop.params.length - 1].end
          paramsString = ctx.getString({ start, end } as Node)
        }
        defaultString = `${prop.async ? 'async ' : ''}${
          prop.kind !== 'method' ? `${prop.kind} ` : ''
        }default(${paramsString}) ${ctx.getString(prop.body)}`
      }
    }
  }

  const finalKey = getEscapedPropName(key)
  if (!ctx.options.isProd) {
    // 开发环境：完整类型 + 校验元数据
    return `${finalKey}: { ${concatStrings([
      `type: ${toRuntimeTypeString(type)}`,
      `required: ${required}`,
      skipCheck && 'skipCheck: true',
      defaultString,
    ])} }`
  } else if (
    type.some(
      el =>
        el === 'Boolean' ||
        ((!hasStaticDefaults || defaultString) && el === 'Function'),
    )
  ) {
    // #4783 Boolean：必须保留 type
    // #7111 Function + 默认值：需保留 type
    return `${finalKey}: { ${concatStrings([
      `type: ${toRuntimeTypeString(type)}`,
      defaultString,
    ])} }`
  } else {
    // #8989 自定义元素：始终保留 type
    if (ctx.isCE) {
      if (defaultString) {
        return `${finalKey}: ${`{ ${defaultString}, type: ${toRuntimeTypeString(
          type,
        )} }`}`
      } else {
        return `${finalKey}: {type: ${toRuntimeTypeString(type)}}`
      }
    }

    // 生产环境：移除冗余校验
    return `${finalKey}: ${defaultString ? `{ ${defaultString} }` : `{}`}`
  }
}

/**
 * 判断 withDefaults 参数是否可静态分析
 *
 * 是 → 直接生成默认值声明（优化）
 * 否 → 回退到运行时 mergeDefaults
 */
function hasStaticWithDefaults(ctx: TypeResolveContext) {
  return !!(
    ctx.propsRuntimeDefaults &&
    ctx.propsRuntimeDefaults.type === 'ObjectExpression' &&
    ctx.propsRuntimeDefaults.properties.every(
      node =>
        node.type !== 'SpreadElement' &&
        (!node.computed || node.key.type.endsWith('Literal')),
    )
  )
}

/**
 * 生成解构默认值代码
 *
 * @returns valueString + needSkipFactory 标志
 */
function genDestructuredDefaultValue(
  ctx: TypeResolveContext,
  key: string,
  inferredType?: string[],
):
  | {
      valueString: string
      needSkipFactory: boolean
    }
  | undefined {
  const destructured = ctx.propsDestructuredBindings[key]
  const defaultVal = destructured && destructured.default
  if (defaultVal) {
    const value = ctx.getString(defaultVal)
    const unwrapped = unwrapTSNode(defaultVal)

    // 类型匹配检查（启发性）
    if (inferredType && inferredType.length && !inferredType.includes('null')) {
      const valueType = inferValueType(unwrapped)
      if (valueType && !inferredType.includes(valueType)) {
        ctx.error(
          `Default value of prop "${key}" does not match declared type.`,
          unwrapped,
        )
      }
    }

    // 函数或外部引用 → 跳过 factory 包装
    // 因为无法安全推断运行时 prop 类型是否包含 Function
    const needSkipFactory =
      !inferredType &&
      (isFunctionType(unwrapped) || unwrapped.type === 'Identifier')

    // 非字面量 → 需要 factory 包装防止对象/数组引用共享
    const needFactoryWrap =
      !needSkipFactory &&
      !isLiteralNode(unwrapped) &&
      !inferredType?.includes('Function')

    return {
      valueString: needFactoryWrap ? `() => (${value})` : value,
      needSkipFactory,
    }
  }
}

/**
 * 启发性类型推断（非完备）
 * 用于检测默认值与声明类型的不匹配
 */
function inferValueType(node: Node): string | undefined {
  switch (node.type) {
    case 'StringLiteral':
      return 'String'
    case 'NumericLiteral':
      return 'Number'
    case 'BooleanLiteral':
      return 'Boolean'
    case 'ObjectExpression':
      return 'Object'
    case 'ArrayExpression':
      return 'Array'
    case 'FunctionExpression':
    case 'ArrowFunctionExpression':
      return 'Function'
  }
}
