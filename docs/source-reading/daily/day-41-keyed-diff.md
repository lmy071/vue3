# Day 41：patchKeyedChildren 五阶段

> 阶段：渲染器｜建议投入：约 3 小时｜目标：形成可以通过代码、测试和实验复验的理解。

## 今日目标

- 先同步头部与尾部，处理纯新增/纯删除
- 未知区建立 keyToNewIndexMap，再扫描旧节点建立 newIndexToOldIndexMap
- maxNewIndexSoFar 判定是否发生移动

## 源码入口

- [packages/runtime-core/src/renderer.ts](../../../packages/runtime-core/src/renderer.ts)

## 核心机制

1. 先同步头部与尾部，处理纯新增/纯删除
2. 未知区建立 keyToNewIndexMap，再扫描旧节点建立 newIndexToOldIndexMap
3. maxNewIndexSoFar 判定是否发生移动

不要从第一行机械读到最后一行。先确定入口输入和外部结果，再围绕上面的机制追踪分支；开发警告、compat 和复杂类型分支第一遍只做标记。

## 主调用链

```text
sync start → sync end → mount remaining/remove remaining → patch unknown sequence → move/mount backward
```

阅读时给链路中的每个箭头补上：调用函数、关键参数、被修改的状态，以及它属于同步执行、批处理还是异步队列。

## 精读步骤

1. 打开 `packages/runtime-core/src/renderer.ts`，定位公共入口、核心数据结构和主要分派点；记录它向下调用的 2～4 个函数。
2. 全仓搜索今日核心函数的调用方，分别找出至少一个生产者和消费者。
3. 对照测试，用边界用例修正自己的初始推断。

## 动手实验

1. 手算 ABC→ABCD、ABCD→BCD、ABCD→DABC
2. 记录 i/e1/e2/s1/s2 变化
3. 分析无 key 节点在未知区的匹配

实验必须记录“输入、预期、实际结果、源码解释”，只记录最终输出不算完成。

## 测试与反证

- [packages/runtime-core/__tests__/rendererChildren.spec.ts](../../../packages/runtime-core/__tests__/rendererChildren.spec.ts)

```bash
pnpm vitest packages/runtime-core/__tests__/rendererChildren.spec.ts
```

若当前仓库基线阻止测试启动，记录首个环境/语法错误和阻断链，不要把它误判成今日主题的行为错误。

## 闭卷验收

1. 为什么先做头尾同步？
2. newIndexToOldIndexMap 为什么存 oldIndex+1？
3. 从后向前 mount/move 如何利用 anchor？

## 今日完成标准

- [ ] 能不看源码画出主调用链。
- [ ] 能解释至少三个关键分支及其设计权衡。
- [ ] 完成全部实验，并阅读对应测试中的边界案例。
- [ ] 写出一个最小复刻、伪代码或状态转换表。
- [ ] 将仍不确定的问题标注为“事实缺口”或“设计取舍”。

## 导航

上一天：[Day 40｜patchChildren 的文本、数组与空值转换](./day-40-children-transitions.md)  
下一天：[Day 42｜LIS 与最小移动](./day-42-lis-move.md)

