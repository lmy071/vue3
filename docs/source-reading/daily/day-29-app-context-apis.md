# Day 29：createApp、Provide/Inject 与生命周期 API

> 阶段：运行时模型｜建议投入：约 3 小时｜目标：形成可以通过代码、测试和实验复验的理解。

## 今日目标

- AppContext 隔离 components/directives/provides/config/caches
- createAppAPI 由 renderer 注入 render/hydrate
- provide/inject 沿实例父链或 app provides 查找，生命周期 hook 包装错误处理与 tracking 控制

## 源码入口

- [packages/runtime-core/src/apiCreateApp.ts](../../../packages/runtime-core/src/apiCreateApp.ts)
- [packages/runtime-core/src/apiInject.ts](../../../packages/runtime-core/src/apiInject.ts)
- [packages/runtime-core/src/apiLifecycle.ts](../../../packages/runtime-core/src/apiLifecycle.ts)

## 核心机制

1. AppContext 隔离 components/directives/provides/config/caches
2. createAppAPI 由 renderer 注入 render/hydrate
3. provide/inject 沿实例父链或 app provides 查找，生命周期 hook 包装错误处理与 tracking 控制

不要从第一行机械读到最后一行。先确定入口输入和外部结果，再围绕上面的机制追踪分支；开发警告、compat 和复杂类型分支第一遍只做标记。

## 主调用链

```text
renderer.createApp → createAppAPI → app.mount → root VNode.appContext → render；provide → parent provides 原型链
```

阅读时给链路中的每个箭头补上：调用函数、关键参数、被修改的状态，以及它属于同步执行、批处理还是异步队列。

## 精读步骤

1. 打开 `packages/runtime-core/src/apiCreateApp.ts`，定位公共入口、核心数据结构和主要分派点；记录它向下调用的 2～4 个函数。
2. 打开 `packages/runtime-core/src/apiInject.ts`，定位公共入口、核心数据结构和主要分派点；记录它向下调用的 2～4 个函数。
3. 打开 `packages/runtime-core/src/apiLifecycle.ts`，定位公共入口、核心数据结构和主要分派点；记录它向下调用的 2～4 个函数。
4. 全仓搜索今日核心函数的调用方，分别找出至少一个生产者和消费者。
5. 对照测试，用边界用例修正自己的初始推断。

## 动手实验

1. 创建两个 app 验证 global config 隔离
2. 跟踪 app.provide 与 component provide 覆盖
3. 记录 lifecycle hook 注册与执行实例

实验必须记录“输入、预期、实际结果、源码解释”，只记录最终输出不算完成。

## 测试与反证

- [packages/runtime-core/__tests__/apiCreateApp.spec.ts](../../../packages/runtime-core/__tests__/apiCreateApp.spec.ts)
- [packages/runtime-core/__tests__/apiInject.spec.ts](../../../packages/runtime-core/__tests__/apiInject.spec.ts)
- [packages/runtime-core/__tests__/apiLifecycle.spec.ts](../../../packages/runtime-core/__tests__/apiLifecycle.spec.ts)

```bash
pnpm vitest packages/runtime-core/__tests__/apiCreateApp.spec.ts
pnpm vitest packages/runtime-core/__tests__/apiInject.spec.ts
pnpm vitest packages/runtime-core/__tests__/apiLifecycle.spec.ts
```

若当前仓库基线阻止测试启动，记录首个环境/语法错误和阻断链，不要把它误判成今日主题的行为错误。

## 闭卷验收

1. 为什么 createAppAPI 是高阶函数？
2. provides 为什么使用原型链？
3. 生命周期 hook 执行时为何暂停依赖追踪？

## 今日完成标准

- [ ] 能不看源码画出主调用链。
- [ ] 能解释至少三个关键分支及其设计权衡。
- [ ] 完成全部实验，并阅读对应测试中的边界案例。
- [ ] 写出一个最小复刻、伪代码或状态转换表。
- [ ] 将仍不确定的问题标注为“事实缺口”或“设计取舍”。

## 导航

上一天：[Day 28｜组件公开代理与 Options API 汇合](./day-28-public-instance-options.md)  
下一天：[Day 30｜异步组件与错误边界](./day-30-async-error-handling.md)

