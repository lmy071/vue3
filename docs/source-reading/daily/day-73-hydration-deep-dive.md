# Day 73：Hydration、Mismatch 分类与恢复

> 阶段：SSR｜建议投入：约 3 小时｜目标：形成可以通过代码、测试和实验复验的理解。

## 今日目标

- 属性 mismatch 主要警告，结构 mismatch 必须修复 DOM 并维持指针
- Fragment markers、Teleport anchors、Suspense async 分支扩展普通元素遍历
- data-allow-mismatch 可按 text/children/class/style/attribute 控制警告

## 源码入口

- [packages/runtime-core/src/hydration.ts](../../../packages/runtime-core/src/hydration.ts)
- [packages/runtime-core/src/components/Teleport.ts](../../../packages/runtime-core/src/components/Teleport.ts)
- [packages/runtime-core/src/components/Suspense.ts](../../../packages/runtime-core/src/components/Suspense.ts)

## 核心机制

1. 属性 mismatch 主要警告，结构 mismatch 必须修复 DOM 并维持指针
2. Fragment markers、Teleport anchors、Suspense async 分支扩展普通元素遍历
3. data-allow-mismatch 可按 text/children/class/style/attribute 控制警告

不要从第一行机械读到最后一行。先确定入口输入和外部结果，再围绕上面的机制追踪分支；开发警告、compat 和复杂类型分支第一遍只做标记。

## 主调用链

```text
server HTML nodes + client VNode → hydrateNode → assert type/props/children → attach listeners/component effect → recover mismatch
```

阅读时给链路中的每个箭头补上：调用函数、关键参数、被修改的状态，以及它属于同步执行、批处理还是异步队列。

## 精读步骤

1. 打开 `packages/runtime-core/src/hydration.ts`，定位公共入口、核心数据结构和主要分派点；记录它向下调用的 2～4 个函数。
2. 打开 `packages/runtime-core/src/components/Teleport.ts`，定位公共入口、核心数据结构和主要分派点；记录它向下调用的 2～4 个函数。
3. 打开 `packages/runtime-core/src/components/Suspense.ts`，定位公共入口、核心数据结构和主要分派点；记录它向下调用的 2～4 个函数。
4. 全仓搜索今日核心函数的调用方，分别找出至少一个生产者和消费者。
5. 对照测试，用边界用例修正自己的初始推断。

## 动手实验

1. 制造 text、class、element type、children count 四类 mismatch
2. 记录恢复后的 next node 与 vnode.el
3. 验证 allow-mismatch 只抑制允许类别

实验必须记录“输入、预期、实际结果、源码解释”，只记录最终输出不算完成。

## 测试与反证

- [packages/runtime-core/__tests__/hydration.spec.ts](../../../packages/runtime-core/__tests__/hydration.spec.ts)
- [packages/server-renderer/__tests__/render.spec.ts](../../../packages/server-renderer/__tests__/render.spec.ts)

```bash
pnpm vitest packages/runtime-core/__tests__/hydration.spec.ts
pnpm vitest packages/server-renderer/__tests__/render.spec.ts
```

若当前仓库基线阻止测试启动，记录首个环境/语法错误和阻断链，不要把它误判成今日主题的行为错误。

## 闭卷验收

1. hydration 为什么仍需创建组件 render effect？
2. 结构 mismatch 恢复最难维护的状态是什么？
3. 事件 listener 在 hydration 哪一步绑定？

## 今日完成标准

- [ ] 能不看源码画出主调用链。
- [ ] 能解释至少三个关键分支及其设计权衡。
- [ ] 完成全部实验，并阅读对应测试中的边界案例。
- [ ] 写出一个最小复刻、伪代码或状态转换表。
- [ ] 将仍不确定的问题标注为“事实缺口”或“设计取舍”。

## 导航

上一天：[Day 72｜服务端组件渲染、Buffer 与 Stream](./day-72-server-renderer.md)  
下一天：[Day 74｜Vue 聚合入口、运行时编译与发布形态](./day-74-vue-build-runtime.md)

