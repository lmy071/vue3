# Day 18：computed 的双重身份与版本快路径

> 阶段：响应式系统｜建议投入：约 3 小时｜目标：形成可以通过代码、测试和实验复验的理解。

## 今日目标

- ComputedRefImpl 既是 subscriber 又拥有 dep
- globalVersion 可证明全局无响应式变化
- 依赖 version 检查避免无关变化导致 getter 重算

## 源码入口

- [packages/reactivity/src/computed.ts](../../../packages/reactivity/src/computed.ts)
- [packages/reactivity/src/effect.ts](../../../packages/reactivity/src/effect.ts)
- [packages/reactivity/src/dep.ts](../../../packages/reactivity/src/dep.ts)

## 核心机制

1. ComputedRefImpl 既是 subscriber 又拥有 dep
2. globalVersion 可证明全局无响应式变化
3. 依赖 version 检查避免无关变化导致 getter 重算

不要从第一行机械读到最后一行。先确定入口输入和外部结果，再围绕上面的机制追踪分支；开发警告、compat 和复杂类型分支第一遍只做标记。

## 主调用链

```text
read computed.value → dep.track → refreshComputed → set activeSub=computed → getter → cache value/version
```

阅读时给链路中的每个箭头补上：调用函数、关键参数、被修改的状态，以及它属于同步执行、批处理还是异步队列。

## 精读步骤

1. 打开 `packages/reactivity/src/computed.ts`，定位公共入口、核心数据结构和主要分派点；记录它向下调用的 2～4 个函数。
2. 打开 `packages/reactivity/src/effect.ts`，定位公共入口、核心数据结构和主要分派点；记录它向下调用的 2～4 个函数。
3. 打开 `packages/reactivity/src/dep.ts`，定位公共入口、核心数据结构和主要分派点；记录它向下调用的 2～4 个函数。
4. 全仓搜索今日核心函数的调用方，分别找出至少一个生产者和消费者。
5. 对照测试，用边界用例修正自己的初始推断。

## 动手实验

1. 统计连续读取、无关变化、相关变化下 getter 次数
2. 构造 chained computed
3. 验证 writable computed setter

实验必须记录“输入、预期、实际结果、源码解释”，只记录最终输出不算完成。

## 测试与反证

- [packages/reactivity/__tests__/computed.spec.ts](../../../packages/reactivity/__tests__/computed.spec.ts)

```bash
pnpm vitest packages/reactivity/__tests__/computed.spec.ts
```

若当前仓库基线阻止测试启动，记录首个环境/语法错误和阻断链，不要把它误判成今日主题的行为错误。

## 闭卷验收

1. computed 为何惰性？
2. 它为什么同时需要 deps 和 dep？
3. globalVersion 与 dep.version 各证明什么？

## 今日完成标准

- [ ] 能不看源码画出主调用链。
- [ ] 能解释至少三个关键分支及其设计权衡。
- [ ] 完成全部实验，并阅读对应测试中的边界案例。
- [ ] 写出一个最小复刻、伪代码或状态转换表。
- [ ] 将仍不确定的问题标注为“事实缺口”或“设计取舍”。

## 导航

上一天：[Day 17｜ref、toRef、proxyRefs 与 customRef](./day-17-ref-system.md)  
下一天：[Day 19｜watch source、traverse 与 cleanup](./day-19-watch-core.md)

