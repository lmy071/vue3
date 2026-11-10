# Day 44：Hydration 核心遍历与节点接管

> 阶段：渲染器｜建议投入：约 3 小时｜目标：形成可以通过代码、测试和实验复验的理解。

## 今日目标

- hydrate 从已有 DOM 与客户端 VNode 同步遍历，不重新创建匹配节点
- hydrateNode 按 VNode 类型/shapeFlag 分派并返回下一个宿主节点
- mismatch 需要删除/插入并保持遍历指针与 anchor 正确

## 源码入口

- [packages/runtime-core/src/hydration.ts](../../../packages/runtime-core/src/hydration.ts)
- [packages/runtime-core/src/renderer.ts](../../../packages/runtime-core/src/renderer.ts)

## 核心机制

1. hydrate 从已有 DOM 与客户端 VNode 同步遍历，不重新创建匹配节点
2. hydrateNode 按 VNode 类型/shapeFlag 分派并返回下一个宿主节点
3. mismatch 需要删除/插入并保持遍历指针与 anchor 正确

不要从第一行机械读到最后一行。先确定入口输入和外部结果，再围绕上面的机制追踪分支；开发警告、compat 和复杂类型分支第一遍只做标记。

## 主调用链

```text
hydrate(vnode,container) → hydrateNode(dom,vnode) → element/component/fragment/teleport/suspense → next node
```

阅读时给链路中的每个箭头补上：调用函数、关键参数、被修改的状态，以及它属于同步执行、批处理还是异步队列。

## 精读步骤

1. 打开 `packages/runtime-core/src/hydration.ts`，定位公共入口、核心数据结构和主要分派点；记录它向下调用的 2～4 个函数。
2. 打开 `packages/runtime-core/src/renderer.ts`，定位公共入口、核心数据结构和主要分派点；记录它向下调用的 2～4 个函数。
3. 全仓搜索今日核心函数的调用方，分别找出至少一个生产者和消费者。
4. 对照测试，用边界用例修正自己的初始推断。

## 动手实验

1. 画出服务端 DOM 与客户端 VNode 双指针
2. 制造文本、元素类型、children 数量 mismatch
3. 记录 vnode.el 如何接管现有节点

实验必须记录“输入、预期、实际结果、源码解释”，只记录最终输出不算完成。

## 测试与反证

- [packages/runtime-core/__tests__/hydration.spec.ts](../../../packages/runtime-core/__tests__/hydration.spec.ts)

```bash
pnpm vitest packages/runtime-core/__tests__/hydration.spec.ts
```

若当前仓库基线阻止测试启动，记录首个环境/语法错误和阻断链，不要把它误判成今日主题的行为错误。

## 闭卷验收

1. hydration 与 mount 的核心区别是什么？
2. hydrateNode 为什么返回 next node？
3. mismatch 恢复为何不能简单清空整个容器？

## 今日完成标准

- [ ] 能不看源码画出主调用链。
- [ ] 能解释至少三个关键分支及其设计权衡。
- [ ] 完成全部实验，并阅读对应测试中的边界案例。
- [ ] 写出一个最小复刻、伪代码或状态转换表。
- [ ] 将仍不确定的问题标注为“事实缺口”或“设计取舍”。

## 导航

上一天：[Day 43｜卸载、移动、Template Ref 与 Directives](./day-43-unmount-ref-directives.md)  
下一天：[Day 45｜Renderer 全链路复刻与验收](./day-45-runtime-integration.md)

