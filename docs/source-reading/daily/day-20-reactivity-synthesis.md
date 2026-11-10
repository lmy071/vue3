# Day 20：响应式全链路复刻与验收

> 阶段：响应式系统｜建议投入：约 3 小时｜目标：形成可以通过代码、测试和实验复验的理解。

## 今日目标

- 把 Proxy、Dep/Link、effect、ref/computed/watch 串成统一数据流
- 明确响应式层只提供 scheduler hook，不决定组件队列
- 用测试而非注释验证不变量

## 源码入口

- [packages/reactivity/src/index.ts](../../../packages/reactivity/src/index.ts)
- [packages/reactivity/src/reactive.ts](../../../packages/reactivity/src/reactive.ts)
- [packages/reactivity/src/dep.ts](../../../packages/reactivity/src/dep.ts)
- [packages/reactivity/src/effect.ts](../../../packages/reactivity/src/effect.ts)

## 核心机制

1. 把 Proxy、Dep/Link、effect、ref/computed/watch 串成统一数据流
2. 明确响应式层只提供 scheduler hook，不决定组件队列
3. 用测试而非注释验证不变量

不要从第一行机械读到最后一行。先确定入口输入和外部结果，再围绕上面的机制追踪分支；开发警告、compat 和复杂类型分支第一遍只做标记。

## 主调用链

```text
API → proxy/ref read → dependency graph → mutation → batch → user scheduler/effect
```

阅读时给链路中的每个箭头补上：调用函数、关键参数、被修改的状态，以及它属于同步执行、批处理还是异步队列。

## 精读步骤

1. 打开 `packages/reactivity/src/index.ts`，定位公共入口、核心数据结构和主要分派点；记录它向下调用的 2～4 个函数。
2. 打开 `packages/reactivity/src/reactive.ts`，定位公共入口、核心数据结构和主要分派点；记录它向下调用的 2～4 个函数。
3. 打开 `packages/reactivity/src/dep.ts`，定位公共入口、核心数据结构和主要分派点；记录它向下调用的 2～4 个函数。
4. 打开 `packages/reactivity/src/effect.ts`，定位公共入口、核心数据结构和主要分派点；记录它向下调用的 2～4 个函数。
5. 全仓搜索今日核心函数的调用方，分别找出至少一个生产者和消费者。
6. 对照测试，用边界用例修正自己的初始推断。

## 动手实验

1. 完成 500～800 行 mini-reactivity
2. 为条件依赖、computed cache、watch cleanup 写测试
3. 闭卷画完整对象模型与时序图

实验必须记录“输入、预期、实际结果、源码解释”，只记录最终输出不算完成。

## 测试与反证

- [packages/reactivity/__tests__/effect.spec.ts](../../../packages/reactivity/__tests__/effect.spec.ts)
- [packages/reactivity/__tests__/computed.spec.ts](../../../packages/reactivity/__tests__/computed.spec.ts)
- [packages/reactivity/__tests__/watch.spec.ts](../../../packages/reactivity/__tests__/watch.spec.ts)

```bash
pnpm vitest packages/reactivity/__tests__/effect.spec.ts
pnpm vitest packages/reactivity/__tests__/computed.spec.ts
pnpm vitest packages/reactivity/__tests__/watch.spec.ts
```

若当前仓库基线阻止测试启动，记录首个环境/语法错误和阻断链，不要把它误判成今日主题的行为错误。

## 闭卷验收

1. 一次对象写入可能触发哪些 Dep？
2. computed 脏传播为何不等于立即求值？
3. 哪些能力属于 runtime-core 而不是 reactivity？

## 今日完成标准

- [ ] 能不看源码画出主调用链。
- [ ] 能解释至少三个关键分支及其设计权衡。
- [ ] 完成全部实验，并阅读对应测试中的边界案例。
- [ ] 写出一个最小复刻、伪代码或状态转换表。
- [ ] 将仍不确定的问题标注为“事实缺口”或“设计取舍”。

## 导航

上一天：[Day 19｜watch source、traverse 与 cleanup](./day-19-watch-core.md)  
下一天：[Day 21｜VNode 数据模型与特殊节点](./day-21-vnode-model.md)

