/**
 * modules/attrs.ts —— HTML attribute patch
 *
 * ## setAttribute / removeAttribute 封装
 *
 * patchAttr 处理普通 HTML attribute 的设置与删除：
 * - null/undefined → removeAttribute
 * - SVG xlink: → setAttributeNS / removeAttributeNS
 * - 特殊布尔属性（disabled/checked 等，无对应 DOM prop）→ setAttribute(key, '') 或 removeAttribute
 * - false 值 → removeAttribute（非特殊布尔属性）
 *
 * ## Vue 2.x 兼容
 *
 * compatCoerceAttr 处理 Vue 2 的 SEO 属性强制：
 * - contenteditable/draggable/spellcheck → 'true'/'false' 字符串
 * - false 值移除 → ATTR_FALSE_VALUE 废弃警告
 */

import {
  NOOP,
  includeBooleanAttr,
  isSpecialBooleanAttr,
  isSymbol,
  makeMap,
} from '@vue/shared'
import {
  type ComponentInternalInstance,
  DeprecationTypes,
  compatUtils,
} from '@vue/runtime-core'

export const xlinkNS = 'http://www.w3.org/1999/xlink'

export function patchAttr(
  el: Element,
  key: string,
  value: any,
  isSVG: boolean,
  instance?: ComponentInternalInstance | null,
  isBoolean: boolean = isSpecialBooleanAttr(key),
): void {
  if (isSVG && key.startsWith('xlink:')) {
    if (value == null) {
      el.removeAttributeNS(xlinkNS, key.slice(6, key.length))
    } else {
      el.setAttributeNS(xlinkNS, key, value)
    }
  } else {
    if (__COMPAT__ && compatCoerceAttr(el, key, value, instance)) {
      return
    }

    // note we are only checking boolean attributes that don't have a
    // corresponding dom prop of the same name here.
    if (value == null || (isBoolean && !includeBooleanAttr(value))) {
      el.removeAttribute(key)
    } else {
      // attribute value is a string https://html.spec.whatwg.org/multipage/dom.html#attributes
      el.setAttribute(
        key,
        isBoolean ? '' : isSymbol(value) ? String(value) : value,
      )
    }
  }
}

// 2.x compat
const isEnumeratedAttr = __COMPAT__
  ? /*@__PURE__*/ makeMap('contenteditable,draggable,spellcheck')
  : NOOP

export function compatCoerceAttr(
  el: Element,
  key: string,
  value: unknown,
  instance: ComponentInternalInstance | null = null,
): boolean {
  if (isEnumeratedAttr(key)) {
    const v2CoercedValue =
      value === undefined
        ? null
        : value === null || value === false || value === 'false'
          ? 'false'
          : 'true'
    if (
      v2CoercedValue &&
      compatUtils.softAssertCompatEnabled(
        DeprecationTypes.ATTR_ENUMERATED_COERCION,
        instance,
        key,
        value,
        v2CoercedValue,
      )
    ) {
      el.setAttribute(key, v2CoercedValue)
      return true
    }
  } else if (
    value === false &&
    !(el.tagName === 'INPUT' && key === 'value') &&
    !isSpecialBooleanAttr(key) &&
    compatUtils.isCompatEnabled(DeprecationTypes.ATTR_FALSE_VALUE, instance)
  ) {
    compatUtils.warnDeprecation(
      DeprecationTypes.ATTR_FALSE_VALUE,
      instance,
      key,
    )
    el.removeAttribute(key)
    return true
  }
  return false
}
