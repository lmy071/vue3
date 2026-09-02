/**
 * helpers/useCssVars.ts —— useCssVars 组合式函数
 *
 * SFC CSS 变量注入的运行时 helper。在 <style vars="{ color }"> 中使用。
 *
 * ## 工作流
 *
 * 1. 组件挂载后通过 getter 获取 CSS 变量值
 * 2. setVarsOnNode：遍历 vnode 树，设置 CSS 自定义属性（--*）
 * 3. MutationObserver：监听父节点 DOM 变化，刷新子组件变量
 * 4. Teleport 支持：通过 data-v-owner 属性定位，ut（updateTeleports）批量更新
 *
 * ## VNode 遍历
 *
 * setVarsOnVNode 处理三种情况：
 * - 组件 → 递归到 subtree
 * - ELEMENT → setVarsOnNode
 * - Fragment/Static → 遍历子节点
 *
 * ## 性能
 *
 * onBeforeUpdate 中通过 queuePostFlushCb 延迟 setVars，避免同步阻塞。
 * watch + flush: 'post' 确保 DOM 更新后再写入 CSS 变量。
 */

import {
  Fragment,
  Static,
  type VNode,
  getCurrentInstance,
  onBeforeUpdate,
  onMounted,
  onUnmounted,
  queuePostFlushCb,
  warn,
  watch,
} from '@vue/runtime-core'
import { NOOP, ShapeFlags, normalizeCssVarValue } from '@vue/shared'

export const CSS_VAR_TEXT: unique symbol = Symbol(__DEV__ ? 'CSS_VAR_TEXT' : '')
/**
 * Runtime helper for SFC's CSS variable injection feature.
 * @private
 */
export function useCssVars(
  getter: (ctx: any) => Record<string, unknown>,
): void {
  if (!__BROWSER__ && !__TEST__) return

  const instance = getCurrentInstance()
  /* v8 ignore start */
  if (!instance) {
    __DEV__ &&
      warn(`useCssVars is called without current active component instance.`)
    return
  }
  /* v8 ignore stop */

  const updateTeleports = (instance.ut = (vars = getter(instance.proxy)) => {
    Array.from(
      document.querySelectorAll(`[data-v-owner="${instance.uid}"]`),
    ).forEach(node => setVarsOnNode(node, vars))
  })

  if (__DEV__) {
    instance.getCssVars = () => getter(instance.proxy)
  }

  const setVars = () => {
    const vars = getter(instance.proxy)
    if (instance.ce) {
      setVarsOnNode(instance.ce as any, vars)
    } else {
      setVarsOnVNode(instance.subTree, vars)
    }
    updateTeleports(vars)
  }

  // handle cases where child component root is affected
  // and triggers reflow in onMounted
  onBeforeUpdate(() => {
    queuePostFlushCb(setVars)
  })

  onMounted(() => {
    // run setVars synchronously here, but run as post-effect on changes
    watch(setVars, NOOP, { flush: 'post' })
    const ob = new MutationObserver(setVars)
    ob.observe(instance.subTree.el!.parentNode, { childList: true })
    onUnmounted(() => ob.disconnect())
  })
}

function setVarsOnVNode(vnode: VNode, vars: Record<string, unknown>) {
  if (__FEATURE_SUSPENSE__ && vnode.shapeFlag & ShapeFlags.SUSPENSE) {
    const suspense = vnode.suspense!
    vnode = suspense.activeBranch!
    if (suspense.pendingBranch && !suspense.isHydrating) {
      suspense.effects.push(() => {
        setVarsOnVNode(suspense.activeBranch!, vars)
      })
    }
  }

  // drill down HOCs until it's a non-component vnode
  while (vnode.component) {
    vnode = vnode.component.subTree
  }

  if (vnode.shapeFlag & ShapeFlags.ELEMENT && vnode.el) {
    setVarsOnNode(vnode.el as Node, vars)
  } else if (vnode.type === Fragment) {
    ;(vnode.children as VNode[]).forEach(c => setVarsOnVNode(c, vars))
  } else if (vnode.type === Static) {
    let { el, anchor } = vnode
    while (el) {
      setVarsOnNode(el as Node, vars)
      if (el === anchor) break
      el = el.nextSibling
    }
  }
}

function setVarsOnNode(el: Node, vars: Record<string, unknown>) {
  if (el.nodeType === 1) {
    const style = (el as HTMLElement).style
    let cssText = ''
    for (const key in vars) {
      const value = normalizeCssVarValue(vars[key])
      style.setProperty(`--${key}`, value)
      cssText += `--${key}: ${value};`
    }
    ;(style as any)[CSS_VAR_TEXT] = cssText
  }
}
