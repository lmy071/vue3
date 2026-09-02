/**
 * modules/class.ts —— class 属性 patch
 *
 * patchClass 处理动态 class 绑定。编译器会将 :class 绑定与静态 class
 * 合并为单一值传入。
 *
 * ## 三种路径
 *
 * - null/undefined → removeAttribute('class')
 * - SVG 元素 → setAttribute('class', value)（SVG className 不可靠）
 * - HTML 元素 → el.className = value（比 setAttribute 快）
 *
 * ## Transition 集成
 *
 * 过渡动画期间，el._vtc（Vue Transition Classes）存储临时添加的类名。
 * patchClass 会将它们合并到最终值中，避免覆盖过渡类。
 */

import { type ElementWithTransition, vtcKey } from '../components/Transition'

// compiler should normalize class + :class bindings on the same element
// into a single binding ['staticClass', dynamic]
export function patchClass(
  el: Element,
  value: string | null,
  isSVG: boolean,
): void {
  // directly setting className should be faster than setAttribute in theory
  // if this is an element during a transition, take the temporary transition
  // classes into account.
  const transitionClasses = (el as ElementWithTransition)[vtcKey]
  if (transitionClasses) {
    value = (
      value ? [value, ...transitionClasses] : [...transitionClasses]
    ).join(' ')
  }
  if (value == null) {
    el.removeAttribute('class')
  } else if (isSVG) {
    el.setAttribute('class', value)
  } else {
    el.className = value
  }
}
