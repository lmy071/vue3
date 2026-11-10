# Day 38：setupRenderEffect 与首次组件渲染

> 阶段：渲染器｜建议投入：约 3 小时｜目标：形成可以通过代码、测试和实验复验的理解。

## 今日目标

- componentUpdateFn 首次分支执行 beforeMount、renderComponentRoot、patch subTree、mounted
- ReactiveEffect 的 scheduler 只 queueJob，不同步更新
- instance.subTree、vnode.el 和 isMounted 在正确阶段更新

## 源码入口

- [packages/runtime-core/src/renderer.ts](../../../packages/runtime-core/src/renderer.ts)
- [packages/runtime-core/src/componentRenderUtils.ts](../../../packages/runtime-core/src/componentRenderUtils.ts)
- [packages/runtime-core/src/scheduler.ts](../../../packages/runtime-core/src/scheduler.ts)

## 核心机制

1. componentUpdateFn 首次分支执行 beforeMount、renderComponentRoot、patch subTree、mounted
2. ReactiveEffect 的 scheduler 只 queueJob，不同步更新
3. instance.subTree、vnode.el 和 isMounted 在正确阶段更新

不要从第一行机械读到最后一行。先确定入口输入和外部结果，再围绕上面的机制追踪分支；开发警告、compat 和复杂类型分支第一遍只做标记。

## 主调用链

```text
effect.run → componentUpdateFn mount → renderComponentRoot → patch(null,subTree) → el 回填 → post hooks
```

阅读时给链路中的每个箭头补上：调用函数、关键参数、被修改的状态，以及它属于同步执行、批处理还是异步队列。

## 精读步骤

1. 打开 `packages/runtime-core/src/renderer.ts`，定位公共入口、核心数据结构和主要分派点；记录它向下调用的 2～4 个函数。
2. 打开 `packages/runtime-core/src/componentRenderUtils.ts`，定位公共入口、核心数据结构和主要分派点；记录它向下调用的 2～4 个函数。
3. 打开 `packages/runtime-core/src/scheduler.ts`，定位公共入口、核心数据结构和主要分派点；记录它向下调用的 2～4 个函数。
4. 全仓搜索今日核心函数的调用方，分别找出至少一个生产者和消费者。
5. 对照测试，用边界用例修正自己的初始推断。

## 动手实验

1. 在 beforeMount/render/mounted 记录 DOM 状态
2. 追踪 instance.subTree 与 initialVNode.el
3. 同步修改两次 state 验证只排一个 job

实验必须记录“输入、预期、实际结果、源码解释”，只记录最终输出不算完成。

## 测试与反证

- [packages/runtime-core/__tests__/rendererComponent.spec.ts](../../../packages/runtime-core/__tests__/rendererComponent.spec.ts)
- [packages/runtime-core/__tests__/apiLifecycle.spec.ts](../../../packages/runtime-core/__tests__/apiLifecycle.spec.ts)

```bash
pnpm vitest packages/runtime-core/__tests__/rendererComponent.spec.ts
pnpm vitest packages/runtime-core/__tests__/apiLifecycle.spec.ts
```

若当前仓库基线阻止测试启动，记录首个环境/语法错误和阻断链，不要把它误判成今日主题的行为错误。

## 闭卷验收

1. render effect 收集了哪些依赖？
2. mounted 为什么不是 patch 后立即同步调用？
3. 组件 vnode.el 为什么指向 subTree.el？

## 今日完成标准

- [ ] 能不看源码画出主调用链。
- [ ] 能解释至少三个关键分支及其设计权衡。
- [ ] 完成全部实验，并阅读对应测试中的边界案例。
- [ ] 写出一个最小复刻、伪代码或状态转换表。
- [ ] 将仍不确定的问题标注为“事实缺口”或“设计取舍”。

## 导航

上一天：[Day 37｜mountComponent 首次组件挂载](./day-37-mount-component.md)  
下一天：[Day 39｜组件更新判定与更新分支](./day-39-component-update-path.md)

