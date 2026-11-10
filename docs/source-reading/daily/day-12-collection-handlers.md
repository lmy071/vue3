# Day 12：Map、Set 与弱集合代理

> 阶段：响应式系统｜建议投入：约 3 小时｜目标：形成可以通过代码、测试和实验复验的理解。

## 今日目标

- Map/Set 内部槽需要专用 instrumentation
- 区分单 key、ITERATE_KEY、MAP_KEY_ITERATE_KEY
- 处理 raw key 与 proxy key 的身份一致性

## 源码入口

- [packages/reactivity/src/collectionHandlers.ts](../../../packages/reactivity/src/collectionHandlers.ts)
- [packages/reactivity/src/dep.ts](../../../packages/reactivity/src/dep.ts)

## 核心机制

1. Map/Set 内部槽需要专用 instrumentation
2. 区分单 key、ITERATE_KEY、MAP_KEY_ITERATE_KEY
3. 处理 raw key 与 proxy key 的身份一致性

不要从第一行机械读到最后一行。先确定入口输入和外部结果，再围绕上面的机制追踪分支；开发警告、compat 和复杂类型分支第一遍只做标记。

## 主调用链

```text
collection.get/size/iterator → instrumentation getter → track → wrap value；set/add/delete/clear → trigger
```

阅读时给链路中的每个箭头补上：调用函数、关键参数、被修改的状态，以及它属于同步执行、批处理还是异步队列。

## 精读步骤

1. 打开 `packages/reactivity/src/collectionHandlers.ts`，定位公共入口、核心数据结构和主要分派点；记录它向下调用的 2～4 个函数。
2. 打开 `packages/reactivity/src/dep.ts`，定位公共入口、核心数据结构和主要分派点；记录它向下调用的 2～4 个函数。
3. 全仓搜索今日核心函数的调用方，分别找出至少一个生产者和消费者。
4. 对照测试，用边界用例修正自己的初始推断。

## 动手实验

1. 对 Map keys 与 values 建立两个 effect 并比较触发
2. 验证已有 key set 与新 key add
3. 测试 WeakMap 无迭代能力的分支

实验必须记录“输入、预期、实际结果、源码解释”，只记录最终输出不算完成。

## 测试与反证

- [packages/reactivity/__tests__/collections/Map.spec.ts](../../../packages/reactivity/__tests__/collections/Map.spec.ts)
- [packages/reactivity/__tests__/collections/Set.spec.ts](../../../packages/reactivity/__tests__/collections/Set.spec.ts)

```bash
pnpm vitest packages/reactivity/__tests__/collections/Map.spec.ts
pnpm vitest packages/reactivity/__tests__/collections/Set.spec.ts
```

若当前仓库基线阻止测试启动，记录首个环境/语法错误和阻断链，不要把它误判成今日主题的行为错误。

## 闭卷验收

1. 为什么不能直接 Reflect.get Map 方法？
2. Map.set 已有 key 为何不触发 key 迭代？
3. clear 如何通知所有相关依赖？

## 今日完成标准

- [ ] 能不看源码画出主调用链。
- [ ] 能解释至少三个关键分支及其设计权衡。
- [ ] 完成全部实验，并阅读对应测试中的边界案例。
- [ ] 写出一个最小复刻、伪代码或状态转换表。
- [ ] 将仍不确定的问题标注为“事实缺口”或“设计取舍”。

## 导航

上一天：[Day 11｜数组方法的响应式适配](./day-11-array-instrumentations.md)  
下一天：[Day 13｜Dep、Link 与依赖图](./day-13-dep-link-model.md)

