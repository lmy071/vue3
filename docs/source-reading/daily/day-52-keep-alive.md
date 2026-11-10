# Day 52：KeepAlive 缓存、激活与淘汰

> 阶段：内置组件｜建议投入：约 3 小时｜目标：形成可以通过代码、测试和实验复验的理解。

## 今日目标

- KeepAlive 通过 renderer internals 的 move/patch/unmount 介入
- cache Map 与 keys Set 实现 LRU max 淘汰
- shape flags 区分 shouldKeepAlive 与 keptAlive，activate/deactivate 不等于 mount/unmount

## 源码入口

- [packages/runtime-core/src/components/KeepAlive.ts](../../../packages/runtime-core/src/components/KeepAlive.ts)
- [packages/runtime-core/src/renderer.ts](../../../packages/runtime-core/src/renderer.ts)

## 核心机制

1. KeepAlive 通过 renderer internals 的 move/patch/unmount 介入
2. cache Map 与 keys Set 实现 LRU max 淘汰
3. shape flags 区分 shouldKeepAlive 与 keptAlive，activate/deactivate 不等于 mount/unmount

不要从第一行机械读到最后一行。先确定入口输入和外部结果，再围绕上面的机制追踪分支；开发警告、compat 和复杂类型分支第一遍只做标记。

## 主调用链

```text
KeepAlive render → cache lookup/mark flags → renderer activate/deactivate → storageContainer move → hooks
```

阅读时给链路中的每个箭头补上：调用函数、关键参数、被修改的状态，以及它属于同步执行、批处理还是异步队列。

## 精读步骤

1. 打开 `packages/runtime-core/src/components/KeepAlive.ts`，定位公共入口、核心数据结构和主要分派点；记录它向下调用的 2～4 个函数。
2. 打开 `packages/runtime-core/src/renderer.ts`，定位公共入口、核心数据结构和主要分派点；记录它向下调用的 2～4 个函数。
3. 全仓搜索今日核心函数的调用方，分别找出至少一个生产者和消费者。
4. 对照测试，用边界用例修正自己的初始推断。

## 动手实验

1. 验证组件切换后 state 保留
2. 设置 max 观察 LRU 淘汰
3. 比较 include/exclude 动态变化后的 prune

实验必须记录“输入、预期、实际结果、源码解释”，只记录最终输出不算完成。

## 测试与反证

- [packages/runtime-core/__tests__/components/KeepAlive.spec.ts](../../../packages/runtime-core/__tests__/components/KeepAlive.spec.ts)

```bash
pnpm vitest packages/runtime-core/__tests__/components/KeepAlive.spec.ts
```

若当前仓库基线阻止测试启动，记录首个环境/语法错误和阻断链，不要把它误判成今日主题的行为错误。

## 闭卷验收

1. 缓存的是组件实例还是 VNode/子树关系？
2. deactivate 为什么移动到隐藏容器？
3. LRU 为何需要 Map 加 Set？

## 今日完成标准

- [ ] 能不看源码画出主调用链。
- [ ] 能解释至少三个关键分支及其设计权衡。
- [ ] 完成全部实验，并阅读对应测试中的边界案例。
- [ ] 写出一个最小复刻、伪代码或状态转换表。
- [ ] 将仍不确定的问题标注为“事实缺口”或“设计取舍”。

## 导航

上一天：[Day 51｜TransitionGroup 与 FLIP 列表动画](./day-51-transition-group.md)  
下一天：[Day 53｜Teleport 的双容器渲染与移动](./day-53-teleport.md)

