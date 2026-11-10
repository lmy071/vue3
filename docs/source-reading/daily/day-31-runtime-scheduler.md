# Day 31：Scheduler、nextTick 与任务排序

> 阶段：运行时模型｜建议投入：约 3 小时｜目标：形成可以通过代码、测试和实验复验的理解。

## 今日目标

- queueJob 通过 id 排序保证父先于子且可跳过已卸载子任务
- SchedulerJobFlags 管理 QUEUED/PRE/ALLOW_RECURSE/DISPOSED
- pre、main、post 三类队列在同一 microtask 中有序清空

## 源码入口

- [packages/runtime-core/src/scheduler.ts](../../../packages/runtime-core/src/scheduler.ts)
- [packages/runtime-core/src/errorHandling.ts](../../../packages/runtime-core/src/errorHandling.ts)

## 核心机制

1. queueJob 通过 id 排序保证父先于子且可跳过已卸载子任务
2. SchedulerJobFlags 管理 QUEUED/PRE/ALLOW_RECURSE/DISPOSED
3. pre、main、post 三类队列在同一 microtask 中有序清空

不要从第一行机械读到最后一行。先确定入口输入和外部结果，再围绕上面的机制追踪分支；开发警告、compat 和复杂类型分支第一遍只做标记。

## 主调用链

```text
reactive scheduler → queueJob/queuePostFlushCb → resolvedPromise.then(flushJobs) → pre/main/post → nextTick
```

阅读时给链路中的每个箭头补上：调用函数、关键参数、被修改的状态，以及它属于同步执行、批处理还是异步队列。

## 精读步骤

1. 打开 `packages/runtime-core/src/scheduler.ts`，定位公共入口、核心数据结构和主要分派点；记录它向下调用的 2～4 个函数。
2. 打开 `packages/runtime-core/src/errorHandling.ts`，定位公共入口、核心数据结构和主要分派点；记录它向下调用的 2～4 个函数。
3. 全仓搜索今日核心函数的调用方，分别找出至少一个生产者和消费者。
4. 对照测试，用边界用例修正自己的初始推断。

## 动手实验

1. 验证父子组件更新顺序
2. 同一 tick 连续写入观察去重
3. 比较 nextTick 回调与 post watcher

实验必须记录“输入、预期、实际结果、源码解释”，只记录最终输出不算完成。

## 测试与反证

- [packages/runtime-core/__tests__/scheduler.spec.ts](../../../packages/runtime-core/__tests__/scheduler.spec.ts)
- [packages/runtime-core/__tests__/apiWatch.spec.ts](../../../packages/runtime-core/__tests__/apiWatch.spec.ts)

```bash
pnpm vitest packages/runtime-core/__tests__/scheduler.spec.ts
pnpm vitest packages/runtime-core/__tests__/apiWatch.spec.ts
```

若当前仓库基线阻止测试启动，记录首个环境/语法错误和阻断链，不要把它误判成今日主题的行为错误。

## 闭卷验收

1. 为什么 job 按 uid 排序？
2. nextTick 等待的是什么 Promise？
3. ALLOW_RECURSE 解决什么场景？

## 今日完成标准

- [ ] 能不看源码画出主调用链。
- [ ] 能解释至少三个关键分支及其设计权衡。
- [ ] 完成全部实验，并阅读对应测试中的边界案例。
- [ ] 写出一个最小复刻、伪代码或状态转换表。
- [ ] 将仍不确定的问题标注为“事实缺口”或“设计取舍”。

## 导航

上一天：[Day 30｜异步组件与错误边界](./day-30-async-error-handling.md)  
下一天：[Day 32｜runtime-test 与 Host Renderer 契约](./day-32-runtime-test-host.md)

