# Day 37：mountComponent 首次组件挂载

> 阶段：渲染器｜建议投入：约 3 小时｜目标：形成可以通过代码、测试和实验复验的理解。

## 今日目标

- mountComponent 创建实例、注入 renderer internals、处理 KeepAlive/SSR async setup
- setupComponent 完成 props/slots/setup/render
- setupRenderEffect 建立组件渲染 ReactiveEffect

## 源码入口

- [packages/runtime-core/src/renderer.ts](../../../packages/runtime-core/src/renderer.ts)
- [packages/runtime-core/src/component.ts](../../../packages/runtime-core/src/component.ts)

## 核心机制

1. mountComponent 创建实例、注入 renderer internals、处理 KeepAlive/SSR async setup
2. setupComponent 完成 props/slots/setup/render
3. setupRenderEffect 建立组件渲染 ReactiveEffect

不要从第一行机械读到最后一行。先确定入口输入和外部结果，再围绕上面的机制追踪分支；开发警告、compat 和复杂类型分支第一遍只做标记。

## 主调用链

```text
patch component → processComponent → mountComponent → createInstance → setupComponent → setupRenderEffect
```

阅读时给链路中的每个箭头补上：调用函数、关键参数、被修改的状态，以及它属于同步执行、批处理还是异步队列。

## 精读步骤

1. 打开 `packages/runtime-core/src/renderer.ts`，定位公共入口、核心数据结构和主要分派点；记录它向下调用的 2～4 个函数。
2. 打开 `packages/runtime-core/src/component.ts`，定位公共入口、核心数据结构和主要分派点；记录它向下调用的 2～4 个函数。
3. 全仓搜索今日核心函数的调用方，分别找出至少一个生产者和消费者。
4. 对照测试，用边界用例修正自己的初始推断。

## 动手实验

1. 记录根组件到首个 DOM 的完整调用栈
2. 比较同步 setup 与 async setup
3. 定位组件 job.id 与 uid 的绑定

实验必须记录“输入、预期、实际结果、源码解释”，只记录最终输出不算完成。

## 测试与反证

- [packages/runtime-core/__tests__/rendererComponent.spec.ts](../../../packages/runtime-core/__tests__/rendererComponent.spec.ts)
- [packages/runtime-core/__tests__/component.spec.ts](../../../packages/runtime-core/__tests__/component.spec.ts)

```bash
pnpm vitest packages/runtime-core/__tests__/rendererComponent.spec.ts
pnpm vitest packages/runtime-core/__tests__/component.spec.ts
```

若当前仓库基线阻止测试启动，记录首个环境/语法错误和阻断链，不要把它误判成今日主题的行为错误。

## 闭卷验收

1. 组件实例与组件 VNode 是同一对象吗？
2. async setup 未 resolve 前挂什么？
3. 为什么 renderer internals 要暴露给 KeepAlive？

## 今日完成标准

- [ ] 能不看源码画出主调用链。
- [ ] 能解释至少三个关键分支及其设计权衡。
- [ ] 完成全部实验，并阅读对应测试中的边界案例。
- [ ] 写出一个最小复刻、伪代码或状态转换表。
- [ ] 将仍不确定的问题标注为“事实缺口”或“设计取舍”。

## 导航

上一天：[Day 36｜Fragment、Static VNode 与 Block Tree](./day-36-fragments-static-blocks.md)  
下一天：[Day 38｜setupRenderEffect 与首次组件渲染](./day-38-setup-render-effect.md)

