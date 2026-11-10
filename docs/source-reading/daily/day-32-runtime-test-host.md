# Day 32：runtime-test 与 Host Renderer 契约

> 阶段：渲染器｜建议投入：约 3 小时｜目标：形成可以通过代码、测试和实验复验的理解。

## 今日目标

- renderer 只依赖 HostConfig，不直接操作 DOM
- runtime-test 用内存节点让渲染算法可观察、可序列化
- nodeOps 与 patchProp 是结构操作和属性操作两条宿主边界

## 源码入口

- [packages/runtime-test/src/nodeOps.ts](../../../packages/runtime-test/src/nodeOps.ts)
- [packages/runtime-test/src/patchProp.ts](../../../packages/runtime-test/src/patchProp.ts)
- [packages/runtime-test/src/serialize.ts](../../../packages/runtime-test/src/serialize.ts)
- [packages/runtime-core/src/renderer.ts](../../../packages/runtime-core/src/renderer.ts)

## 核心机制

1. renderer 只依赖 HostConfig，不直接操作 DOM
2. runtime-test 用内存节点让渲染算法可观察、可序列化
3. nodeOps 与 patchProp 是结构操作和属性操作两条宿主边界

不要从第一行机械读到最后一行。先确定入口输入和外部结果，再围绕上面的机制追踪分支；开发警告、compat 和复杂类型分支第一遍只做标记。

## 主调用链

```text
createRenderer(hostOptions) → renderer internals → hostCreate/insert/remove/setText/patchProp
```

阅读时给链路中的每个箭头补上：调用函数、关键参数、被修改的状态，以及它属于同步执行、批处理还是异步队列。

## 精读步骤

1. 打开 `packages/runtime-test/src/nodeOps.ts`，定位公共入口、核心数据结构和主要分派点；记录它向下调用的 2～4 个函数。
2. 打开 `packages/runtime-test/src/patchProp.ts`，定位公共入口、核心数据结构和主要分派点；记录它向下调用的 2～4 个函数。
3. 打开 `packages/runtime-test/src/serialize.ts`，定位公共入口、核心数据结构和主要分派点；记录它向下调用的 2～4 个函数。
4. 打开 `packages/runtime-core/src/renderer.ts`，定位公共入口、核心数据结构和主要分派点；记录它向下调用的 2～4 个函数。
5. 全仓搜索今日核心函数的调用方，分别找出至少一个生产者和消费者。
6. 对照测试，用边界用例修正自己的初始推断。

## 动手实验

1. 阅读 TestNode 数据结构
2. 用 createRenderer 实现控制台树宿主
3. 比较 runtime-test nodeOps 与 runtime-dom nodeOps

实验必须记录“输入、预期、实际结果、源码解释”，只记录最终输出不算完成。

## 测试与反证

- [packages/runtime-test/__tests__/testRuntime.spec.ts](../../../packages/runtime-test/__tests__/testRuntime.spec.ts)
- [packages/runtime-core/__tests__/rendererElement.spec.ts](../../../packages/runtime-core/__tests__/rendererElement.spec.ts)

```bash
pnpm vitest packages/runtime-test/__tests__/testRuntime.spec.ts
pnpm vitest packages/runtime-core/__tests__/rendererElement.spec.ts
```

若当前仓库基线阻止测试启动，记录首个环境/语法错误和阻断链，不要把它误判成今日主题的行为错误。

## 闭卷验收

1. 平台无关 renderer 的最小 host 能力是什么？
2. 为什么 patchProp 独立于 nodeOps？
3. 测试宿主比 jsdom 更适合验证什么？

## 今日完成标准

- [ ] 能不看源码画出主调用链。
- [ ] 能解释至少三个关键分支及其设计权衡。
- [ ] 完成全部实验，并阅读对应测试中的边界案例。
- [ ] 写出一个最小复刻、伪代码或状态转换表。
- [ ] 将仍不确定的问题标注为“事实缺口”或“设计取舍”。

## 导航

上一天：[Day 31｜Scheduler、nextTick 与任务排序](./day-31-runtime-scheduler.md)  
下一天：[Day 33｜render、patch 与节点类型分派](./day-33-renderer-patch-dispatch.md)

