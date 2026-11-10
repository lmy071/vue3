# Day 43：卸载、移动、Template Ref 与 Directives

> 阶段：渲染器｜建议投入：约 3 小时｜目标：形成可以通过代码、测试和实验复验的理解。

## 今日目标

- unmount 按组件、Suspense、Teleport、元素/Fragment 分派并安排 hooks
- 组件卸载停止 scope、标记 job disposed、递归卸载 subTree
- setRef 支持 string/ref/function/数组，非 null 设置通常 post-render

## 源码入口

- [packages/runtime-core/src/renderer.ts](../../../packages/runtime-core/src/renderer.ts)
- [packages/runtime-core/src/rendererTemplateRef.ts](../../../packages/runtime-core/src/rendererTemplateRef.ts)
- [packages/runtime-core/src/directives.ts](../../../packages/runtime-core/src/directives.ts)

## 核心机制

1. unmount 按组件、Suspense、Teleport、元素/Fragment 分派并安排 hooks
2. 组件卸载停止 scope、标记 job disposed、递归卸载 subTree
3. setRef 支持 string/ref/function/数组，非 null 设置通常 post-render

不要从第一行机械读到最后一行。先确定入口输入和外部结果，再围绕上面的机制追踪分支；开发警告、compat 和复杂类型分支第一遍只做标记。

## 主调用链

```text
patch remove/replacement → unmount → before hooks → scope.stop/subtree remove → post hooks；VNode ref → setRef
```

阅读时给链路中的每个箭头补上：调用函数、关键参数、被修改的状态，以及它属于同步执行、批处理还是异步队列。

## 精读步骤

1. 打开 `packages/runtime-core/src/renderer.ts`，定位公共入口、核心数据结构和主要分派点；记录它向下调用的 2～4 个函数。
2. 打开 `packages/runtime-core/src/rendererTemplateRef.ts`，定位公共入口、核心数据结构和主要分派点；记录它向下调用的 2～4 个函数。
3. 打开 `packages/runtime-core/src/directives.ts`，定位公共入口、核心数据结构和主要分派点；记录它向下调用的 2～4 个函数。
4. 全仓搜索今日核心函数的调用方，分别找出至少一个生产者和消费者。
5. 对照测试，用边界用例修正自己的初始推断。

## 动手实验

1. 记录组件卸载时 effect、hooks、DOM 删除顺序
2. 验证 v-if 下 ref 从元素变 null
3. 编写对象指令并跟踪 created→unmounted

实验必须记录“输入、预期、实际结果、源码解释”，只记录最终输出不算完成。

## 测试与反证

- [packages/runtime-core/__tests__/rendererTemplateRef.spec.ts](../../../packages/runtime-core/__tests__/rendererTemplateRef.spec.ts)
- [packages/runtime-core/__tests__/directives.spec.ts](../../../packages/runtime-core/__tests__/directives.spec.ts)
- [packages/runtime-core/__tests__/rendererComponent.spec.ts](../../../packages/runtime-core/__tests__/rendererComponent.spec.ts)

```bash
pnpm vitest packages/runtime-core/__tests__/rendererTemplateRef.spec.ts
pnpm vitest packages/runtime-core/__tests__/directives.spec.ts
pnpm vitest packages/runtime-core/__tests__/rendererComponent.spec.ts
```

若当前仓库基线阻止测试启动，记录首个环境/语法错误和阻断链，不要把它误判成今日主题的行为错误。

## 闭卷验收

1. 为什么旧 ref 要先清理？
2. 组件 job 如何避免卸载后仍执行？
3. directives 为什么存到 VNode 而非 DOM？

## 今日完成标准

- [ ] 能不看源码画出主调用链。
- [ ] 能解释至少三个关键分支及其设计权衡。
- [ ] 完成全部实验，并阅读对应测试中的边界案例。
- [ ] 写出一个最小复刻、伪代码或状态转换表。
- [ ] 将仍不确定的问题标注为“事实缺口”或“设计取舍”。

## 导航

上一天：[Day 42｜LIS 与最小移动](./day-42-lis-move.md)  
下一天：[Day 44｜Hydration 核心遍历与节点接管](./day-44-hydration-overview.md)

