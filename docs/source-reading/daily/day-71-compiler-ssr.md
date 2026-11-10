# Day 71：SSR 编译器与专用 Helpers

> 阶段：SSR｜建议投入：约 3 小时｜目标：形成可以通过代码、测试和实验复验的理解。

## 今日目标

- SSR 复用 DOM parser/core transforms，但追加 SSR transform 与专用 codegen
- 原生元素尽量生成字符串 push，组件生成 ssrRenderComponent
- v-if/v-for/slot/teleport/suspense 使用 SSR 专用 helpers

## 源码入口

- [packages/compiler-ssr/src/index.ts](../../../packages/compiler-ssr/src/index.ts)
- [packages/compiler-ssr/src/ssrCodegenTransform.ts](../../../packages/compiler-ssr/src/ssrCodegenTransform.ts)
- [packages/compiler-ssr/src/transforms/ssrTransformElement.ts](../../../packages/compiler-ssr/src/transforms/ssrTransformElement.ts)
- [packages/compiler-ssr/src/transforms/ssrTransformComponent.ts](../../../packages/compiler-ssr/src/transforms/ssrTransformComponent.ts)

## 核心机制

1. SSR 复用 DOM parser/core transforms，但追加 SSR transform 与专用 codegen
2. 原生元素尽量生成字符串 push，组件生成 ssrRenderComponent
3. v-if/v-for/slot/teleport/suspense 使用 SSR 专用 helpers

不要从第一行机械读到最后一行。先确定入口输入和外部结果，再围绕上面的机制追踪分支；开发警告、compat 和复杂类型分支第一遍只做标记。

## 主调用链

```text
compiler-ssr.compile → DOM/core transform → ssrCodegenTransform → generate ssrRender(_ctx,_push,_parent,_attrs)
```

阅读时给链路中的每个箭头补上：调用函数、关键参数、被修改的状态，以及它属于同步执行、批处理还是异步队列。

## 精读步骤

1. 打开 `packages/compiler-ssr/src/index.ts`，定位公共入口、核心数据结构和主要分派点；记录它向下调用的 2～4 个函数。
2. 打开 `packages/compiler-ssr/src/ssrCodegenTransform.ts`，定位公共入口、核心数据结构和主要分派点；记录它向下调用的 2～4 个函数。
3. 打开 `packages/compiler-ssr/src/transforms/ssrTransformElement.ts`，定位公共入口、核心数据结构和主要分派点；记录它向下调用的 2～4 个函数。
4. 打开 `packages/compiler-ssr/src/transforms/ssrTransformComponent.ts`，定位公共入口、核心数据结构和主要分派点；记录它向下调用的 2～4 个函数。
5. 全仓搜索今日核心函数的调用方，分别找出至少一个生产者和消费者。
6. 对照测试，用边界用例修正自己的初始推断。

## 动手实验

1. 比较同一模板客户端 render 与 ssrRender
2. 标注静态字符串、动态 escape 和 component helper
3. 编译 v-if/v-for/slot/teleport

实验必须记录“输入、预期、实际结果、源码解释”，只记录最终输出不算完成。

## 测试与反证

- [packages/compiler-ssr/__tests__/ssrElement.spec.ts](../../../packages/compiler-ssr/__tests__/ssrElement.spec.ts)
- [packages/compiler-ssr/__tests__/ssrComponent.spec.ts](../../../packages/compiler-ssr/__tests__/ssrComponent.spec.ts)
- [packages/compiler-ssr/__tests__/ssrVIf.spec.ts](../../../packages/compiler-ssr/__tests__/ssrVIf.spec.ts)

```bash
pnpm vitest packages/compiler-ssr/__tests__/ssrElement.spec.ts
pnpm vitest packages/compiler-ssr/__tests__/ssrComponent.spec.ts
pnpm vitest packages/compiler-ssr/__tests__/ssrVIf.spec.ts
```

若当前仓库基线阻止测试启动，记录首个环境/语法错误和阻断链，不要把它误判成今日主题的行为错误。

## 闭卷验收

1. SSR 为什么不能直接执行客户端 VNode renderer？
2. 哪些节点仍需 VNode fallback？
3. 动态文本在哪一层转义？

## 今日完成标准

- [ ] 能不看源码画出主调用链。
- [ ] 能解释至少三个关键分支及其设计权衡。
- [ ] 完成全部实验，并阅读对应测试中的边界案例。
- [ ] 写出一个最小复刻、伪代码或状态转换表。
- [ ] 将仍不确定的问题标注为“事实缺口”或“设计取舍”。

## 导航

上一天：[Day 70｜Top-level Await、Scoped CSS、资源 URL 与 CSS Vars](./day-70-sfc-advanced.md)  
下一天：[Day 72｜服务端组件渲染、Buffer 与 Stream](./day-72-server-renderer.md)

