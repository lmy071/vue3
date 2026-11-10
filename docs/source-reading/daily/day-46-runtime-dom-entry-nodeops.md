# Day 46：runtime-dom 入口与 nodeOps

> 阶段：DOM 平台｜建议投入：约 3 小时｜目标：形成可以通过代码、测试和实验复验的理解。

## 今日目标

- ensureRenderer 懒创建使只使用 reactivity 时 renderer 可 tree-shake
- createApp.mount 增强容器规范化、模板获取、清空和 data-v-app
- nodeOps 把 HostConfig 映射到真实 DOM API 并处理 namespace

## 源码入口

- [packages/runtime-dom/src/index.ts](../../../packages/runtime-dom/src/index.ts)
- [packages/runtime-dom/src/nodeOps.ts](../../../packages/runtime-dom/src/nodeOps.ts)
- [packages/runtime-dom/src/patchProp.ts](../../../packages/runtime-dom/src/patchProp.ts)

## 核心机制

1. ensureRenderer 懒创建使只使用 reactivity 时 renderer 可 tree-shake
2. createApp.mount 增强容器规范化、模板获取、清空和 data-v-app
3. nodeOps 把 HostConfig 映射到真实 DOM API 并处理 namespace

不要从第一行机械读到最后一行。先确定入口输入和外部结果，再围绕上面的机制追踪分支；开发警告、compat 和复杂类型分支第一遍只做标记。

## 主调用链

```text
runtime-dom.createApp → ensureRenderer(createRenderer(nodeOps+patchProp)) → core app.mount → DOM
```

阅读时给链路中的每个箭头补上：调用函数、关键参数、被修改的状态，以及它属于同步执行、批处理还是异步队列。

## 精读步骤

1. 打开 `packages/runtime-dom/src/index.ts`，定位公共入口、核心数据结构和主要分派点；记录它向下调用的 2～4 个函数。
2. 打开 `packages/runtime-dom/src/nodeOps.ts`，定位公共入口、核心数据结构和主要分派点；记录它向下调用的 2～4 个函数。
3. 打开 `packages/runtime-dom/src/patchProp.ts`，定位公共入口、核心数据结构和主要分派点；记录它向下调用的 2～4 个函数。
4. 全仓搜索今日核心函数的调用方，分别找出至少一个生产者和消费者。
5. 对照测试，用边界用例修正自己的初始推断。

## 动手实验

1. 从 createApp().mount 跟到 document.createElement
2. 比较 createApp 与 createSSRApp 的 mount 参数
3. 记录 SVG/MathML/foreignObject namespace 转换

实验必须记录“输入、预期、实际结果、源码解释”，只记录最终输出不算完成。

## 测试与反证

- [packages/runtime-dom/__tests__/createApp.spec.ts](../../../packages/runtime-dom/__tests__/createApp.spec.ts)
- [packages/runtime-dom/__tests__/nodeOps.spec.ts](../../../packages/runtime-dom/__tests__/nodeOps.spec.ts)

```bash
pnpm vitest packages/runtime-dom/__tests__/createApp.spec.ts
pnpm vitest packages/runtime-dom/__tests__/nodeOps.spec.ts
```

若当前仓库基线阻止测试启动，记录首个环境/语法错误和阻断链，不要把它误判成今日主题的行为错误。

## 闭卷验收

1. renderer 为什么懒创建？
2. runtime-dom mount 为什么先清空容器？
3. nodeOps.insert 如何同时完成移动？

## 今日完成标准

- [ ] 能不看源码画出主调用链。
- [ ] 能解释至少三个关键分支及其设计权衡。
- [ ] 完成全部实验，并阅读对应测试中的边界案例。
- [ ] 写出一个最小复刻、伪代码或状态转换表。
- [ ] 将仍不确定的问题标注为“事实缺口”或“设计取舍”。

## 导航

上一天：[Day 45｜Renderer 全链路复刻与验收](./day-45-runtime-integration.md)  
下一天：[Day 47｜patchProp、Attributes 与 DOM Properties](./day-47-dom-attrs-props.md)

