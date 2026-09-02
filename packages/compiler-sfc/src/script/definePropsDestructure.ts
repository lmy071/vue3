/**
 * definePropsDestructure.ts —— Props 解构变换
 *
 * ## 功能概述
 * 实现 Vue 3.5 的响应式 Props 解构特性。
 * 当 `defineProps` 使用解构时，编译器自动将解构变量引用
 * 转换为 `__props.xxx` 访问，保持响应性。
 *
 * ## 三步流程
 *
 * ### 1. processPropsDestructure（收集阶段）
 * 遍历 `defineProps` 的解构模式，注册每个 prop：
 * - 简单解构：`const { foo } = defineProps(...)` → foo → __props.foo
 * - 默认值：`const { foo = 123 }` → foo → __props.foo（含默认值）
 * - 别名：`const { foo: bar }` → bar → __props.foo（PROPS_ALIASED）
 * - rest：`const { ...rest }` → rest → SETUP_REACTIVE_CONST
 *
 * ### 2. transformDestructuredProps（变换阶段）
 * 遍历 script setup AST，重写所有对解构 prop 的引用：
 * - 属性简写：`{ foo }` → `{ foo: __props.foo }`
 * - 一般引用：`foo` → `__props.foo`
 * - 赋值禁止：`foo = x` → 报错（props 只读）
 *
 * ### 3. 作用域管理
 * 使用 scope stack 追踪变量遮蔽：
 * - 函数参数 / catch / for 循环 → 新作用域
 * - 局部声明的同名变量 → 标记为非 prop 绑定
 * - 嵌套作用域中的 props 引用 → 正确穿透重写
 *
 * ## 安全校验
 * - **watch(xxx)** → 报错，提示使用 getter
 * - **toRef(xxx)** → 报错，提示使用 getter
 * - **计算键** → 报错（不支持）
 * - **嵌套解构** → 报错（不支持）
 */

import type {
  BlockStatement,
  Expression,
  Identifier,
  Node,
  ObjectPattern,
  Program,
  VariableDeclaration,
} from '@babel/types'
import { walk } from 'estree-walker'
import {
  BindingTypes,
  TS_NODE_TYPES,
  extractIdentifiers,
  isFunctionType,
  isInDestructureAssignment,
  isReferencedIdentifier,
  isStaticProperty,
  unwrapTSNode,
  walkFunctionParams,
} from '@vue/compiler-dom'
import { genPropsAccessExp } from '@vue/shared'
import { isCallOf, resolveObjectKey } from './utils'
import type { ScriptCompileContext } from './context'
import { DEFINE_PROPS } from './defineProps'

export function processPropsDestructure(
  ctx: ScriptCompileContext,
  declId: ObjectPattern,
): void {
  if (ctx.options.propsDestructure === 'error') {
    ctx.error(`Props destructure is explicitly prohibited via config.`, declId)
  } else if (ctx.options.propsDestructure === false) {
    return
  }

  ctx.propsDestructureDecl = declId

  const registerBinding = (
    key: string,
    local: string,
    defaultValue?: Expression,
  ) => {
    ctx.propsDestructuredBindings[key] = { local, default: defaultValue }
    if (local !== key) {
      ctx.bindingMetadata[local] = BindingTypes.PROPS_ALIASED
      ;(ctx.bindingMetadata.__propsAliases ||
        (ctx.bindingMetadata.__propsAliases = {}))[local] = key
    }
  }

  for (const prop of declId.properties) {
    if (prop.type === 'ObjectProperty') {
      const propKey = resolveObjectKey(prop.key, prop.computed)

      if (!propKey) {
        ctx.error(
          `${DEFINE_PROPS}() destructure cannot use computed key.`,
          prop.key,
        )
      }

      if (prop.value.type === 'AssignmentPattern') {
        // 默认值：{ foo = 123 }
        const { left, right } = prop.value
        if (left.type !== 'Identifier') {
          ctx.error(
            `${DEFINE_PROPS}() destructure does not support nested patterns.`,
            left,
          )
        }
        registerBinding(propKey, left.name, right)
      } else if (prop.value.type === 'Identifier') {
        // 简单解构：{ foo }
        registerBinding(propKey, prop.value.name)
      } else {
        ctx.error(
          `${DEFINE_PROPS}() destructure does not support nested patterns.`,
          prop.value,
        )
      }
    } else {
      // rest 展开：{ ...rest }
      ctx.propsDestructureRestId = (prop.argument as Identifier).name
      ctx.bindingMetadata[ctx.propsDestructureRestId] =
        BindingTypes.SETUP_REACTIVE_CONST
    }
  }
}

/**
 * true → prop 绑定
 * false → 局部绑定
 */
type Scope = Record<string, boolean>

export function transformDestructuredProps(
  ctx: ScriptCompileContext,
  vueImportAliases: Record<string, string>,
): void {
  if (ctx.options.propsDestructure === false) {
    return
  }

  const rootScope: Scope = Object.create(null)
  const scopeStack: Scope[] = [rootScope]
  const functionScopeStack: Scope[] = [rootScope]
  let currentScope: Scope = rootScope
  const excludedIds = new WeakSet<Identifier>()
  const parentStack: Node[] = []
  const propsLocalToPublicMap: Record<string, string> = Object.create(null)

  for (const key in ctx.propsDestructuredBindings) {
    const { local } = ctx.propsDestructuredBindings[key]
    rootScope[local] = true
    propsLocalToPublicMap[local] = key
  }

  function pushScope(isFunctionScope = false) {
    const scope = (currentScope = Object.create(currentScope))
    scopeStack.push(scope)
    if (isFunctionScope) {
      functionScopeStack.push(scope)
    }
  }

  function popScope(isFunctionScope = false) {
    scopeStack.pop()
    if (isFunctionScope) {
      functionScopeStack.pop()
    }
    currentScope = scopeStack[scopeStack.length - 1] || null
  }

  function registerLocalBinding(id: Identifier, scope = currentScope) {
    excludedIds.add(id)
    if (scope) {
      scope[id.name] = false
    } else {
      ctx.error(
        'registerBinding called without active scope, something is wrong.',
        id,
      )
    }
  }

  function walkScope(node: Program | BlockStatement, isRoot = false) {
    for (const stmt of node.body) {
      if (stmt.type === 'VariableDeclaration') {
        walkVariableDeclaration(stmt, isRoot)
      } else if (
        stmt.type === 'FunctionDeclaration' ||
        stmt.type === 'ClassDeclaration'
      ) {
        if (stmt.declare || !stmt.id) continue
        registerLocalBinding(stmt.id)
      } else if (
        stmt.type === 'ExportNamedDeclaration' &&
        stmt.declaration &&
        stmt.declaration.type === 'VariableDeclaration'
      ) {
        walkVariableDeclaration(stmt.declaration, isRoot)
      } else if (
        stmt.type === 'LabeledStatement' &&
        stmt.body.type === 'VariableDeclaration'
      ) {
        walkVariableDeclaration(stmt.body, isRoot)
      }
    }
  }

  function walkVariableDeclaration(
    stmt: VariableDeclaration,
    isRoot = false,
    scope = stmt.kind === 'var'
      ? functionScopeStack[functionScopeStack.length - 1]
      : currentScope,
  ) {
    if (stmt.declare) {
      return
    }
    for (const decl of stmt.declarations) {
      const isDefineProps =
        isRoot && decl.init && isCallOf(unwrapTSNode(decl.init), 'defineProps')
      for (const id of extractIdentifiers(decl.id)) {
        if (isDefineProps) {
          // defineProps 解构 → 排除（已作为 knownProps 传入）
          excludedIds.add(id)
        } else {
          registerLocalBinding(id, scope)
        }
      }
    }
  }

  function walkFunctionScopeVarDeclarations(
    scopeNode: Program | BlockStatement,
    isRoot = false,
  ) {
    const scope = functionScopeStack[functionScopeStack.length - 1]
    walk(scopeNode, {
      enter(node: Node, parent: Node | null) {
        if (
          parent &&
          parent.type.startsWith('TS') &&
          !TS_NODE_TYPES.includes(parent.type)
        ) {
          return this.skip()
        }

        if (
          isFunctionType(node) ||
          node.type === 'ClassDeclaration' ||
          node.type === 'ClassExpression'
        ) {
          return this.skip()
        }

        if (node.type === 'VariableDeclaration' && node.kind === 'var') {
          walkVariableDeclaration(node, isRoot && parent === scopeNode, scope)
        }
      },
    })
  }

  function rewriteId(id: Identifier, parent: Node, parentStack: Node[]) {
    if (
      (parent.type === 'AssignmentExpression' && id === parent.left) ||
      parent.type === 'UpdateExpression'
    ) {
      ctx.error(`Cannot assign to destructured props as they are readonly.`, id)
    }

    if (isStaticProperty(parent) && parent.shorthand) {
      // 属性简写 → 展开：{ prop } → { prop: __props.prop }
      if (
        !(parent as any).inPattern ||
        isInDestructureAssignment(parent, parentStack)
      ) {
        ctx.s.appendLeft(
          id.end! + ctx.startOffset!,
          `: ${genPropsAccessExp(propsLocalToPublicMap[id.name])}`,
        )
      }
    } else {
      // 一般引用 → x → __props.x
      ctx.s.overwrite(
        id.start! + ctx.startOffset!,
        id.end! + ctx.startOffset!,
        genPropsAccessExp(propsLocalToPublicMap[id.name]),
      )
    }
  }

  function checkUsage(node: Node, method: string, alias = method) {
    if (isCallOf(node, alias)) {
      const arg = unwrapTSNode(node.arguments[0])
      if (arg.type === 'Identifier' && currentScope[arg.name]) {
        ctx.error(
          `"${arg.name}" is a destructured prop and should not be passed directly to ${method}(). ` +
            `Pass a getter () => ${arg.name} instead.`,
          arg,
        )
      }
    }
  }

  // 先遍历根作用域
  const ast = ctx.scriptSetupAst!
  walkFunctionScopeVarDeclarations(ast, true)
  walkScope(ast, true)
  walk(ast, {
    enter(node: Node, parent: Node | null) {
      parent && parentStack.push(parent)

      // 跳过类型节点
      if (
        parent &&
        parent.type.startsWith('TS') &&
        !TS_NODE_TYPES.includes(parent.type)
      ) {
        return this.skip()
      }

      // 安全检查：watch / toRef 不能直接传解构 prop
      checkUsage(node, 'watch', vueImportAliases.watch)
      checkUsage(node, 'toRef', vueImportAliases.toRef)

      // 函数作用域
      if (isFunctionType(node)) {
        pushScope(true)
        walkFunctionParams(node, registerLocalBinding)
        if (node.body.type === 'BlockStatement') {
          walkFunctionScopeVarDeclarations(node.body)
          walkScope(node.body)
        }
        return
      }

      // catch 参数
      if (node.type === 'CatchClause') {
        pushScope()
        if (node.param && node.param.type === 'Identifier') {
          registerLocalBinding(node.param)
        }
        walkScope(node.body)
        return
      }

      // for 循环变量
      if (
        node.type === 'ForOfStatement' ||
        node.type === 'ForInStatement' ||
        node.type === 'ForStatement'
      ) {
        pushScope()
        const varDecl = node.type === 'ForStatement' ? node.init : node.left
        if (varDecl && varDecl.type === 'VariableDeclaration') {
          walkVariableDeclaration(varDecl)
        }
        if (node.body.type === 'BlockStatement') {
          walkScope(node.body)
        }
        return
      }

      // 非函数块作用域
      if (node.type === 'BlockStatement' && !isFunctionType(parent!)) {
        pushScope()
        walkScope(node)
        return
      }

      // 标识符引用 → 重写为 __props.xxx
      if (node.type === 'Identifier') {
        if (
          isReferencedIdentifier(node, parent!, parentStack) &&
          !excludedIds.has(node)
        ) {
          if (currentScope[node.name]) {
            rewriteId(node, parent!, parentStack)
          }
        }
      }
    },
    leave(node: Node, parent: Node | null) {
      parent && parentStack.pop()
      if (isFunctionType(node)) {
        popScope(true)
      } else if (node.type === 'BlockStatement' && !isFunctionType(parent!)) {
        popScope()
      } else if (
        node.type === 'CatchClause' ||
        node.type === 'ForOfStatement' ||
        node.type === 'ForInStatement' ||
        node.type === 'ForStatement'
      ) {
        popScope()
      }
    },
  })
}
