# Day 53：Teleport 的双容器渲染与移动

> 阶段：内置组件｜建议投入：约 3 小时｜目标：形成可以通过代码、测试和实验复验的理解。

## 今日目标

- 主容器保留 anchors，children 挂到 target 并有 target anchors
- disabled/target 变化触发不同 move 类型
- defer 与 target 查找时机影响挂载

## 源码入口

- [packages/runtime-core/src/components/Teleport.ts](../../../packages/runtime-core/src/components/Teleport.ts)
- [packages/runtime-core/src/renderer.ts](../../../packages/runtime-core/src/renderer.ts)

## 核心机制

1. 主容器保留 anchors，children 挂到 target 并有 target anchors
2. disabled/target 变化触发不同 move 类型
3. defer 与 target 查找时机影响挂载

不要从第一行机械读到最后一行。先确定入口输入和外部结果，再围绕上面的机制追踪分支；开发警告、compat 和复杂类型分支第一遍只做标记。

## 主调用链

```text
patch Teleport VNode → resolveTarget → anchors in main/target → mount/patch children → move on disabled/target change
```

阅读时给链路中的每个箭头补上：调用函数、关键参数、被修改的状态，以及它属于同步执行、批处理还是异步队列。

## 精读步骤

1. 打开 `packages/runtime-core/src/components/Teleport.ts`，定位公共入口、核心数据结构和主要分派点；记录它向下调用的 2～4 个函数。
2. 打开 `packages/runtime-core/src/renderer.ts`，定位公共入口、核心数据结构和主要分派点；记录它向下调用的 2～4 个函数。
3. 全仓搜索今日核心函数的调用方，分别找出至少一个生产者和消费者。
4. 对照测试，用边界用例修正自己的初始推断。

## 动手实验

1. 动态切换 disabled
2. 运行时更换 to target
3. 目标不存在时记录警告与恢复

实验必须记录“输入、预期、实际结果、源码解释”，只记录最终输出不算完成。

## 测试与反证

- [packages/runtime-core/__tests__/components/Teleport.spec.ts](../../../packages/runtime-core/__tests__/components/Teleport.spec.ts)

```bash
pnpm vitest packages/runtime-core/__tests__/components/Teleport.spec.ts
```

若当前仓库基线阻止测试启动，记录首个环境/语法错误和阻断链，不要把它误判成今日主题的行为错误。

## 闭卷验收

1. 为什么两个容器都需要 anchor？
2. Teleport children 的逻辑父组件是谁？
3. 移动为何能复用现有 DOM 而不重建？

## 今日完成标准

- [ ] 能不看源码画出主调用链。
- [ ] 能解释至少三个关键分支及其设计权衡。
- [ ] 完成全部实验，并阅读对应测试中的边界案例。
- [ ] 写出一个最小复刻、伪代码或状态转换表。
- [ ] 将仍不确定的问题标注为“事实缺口”或“设计取舍”。

## 导航

上一天：[Day 52｜KeepAlive 缓存、激活与淘汰](./day-52-keep-alive.md)  
下一天：[Day 54｜Suspense、异步依赖与边界切换](./day-54-suspense.md)

