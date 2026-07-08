/**
 * directives/vShow.ts —— v-show 指令
 *
 * v-show 通过 CSS display 属性控制元素可见性。
 *
 * ## 工作原理
 *
 * 1. beforeMount：保存原始 display 值到 el._vod（Vue Original Display）
 * 2. 根据 binding.value 调用 setDisplay：
 *    - true → el.style.display = el._vod（恢复原始值）
 *    - false → el.style.display = 'none'
 * 3. el._vsh（Vue Show Hidden）标记隐藏状态
 *
 * ## Transition 集成
 *
 * 若元素绑定了 <Transition>：
 * - 显示：beforeEnter → setDisplay(true) → enter
 * - 隐藏：leave → setDisplay(false)（在 leave 回调中）
 *
 * ## SSR
 *
 * initVShowForSSR 提供 getSSRProps：value 为 false 时返回 { style: { display: 'none' } }
 */

import type { ObjectDirective } from '@vue/runtime-core'
import type { ObjectDirective } from '@vue/runtime-core'

export const vShowOriginalDisplay: unique symbol = Symbol('_vod')
export const vShowHidden: unique symbol = Symbol('_vsh')

export interface VShowElement extends HTMLElement {
  // _vod = vue original display
  [vShowOriginalDisplay]: string
  [vShowHidden]: boolean
}

export const vShow: ObjectDirective<VShowElement> & { name: 'show' } = {
  // used for prop mismatch check during hydration
  name: 'show',
  beforeMount(el, { value }, { transition }) {
    el[vShowOriginalDisplay] =
      el.style.display === 'none' ? '' : el.style.display
    if (transition && value) {
      transition.beforeEnter(el)
    } else {
      setDisplay(el, value)
    }
  },
  mounted(el, { value }, { transition }) {
    if (transition && value) {
      transition.enter(el)
    }
  },
  updated(el, { value, oldValue }, { transition }) {
    if (!value === !oldValue) return
    if (transition) {
      if (value) {
        transition.beforeEnter(el)
        setDisplay(el, true)
        transition.enter(el)
      } else {
        transition.leave(el, () => {
          setDisplay(el, false)
        })
      }
    } else {
      setDisplay(el, value)
    }
  },
  beforeUnmount(el, { value }) {
    setDisplay(el, value)
  },
}

function setDisplay(el: VShowElement, value: unknown): void {
  el.style.display = value ? el[vShowOriginalDisplay] : 'none'
  el[vShowHidden] = !value
}

// SSR vnode transforms, only used when user includes client-oriented render
// function in SSR
export function initVShowForSSR(): void {
  vShow.getSSRProps = ({ value }) => {
    if (!value) {
      return { style: { display: 'none' } }
    }
  }
}
