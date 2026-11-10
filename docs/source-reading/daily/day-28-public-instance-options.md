# Day 28：组件公开代理与 Options API 汇合

> 阶段：运行时模型｜建议投入：约 3 小时｜目标：形成可以通过代码、测试和实验复验的理解。

## 今日目标

- PublicInstanceProxyHandlers 按 setup/data/props/ctx/globalProperties 查找
- accessCache 避免 render 热路径重复 hasOwn
- applyOptions 把 data/methods/computed/watch/hooks 注入同一实例模型

## 源码入口

- [packages/runtime-core/src/componentPublicInstance.ts](../../../packages/runtime-core/src/componentPublicInstance.ts)
- [packages/runtime-core/src/componentOptions.ts](../../../packages/runtime-core/src/componentOptions.ts)
- [packages/runtime-core/src/apiDefineComponent.ts](../../../packages/runtime-core/src/apiDefineComponent.ts)

## 核心机制

1. PublicInstanceProxyHandlers 按 setup/data/props/ctx/globalProperties 查找
2. accessCache 避免 render 热路径重复 hasOwn
3. applyOptions 把 data/methods/computed/watch/hooks 注入同一实例模型

不要从第一行机械读到最后一行。先确定入口输入和外部结果，再围绕上面的机制追踪分支；开发警告、compat 和复杂类型分支第一遍只做标记。

## 主调用链

```text
render ctx property get → accessCache → setupState/data/props/ctx/publicProperties/globalProperties
```

阅读时给链路中的每个箭头补上：调用函数、关键参数、被修改的状态，以及它属于同步执行、批处理还是异步队列。

## 精读步骤

1. 打开 `packages/runtime-core/src/componentPublicInstance.ts`，定位公共入口、核心数据结构和主要分派点；记录它向下调用的 2～4 个函数。
2. 打开 `packages/runtime-core/src/componentOptions.ts`，定位公共入口、核心数据结构和主要分派点；记录它向下调用的 2～4 个函数。
3. 打开 `packages/runtime-core/src/apiDefineComponent.ts`，定位公共入口、核心数据结构和主要分派点；记录它向下调用的 2～4 个函数。
4. 全仓搜索今日核心函数的调用方，分别找出至少一个生产者和消费者。
5. 对照测试，用边界用例修正自己的初始推断。

## 动手实验

1. 记录同名 setup/data/prop 的访问优先级
2. 追踪 $attrs/$slots/$emit 公共属性
3. 用 Options API 组件跟踪 applyOptions 顺序

实验必须记录“输入、预期、实际结果、源码解释”，只记录最终输出不算完成。

## 测试与反证

- [packages/runtime-core/__tests__/componentPublicInstance.spec.ts](../../../packages/runtime-core/__tests__/componentPublicInstance.spec.ts)
- [packages/runtime-core/__tests__/apiOptions.spec.ts](../../../packages/runtime-core/__tests__/apiOptions.spec.ts)

```bash
pnpm vitest packages/runtime-core/__tests__/componentPublicInstance.spec.ts
pnpm vitest packages/runtime-core/__tests__/apiOptions.spec.ts
```

若当前仓库基线阻止测试启动，记录首个环境/语法错误和阻断链，不要把它误判成今日主题的行为错误。

## 闭卷验收

1. 为何 render 中使用 proxy？
2. accessCache 何时不能缓存？
3. Composition API 与 Options API 最终是否使用两套 renderer？

## 今日完成标准

- [ ] 能不看源码画出主调用链。
- [ ] 能解释至少三个关键分支及其设计权衡。
- [ ] 完成全部实验，并阅读对应测试中的边界案例。
- [ ] 写出一个最小复刻、伪代码或状态转换表。
- [ ] 将仍不确定的问题标注为“事实缺口”或“设计取舍”。

## 导航

上一天：[Day 27｜Slots 初始化、更新与渲染上下文](./day-27-component-slots.md)  
下一天：[Day 29｜createApp、Provide/Inject 与生命周期 API](./day-29-app-context-apis.md)

