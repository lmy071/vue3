# Day 30：异步组件与错误边界

> 阶段：运行时模型｜建议投入：约 3 小时｜目标：形成可以通过代码、测试和实验复验的理解。

## 今日目标

- defineAsyncComponent 管理 loader、delay、timeout、retry 与 suspense
- callWithErrorHandling/AsyncErrorHandling 统一捕获 sync/Promise 错误
- handleError 沿 errorCaptured hooks 再到 app errorHandler

## 源码入口

- [packages/runtime-core/src/apiAsyncComponent.ts](../../../packages/runtime-core/src/apiAsyncComponent.ts)
- [packages/runtime-core/src/errorHandling.ts](../../../packages/runtime-core/src/errorHandling.ts)
- [packages/runtime-core/src/component.ts](../../../packages/runtime-core/src/component.ts)

## 核心机制

1. defineAsyncComponent 管理 loader、delay、timeout、retry 与 suspense
2. callWithErrorHandling/AsyncErrorHandling 统一捕获 sync/Promise 错误
3. handleError 沿 errorCaptured hooks 再到 app errorHandler

不要从第一行机械读到最后一行。先确定入口输入和外部结果，再围绕上面的机制追踪分支；开发警告、compat 和复杂类型分支第一遍只做标记。

## 主调用链

```text
async wrapper setup → load/retry → resolved component 或 error/loading component；error → parent capture → app handler → log
```

阅读时给链路中的每个箭头补上：调用函数、关键参数、被修改的状态，以及它属于同步执行、批处理还是异步队列。

## 精读步骤

1. 打开 `packages/runtime-core/src/apiAsyncComponent.ts`，定位公共入口、核心数据结构和主要分派点；记录它向下调用的 2～4 个函数。
2. 打开 `packages/runtime-core/src/errorHandling.ts`，定位公共入口、核心数据结构和主要分派点；记录它向下调用的 2～4 个函数。
3. 打开 `packages/runtime-core/src/component.ts`，定位公共入口、核心数据结构和主要分派点；记录它向下调用的 2～4 个函数。
4. 全仓搜索今日核心函数的调用方，分别找出至少一个生产者和消费者。
5. 对照测试，用边界用例修正自己的初始推断。

## 动手实验

1. 模拟 loader 失败后 retry
2. 比较 suspensible true/false
3. 验证 errorCaptured 返回 false 阻断传播

实验必须记录“输入、预期、实际结果、源码解释”，只记录最终输出不算完成。

## 测试与反证

- [packages/runtime-core/__tests__/apiAsyncComponent.spec.ts](../../../packages/runtime-core/__tests__/apiAsyncComponent.spec.ts)
- [packages/runtime-core/__tests__/errorHandling.spec.ts](../../../packages/runtime-core/__tests__/errorHandling.spec.ts)

```bash
pnpm vitest packages/runtime-core/__tests__/apiAsyncComponent.spec.ts
pnpm vitest packages/runtime-core/__tests__/errorHandling.spec.ts
```

若当前仓库基线阻止测试启动，记录首个环境/语法错误和阻断链，不要把它误判成今日主题的行为错误。

## 闭卷验收

1. 异步组件为何是 wrapper 组件？
2. Suspense 模式下谁控制 loading？
3. 错误为何必须带 ErrorCodes 分类？

## 今日完成标准

- [ ] 能不看源码画出主调用链。
- [ ] 能解释至少三个关键分支及其设计权衡。
- [ ] 完成全部实验，并阅读对应测试中的边界案例。
- [ ] 写出一个最小复刻、伪代码或状态转换表。
- [ ] 将仍不确定的问题标注为“事实缺口”或“设计取舍”。

## 导航

上一天：[Day 29｜createApp、Provide/Inject 与生命周期 API](./day-29-app-context-apis.md)  
下一天：[Day 31｜Scheduler、nextTick 与任务排序](./day-31-runtime-scheduler.md)

