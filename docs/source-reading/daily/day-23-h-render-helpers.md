# Day 23：h API 与编译器运行时 Helpers

> 阶段：运行时模型｜建议投入：约 3 小时｜目标：形成可以通过代码、测试和实验复验的理解。

## 今日目标

- h 的多重重载最终归一到 createVNode
- renderList 统一数组、数字、字符串、Iterable 与对象
- renderSlot/createSlots 消费编译器生成的 slot 协议

## 源码入口

- [packages/runtime-core/src/h.ts](../../../packages/runtime-core/src/h.ts)
- [packages/runtime-core/src/helpers/renderList.ts](../../../packages/runtime-core/src/helpers/renderList.ts)
- [packages/runtime-core/src/helpers/renderSlot.ts](../../../packages/runtime-core/src/helpers/renderSlot.ts)
- [packages/runtime-core/src/helpers/createSlots.ts](../../../packages/runtime-core/src/helpers/createSlots.ts)

## 核心机制

1. h 的多重重载最终归一到 createVNode
2. renderList 统一数组、数字、字符串、Iterable 与对象
3. renderSlot/createSlots 消费编译器生成的 slot 协议

不要从第一行机械读到最后一行。先确定入口输入和外部结果，再围绕上面的机制追踪分支；开发警告、compat 和复杂类型分支第一遍只做标记。

## 主调用链

```text
user render/h 或 compiled helper → VNode/Fragment/slot VNodes → renderer
```

阅读时给链路中的每个箭头补上：调用函数、关键参数、被修改的状态，以及它属于同步执行、批处理还是异步队列。

## 精读步骤

1. 打开 `packages/runtime-core/src/h.ts`，定位公共入口、核心数据结构和主要分派点；记录它向下调用的 2～4 个函数。
2. 打开 `packages/runtime-core/src/helpers/renderList.ts`，定位公共入口、核心数据结构和主要分派点；记录它向下调用的 2～4 个函数。
3. 打开 `packages/runtime-core/src/helpers/renderSlot.ts`，定位公共入口、核心数据结构和主要分派点；记录它向下调用的 2～4 个函数。
4. 打开 `packages/runtime-core/src/helpers/createSlots.ts`，定位公共入口、核心数据结构和主要分派点；记录它向下调用的 2～4 个函数。
5. 全仓搜索今日核心函数的调用方，分别找出至少一个生产者和消费者。
6. 对照测试，用边界用例修正自己的初始推断。

## 动手实验

1. 分别用 h 的 2 参数与 3 参数形式创建同一树
2. 验证 renderList 对 5 类 source 的回调参数
3. 跟踪 renderSlot 的 fallback 与 block

实验必须记录“输入、预期、实际结果、源码解释”，只记录最终输出不算完成。

## 测试与反证

- [packages/runtime-core/__tests__/h.spec.ts](../../../packages/runtime-core/__tests__/h.spec.ts)
- [packages/runtime-core/__tests__/helpers/renderList.spec.ts](../../../packages/runtime-core/__tests__/helpers/renderList.spec.ts)
- [packages/runtime-core/__tests__/helpers/renderSlot.spec.ts](../../../packages/runtime-core/__tests__/helpers/renderSlot.spec.ts)

```bash
pnpm vitest packages/runtime-core/__tests__/h.spec.ts
pnpm vitest packages/runtime-core/__tests__/helpers/renderList.spec.ts
pnpm vitest packages/runtime-core/__tests__/helpers/renderSlot.spec.ts
```

若当前仓库基线阻止测试启动，记录首个环境/语法错误和阻断链，不要把它误判成今日主题的行为错误。

## 闭卷验收

1. h 为什么需要运行时参数判别？
2. 数字 v-for 从几开始回调？
3. slot helper 为什么参与 block tracking？

## 今日完成标准

- [ ] 能不看源码画出主调用链。
- [ ] 能解释至少三个关键分支及其设计权衡。
- [ ] 完成全部实验，并阅读对应测试中的边界案例。
- [ ] 写出一个最小复刻、伪代码或状态转换表。
- [ ] 将仍不确定的问题标注为“事实缺口”或“设计取舍”。

## 导航

上一天：[Day 22｜createVNode、normalizeChildren 与 Block](./day-22-create-vnode-normalization.md)  
下一天：[Day 24｜组件实例创建与 setup 流程](./day-24-component-instance-setup.md)

