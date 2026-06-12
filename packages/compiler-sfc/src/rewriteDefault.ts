/**
 * rewriteDefault.ts —— export default 重写
 *
 * ## 功能概述
 * 将 `<script>` 块中的 `export default` 重写为变量声明，
 * 以便编译器注入代码（如 CSS variables、运行时辅助代码）。
 *
 * ## 核心函数
 *
 * ### rewriteDefault（公共 API）
 * 接受原始源码和变量名，返回重写后的源码。
 *
 * ### rewriteDefaultAST（内部逻辑）
 * 处理四种情况：
 * 1. **无默认导出**：在末尾追加 `const <as> = {}`
 * 2. **有命名的 class 声明**：
 *    `export default class Foo {}` → `class Foo {}` + `const <as> = Foo`
 *    (正确处理装饰器位置)
 * 3. **匿名/表达式默认导出**：
 *    `export default <expr>` → `const <as> = <expr>`
 * 4. **命名导出 default**：
 *    `export { default }` → `const <as> = <name>`
 *    `export { default as Foo } from '...'` → import + 变量声明
 *
 * ### hasDefaultExport
 * 检测 AST 中是否存在默认导出。
 *
 * ### specifierEnd（辅助）
 * 处理 `export { default , foo }` 中逗号位置的精确计算。
 */

import { parse } from '@babel/parser'
import MagicString from 'magic-string'
import type { ParserPlugin } from '@babel/parser'
import type { Identifier, Statement } from '@babel/types'
import { resolveParserPlugins } from './script/context'

export function rewriteDefault(
  input: string,
  as: string,
  parserPlugins?: ParserPlugin[],
): string {
  const ast = parse(input, {
    sourceType: 'module',
    plugins: resolveParserPlugins('js', parserPlugins),
  }).program.body
  const s = new MagicString(input)

  rewriteDefaultAST(ast, s, as)

  return s.toString()
}

/**
 * 将 script 块的 export default 重写为变量声明，以便注入内容
 */
export function rewriteDefaultAST(
  ast: Statement[],
  s: MagicString,
  as: string,
): void {
  if (!hasDefaultExport(ast)) {
    s.append(`\nconst ${as} = {}`)
    return
  }

  // 如果 script 仍包含 `default export`，可能有
  // 多行注释或模板字符串，需完整遍历
  ast.forEach(node => {
    if (node.type === 'ExportDefaultDeclaration') {
      // 有命名的 class 声明 → 保留 class，追加变量声明
      if (node.declaration.type === 'ClassDeclaration' && node.declaration.id) {
        const start: number =
          node.declaration.decorators && node.declaration.decorators.length > 0
            ? node.declaration.decorators[
                node.declaration.decorators.length - 1
              ].end!
            : node.start!
        s.overwrite(start, node.declaration.id.start!, ` class `)
        s.append(`\nconst ${as} = ${node.declaration.id.name}`)
      } else {
        // 匿名/表达式默认导出 → 直接替换 export default 为 const
        s.overwrite(node.start!, node.declaration.start!, `const ${as} = `)
      }
    } else if (node.type === 'ExportNamedDeclaration') {
      for (const specifier of node.specifiers) {
        if (
          specifier.type === 'ExportSpecifier' &&
          specifier.exported.type === 'Identifier' &&
          specifier.exported.name === 'default'
        ) {
          // 有 source 的重导出（import → 变量声明）
          if (node.source) {
            if (specifier.local.name === 'default') {
              s.prepend(
                `import { default as __VUE_DEFAULT__ } from '${node.source.value}'\n`,
              )
              const end = specifierEnd(s, specifier.local.end!, node.end!)
              s.remove(specifier.start!, end)
              s.append(`\nconst ${as} = __VUE_DEFAULT__`)
              continue
            } else {
              s.prepend(
                `import { ${s.slice(
                  specifier.local.start!,
                  specifier.local.end!,
                )} as __VUE_DEFAULT__ } from '${node.source.value}'\n`,
              )
              const end = specifierEnd(s, specifier.exported.end!, node.end!)
              s.remove(specifier.start!, end)
              s.append(`\nconst ${as} = __VUE_DEFAULT__`)
              continue
            }
          }

          // 无 source 的命名导出 → 直接替换
          const end = specifierEnd(s, specifier.end!, node.end!)
          s.remove(specifier.start!, end)
          s.append(`\nconst ${as} = ${specifier.local.name}`)
        }
      }
    }
  })
}

export function hasDefaultExport(ast: Statement[]): boolean {
  for (const stmt of ast) {
    if (stmt.type === 'ExportDefaultDeclaration') {
      return true
    } else if (
      stmt.type === 'ExportNamedDeclaration' &&
      stmt.specifiers.some(
        spec => (spec.exported as Identifier).name === 'default',
      )
    ) {
      return true
    }
  }
  return false
}

/**
 * 计算 export specifier 的结束位置（跳过逗号和空白）
 * export { default   , foo } → 处理 default 后的 `,`
 */
function specifierEnd(s: MagicString, end: number, nodeEnd: number | null) {
  let hasCommas = false
  let oldEnd = end
  while (end < nodeEnd!) {
    if (/\s/.test(s.slice(end, end + 1))) {
      end++
    } else if (s.slice(end, end + 1) === ',') {
      end++
      hasCommas = true
      break
    } else if (s.slice(end, end + 1) === '}') {
      break
    }
  }
  return hasCommas ? end : oldEnd
}
