/**
 * patchProp.ts —— 属性/样式/事件 patch 分发器
 *
 * DOM 平台 patchProp 实现，根据 key 类型分发到不同的 patch 模块。
 *
 * ## 分发决策树
 *
 * ```
 * patchProp(el, key, prev, next, ...)
 *   │
 *   ├── key === 'class'     → patchClass()     (modules/class.ts)
 *   ├── key === 'style'     → patchStyle()     (modules/style.ts)
 *   ├── isOn(key)           → patchEvent()     (modules/events.ts)
 *   │                          跳过 v-model listeners
 *   ├── . 前缀              → patchDOMProp()   (强制 DOM prop)
 *   ├── ^ 前缀              → patchAttr()      (强制 HTML attribute)
 *   ├── shouldSetAsProp()   → patchDOMProp()   (modules/props.ts)
 *   │   ├── value/checked/selected + 非自定义元素 → 同时设置 attribute
 *   ├── VueElement + prop   → patchDOMProp()   (camelize)
 *   └── 其他                → patchAttr()      (modules/attrs.ts)
 * ```
 *
 * ## shouldSetAsProp 规则
 *
 * position: svg 元素除 innerHTML/textContent/原生 onclick 外都用 attribute
 * 强制 attribute：spellcheck/draggable/translate/autocorrect/form/iframe sandbox
 * 强制 attribute：<input list>、<textarea type>、<img/video/canvas/source width/height>
 * 默认：key in el（DOM 属性存在则用 prop）
 */

import { patchClass } from './modules/class'
import { patchClass } from './modules/class'
import { patchStyle } from './modules/style'
import { patchAttr } from './modules/attrs'
import { patchDOMProp } from './modules/props'
import { patchEvent } from './modules/events'
import {
  camelize,
  isFunction,
  isModelListener,
  isOn,
  isString,
} from '@vue/shared'
import type { RendererOptions } from '@vue/runtime-core'
import type { VueElement } from './apiCustomElement'

const isNativeOn = (key: string) =>
  key.charCodeAt(0) === 111 /* o */ &&
  key.charCodeAt(1) === 110 /* n */ &&
  // lowercase letter
  key.charCodeAt(2) > 96 &&
  key.charCodeAt(2) < 123

type DOMRendererOptions = RendererOptions<Node, Element>

export const patchProp: DOMRendererOptions['patchProp'] = (
  el,
  key,
  prevValue,
  nextValue,
  namespace,
  parentComponent,
) => {
  const isSVG = namespace === 'svg'
  if (key === 'class') {
    patchClass(el, nextValue, isSVG)
  } else if (key === 'style') {
    patchStyle(el, prevValue, nextValue)
  } else if (isOn(key)) {
    // ignore v-model listeners
    if (!isModelListener(key)) {
      patchEvent(el, key, prevValue, nextValue, parentComponent)
    }
  } else if (
    key[0] === '.'
      ? ((key = key.slice(1)), true)
      : key[0] === '^'
        ? ((key = key.slice(1)), false)
        : shouldSetAsProp(el, key, nextValue, isSVG)
  ) {
    patchDOMProp(el, key, nextValue, parentComponent)
    // #6007 also set form state as attributes so they work with
    // <input type="reset"> or libs / extensions that expect attributes
    // #11163 custom elements may use value as an prop and set it as object
    if (
      !el.tagName.includes('-') &&
      (key === 'value' || key === 'checked' || key === 'selected')
    ) {
      patchAttr(el, key, nextValue, isSVG, parentComponent, key !== 'value')
    }
  } else if (
    // #11081 force set props for possible async custom element
    (el as VueElement)._isVueCE &&
    // #12408 check if it's declared prop or it's async custom element
    (shouldSetAsPropForVueCE(el as VueElement, key) ||
      // @ts-expect-error _def is private
      ((el as VueElement)._def.__asyncLoader &&
        (/[A-Z]/.test(key) || !isString(nextValue))))
  ) {
    patchDOMProp(el, camelize(key), nextValue, parentComponent, key)
  } else {
    // special case for <input v-model type="checkbox"> with
    // :true-value & :false-value
    // store value as dom properties since non-string values will be
    // stringified.
    if (key === 'true-value') {
      ;(el as any)._trueValue = nextValue
    } else if (key === 'false-value') {
      ;(el as any)._falseValue = nextValue
    }
    patchAttr(el, key, nextValue, isSVG, parentComponent)
  }
}

function shouldSetAsProp(
  el: Element,
  key: string,
  value: unknown,
  isSVG: boolean,
) {
  if (isSVG) {
    // most keys must be set as attribute on svg elements to work
    // ...except innerHTML & textContent
    if (key === 'innerHTML' || key === 'textContent') {
      return true
    }
    // or native onclick with function values
    if (key in el && isNativeOn(key) && isFunction(value)) {
      return true
    }
    return false
  }

  // these are enumerated attrs, however their corresponding DOM properties
  // are actually booleans - this leads to setting it with a string "false"
  // value leading it to be coerced to `true`, so we need to always treat
  // them as attributes.
  // Note that `contentEditable` doesn't have this problem: its DOM
  // property is also enumerated string values.
  if (
    key === 'spellcheck' ||
    key === 'draggable' ||
    key === 'translate' ||
    key === 'autocorrect'
  ) {
    return false
  }

  // #13946 iframe.sandbox should always be set as attribute since setting
  // the property to null results in 'null' string, and setting to empty string
  // enables the most restrictive sandbox mode instead of no sandboxing.
  if (key === 'sandbox' && el.tagName === 'IFRAME') {
    return false
  }

  // #1787, #2840 form property on form elements is readonly and must be set as
  // attribute.
  if (key === 'form') {
    return false
  }

  // #1526 <input list> must be set as attribute
  if (key === 'list' && el.tagName === 'INPUT') {
    return false
  }

  // #2766 <textarea type> must be set as attribute
  if (key === 'type' && el.tagName === 'TEXTAREA') {
    return false
  }

  // #8780 the width or height of embedded tags must be set as attribute
  if (key === 'width' || key === 'height') {
    const tag = el.tagName
    if (
      tag === 'IMG' ||
      tag === 'VIDEO' ||
      tag === 'CANVAS' ||
      tag === 'SOURCE'
    ) {
      return false
    }
  }

  // native onclick with string value, must be set as attribute
  if (isNativeOn(key) && isString(value)) {
    return false
  }

  return key in el
}

function shouldSetAsPropForVueCE(el: VueElement, key: string) {
  const props = // @ts-expect-error _def is private
    el._def.props as Record<string, unknown> | string[] | undefined
  if (!props) {
    return false
  }

  const camelKey = camelize(key)
  return Array.isArray(props)
    ? props.some(prop => camelize(prop) === camelKey)
    : Object.keys(props).some(prop => camelize(prop) === camelKey)
}
