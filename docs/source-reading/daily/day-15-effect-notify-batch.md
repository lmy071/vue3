# Day 15：trigger、notify 与响应式批处理

> 阶段：响应式系统｜建议投入：约 3 小时｜目标：形成可以通过代码、测试和实验复验的理解。

## 今日目标

- Dep 与 globalVersion 在 trigger 时递增
- subscriber.notify 先去重再进入 batch
- computed 与普通 effect 的批处理队列和传播顺序不同

## 源码入口

- [packages/reactivity/src/dep.ts](../../../packages/reactivity/src/dep.ts)
- [packages/reactivity/src/effect.ts](../../../packages/reactivity/src/effect.ts)

## 核心机制

1. Dep 与 globalVersion 在 trigger 时递增
2. subscriber.notify 先去重再进入 batch
3. computed 与普通 effect 的批处理队列和传播顺序不同

不要从第一行机械读到最后一行。先确定入口输入和外部结果，再围绕上面的机制追踪分支；开发警告、compat 和复杂类型分支第一遍只做标记。

## 主调用链

```text
proxy mutation → trigger → Dep.trigger/notify → batch → endBatch → scheduler 或 runIfDirty
```

阅读时给链路中的每个箭头补上：调用函数、关键参数、被修改的状态，以及它属于同步执行、批处理还是异步队列。

## 精读步骤

1. 打开 `packages/reactivity/src/dep.ts`，定位公共入口、核心数据结构和主要分派点；记录它向下调用的 2～4 个函数。
2. 打开 `packages/reactivity/src/effect.ts`，定位公共入口、核心数据结构和主要分派点；记录它向下调用的 2～4 个函数。
3. 全仓搜索今日核心函数的调用方，分别找出至少一个生产者和消费者。
4. 对照测试，用边界用例修正自己的初始推断。

## 动手实验

1. 同一同步过程多次写入观察 effect 次数
2. 为 effect 注入 scheduler 并记录任务
3. 构造 computed→effect 链观察通知顺序

实验必须记录“输入、预期、实际结果、源码解释”，只记录最终输出不算完成。

## 测试与反证

- [packages/reactivity/__tests__/effect.spec.ts](../../../packages/reactivity/__tests__/effect.spec.ts)
- [packages/reactivity/__tests__/computed.spec.ts](../../../packages/reactivity/__tests__/computed.spec.ts)

```bash
pnpm vitest packages/reactivity/__tests__/effect.spec.ts
pnpm vitest packages/reactivity/__tests__/computed.spec.ts
```

若当前仓库基线阻止测试启动，记录首个环境/语法错误和阻断链，不要把它误判成今日主题的行为错误。

## 闭卷验收

1. 响应式 batch 与 runtime scheduler 是同一层吗？
2. globalVersion 服务哪条快路径？
3. 为什么不能在遍历 subs 时直接同步执行所有 effect？

## 今日完成标准

- [ ] 能不看源码画出主调用链。
- [ ] 能解释至少三个关键分支及其设计权衡。
- [ ] 完成全部实验，并阅读对应测试中的边界案例。
- [ ] 写出一个最小复刻、伪代码或状态转换表。
- [ ] 将仍不确定的问题标注为“事实缺口”或“设计取舍”。

## 导航

上一天：[Day 14｜ReactiveEffect.run 与增量清理](./day-14-effect-run-cleanup.md)  
下一天：[Day 16｜EffectScope 与资源生命周期](./day-16-effect-scope.md)

