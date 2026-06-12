/**
 * pluginTrim.ts —— PostCSS 空白修剪插件
 *
 * ## 功能概述
 * 一个 PostCSS 插件，用于规范化样式块内的空白字符。
 *
 * ## 处理逻辑
 * 遍历所有 rule 和 at-rule 节点：
 * - `raws.before` → 统一为单个换行 `\n`
 * - `raws.after` → 统一为单个换行 `\n`
 *
 * ## 用途
 * 在 SFC 样式提取过程中使用，去除多余的空白行，
 * 使输出的 CSS 格式一致且紧凑。
 */

import type { PluginCreator } from 'postcss'

const trimPlugin: PluginCreator<{}> = () => {
  return {
    postcssPlugin: 'vue-sfc-trim',
    Once(root) {
      root.walk(({ type, raws }) => {
        if (type === 'rule' || type === 'atrule') {
          if (raws.before) raws.before = '\n'
          if ('after' in raws && raws.after) raws.after = '\n'
        }
      })
    },
  }
}

trimPlugin.postcss = true
export default trimPlugin
