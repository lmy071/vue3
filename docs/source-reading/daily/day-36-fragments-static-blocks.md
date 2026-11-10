# Day 36：Fragment、Static VNode 与 Block Tree

> 阶段：渲染器｜建议投入：约 3 小时｜目标：形成可以通过代码、测试和实验复验的理解。

## 今日目标

- Fragment 用 start/end anchor 表示无真实父元素的节点范围
- Static VNode 可由 hostInsertStaticContent 克隆整段内容
- Block dynamicChildren 只记录需要更新的后代

## 源码入口

- [packages/runtime-core/src/renderer.ts](../../../packages/runtime-core/src/renderer.ts)
- [packages/runtime-core/src/vnode.ts](../../../packages/runtime-core/src/vnode.ts)

## 核心机制

1. Fragment 用 start/end anchor 表示无真实父元素的节点范围
2. Static VNode 可由 hostInsertStaticContent 克隆整段内容
3. Block dynamicChildren 只记录需要更新的后代

不要从第一行机械读到最后一行。先确定入口输入和外部结果，再围绕上面的机制追踪分支；开发警告、compat 和复杂类型分支第一遍只做标记。

## 主调用链

```text
compiled block → openBlock/createElementBlock → dynamicChildren → processFragment/patchBlockChildren
```

阅读时给链路中的每个箭头补上：调用函数、关键参数、被修改的状态，以及它属于同步执行、批处理还是异步队列。

## 精读步骤

1. 打开 `packages/runtime-core/src/renderer.ts`，定位公共入口、核心数据结构和主要分派点；记录它向下调用的 2～4 个函数。
2. 打开 `packages/runtime-core/src/vnode.ts`，定位公共入口、核心数据结构和主要分派点；记录它向下调用的 2～4 个函数。
3. 全仓搜索今日核心函数的调用方，分别找出至少一个生产者和消费者。
4. 对照测试，用边界用例修正自己的初始推断。

## 动手实验

1. 渲染多根 Fragment 并观察两个 anchor
2. 比较 STABLE/KEYED/UNKEYED_FRAGMENT
3. 跟踪静态节点 mount、move、remove

实验必须记录“输入、预期、实际结果、源码解释”，只记录最终输出不算完成。

## 测试与反证

- [packages/runtime-core/__tests__/rendererFragment.spec.ts](../../../packages/runtime-core/__tests__/rendererFragment.spec.ts)
- [packages/runtime-dom/__tests__/rendererStaticNode.spec.ts](../../../packages/runtime-dom/__tests__/rendererStaticNode.spec.ts)
- [packages/runtime-core/__tests__/rendererOptimizedMode.spec.ts](../../../packages/runtime-core/__tests__/rendererOptimizedMode.spec.ts)

```bash
pnpm vitest packages/runtime-core/__tests__/rendererFragment.spec.ts
pnpm vitest packages/runtime-dom/__tests__/rendererStaticNode.spec.ts
pnpm vitest packages/runtime-core/__tests__/rendererOptimizedMode.spec.ts
```

若当前仓库基线阻止测试启动，记录首个环境/语法错误和阻断链，不要把它误判成今日主题的行为错误。

## 闭卷验收

1. Fragment 为什么需要两个 anchor？
2. block tree 与普通 VNode tree 的关系是什么？
3. 静态节点 hydration 为什么可跳过子树？

## 今日完成标准

- [ ] 能不看源码画出主调用链。
- [ ] 能解释至少三个关键分支及其设计权衡。
- [ ] 完成全部实验，并阅读对应测试中的边界案例。
- [ ] 写出一个最小复刻、伪代码或状态转换表。
- [ ] 将仍不确定的问题标注为“事实缺口”或“设计取舍”。

## 导航

上一天：[Day 35｜patchElement 与 Props 快路径](./day-35-patch-element.md)  
下一天：[Day 37｜mountComponent 首次组件挂载](./day-37-mount-component.md)
