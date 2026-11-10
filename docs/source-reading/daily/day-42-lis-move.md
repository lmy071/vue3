# Day 42：LIS 与最小移动

> 阶段：渲染器｜建议投入：约 3 小时｜目标：形成可以通过代码、测试和实验复验的理解。

## 今日目标

- 只有 moved=true 才计算 getSequence
- LIS 保留相对顺序已正确的旧节点，其余节点移动
- LIS 输入中的 0 表示新节点，算法必须跳过

## 源码入口

- [packages/runtime-core/src/renderer.ts](../../../packages/runtime-core/src/renderer.ts)

## 核心机制

1. 只有 moved=true 才计算 getSequence
2. LIS 保留相对顺序已正确的旧节点，其余节点移动
3. LIS 输入中的 0 表示新节点，算法必须跳过

不要从第一行机械读到最后一行。先确定入口输入和外部结果，再围绕上面的机制追踪分支；开发警告、compat 和复杂类型分支第一遍只做标记。

## 主调用链

```text
newIndexToOldIndexMap → getSequence → backward loop → 0 mount / not-in-LIS move / in-LIS keep
```

阅读时给链路中的每个箭头补上：调用函数、关键参数、被修改的状态，以及它属于同步执行、批处理还是异步队列。

## 精读步骤

1. 打开 `packages/runtime-core/src/renderer.ts`，定位公共入口、核心数据结构和主要分派点；记录它向下调用的 2～4 个函数。
2. 全仓搜索今日核心函数的调用方，分别找出至少一个生产者和消费者。
3. 对照测试，用边界用例修正自己的初始推断。

## 动手实验

1. 手算 [2,3,1,5,4] 的 LIS 索引
2. 独立实现 getSequence 并测试 0
3. 对同一 reorder 比较朴素移动次数

实验必须记录“输入、预期、实际结果、源码解释”，只记录最终输出不算完成。

## 测试与反证

- [packages/runtime-core/__tests__/rendererChildren.spec.ts](../../../packages/runtime-core/__tests__/rendererChildren.spec.ts)

```bash
pnpm vitest packages/runtime-core/__tests__/rendererChildren.spec.ts
```

若当前仓库基线阻止测试启动，记录首个环境/语法错误和阻断链，不要把它误判成今日主题的行为错误。

## 闭卷验收

1. 为什么 LIS 返回索引而非值？
2. LIS 是否保证全局最少 DOM 操作？
3. 为什么最终遍历必须从右向左？

## 今日完成标准

- [ ] 能不看源码画出主调用链。
- [ ] 能解释至少三个关键分支及其设计权衡。
- [ ] 完成全部实验，并阅读对应测试中的边界案例。
- [ ] 写出一个最小复刻、伪代码或状态转换表。
- [ ] 将仍不确定的问题标注为“事实缺口”或“设计取舍”。

## 导航

上一天：[Day 41｜patchKeyedChildren 五阶段](./day-41-keyed-diff.md)  
下一天：[Day 43｜卸载、移动、Template Ref 与 Directives](./day-43-unmount-ref-directives.md)

