/**
 * components/TransitionGroup.ts —— <TransitionGroup> 组件
 *
 * 列表过渡组件，为列表元素的位置移动添加动画。
 * 不支持 mode prop（TransitionGroup 中 mode 被删除）。
 *
 * ## 工作原理
 *
 * ### 三阶段动画
 *
 * 1. **Record**（before update）：记录每个子节点的旧位置
 *    `positionMap.set(child, getPosition(el))`
 *
 * 2. **Apply**（onUpdated）：记录新位置 → 计算偏移量 → 应用 FLIP 变换
 *    ```
 *    dx = oldPos.left - newPos.left
 *    dy = oldPos.top - newPos.top
 *    el.style.transform = translate(dx, dy)
 *    el.style.transitionDuration = '0s'
 *    ```
 *
 * 3. **Animate**（重排后）：
 *    - addClass(moveClass) → 清除 transform → CSS transition 动画
 *    - transitionend → removeClass(moveClass)
 *
 * ## FLIP 动画（First, Last, Invert, Play）
 *
 * FLIP 将元素从旧位置"瞬间"移到新位置，再通过 CSS transition 平滑过渡。
 * 此处的"瞬间移动"通过 transform 实现（无 layout 重计算），
 * transitionDuration='0s' 确保变换不产生动画。
 *
 * ## scale 校正
 *
 * 如果元素在移动过程中发生了尺寸变化（如宽度从 100px 变为 200px），
 * 需要缩放 transform 偏移量以补偿，避免视觉抖动。
 * scaleX = rect.width / el.offsetWidth
 *
 * ## hasCSSTransform 检测
 *
 * 在决定是否执行 FLIP 前，克隆目标元素检测 moveClass 是否触发了 CSS transition。
 * 如果 moveClass 没有 transform transition，跳过动画（避免无关重排）。
 *
 * ## key 属性要求
 *
 * TransitionGroup 要求所有子元素都有唯一 key，用于追踪元素移动。
 *
 * ## Vue 2.x 兼容
 *
 * - TRANSITION_GROUP_ROOT：没有 tag prop 时默认使用 <span> 而非 Fragment
 */

import {
  type ElementWithTransition,
  type TransitionProps,
  TransitionPropsValidators,
  addTransitionClass,
  forceReflow,
  getTransitionInfo,
  removeTransitionClass,
  resolveTransitionProps,
  vtcKey,
} from './Transition'
import { type VShowElement, vShowHidden } from '../directives/vShow'
import {
  type ComponentOptions,
  DeprecationTypes,
  Fragment,
  type SetupContext,
  Text,
  type VNode,
  compatUtils,
  createVNode,
  getCurrentInstance,
  getTransitionRawChildren,
  onUpdated,
  resolveTransitionHooks,
  setTransitionHooks,
  toRaw,
  useTransitionState,
  warn,
} from '@vue/runtime-core'
import { extend } from '@vue/shared'

interface Position {
  top: number
  left: number
}

const positionMap = new WeakMap<VNode, Position>()
const newPositionMap = new WeakMap<VNode, Position>()
const moveCbKey = Symbol('_moveCb')
const enterCbKey = Symbol('_enterCb')

export type TransitionGroupProps = Omit<TransitionProps, 'mode'> & {
  tag?: string
  moveClass?: string
}

/**
 * Wrap logic that modifies TransitionGroup properties in a function
 * so that it can be annotated as pure
 */
const decorate = (t: typeof TransitionGroupImpl) => {
  // TransitionGroup does not support "mode" so we need to remove it from the
  // props declarations, but direct delete operation is considered a side effect
  delete t.props.mode
  if (__COMPAT__) {
    t.__isBuiltIn = true
  }
  return t
}

const TransitionGroupImpl: ComponentOptions = /*@__PURE__*/ decorate({
  name: 'TransitionGroup',

  props: /*@__PURE__*/ extend({}, TransitionPropsValidators, {
    tag: String,
    moveClass: String,
  }),

  setup(props: TransitionGroupProps, { slots }: SetupContext) {
    const instance = getCurrentInstance()!
    const state = useTransitionState()
    let prevChildren: VNode[]
    let children: VNode[]

    onUpdated(() => {
      // children is guaranteed to exist after initial render
      if (!prevChildren.length) {
        return
      }
      const moveClass = props.moveClass || `${props.name || 'v'}-move`

      if (
        !hasCSSTransform(
          prevChildren[0].el as ElementWithTransition,
          instance.vnode.el as Node,
          moveClass,
        )
      ) {
        prevChildren = []
        return
      }

      // we divide the work into three loops to avoid mixing DOM reads and writes
      // in each iteration - which helps prevent layout thrashing.
      prevChildren.forEach(callPendingCbs)
      prevChildren.forEach(recordPosition)
      const movedChildren = prevChildren.filter(applyTranslation)

      // force reflow to put everything in position
      forceReflow(instance.vnode.el as Node)

      movedChildren.forEach(c => {
        const el = c.el as ElementWithTransition
        const style = el.style
        addTransitionClass(el, moveClass)
        style.transform = style.webkitTransform = style.transitionDuration = ''
        const cb = ((el as any)[moveCbKey] = (e: TransitionEvent) => {
          if (e && e.target !== el) {
            return
          }
          if (!e || e.propertyName.endsWith('transform')) {
            el.removeEventListener('transitionend', cb)
            ;(el as any)[moveCbKey] = null
            removeTransitionClass(el, moveClass)
          }
        })
        el.addEventListener('transitionend', cb)
      })
      prevChildren = []
    })

    return () => {
      const rawProps = toRaw(props)
      const cssTransitionProps = resolveTransitionProps(rawProps)
      let tag = rawProps.tag || Fragment

      if (
        __COMPAT__ &&
        !rawProps.tag &&
        compatUtils.checkCompatEnabled(
          DeprecationTypes.TRANSITION_GROUP_ROOT,
          instance.parent,
        )
      ) {
        tag = 'span'
      }

      prevChildren = []
      if (children) {
        for (let i = 0; i < children.length; i++) {
          const child = children[i]
          if (
            child.el &&
            child.el instanceof Element &&
            // Hidden v-show nodes have no previous layout box to animate from.
            !(child.el as VShowElement)[vShowHidden]
          ) {
            prevChildren.push(child)
            setTransitionHooks(
              child,
              resolveTransitionHooks(
                child,
                cssTransitionProps,
                state,
                instance,
              ),
            )
            positionMap.set(child, getPosition(child.el as HTMLElement))
          }
        }
      }

      children = slots.default ? getTransitionRawChildren(slots.default()) : []

      for (let i = 0; i < children.length; i++) {
        const child = children[i]
        if (child.key != null) {
          setTransitionHooks(
            child,
            resolveTransitionHooks(child, cssTransitionProps, state, instance),
          )
        } else if (__DEV__ && child.type !== Text) {
          warn(`<TransitionGroup> children must be keyed.`)
        }
      }

      return createVNode(tag, null, children)
    }
  },
})

export const TransitionGroup = TransitionGroupImpl as unknown as {
  new (): {
    $props: TransitionGroupProps
  }
}

function callPendingCbs(c: VNode) {
  const el = c.el as any
  if (el[moveCbKey]) {
    el[moveCbKey]()
  }
  if (el[enterCbKey]) {
    el[enterCbKey]()
  }
}

function recordPosition(c: VNode) {
  newPositionMap.set(c, getPosition(c.el as HTMLElement))
}

function applyTranslation(c: VNode): VNode | undefined {
  const oldPos = positionMap.get(c)!
  const newPos = newPositionMap.get(c)!
  const dx = oldPos.left - newPos.left
  const dy = oldPos.top - newPos.top
  if (dx || dy) {
    const el = c.el as HTMLElement
    const s = el.style
    const rect = el.getBoundingClientRect()
    let scaleX = 1
    let scaleY = 1
    if (el.offsetWidth) scaleX = rect.width / el.offsetWidth
    if (el.offsetHeight) scaleY = rect.height / el.offsetHeight
    if (!Number.isFinite(scaleX) || scaleX === 0) scaleX = 1
    if (!Number.isFinite(scaleY) || scaleY === 0) scaleY = 1
    // Avoid division noise when scale is effectively 1.
    if (Math.abs(scaleX - 1) < 0.01) scaleX = 1
    if (Math.abs(scaleY - 1) < 0.01) scaleY = 1
    s.transform = s.webkitTransform = `translate(${dx / scaleX}px,${
      dy / scaleY
    }px)`
    s.transitionDuration = '0s'
    return c
  }
}

function getPosition(el: HTMLElement): Position {
  const rect = el.getBoundingClientRect()
  return {
    left: rect.left,
    top: rect.top,
  }
}

function hasCSSTransform(
  el: ElementWithTransition,
  root: Node,
  moveClass: string,
): boolean {
  // Detect whether an element with the move class applied has
  // CSS transitions. Since the element may be inside an entering
  // transition at this very moment, we make a clone of it and remove
  // all other transition classes applied to ensure only the move class
  // is applied.
  const clone = el.cloneNode() as HTMLElement
  const _vtc = el[vtcKey]
  if (_vtc) {
    _vtc.forEach(cls => {
      cls.split(/\s+/).forEach(c => c && clone.classList.remove(c))
    })
  }
  moveClass.split(/\s+/).forEach(c => c && clone.classList.add(c))
  clone.style.display = 'none'
  const container = (
    root.nodeType === 1 ? root : root.parentNode
  ) as HTMLElement
  container.appendChild(clone)
  const { hasTransform } = getTransitionInfo(clone)
  container.removeChild(clone)
  return hasTransform
}
