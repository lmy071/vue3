/**
 * nodeOps.ts —— DOM 节点操作平台适配
 *
 * 实现 RendererOptions 中除 patchProp 之外的所有 DOM 操作回调。
 * runtime-core 的渲染器通过此对象操作真实 DOM。
 *
 * ## 操作清单
 *
 * | 操作 | DOM API | 说明 |
 * |------|---------|------|
 * | insert | parent.insertBefore(child, anchor) | 在 anchor 前插入 |
 * | remove | parent.removeChild(child) | 移除子节点 |
 * | createElement | doc.createElement / createElementNS | 根据 namespace 创建 |
 * | createText | doc.createTextNode | 文本节点 |
 * | createComment | doc.createComment | 注释节点 |
 * | setText | node.nodeValue = text | 文本内容 |
 * | setElementText | el.textContent = text | 元素文本 |
 * | parentNode | node.parentNode | 父节点 |
 * | nextSibling | node.nextSibling | 下一个兄弟 |
 * | querySelector | doc.querySelector | 选择器查询 |
 * | setScopeId | el.setAttribute(id, '') | Scoped CSS 标记 |
 * | insertStaticContent | innerHTML + cloneNode | 静态内容批量插入 |
 *
 * ## Trusted Types 支持
 *
 * 若浏览器支持 Trusted Types API，创建名为 'vue' 的安全策略，
 * createHTML 直接透传。unsafeToTrustedHTML 用于 innerHTML 赋值时的类型安全。
 *
 * ## static 节点缓存
 *
 * insertStaticContent 优先使用缓存的静态节点（cloneNode），
 * 缓存不可用时通过 template 元素的 innerHTML 批量创建。
 */

import { warn } from '@vue/runtime-core'
import type { RendererOptions } from '@vue/runtime-core'
import type {
  TrustedHTML,
  TrustedTypePolicy,
  TrustedTypesWindow,
} from 'trusted-types/lib'

let policy: Pick<TrustedTypePolicy, 'name' | 'createHTML'> | undefined =
  undefined

const tt =
  typeof window !== 'undefined' &&
  (window as unknown as TrustedTypesWindow).trustedTypes

if (tt) {
  try {
    policy = /*@__PURE__*/ tt.createPolicy('vue', {
      createHTML: val => val,
    })
  } catch (e: unknown) {
    // `createPolicy` throws a TypeError if the name is a duplicate
    // and the CSP trusted-types directive is not using `allow-duplicates`.
    // So we have to catch that error.
    __DEV__ && warn(`Error creating trusted types policy: ${e}`)
  }
}

// __UNSAFE__
// Reason: potentially setting innerHTML.
// This function merely perform a type-level trusted type conversion
// for use in `innerHTML` assignment, etc.
// Be careful of whatever value passed to this function.
export const unsafeToTrustedHTML: (value: string) => TrustedHTML | string =
  policy ? val => policy.createHTML(val) : val => val

export const svgNS = 'http://www.w3.org/2000/svg'
export const mathmlNS = 'http://www.w3.org/1998/Math/MathML'

const doc = (typeof document !== 'undefined' ? document : null) as Document

const templateContainer = doc && /*@__PURE__*/ doc.createElement('template')

export const nodeOps: Omit<RendererOptions<Node, Element>, 'patchProp'> = {
  insert: (child, parent, anchor) => {
    parent.insertBefore(child, anchor || null)
  },

  remove: child => {
    const parent = child.parentNode
    if (parent) {
      parent.removeChild(child)
    }
  },

  createElement: (tag, namespace, is, props): Element => {
    const el =
      namespace === 'svg'
        ? doc.createElementNS(svgNS, tag)
        : namespace === 'mathml'
          ? doc.createElementNS(mathmlNS, tag)
          : is
            ? doc.createElement(tag, { is })
            : doc.createElement(tag)

    if (tag === 'select' && props && props.multiple != null) {
      ;(el as HTMLSelectElement).setAttribute('multiple', props.multiple)
    }

    return el
  },

  createText: text => doc.createTextNode(text),

  createComment: text => doc.createComment(text),

  setText: (node, text) => {
    node.nodeValue = text
  },

  setElementText: (el, text) => {
    el.textContent = text
  },

  parentNode: node => node.parentNode as Element | null,

  nextSibling: node => node.nextSibling,

  querySelector: selector => doc.querySelector(selector),

  setScopeId(el, id) {
    el.setAttribute(id, '')
  },

  // __UNSAFE__
  // Reason: innerHTML.
  // Static content here can only come from compiled templates.
  // As long as the user only uses trusted templates, this is safe.
  insertStaticContent(content, parent, anchor, namespace, start, end) {
    // <parent> before | first ... last | anchor </parent>
    const before = anchor ? anchor.previousSibling : parent.lastChild
    // #5308 can only take cached path if:
    // - has a single root node
    // - nextSibling info is still available
    if (start && (start === end || start.nextSibling)) {
      // cached
      while (true) {
        parent.insertBefore(start!.cloneNode(true), anchor)
        if (start === end || !(start = start!.nextSibling)) break
      }
    } else {
      // fresh insert
      templateContainer.innerHTML = unsafeToTrustedHTML(
        namespace === 'svg'
          ? `<svg>${content}</svg>`
          : namespace === 'mathml'
            ? `<math>${content}</math>`
            : content,
      ) as string

      const template = templateContainer.content
      if (namespace === 'svg' || namespace === 'mathml') {
        // remove outer svg/math wrapper
        const wrapper = template.firstChild!
        while (wrapper.firstChild) {
          template.appendChild(wrapper.firstChild)
        }
        template.removeChild(wrapper)
      }
      parent.insertBefore(template, anchor)
    }
    return [
      // first
      before ? before.nextSibling! : parent.firstChild!,
      // last
      anchor ? anchor.previousSibling! : parent.lastChild!,
    ]
  },
}
