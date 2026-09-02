/**
 * helpers/useCssModule.ts —— useCssModule 组合式函数
 *
 * 在 setup() 中获取 CSS Modules 注入的类名映射。
 *
 * ## 用法
 *
 * ```ts
 * const $style = useCssModule()     // 默认 $style
 * const $foo = useCssModule('foo')  // 具名模块
 * ```
 *
 * ## 实现
 *
 * 通过 getCurrentInstance() 获取组件实例，从 instance.type.__cssModules 读取模块映射。
 * 全局构建中直接返回 EMPTY_OBJ。
 */

import { getCurrentInstance, warn } from '@vue/runtime-core'
import { EMPTY_OBJ } from '@vue/shared'

export function useCssModule(name = '$style'): Record<string, string> {
  if (!__GLOBAL__) {
    const instance = getCurrentInstance()!
    if (!instance) {
      __DEV__ && warn(`useCssModule must be called inside setup()`)
      return EMPTY_OBJ
    }
    const modules = instance.type.__cssModules
    if (!modules) {
      __DEV__ && warn(`Current instance does not have CSS modules injected.`)
      return EMPTY_OBJ
    }
    const mod = modules[name]
    if (!mod) {
      __DEV__ &&
        warn(`Current instance does not have CSS module named "${name}".`)
      return EMPTY_OBJ
    }
    return mod as Record<string, string>
  } else {
    /* v8 ignore start */
    if (__DEV__) {
      warn(`useCssModule() is not supported in the global build.`)
    }
    return EMPTY_OBJ
    /* v8 ignore stop */
  }
}
