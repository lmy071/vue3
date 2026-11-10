# Day 45：Renderer 全链路复刻与验收

> 阶段：渲染器｜建议投入：约 3 小时｜目标：形成可以通过代码、测试和实验复验的理解。

## 今日目标

- 把 host contract、VNode、组件 effect、scheduler、diff、unmount 串成闭环
- 区分 mount、patch、move、remove 四种结构动作
- 用 runtime-test 观察算法而不依赖浏览器

## 源码入口

- [packages/runtime-core/src/renderer.ts](../../../packages/runtime-core/src/renderer.ts)
- [packages/runtime-test/src/index.ts](../../../packages/runtime-test/src/index.ts)
- [packages/runtime-core/src/scheduler.ts](../../../packages/runtime-core/src/scheduler.ts)

## 核心机制

1. 把 host contract、VNode、组件 effect、scheduler、diff、unmount 串成闭环
2. 区分 mount、patch、move、remove 四种结构动作
3. 用 runtime-test 观察算法而不依赖浏览器

不要从第一行机械读到最后一行。先确定入口输入和外部结果，再围绕上面的机制追踪分支；开发警告、compat 和复杂类型分支第一遍只做标记。

## 主调用链

```text
state write → effect notify → queueJob → componentUpdateFn → render VNode → patch → host operations
```

阅读时给链路中的每个箭头补上：调用函数、关键参数、被修改的状态，以及它属于同步执行、批处理还是异步队列。

## 精读步骤

1. 打开 `packages/runtime-core/src/renderer.ts`，定位公共入口、核心数据结构和主要分派点；记录它向下调用的 2～4 个函数。
2. 打开 `packages/runtime-test/src/index.ts`，定位公共入口、核心数据结构和主要分派点；记录它向下调用的 2～4 个函数。
3. 打开 `packages/runtime-core/src/scheduler.ts`，定位公共入口、核心数据结构和主要分派点；记录它向下调用的 2～4 个函数。
4. 全仓搜索今日核心函数的调用方，分别找出至少一个生产者和消费者。
5. 对照测试，用边界用例修正自己的初始推断。

## 动手实验

1. 完成 mini renderer：元素、文本、组件、keyed diff
2. 为父子更新顺序和卸载写测试
3. 闭卷讲解一次状态写入到宿主树变化

实验必须记录“输入、预期、实际结果、源码解释”，只记录最终输出不算完成。

## 测试与反证

- [packages/runtime-core/__tests__/rendererElement.spec.ts](../../../packages/runtime-core/__tests__/rendererElement.spec.ts)
- [packages/runtime-core/__tests__/rendererComponent.spec.ts](../../../packages/runtime-core/__tests__/rendererComponent.spec.ts)
- [packages/runtime-core/__tests__/rendererChildren.spec.ts](../../../packages/runtime-core/__tests__/rendererChildren.spec.ts)

```bash
pnpm vitest packages/runtime-core/__tests__/rendererElement.spec.ts
pnpm vitest packages/runtime-core/__tests__/rendererComponent.spec.ts
pnpm vitest packages/runtime-core/__tests__/rendererChildren.spec.ts
```

若当前仓库基线阻止测试启动，记录首个环境/语法错误和阻断链，不要把它误判成今日主题的行为错误。

## 闭卷验收

1. 组件更新与元素更新在哪里汇合？
2. scheduler 如何保护父子更新顺序？
3. 哪些 renderer 优化必须由 compiler 提供信息？

## 今日完成标准

- [ ] 能不看源码画出主调用链。
- [ ] 能解释至少三个关键分支及其设计权衡。
- [ ] 完成全部实验，并阅读对应测试中的边界案例。
- [ ] 写出一个最小复刻、伪代码或状态转换表。
- [ ] 将仍不确定的问题标注为“事实缺口”或“设计取舍”。

## 导航

上一天：[Day 44｜Hydration 核心遍历与节点接管](./day-44-hydration-overview.md)  
下一天：[Day 46｜runtime-dom 入口与 nodeOps](./day-46-runtime-dom-entry-nodeops.md)

