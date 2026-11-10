# Day 13：Dep、Link 与依赖图

> 阶段：响应式系统｜建议投入：约 3 小时｜目标：形成可以通过代码、测试和实验复验的理解。

## 今日目标

- 建立 targetMap → depsMap → Dep → Link → Subscriber 对象模型
- Link 同时位于 Dep subscriber 链与 Subscriber deps 链
- version/activeLink 支持增量复用与清理

## 源码入口

- [packages/reactivity/src/dep.ts](../../../packages/reactivity/src/dep.ts)
- [packages/reactivity/src/effect.ts](../../../packages/reactivity/src/effect.ts)

## 核心机制

1. 建立 targetMap → depsMap → Dep → Link → Subscriber 对象模型
2. Link 同时位于 Dep subscriber 链与 Subscriber deps 链
3. version/activeLink 支持增量复用与清理

不要从第一行机械读到最后一行。先确定入口输入和外部结果，再围绕上面的机制追踪分支；开发警告、compat 和复杂类型分支第一遍只做标记。

## 主调用链

```text
track(target,key) → get/create Dep → Dep.track → get/reuse Link → 双向挂链
```

阅读时给链路中的每个箭头补上：调用函数、关键参数、被修改的状态，以及它属于同步执行、批处理还是异步队列。

## 精读步骤

1. 打开 `packages/reactivity/src/dep.ts`，定位公共入口、核心数据结构和主要分派点；记录它向下调用的 2～4 个函数。
2. 打开 `packages/reactivity/src/effect.ts`，定位公共入口、核心数据结构和主要分派点；记录它向下调用的 2～4 个函数。
3. 全仓搜索今日核心函数的调用方，分别找出至少一个生产者和消费者。
4. 对照测试，用边界用例修正自己的初始推断。

## 动手实验

1. 画出两个 effect 订阅同一 dep 的链表
2. 逐字段记录 Link 在两条链的位置
3. 用条件 effect 观察 Link version 变化

实验必须记录“输入、预期、实际结果、源码解释”，只记录最终输出不算完成。

## 测试与反证

- [packages/reactivity/__tests__/effect.spec.ts](../../../packages/reactivity/__tests__/effect.spec.ts)
- [packages/reactivity/__tests__/gc.spec.ts](../../../packages/reactivity/__tests__/gc.spec.ts)

```bash
pnpm vitest packages/reactivity/__tests__/effect.spec.ts
pnpm vitest packages/reactivity/__tests__/gc.spec.ts
```

若当前仓库基线阻止测试启动，记录首个环境/语法错误和阻断链，不要把它误判成今日主题的行为错误。

## 闭卷验收

1. 为何需要两条链？
2. Dep.activeLink 优化什么？
3. targetMap 为什么以 WeakMap 起始？

## 今日完成标准

- [ ] 能不看源码画出主调用链。
- [ ] 能解释至少三个关键分支及其设计权衡。
- [ ] 完成全部实验，并阅读对应测试中的边界案例。
- [ ] 写出一个最小复刻、伪代码或状态转换表。
- [ ] 将仍不确定的问题标注为“事实缺口”或“设计取舍”。

## 导航

上一天：[Day 12｜Map、Set 与弱集合代理](./day-12-collection-handlers.md)  
下一天：[Day 14｜ReactiveEffect.run 与增量清理](./day-14-effect-run-cleanup.md)

