# Day 72：服务端组件渲染、Buffer 与 Stream

> 阶段：SSR｜建议投入：约 3 小时｜目标：形成可以通过代码、测试和实验复验的理解。

## 今日目标

- renderComponentVNode 创建/复用组件实例并执行 ssrRender 或 vnode fallback
- SSRBuffer 允许 string、Promise、nested buffer 混合并延迟 unroll
- renderToString、Node/Web stream 共享核心 renderToSimpleStream

## 源码入口

- [packages/server-renderer/src/render.ts](../../../packages/server-renderer/src/render.ts)
- [packages/server-renderer/src/renderToString.ts](../../../packages/server-renderer/src/renderToString.ts)
- [packages/server-renderer/src/renderToStream.ts](../../../packages/server-renderer/src/renderToStream.ts)
- [packages/server-renderer/src/internal.ts](../../../packages/server-renderer/src/internal.ts)

## 核心机制

1. renderComponentVNode 创建/复用组件实例并执行 ssrRender 或 vnode fallback
2. SSRBuffer 允许 string、Promise、nested buffer 混合并延迟 unroll
3. renderToString、Node/Web stream 共享核心 renderToSimpleStream

不要从第一行机械读到最后一行。先确定入口输入和外部结果，再围绕上面的机制追踪分支；开发警告、compat 和复杂类型分支第一遍只做标记。

## 主调用链

```text
renderToString(app/vnode) → renderComponentVNode → ssrRender/push buffer → unrollBuffer await async chunks → HTML
```

阅读时给链路中的每个箭头补上：调用函数、关键参数、被修改的状态，以及它属于同步执行、批处理还是异步队列。

## 精读步骤

1. 打开 `packages/server-renderer/src/render.ts`，定位公共入口、核心数据结构和主要分派点；记录它向下调用的 2～4 个函数。
2. 打开 `packages/server-renderer/src/renderToString.ts`，定位公共入口、核心数据结构和主要分派点；记录它向下调用的 2～4 个函数。
3. 打开 `packages/server-renderer/src/renderToStream.ts`，定位公共入口、核心数据结构和主要分派点；记录它向下调用的 2～4 个函数。
4. 打开 `packages/server-renderer/src/internal.ts`，定位公共入口、核心数据结构和主要分派点；记录它向下调用的 2～4 个函数。
5. 全仓搜索今日核心函数的调用方，分别找出至少一个生产者和消费者。
6. 对照测试，用边界用例修正自己的初始推断。

## 动手实验

1. 渲染同步与 async setup 组件比较 buffer
2. 对 nested async component 记录输出顺序
3. 比较 renderToString 与 Web ReadableStream

实验必须记录“输入、预期、实际结果、源码解释”，只记录最终输出不算完成。

## 测试与反证

- [packages/server-renderer/__tests__/render.spec.ts](../../../packages/server-renderer/__tests__/render.spec.ts)
- [packages/server-renderer/__tests__/webStream.spec.ts](../../../packages/server-renderer/__tests__/webStream.spec.ts)

```bash
pnpm vitest packages/server-renderer/__tests__/render.spec.ts
pnpm vitest packages/server-renderer/__tests__/webStream.spec.ts
```

若当前仓库基线阻止测试启动，记录首个环境/语法错误和阻断链，不要把它误判成今日主题的行为错误。

## 闭卷验收

1. 为什么 buffer 不是简单字符串数组？
2. SSR 组件实例为何关闭普通响应式追踪？
3. Teleport 内容在哪里收集？

## 今日完成标准

- [ ] 能不看源码画出主调用链。
- [ ] 能解释至少三个关键分支及其设计权衡。
- [ ] 完成全部实验，并阅读对应测试中的边界案例。
- [ ] 写出一个最小复刻、伪代码或状态转换表。
- [ ] 将仍不确定的问题标注为“事实缺口”或“设计取舍”。

## 导航

上一天：[Day 71｜SSR 编译器与专用 Helpers](./day-71-compiler-ssr.md)  
下一天：[Day 73｜Hydration、Mismatch 分类与恢复](./day-73-hydration-deep-dive.md)

