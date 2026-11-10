# Day 27：Slots 初始化、更新与渲染上下文

> 阶段：运行时模型｜建议投入：约 3 小时｜目标：形成可以通过代码、测试和实验复验的理解。

## 今日目标

- 对象 slots、VNode children 和函数 slot 被统一为函数返回 VNode 数组
- withCtx 绑定 currentRenderingInstance 并控制 block tracking
- SlotFlags 决定稳定 slot 是否需要删除/更新

## 源码入口

- [packages/runtime-core/src/componentSlots.ts](../../../packages/runtime-core/src/componentSlots.ts)
- [packages/runtime-core/src/componentRenderContext.ts](../../../packages/runtime-core/src/componentRenderContext.ts)
- [packages/runtime-core/src/helpers/renderSlot.ts](../../../packages/runtime-core/src/helpers/renderSlot.ts)

## 核心机制

1. 对象 slots、VNode children 和函数 slot 被统一为函数返回 VNode 数组
2. withCtx 绑定 currentRenderingInstance 并控制 block tracking
3. SlotFlags 决定稳定 slot 是否需要删除/更新

不要从第一行机械读到最后一行。先确定入口输入和外部结果，再围绕上面的机制追踪分支；开发警告、compat 和复杂类型分支第一遍只做标记。

## 主调用链

```text
vnode.children → initSlots → normalizeSlot/withCtx → instance.slots → renderSlot
```

阅读时给链路中的每个箭头补上：调用函数、关键参数、被修改的状态，以及它属于同步执行、批处理还是异步队列。

## 精读步骤

1. 打开 `packages/runtime-core/src/componentSlots.ts`，定位公共入口、核心数据结构和主要分派点；记录它向下调用的 2～4 个函数。
2. 打开 `packages/runtime-core/src/componentRenderContext.ts`，定位公共入口、核心数据结构和主要分派点；记录它向下调用的 2～4 个函数。
3. 打开 `packages/runtime-core/src/helpers/renderSlot.ts`，定位公共入口、核心数据结构和主要分派点；记录它向下调用的 2～4 个函数。
4. 全仓搜索今日核心函数的调用方，分别找出至少一个生产者和消费者。
5. 对照测试，用边界用例修正自己的初始推断。

## 动手实验

1. 比较 stable、dynamic、forwarded slots
2. 验证非函数 slot 的开发警告
3. 跟踪 slot 调用时 currentRenderingInstance

实验必须记录“输入、预期、实际结果、源码解释”，只记录最终输出不算完成。

## 测试与反证

- [packages/runtime-core/__tests__/componentSlots.spec.ts](../../../packages/runtime-core/__tests__/componentSlots.spec.ts)
- [packages/runtime-core/__tests__/helpers/renderSlot.spec.ts](../../../packages/runtime-core/__tests__/helpers/renderSlot.spec.ts)

```bash
pnpm vitest packages/runtime-core/__tests__/componentSlots.spec.ts
pnpm vitest packages/runtime-core/__tests__/helpers/renderSlot.spec.ts
```

若当前仓库基线阻止测试启动，记录首个环境/语法错误和阻断链，不要把它误判成今日主题的行为错误。

## 闭卷验收

1. 为什么 slots 统一成函数？
2. withCtx 为什么临时切换渲染实例？
3. 稳定 slot 如何减少子组件更新？

## 今日完成标准

- [ ] 能不看源码画出主调用链。
- [ ] 能解释至少三个关键分支及其设计权衡。
- [ ] 完成全部实验，并阅读对应测试中的边界案例。
- [ ] 写出一个最小复刻、伪代码或状态转换表。
- [ ] 将仍不确定的问题标注为“事实缺口”或“设计取舍”。

## 导航

上一天：[Day 26｜Emits 规范化与事件派发](./day-26-component-emits.md)  
下一天：[Day 28｜组件公开代理与 Options API 汇合](./day-28-public-instance-options.md)

