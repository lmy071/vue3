# Day 51：TransitionGroup 与 FLIP 列表动画

> 阶段：内置组件｜建议投入：约 3 小时｜目标：形成可以通过代码、测试和实验复验的理解。

## 今日目标

- TransitionGroup 为每个 keyed child 注入 transition hooks
- 更新前后记录位置，利用 transform 反转位移
- 强制 reflow 后移除 transform，触发 move transition

## 源码入口

- [packages/runtime-dom/src/components/TransitionGroup.ts](../../../packages/runtime-dom/src/components/TransitionGroup.ts)
- [packages/runtime-dom/src/components/Transition.ts](../../../packages/runtime-dom/src/components/Transition.ts)

## 核心机制

1. TransitionGroup 为每个 keyed child 注入 transition hooks
2. 更新前后记录位置，利用 transform 反转位移
3. 强制 reflow 后移除 transform，触发 move transition

不要从第一行机械读到最后一行。先确定入口输入和外部结果，再围绕上面的机制追踪分支；开发警告、compat 和复杂类型分支第一遍只做标记。

## 主调用链

```text
beforeUpdate positions → patch keyed children → updated new positions → applyTranslation → forceReflow → add moveClass
```

阅读时给链路中的每个箭头补上：调用函数、关键参数、被修改的状态，以及它属于同步执行、批处理还是异步队列。

## 精读步骤

1. 打开 `packages/runtime-dom/src/components/TransitionGroup.ts`，定位公共入口、核心数据结构和主要分派点；记录它向下调用的 2～4 个函数。
2. 打开 `packages/runtime-dom/src/components/Transition.ts`，定位公共入口、核心数据结构和主要分派点；记录它向下调用的 2～4 个函数。
3. 全仓搜索今日核心函数的调用方，分别找出至少一个生产者和消费者。
4. 对照测试，用边界用例修正自己的初始推断。

## 动手实验

1. 用列表 reorder 记录 old/new DOMRect
2. 解释 FLIP First/Last/Invert/Play
3. 验证无 transform transition 时 hasCSSTransform

实验必须记录“输入、预期、实际结果、源码解释”，只记录最终输出不算完成。

## 测试与反证

- [packages/runtime-core/__tests__/components/BaseTransition.spec.ts](../../../packages/runtime-core/__tests__/components/BaseTransition.spec.ts)

```bash
pnpm vitest packages/runtime-core/__tests__/components/BaseTransition.spec.ts
```

若当前仓库基线阻止测试启动，记录首个环境/语法错误和阻断链，不要把它误判成今日主题的行为错误。

## 闭卷验收

1. 为什么 child 必须有 key？
2. 为什么要强制 reflow？
3. FLIP 如何避免逐帧 JavaScript 动画？

## 今日完成标准

- [ ] 能不看源码画出主调用链。
- [ ] 能解释至少三个关键分支及其设计权衡。
- [ ] 完成全部实验，并阅读对应测试中的边界案例。
- [ ] 写出一个最小复刻、伪代码或状态转换表。
- [ ] 将仍不确定的问题标注为“事实缺口”或“设计取舍”。

## 导航

上一天：[Day 50｜BaseTransition 状态机](./day-50-base-transition.md)  
下一天：[Day 52｜KeepAlive 缓存、激活与淘汰](./day-52-keep-alive.md)

