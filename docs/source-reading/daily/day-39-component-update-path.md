# Day 39：组件更新判定与更新分支

> 阶段：渲染器｜建议投入：约 3 小时｜目标：形成可以通过代码、测试和实验复验的理解。

## 今日目标

- shouldUpdateComponent 结合 patchFlag、dynamicProps、slots 与 emits listener
- updateComponent 可直接复用 el 或设置 next 后运行 update
- preRender 更新 vnode、props、slots，再 render 新 subTree

## 源码入口

- [packages/runtime-core/src/renderer.ts](../../../packages/runtime-core/src/renderer.ts)
- [packages/runtime-core/src/componentRenderUtils.ts](../../../packages/runtime-core/src/componentRenderUtils.ts)
- [packages/runtime-core/src/component.ts](../../../packages/runtime-core/src/component.ts)

## 核心机制

1. shouldUpdateComponent 结合 patchFlag、dynamicProps、slots 与 emits listener
2. updateComponent 可直接复用 el 或设置 next 后运行 update
3. preRender 更新 vnode、props、slots，再 render 新 subTree

不要从第一行机械读到最后一行。先确定入口输入和外部结果，再围绕上面的机制追踪分支；开发警告、compat 和复杂类型分支第一遍只做标记。

## 主调用链

```text
parent patch component → shouldUpdateComponent → instance.next → instance.update → updateComponentPreRender → render → patch old/new subTree
```

阅读时给链路中的每个箭头补上：调用函数、关键参数、被修改的状态，以及它属于同步执行、批处理还是异步队列。

## 精读步骤

1. 打开 `packages/runtime-core/src/renderer.ts`，定位公共入口、核心数据结构和主要分派点；记录它向下调用的 2～4 个函数。
2. 打开 `packages/runtime-core/src/componentRenderUtils.ts`，定位公共入口、核心数据结构和主要分派点；记录它向下调用的 2～4 个函数。
3. 打开 `packages/runtime-core/src/component.ts`，定位公共入口、核心数据结构和主要分派点；记录它向下调用的 2～4 个函数。
4. 全仓搜索今日核心函数的调用方，分别找出至少一个生产者和消费者。
5. 对照测试，用边界用例修正自己的初始推断。

## 动手实验

1. 验证只变化 emit listener 是否更新子组件
2. 比较 stable 与 dynamic slots
3. 记录 beforeUpdate/updated 与 DOM 时序

实验必须记录“输入、预期、实际结果、源码解释”，只记录最终输出不算完成。

## 测试与反证

- [packages/runtime-core/__tests__/rendererComponent.spec.ts](../../../packages/runtime-core/__tests__/rendererComponent.spec.ts)
- [packages/runtime-core/__tests__/componentSlots.spec.ts](../../../packages/runtime-core/__tests__/componentSlots.spec.ts)

```bash
pnpm vitest packages/runtime-core/__tests__/rendererComponent.spec.ts
pnpm vitest packages/runtime-core/__tests__/componentSlots.spec.ts
```

若当前仓库基线阻止测试启动，记录首个环境/语法错误和阻断链，不要把它误判成今日主题的行为错误。

## 闭卷验收

1. 父更新不等于子必更新的依据是什么？
2. instance.next 为何暂存新 VNode？
3. updated hook 为什么进入 post queue？

## 今日完成标准

- [ ] 能不看源码画出主调用链。
- [ ] 能解释至少三个关键分支及其设计权衡。
- [ ] 完成全部实验，并阅读对应测试中的边界案例。
- [ ] 写出一个最小复刻、伪代码或状态转换表。
- [ ] 将仍不确定的问题标注为“事实缺口”或“设计取舍”。

## 导航

上一天：[Day 38｜setupRenderEffect 与首次组件渲染](./day-38-setup-render-effect.md)  
下一天：[Day 40｜patchChildren 的文本、数组与空值转换](./day-40-children-transitions.md)

