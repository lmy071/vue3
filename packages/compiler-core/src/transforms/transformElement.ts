/**
 * transformElement —— 元素转换器（编译器核心）
 *
 * ## 功能概述
 * 这是 Vue 编译器中最重要、最复杂的转换器。它将模板中的元素节点转换为
 * 完整的 VNode 调用表达式（VNodeCall），包括：
 *
 * 1. **标签解析**：字符串标签、动态组件、内置组件、用户组件的区分
 * 2. **Props 构建**：静态属性、指令展开、patchFlag 分析、动态 prop 追踪
 * 3. **Children 处理**：Slot 构建、单文本快速路径、Fragment 判断
 * 4. **指令处理**：内置指令转换 + 自定义指令运行时信息收集
 * 5. **PatchFlag 分析**：精确标记需要动态 patch 的属性类型
 *
 * ## 为什么在退出阶段执行
 * 需要等所有子表达式处理完毕（表达式已解析、指令已转换、插槽已构建），
 * 才能完整地知道 props 和 children 的具体情况，从而正确计算 patchFlag。
 *
 * ## PatchFlag 位标志
 * patchFlag 是 Vue 虚拟 DOM 优化的核心，通过位运算精确标记需要更新的内容：
 * - TEXT (1)      ：动态文本内容
 * - CLASS (2)     ：动态 class
 * - STYLE (4)     ：动态 style
 * - PROPS (8)     ：动态属性（非 class/style）
 * - FULL_PROPS (16)：动态 key（需要完整 props diff）
 * - NEED_HYDRATION (32)：需要 hydrate 事件
 * - NEED_PATCH (512)：至少需要 patch（有 ref/自定义指令）
 * - DYNAMIC_SLOTS (1024)：动态插槽
 */

import type { NodeTransform, TransformContext } from '../transform'
import {
  type ArrayExpression,
  type CallExpression,
  type ComponentNode,
  ConstantTypes,
  type DirectiveArguments,
  type DirectiveNode,
  type ElementNode,
  ElementTypes,
  type ExpressionNode,
  type JSChildNode,
  NodeTypes,
  type ObjectExpression,
  type Property,
  type TemplateTextChildNode,
  type VNodeCall,
  createArrayExpression,
  createCallExpression,
  createObjectExpression,
  createObjectProperty,
  createSimpleExpression,
  createVNodeCall,
} from '../ast'
import {
  PatchFlags,
  camelize,
  capitalize,
  isBuiltInDirective,
  isObject,
  isOn,
  isReservedProp,
  isSymbol,
} from '@vue/shared'
import { ErrorCodes, createCompilerError } from '../errors'
import {
  GUARD_REACTIVE_PROPS,
  KEEP_ALIVE,
  MERGE_PROPS,
  NORMALIZE_CLASS,
  NORMALIZE_PROPS,
  NORMALIZE_STYLE,
  RESOLVE_COMPONENT,
  RESOLVE_DIRECTIVE,
  RESOLVE_DYNAMIC_COMPONENT,
  SUSPENSE,
  TELEPORT,
  TO_HANDLERS,
  UNREF,
} from '../runtimeHelpers'
import {
  findProp,
  isCoreComponent,
  isStaticArgOf,
  isStaticExp,
  toValidAssetId,
} from '../utils'
import { buildSlots } from './vSlot'
import { getConstantType } from './cacheStatic'
import { BindingTypes } from '../options'
import {
  CompilerDeprecationTypes,
  checkCompatEnabled,
  isCompatEnabled,
} from '../compat/compatConfig'
import { processExpression } from './transformExpression'

/**
 * 指令 → runtime symbol 的映射
 *
 * 某些内置指令（如 v-model）的 return.needRuntime 可能返回一个 symbol，
 * 表示应该使用运行时导入的 helper 而不是 resolveDirective 调用。
 */
const directiveImportMap = new WeakMap<DirectiveNode, symbol>()

/**
 * 元素转换器主入口
 *
 * 返回一个退出阶段回调——确保所有子节点和指令都处理完毕后再构建 codegenNode。
 */
export const transformElement: NodeTransform = (node, context) => {
  return function postTransformElement() {
    node = context.currentNode!

    if (
      !(
        node.type === NodeTypes.ELEMENT &&
        (node.tagType === ElementTypes.ELEMENT ||
          node.tagType === ElementTypes.COMPONENT)
      )
    ) {
      return
    }

    const { tag, props } = node
    const isComponent = node.tagType === ElementTypes.COMPONENT

    // ============================================================
    // 1. 标签解析
    // ============================================================

    /**
     * 组件：通过 resolveComponentType 解析引用
     * 元素：直接使用 tag 字符串
     *
     * 解析结果可能是：
     * - 字符串（静态标签："div"）
     * - symbol（内置组件：Fragment、Teleport 等）
     * - CallExpression（resolveDynamicComponent 调用）
     */
    let vnodeTag = isComponent
      ? resolveComponentType(node as ComponentNode, context)
      : `"${tag}"`

    // 动态组件判断（resolveDynamicComponent 调用）
    const isDynamicComponent =
      isObject(vnodeTag) && vnodeTag.callee === RESOLVE_DYNAMIC_COMPONENT

    let vnodeProps: VNodeCall['props']
    let vnodeChildren: VNodeCall['children']
    let patchFlag: VNodeCall['patchFlag'] | 0 = 0
    let vnodeDynamicProps: VNodeCall['dynamicProps']
    let dynamicPropNames: string[] | undefined
    let vnodeDirectives: VNodeCall['directives']

    /**
     * 是否使用 Block 模式
     *
     * Block 是 Vue 3 的动态追踪机制——在 Block 内部的动态节点会被收集到
     * dynamicChildren 数组，从而在更新时精确定位需要 diff 的位置。
     *
     * 以下场景强制使用 Block：
     * - 动态组件（可能解析为普通元素）
     * - Teleport / Suspense（需要独立追踪）
     * - svg / foreignObject / math（需要正确的 isSVG flag：#639, #643）
     */
    let shouldUseBlock =
      isDynamicComponent ||
      vnodeTag === TELEPORT ||
      vnodeTag === SUSPENSE ||
      (!isComponent &&
        (tag === 'svg' || tag === 'foreignObject' || tag === 'math'))

    // ============================================================
    // 2. Props 构建
    // ============================================================
    if (props.length > 0) {
      const propsBuildResult = buildProps(
        node,
        context,
        undefined,
        isComponent,
        isDynamicComponent,
      )
      vnodeProps = propsBuildResult.props
      patchFlag = propsBuildResult.patchFlag
      dynamicPropNames = propsBuildResult.dynamicPropNames

      // 收集运行时指令
      const directives = propsBuildResult.directives
      vnodeDirectives =
        directives && directives.length
          ? (createArrayExpression(
              directives.map(dir => buildDirectiveArgs(dir, context)),
            ) as DirectiveArguments)
          : undefined

      // props 构建可能触发 shouldUseBlock（如动态 key、before-update hook）
      if (propsBuildResult.shouldUseBlock) {
        shouldUseBlock = true
      }
    }

    // ============================================================
    // 3. Children 处理
    // ============================================================
    if (node.children.length > 0) {
      if (vnodeTag === KEEP_ALIVE) {
        /**
         * KeepAlive 特殊处理
         *
         * KeepAlive 虽然是内置组件，但使用原始 children 而非 slot 函数。
         * 这样它可以在 Transition 或其他 HOC 内部正常工作。
         *
         * 需要：
         * 1. 强制 Block 模式（避免 children 被父 block 收集）
         * 2. 标记 DYNAMIC_SLOTS（确保每次都更新 raw children）
         */
        shouldUseBlock = true
        patchFlag |= PatchFlags.DYNAMIC_SLOTS
        if (__DEV__ && node.children.length > 1) {
          context.onError(
            createCompilerError(ErrorCodes.X_KEEP_ALIVE_INVALID_CHILDREN, {
              start: node.children[0].loc.start,
              end: node.children[node.children.length - 1].loc.end,
              source: '',
            }),
          )
        }
      }

      /**
       * 判断子节点是否应该构建为 Slots 对象
       *
       * 条件：
       * - 是组件
       * - 不是 Teleport（有专用的运行时处理）
       * - 不是 KeepAlive（已在上方特殊处理）
       */
      const shouldBuildAsSlots =
        isComponent &&
        vnodeTag !== TELEPORT &&
        vnodeTag !== KEEP_ALIVE

      if (shouldBuildAsSlots) {
        // 组件子节点 → 构建 slots 对象
        const { slots, hasDynamicSlots } = buildSlots(node, context)
        vnodeChildren = slots
        if (hasDynamicSlots) {
          patchFlag |= PatchFlags.DYNAMIC_SLOTS
        }
      } else if (node.children.length === 1 && vnodeTag !== TELEPORT) {
        /**
         * 单子节点优化
         *
         * 如果只有一个文本/插值/复合表达式子节点，直接传递该子节点
         * 而不是包裹在数组中。运行时对此有专门的快速路径。
         *
         * Teleport 除外——Teleport 始终使用数组 children。
         */
        const child = node.children[0]
        const type = child.type
        const hasDynamicTextChild =
          type === NodeTypes.INTERPOLATION ||
          type === NodeTypes.COMPOUND_EXPRESSION

        if (
          hasDynamicTextChild &&
          getConstantType(child, context) === ConstantTypes.NOT_CONSTANT
        ) {
          // 动态文本 → 标记 TEXT patch flag
          patchFlag |= PatchFlags.TEXT
        }

        if (hasDynamicTextChild || type === NodeTypes.TEXT) {
          vnodeChildren = child as TemplateTextChildNode
        } else {
          vnodeChildren = node.children
        }
      } else {
        vnodeChildren = node.children
      }
    }

    // 动态 prop 名称 → 字符串序列化
    if (dynamicPropNames && dynamicPropNames.length) {
      vnodeDynamicProps = stringifyDynamicPropNames(dynamicPropNames)
    }

    /**
     * 生成最终的 codegenNode
     *
     * createVNodeCall 生成 createVNode/createBlock 调用的 AST 节点。
     * 这是整个编译过程的最终产物——表示渲染函数中将执行的代码。
     */
    node.codegenNode = createVNodeCall(
      context,
      vnodeTag,
      vnodeProps,
      vnodeChildren,
      patchFlag === 0 ? undefined : patchFlag,
      vnodeDynamicProps,
      vnodeDirectives,
      !!shouldUseBlock,
      false /* disableTracking */,
      isComponent,
      node.loc,
    )
  }
}

/**
 * 解析组件类型
 *
 * 按优先级尝试多种解析方式：
 *
 * 1. **动态组件**：<component :is="xxx"> → resolveDynamicComponent
 * 2. **内置组件**：Teleport/Transition/KeepAlive/Suspense → symbol
 * 3. **setup 绑定**：<script setup> 中导入的组件 → 直接引用
 * 4. **自引用组件**：文件名推断 → resolveComponent
 * 5. **普通用户组件**：全局/局部注册 → resolveComponent
 *
 * @returns 字符串标签、symbol 或 resolveDynamicComponent/resolveComponent 调用
 */
export function resolveComponentType(
  node: ComponentNode,
  context: TransformContext,
  ssr = false,
): string | symbol | CallExpression {
  let { tag } = node

  // ============================================================
  // 1. 动态组件：<component :is="xxx">
  // ============================================================
  const isExplicitDynamic = isComponentTag(tag) // tag === "component" || "Component"
  const isProp = findProp(node, 'is', false, true /* allow empty */)
  if (isProp) {
    if (
      isExplicitDynamic ||
      (__COMPAT__ &&
        isCompatEnabled(
          CompilerDeprecationTypes.COMPILER_IS_ON_ELEMENT,
          context,
        ))
    ) {
      let exp: ExpressionNode | undefined

      // 提取 :is 的表达式
      if (isProp.type === NodeTypes.ATTRIBUTE) {
        exp = isProp.value && createSimpleExpression(isProp.value.content, true)
      } else {
        exp = isProp.exp
        if (!exp) {
          // #10469 :is 简写（属性名和值相同）
          exp = createSimpleExpression(`is`, false, isProp.arg!.loc)
          if (!__BROWSER__) {
            exp = isProp.exp = processExpression(exp, context)
          }
        }
      }

      if (exp) {
        return createCallExpression(context.helper(RESOLVE_DYNAMIC_COMPONENT), [exp])
      }
    } else if (
      isProp.type === NodeTypes.ATTRIBUTE &&
      isProp.value!.content.startsWith('vue:')
    ) {
      /**
       * <button is="vue:xxx"> 特殊用法
       *
       * 如果不是 <component>，只有以 "vue:" 开头的 is 值会被解析阶段
       * 视为组件进入此分支。提取 "vue:" 后的标签名。
       */
      tag = isProp.value!.content.slice(4)
    }
  }

  // ============================================================
  // 2. 内置组件
  // ============================================================
  const builtIn = isCoreComponent(tag) || context.isBuiltInComponent(tag)
  if (builtIn) {
    if (!ssr) context.helper(builtIn)
    return builtIn
  }

  // ============================================================
  // 3. setup 绑定（仅非浏览器构建）
  // ============================================================
  if (!__BROWSER__) {
    const fromSetup = resolveSetupReference(tag, context)
    if (fromSetup) {
      return fromSetup
    }

    // 点号路径：如 "Foo.Bar" → 解析 "Foo"，再拼接 ".Bar"
    const dotIndex = tag.indexOf('.')
    if (dotIndex > 0) {
      const ns = resolveSetupReference(tag.slice(0, dotIndex), context)
      if (ns) {
        return ns + tag.slice(dotIndex)
      }
    }
  }

  // ============================================================
  // 4. 自引用组件（从文件名推断）
  // ============================================================
  if (
    !__BROWSER__ &&
    context.selfName &&
    capitalize(camelize(tag)) === context.selfName
  ) {
    context.helper(RESOLVE_COMPONENT)
    context.components.add(tag + `__self`)
    return toValidAssetId(tag, `component`)
  }

  // ============================================================
  // 5. 普通用户组件（resolveComponent）
  // ============================================================
  context.helper(RESOLVE_COMPONENT)
  context.components.add(tag)
  return toValidAssetId(tag, `component`)
}

/**
 * 从 setup 绑定中解析组件引用
 *
 * 检查 bindingMetadata 中是否有匹配的组件绑定。
 * 按三种命名形式查找：原始名、camelCase、PascalCase。
 */
function resolveSetupReference(name: string, context: TransformContext) {
  const bindings = context.bindingMetadata
  if (!bindings || bindings.__isScriptSetup === false) {
    return
  }

  const camelName = camelize(name)
  const PascalName = capitalize(camelName)

  const checkType = (type: BindingTypes) => {
    if (bindings[name] === type) return name
    if (bindings[camelName] === type) return camelName
    if (bindings[PascalName] === type) return PascalName
  }

  // 常量组件（import 导入的组件被标记为 SETUP_CONST）
  const fromConst =
    checkType(BindingTypes.SETUP_CONST) ||
    checkType(BindingTypes.SETUP_REACTIVE_CONST) ||
    checkType(BindingTypes.LITERAL_CONST)
  if (fromConst) {
    return context.inline
      ? fromConst // inline 模式：直接使用导入标识符
      : `$setup[${JSON.stringify(fromConst)}]` // 非 inline：通过 $setup 访问
  }

  // 可能是 ref 的组件（let/ref/maybeRef 绑定的组件引用）
  const fromMaybeRef =
    checkType(BindingTypes.SETUP_LET) ||
    checkType(BindingTypes.SETUP_REF) ||
    checkType(BindingTypes.SETUP_MAYBE_REF)
  if (fromMaybeRef) {
    return context.inline
      ? `${context.helperString(UNREF)}(${fromMaybeRef})` // 需要 unref 展开
      : `$setup[${JSON.stringify(fromMaybeRef)}]`
  }

  // Props 中的组件引用
  const fromProps = checkType(BindingTypes.PROPS)
  if (fromProps) {
    return `${context.helperString(UNREF)}(${
      context.inline ? '__props' : '$props'
    }[${JSON.stringify(fromProps)}])`
  }
}

export type PropsExpression = ObjectExpression | CallExpression | ExpressionNode

/**
 * 构建元素的 props 表达式
 *
 * 这是 props 构建的核心函数。它：
 * 1. 遍历所有属性和指令，分类处理
 * 2. 分析 patchFlag（精确标记需要动态 diff 的属性类型）
 * 3. 合并多个 v-bind 对象（通过 mergeProps）
 * 4. 预规范化 class/style（通过 normalizeClass/normalizeStyle）
 *
 * @returns { props, directives, patchFlag, dynamicPropNames, shouldUseBlock }
 */
export function buildProps(
  node: ElementNode,
  context: TransformContext,
  props: ElementNode['props'] | undefined = node.props,
  isComponent: boolean,
  isDynamicComponent: boolean,
  ssr = false,
): {
  props: PropsExpression | undefined
  directives: DirectiveNode[]
  patchFlag: number
  dynamicPropNames: string[]
  shouldUseBlock: boolean
} {
  const { tag, loc: elementLoc, children } = node
  let properties: ObjectExpression['properties'] = []
  const mergeArgs: PropsExpression[] = []
  const runtimeDirectives: DirectiveNode[] = []
  const hasChildren = children.length > 0
  let shouldUseBlock = false

  // ============================================================
  // patchFlag 分析状态
  // ============================================================
  let patchFlag = 0
  let hasRef = false
  let hasClassBinding = false
  let hasStyleBinding = false
  let hasHydrationEventBinding = false
  let hasDynamicKeys = false
  let hasVnodeHook = false
  const dynamicPropNames: string[] = []

  /**
   * 将当前 properties 推进 mergeArgs
   *
   * mergeProps 的参数是多个 props 对象。
   * 每次遇到 v-bind="obj" 或 v-on="obj" 时，
   * 需要将之前收集的 properties 打包为对象推入 mergeArgs。
   */
  const pushMergeArg = (arg?: PropsExpression) => {
    if (properties.length) {
      mergeArgs.push(
        createObjectExpression(dedupeProperties(properties), elementLoc),
      )
      properties = []
    }
    if (arg) mergeArgs.push(arg)
  }

  /**
   * v-for 中的 ref 标记
   *
   * 当元素有 ref 且在 v-for 中时，需要在运行时知道 ref 是数组。
   * 通过添加 ref_for prop 告知运行时。
   */
  const pushRefVForMarker = () => {
    if (context.scopes.vFor > 0) {
      properties.push(
        createObjectProperty(
          createSimpleExpression('ref_for', true),
          createSimpleExpression('true'),
        ),
      )
    }
  }

  /**
   * patchFlag 分析器
   *
   * 对每个 prop 分析其是否影响 patchFlag：
   * - ref → hasRef
   * - class → hasClassBinding
   * - style → hasStyleBinding
   * - onXXX 事件 → hasHydrationEventBinding（非 onClick）
   * - onVnodeXXX → hasVnodeHook
   * - 其他动态 prop → 加入 dynamicPropNames
   *
   * 跳过的 prop：
   * - 缓存的 handler（JS_CACHE_EXPRESSION）
   * - 常量值
   */
  const analyzePatchFlag = ({ key, value }: Property) => {
    if (isStaticExp(key)) {
      const name = key.content
      const isEventHandler = isOn(name)

      if (
        isEventHandler &&
        (!isComponent || isDynamicComponent) &&
        // onClick 有专用的 hydrate 快速路径，不需要标记
        name.toLowerCase() !== 'onclick' &&
        // v-model handler 不需要标记
        name !== 'onUpdate:modelValue' &&
        // onVnodeXXX 钩子单独跟踪
        !isReservedProp(name)
      ) {
        hasHydrationEventBinding = true
      }

      if (isEventHandler && isReservedProp(name)) {
        hasVnodeHook = true
      }

      // 事件包装函数（如 withModifiers(fn)）→ 提取内部表达式做常量判断
      if (isEventHandler && value.type === NodeTypes.JS_CALL_EXPRESSION) {
        value = value.arguments[0] as JSChildNode
      }

      // 常量和缓存值 → 不计入动态 prop
      if (
        value.type === NodeTypes.JS_CACHE_EXPRESSION ||
        ((value.type === NodeTypes.SIMPLE_EXPRESSION ||
          value.type === NodeTypes.COMPOUND_EXPRESSION) &&
          getConstantType(value, context) > 0)
      ) {
        return
      }

      if (name === 'ref') {
        hasRef = true
      } else if (name === 'class') {
        hasClassBinding = true
      } else if (name === 'style') {
        hasStyleBinding = true
      } else if (name !== 'key' && !dynamicPropNames.includes(name)) {
        dynamicPropNames.push(name)
      }

      // 组件的动态 class/style 也需要追踪
      if (
        isComponent &&
        (name === 'class' || name === 'style') &&
        !dynamicPropNames.includes(name)
      ) {
        dynamicPropNames.push(name)
      }
    } else {
      // 非静态 key → 完整 diff
      hasDynamicKeys = true
    }
  }

  // ============================================================
  // 遍历所有 props
  // ============================================================
  for (let i = 0; i < props.length; i++) {
    const prop = props[i]

    if (prop.type === NodeTypes.ATTRIBUTE) {
      // ============================================================
      // 静态属性处理
      // ============================================================
      const { loc, name, nameLoc, value } = prop
      let isStatic = true

      if (name === 'ref') {
        hasRef = true
        pushRefVForMarker()

        /**
         * inline 模式下的 ref 处理
         *
         * 在 <script setup> inline 模式中，ref 是通过解构访问的。
         * 不能使用字符串 key 设置 ref，需要传递实际的 ref 对象。
         * 添加 ref_key 属性告知运行时 ref 的标识符名。
         */
        if (!__BROWSER__ && value && context.inline) {
          const binding = context.bindingMetadata[value.content]
          if (
            binding === BindingTypes.SETUP_LET ||
            binding === BindingTypes.SETUP_REF ||
            binding === BindingTypes.SETUP_MAYBE_REF
          ) {
            isStatic = false
            properties.push(
              createObjectProperty(
                createSimpleExpression('ref_key', true),
                createSimpleExpression(value.content, true, value.loc),
              ),
            )
          }
        }
      }

      // 跳过 is 属性（动态组件处理）和 vue: 前缀
      if (
        name === 'is' &&
        (isComponentTag(tag) ||
          (value && value.content.startsWith('vue:')) ||
          (__COMPAT__ &&
            isCompatEnabled(
              CompilerDeprecationTypes.COMPILER_IS_ON_ELEMENT,
              context,
            )))
      ) {
        continue
      }

      properties.push(
        createObjectProperty(
          createSimpleExpression(name, true, nameLoc),
          createSimpleExpression(
            value ? value.content : '',
            isStatic,
            value ? value.loc : loc,
          ),
        ),
      )
    } else {
      // ============================================================
      // 指令属性处理
      // ============================================================
      const { name, arg, exp, loc, modifiers } = prop
      const isVBind = name === 'bind'
      const isVOn = name === 'on'

      // v-slot 由专用的 transform 处理
      if (name === 'slot') {
        if (!isComponent) {
          context.onError(
            createCompilerError(ErrorCodes.X_V_SLOT_MISPLACED, loc),
          )
        }
        continue
      }

      // v-once / v-memo 由专用的 transform 处理
      if (name === 'once' || name === 'memo') {
        continue
      }

      // 跳过 v-is / :is on component
      if (
        name === 'is' ||
        (isVBind &&
          isStaticArgOf(arg, 'is') &&
          (isComponentTag(tag) ||
            (__COMPAT__ &&
              isCompatEnabled(
                CompilerDeprecationTypes.COMPILER_IS_ON_ELEMENT,
                context,
              ))))
      ) {
        continue
      }

      // SSR 编译中跳过 v-on
      if (isVOn && ssr) {
        continue
      }

      /**
       * 强制 Block 的场景
       *
       * - 动态 key（#938）：动态 key 必须使用 Block 追踪
       * - vue:before-update 钩子 inline：需要在子节点更新前调用
       */
      if (
        (isVBind && isStaticArgOf(arg, 'key')) ||
        (isVOn && hasChildren && isStaticArgOf(arg, 'vue:before-update'))
      ) {
        shouldUseBlock = true
      }

      // v-bind:ref → ref_for 标记
      if (isVBind && isStaticArgOf(arg, 'ref')) {
        pushRefVForMarker()
      }

      /**
       * 无参数 v-bind / v-on 特殊处理
       *
       * v-bind="obj" → mergeProps 的参数（合并所有绑定）
       * v-on="handlers" → toHandlers(handlers)
       */
      if (!arg && (isVBind || isVOn)) {
        hasDynamicKeys = true

        if (exp) {
          if (isVBind) {
            if (__COMPAT__) {
              pushMergeArg()
              // 2.x v-bind 对象顺序兼容
              if (__DEV__) {
                const hasOverridableKeys = mergeArgs.some(arg => {
                  if (arg.type === NodeTypes.JS_OBJECT_EXPRESSION) {
                    return arg.properties.some(({ key }) => {
                      if (
                        key.type !== NodeTypes.SIMPLE_EXPRESSION ||
                        !key.isStatic
                      ) {
                        return true
                      }
                      return (
                        key.content !== 'class' &&
                        key.content !== 'style' &&
                        !isOn(key.content)
                      )
                    })
                  } else {
                    return true
                  }
                })
                if (hasOverridableKeys) {
                  checkCompatEnabled(
                    CompilerDeprecationTypes.COMPILER_V_BIND_OBJECT_ORDER,
                    context,
                    loc,
                  )
                }
              }

              if (
                isCompatEnabled(
                  CompilerDeprecationTypes.COMPILER_V_BIND_OBJECT_ORDER,
                  context,
                )
              ) {
                mergeArgs.unshift(exp)
                continue
              }
            }

            // #10696：v-bind 对象可能包含 ref
            pushRefVForMarker()
            pushMergeArg()
            mergeArgs.push(exp)
          } else {
            // v-on="obj" → toHandlers(obj)
            pushMergeArg({
              type: NodeTypes.JS_CALL_EXPRESSION,
              loc,
              callee: context.helper(TO_HANDLERS),
              arguments: isComponent ? [exp] : [exp, `true`],
            })
          }
        } else {
          context.onError(
            createCompilerError(
              isVBind
                ? ErrorCodes.X_V_BIND_NO_EXPRESSION
                : ErrorCodes.X_V_ON_NO_EXPRESSION,
              loc,
            ),
          )
        }
        continue
      }

      // v-bind.prop 修饰符 → 强制 hydrate（需要区分 attribute 和 property）
      if (isVBind && modifiers.some(mod => mod.content === 'prop')) {
        patchFlag |= PatchFlags.NEED_HYDRATION
      }

      /**
       * 指令转换器调用
       *
       * 如果指令有对应的内置 transform（如 v-model, v-on, v-bind 等），
       * 调用它来处理指令。transform 返回：
       * - props：生成的 prop 数组
       * - needRuntime：是否需要运行时指令信息
       */
      const directiveTransform = context.directiveTransforms[name]
      if (directiveTransform) {
        const { props, needRuntime } = directiveTransform(prop, node, context)
        !ssr && props.forEach(analyzePatchFlag)

        // 动态 v-on 参数：作为 mergeProps 的参数（因为事件名动态）
        if (isVOn && arg && !isStaticExp(arg)) {
          pushMergeArg(createObjectExpression(props, elementLoc))
        } else {
          properties.push(...props)
        }

        // 需要运行时指令信息
        if (needRuntime) {
          runtimeDirectives.push(prop)
          if (isSymbol(needRuntime)) {
            directiveImportMap.set(prop, needRuntime)
          }
        }
      } else if (!isBuiltInDirective(name)) {
        /**
         * 自定义指令
         *
         * 不在内置指令列表中 → 用户自定义指令。
         * 有子节点时强制 Block（因为自定义指令可能使用 beforeUpdate）。
         */
        runtimeDirectives.push(prop)
        if (hasChildren) {
          shouldUseBlock = true
        }
      }
    }
  }

  // ============================================================
  // Props 表达式构建
  // ============================================================

  let propsExpression: PropsExpression | undefined = undefined

  if (mergeArgs.length) {
    /**
     * 有 mergeProps 参数
     *
     * 最后 pushMergeArg() 确保最后收集的 properties 也被打包。
     * 单个参数直接使用，多个参数用 mergeProps 合并。
     */
    pushMergeArg()

    if (mergeArgs.length > 1) {
      // 多个 props 来源 → mergeProps 合并
      propsExpression = createCallExpression(
        context.helper(MERGE_PROPS),
        mergeArgs,
        elementLoc,
      )
    } else {
      // 单一 v-bind → 直接使用
      propsExpression = mergeArgs[0]
    }
  } else if (properties.length) {
    // 纯静态 + 内置指令结果 → 对象表达式
    propsExpression = createObjectExpression(
      dedupeProperties(properties),
      elementLoc,
    )
  }

  // ============================================================
  // patchFlag 计算
  // ============================================================

  if (hasDynamicKeys) {
    // 有动态 key → 必须完整的 props diff
    patchFlag |= PatchFlags.FULL_PROPS
  } else {
    // 精确追踪特定类型的动态绑定
    if (hasClassBinding && !isComponent) {
      patchFlag |= PatchFlags.CLASS
    }
    if (hasStyleBinding && !isComponent) {
      patchFlag |= PatchFlags.STYLE
    }
    if (dynamicPropNames.length) {
      patchFlag |= PatchFlags.PROPS
    }
    if (hasHydrationEventBinding) {
      patchFlag |= PatchFlags.NEED_HYDRATION
    }
  }

  /**
   * NEED_PATCH 标记
   *
   * 即使没有明确的动态绑定，但有 ref 或 vnode hook 或自定义指令时，
   * 至少需要 patch（这些可能触发副作用）。标记 NEED_PATCH 确保 diff 执行。
   */
  if (
    !shouldUseBlock &&
    (patchFlag === 0 || patchFlag === PatchFlags.NEED_HYDRATION) &&
    (hasRef || hasVnodeHook || runtimeDirectives.length > 0)
  ) {
    patchFlag |= PatchFlags.NEED_PATCH
  }

  // ============================================================
  // Props 预规范化（非 SSR）
  // ============================================================

  if (!context.inSSR && propsExpression) {
    switch (propsExpression.type) {
      case NodeTypes.JS_OBJECT_EXPRESSION: {
        /**
         * 对象表达式：可能包含 class/style 需要规范化
         *
         * 找到 class 和 style 的索引位置。
         */
        let classKeyIndex = -1
        let styleKeyIndex = -1
        let hasDynamicKey = false

        for (let i = 0; i < propsExpression.properties.length; i++) {
          const key = propsExpression.properties[i].key
          if (isStaticExp(key)) {
            if (key.content === 'class') {
              classKeyIndex = i
            } else if (key.content === 'style') {
              styleKeyIndex = i
            }
          } else if (!key.isHandlerKey) {
            hasDynamicKey = true
          }
        }

        const classProp = propsExpression.properties[classKeyIndex]
        const styleProp = propsExpression.properties[styleKeyIndex]

        if (!hasDynamicKey) {
          /**
           * 无动态 key → 精确规范化
           *
           * class：动态 class 用 normalizeClass 包装
           * style：动态 style 用 normalizeStyle 包装
           */
          if (classProp && !isStaticExp(classProp.value)) {
            classProp.value = createCallExpression(
              context.helper(NORMALIZE_CLASS),
              [classProp.value],
            )
          }
          if (
            styleProp &&
            (hasStyleBinding ||
              (styleProp.value.type === NodeTypes.SIMPLE_EXPRESSION &&
                styleProp.value.content.trim()[0] === `[`) ||
              styleProp.value.type === NodeTypes.JS_ARRAY_EXPRESSION)
          ) {
            styleProp.value = createCallExpression(
              context.helper(NORMALIZE_STYLE),
              [styleProp.value],
            )
          }
        } else {
          /**
           * 有动态 key → 全局规范化
           *
           * 无法静态确定是否包含 class/style，对整个 props 调用 normalizeProps。
           */
          propsExpression = createCallExpression(
            context.helper(NORMALIZE_PROPS),
            [propsExpression],
          )
        }
        break
      }
      case NodeTypes.JS_CALL_EXPRESSION:
        // mergeProps 调用 → 内部已处理规范化，无需额外处理
        break
      default:
        /**
         * 单个 v-bind 表达式
         *
         * wrap with normalizeProps(guardReactiveProps(expr))
         * guardReactiveProps 确保响应式对象不会被意外跟踪
         */
        propsExpression = createCallExpression(
          context.helper(NORMALIZE_PROPS),
          [
            createCallExpression(context.helper(GUARD_REACTIVE_PROPS), [
              propsExpression,
            ]),
          ],
        )
        break
    }
  }

  return {
    props: propsExpression,
    directives: runtimeDirectives,
    patchFlag,
    dynamicPropNames,
    shouldUseBlock,
  }
}

/**
 * 去重 properties
 *
 * 解析阶段会警告重复的静态属性，但仍可能遇到不同修饰符的 onXXX handler
 * 或 class/style 的静态+动态混合。
 *
 * 处理策略：
 * - onXXX handler / style → 合并为数组
 * - class → 合并为单个连接表达式
 */
function dedupeProperties(properties: Property[]): Property[] {
  const knownProps: Map<string, Property> = new Map()
  const deduped: Property[] = []

  for (let i = 0; i < properties.length; i++) {
    const prop = properties[i]

    // 动态 key → 无法去重，跳过
    if (prop.key.type === NodeTypes.COMPOUND_EXPRESSION || !prop.key.isStatic) {
      deduped.push(prop)
      continue
    }

    const name = prop.key.content
    const existing = knownProps.get(name)

    if (existing) {
      // class / style / onXXX → 合并为数组（同时传递所有值）
      if (name === 'style' || name === 'class' || isOn(name)) {
        mergeAsArray(existing, prop)
      }
      // 其他属性：解析阶段已报告错误，此处忽略
    } else {
      knownProps.set(name, prop)
      deduped.push(prop)
    }
  }

  return deduped
}

/**
 * 将两个 property value 合并为数组
 *
 * 用于 class / style / onXXX 的去重。
 */
function mergeAsArray(existing: Property, incoming: Property) {
  if (existing.value.type === NodeTypes.JS_ARRAY_EXPRESSION) {
    existing.value.elements.push(incoming.value)
  } else {
    existing.value = createArrayExpression(
      [existing.value, incoming.value],
      existing.loc,
    )
  }
}

/**
 * 构建指令的运行时参数
 *
 * 指令数组格式（由 vnode.dirs 在运行时使用）：
 * ```
 * [name, value, arg, modifiers]
 * ```
 *
 * - 内置指令：使用 directiveImportMap 中存储的 runtime symbol
 * - 自定义指令：优先从 setup 绑定解析，否则使用 resolveDirective
 * - 省略未使用的尾随参数（减小体积）
 */
export function buildDirectiveArgs(
  dir: DirectiveNode,
  context: TransformContext,
): ArrayExpression {
  const dirArgs: ArrayExpression['elements'] = []

  // [0] 指令名称或引用
  const runtime = directiveImportMap.get(dir)
  if (runtime) {
    // 内置指令：使用 runtime helper symbol
    dirArgs.push(context.helperString(runtime))
  } else {
    // 自定义指令：检查 setup 绑定
    const fromSetup =
      !__BROWSER__ && resolveSetupReference('v-' + dir.name, context)
    if (fromSetup) {
      dirArgs.push(fromSetup)
    } else {
      // 全局/局部注册：使用 resolveDirective
      context.helper(RESOLVE_DIRECTIVE)
      context.directives.add(dir.name)
      dirArgs.push(toValidAssetId(dir.name, `directive`))
    }
  }

  const { loc } = dir

  // [1] value：指令值
  if (dir.exp) dirArgs.push(dir.exp)

  // [2] arg：指令参数
  if (dir.arg) {
    if (!dir.exp) {
      dirArgs.push(`void 0`) // 前补 void 0 占位
    }
    dirArgs.push(dir.arg)
  }

  // [3] modifiers：修饰符对象
  if (Object.keys(dir.modifiers).length) {
    // 前补 void 0 占位（如果前面参数缺失）
    if (!dir.arg) {
      if (!dir.exp) {
        dirArgs.push(`void 0`)
      }
      dirArgs.push(`void 0`)
    }
    const trueExpression = createSimpleExpression(`true`, false, loc)
    dirArgs.push(
      createObjectExpression(
        dir.modifiers.map(modifier =>
          createObjectProperty(modifier, trueExpression),
        ),
        loc,
      ),
    )
  }

  return createArrayExpression(dirArgs, dir.loc)
}

/**
 * 序列化动态 prop 名称列表
 *
 * 例如：`["title", "value"]`
 * 这是一个编译时确定的字符串常量，在运行时用于 patchFlag 解析。
 */
function stringifyDynamicPropNames(props: string[]): string {
  let propsNamesString = `[`
  for (let i = 0, l = props.length; i < l; i++) {
    propsNamesString += JSON.stringify(props[i])
    if (i < l - 1) propsNamesString += ', '
  }
  return propsNamesString + `]`
}

/**
 * 判断 tag 是否为 component 标签
 */
function isComponentTag(tag: string) {
  return tag === 'component' || tag === 'Component'
}
