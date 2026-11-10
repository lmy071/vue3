# Day 11：数组方法的响应式适配

> 阶段：响应式系统｜建议投入：约 3 小时｜目标：形成可以通过代码、测试和实验复验的理解。

## 今日目标

- 搜索方法需兼容 raw/proxy 身份
- 迭代与 map/filter 返回值要按模式包装
- 变异方法必须避免意外追踪 length 导致递归

## 源码入口

- [packages/reactivity/src/arrayInstrumentations.ts](../../../packages/reactivity/src/arrayInstrumentations.ts)
- [packages/reactivity/src/baseHandlers.ts](../../../packages/reactivity/src/baseHandlers.ts)

## 核心机制

1. 搜索方法需兼容 raw/proxy 身份
2. 迭代与 map/filter 返回值要按模式包装
3. 变异方法必须避免意外追踪 length 导致递归

不要从第一行机械读到最后一行。先确定入口输入和外部结果，再围绕上面的机制追踪分支；开发警告、compat 和复杂类型分支第一遍只做标记。

## 主调用链

```text
proxy array method → instrumentation → raw read/iteration tracking → wrapped result 或 mutation
```

阅读时给链路中的每个箭头补上：调用函数、关键参数、被修改的状态，以及它属于同步执行、批处理还是异步队列。

## 精读步骤

1. 打开 `packages/reactivity/src/arrayInstrumentations.ts`，定位公共入口、核心数据结构和主要分派点；记录它向下调用的 2～4 个函数。
2. 打开 `packages/reactivity/src/baseHandlers.ts`，定位公共入口、核心数据结构和主要分派点；记录它向下调用的 2～4 个函数。
3. 全仓搜索今日核心函数的调用方，分别找出至少一个生产者和消费者。
4. 对照测试，用边界用例修正自己的初始推断。

## 动手实验

1. 验证 includes/indexOf 对 raw 与 proxy 参数
2. 观察 push 在 effect 中是否递归
3. 比较 reactiveReadArray 与 shallowReadArray

实验必须记录“输入、预期、实际结果、源码解释”，只记录最终输出不算完成。

## 测试与反证

- [packages/reactivity/__tests__/reactiveArray.spec.ts](../../../packages/reactivity/__tests__/reactiveArray.spec.ts)

```bash
pnpm vitest packages/reactivity/__tests__/reactiveArray.spec.ts
```

若当前仓库基线阻止测试启动，记录首个环境/语法错误和阻断链，不要把它误判成今日主题的行为错误。

## 闭卷验收

1. 为什么 includes 可能执行两次？
2. 数组迭代追踪哪个 key？
3. 变异方法为何暂停 tracking？

## 今日完成标准

- [ ] 能不看源码画出主调用链。
- [ ] 能解释至少三个关键分支及其设计权衡。
- [ ] 完成全部实验，并阅读对应测试中的边界案例。
- [ ] 写出一个最小复刻、伪代码或状态转换表。
- [ ] 将仍不确定的问题标注为“事实缺口”或“设计取舍”。

## 导航

上一天：[Day 10｜setter、delete、has 与 ownKeys](./day-10-base-mutations.md)  
下一天：[Day 12｜Map、Set 与弱集合代理](./day-12-collection-handlers.md)

