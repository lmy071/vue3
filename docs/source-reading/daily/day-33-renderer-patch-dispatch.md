# Day 33：render、patch 与节点类型分派

> 阶段：渲染器｜建议投入：约 3 小时｜目标：形成可以通过代码、测试和实验复验的理解。

## 今日目标

- render 保存 container._vnode 并以 patch/unmount 统一更新
- patch 先处理 type identity，再分派特殊类型与 shapeFlag
- BAIL 关闭 optimized，n1/n2 不同类型先卸载旧节点

## 源码入口

- [packages/runtime-core/src/renderer.ts](../../../packages/runtime-core/src/renderer.ts)
- [packages/runtime-core/src/vnode.ts](../../../packages/runtime-core/src/vnode.ts)

## 核心机制

1. render 保存 container._vnode 并以 patch/unmount 统一更新
2. patch 先处理 type identity，再分派特殊类型与 shapeFlag
3. BAIL 关闭 optimized，n1/n2 不同类型先卸载旧节点

不要从第一行机械读到最后一行。先确定入口输入和外部结果，再围绕上面的机制追踪分支；开发警告、compat 和复杂类型分支第一遍只做标记。

## 主调用链

```text
render(vnode,container) → patch(old,new) → Text/Comment/Static/Fragment/Element/Component/Teleport/Suspense
```

阅读时给链路中的每个箭头补上：调用函数、关键参数、被修改的状态，以及它属于同步执行、批处理还是异步队列。

## 精读步骤

1. 打开 `packages/runtime-core/src/renderer.ts`，定位公共入口、核心数据结构和主要分派点；记录它向下调用的 2～4 个函数。
2. 打开 `packages/runtime-core/src/vnode.ts`，定位公共入口、核心数据结构和主要分派点；记录它向下调用的 2～4 个函数。
3. 全仓搜索今日核心函数的调用方，分别找出至少一个生产者和消费者。
4. 对照测试，用边界用例修正自己的初始推断。

## 动手实验

1. 跟踪 null→element、element→element、element→null
2. 记录 patch 的 anchor、parentComponent、namespace 参数
3. 验证不同 key/type 导致替换

实验必须记录“输入、预期、实际结果、源码解释”，只记录最终输出不算完成。

## 测试与反证

- [packages/runtime-core/__tests__/rendererElement.spec.ts](../../../packages/runtime-core/__tests__/rendererElement.spec.ts)
- [packages/runtime-core/__tests__/rendererFragment.spec.ts](../../../packages/runtime-core/__tests__/rendererFragment.spec.ts)

```bash
pnpm vitest packages/runtime-core/__tests__/rendererElement.spec.ts
pnpm vitest packages/runtime-core/__tests__/rendererFragment.spec.ts
```

若当前仓库基线阻止测试启动，记录首个环境/语法错误和阻断链，不要把它误判成今日主题的行为错误。

## 闭卷验收

1. 为什么 update 和 mount 共用 patch？
2. anchor 表示什么？
3. isSameVNodeType 检查哪些字段？

## 今日完成标准

- [ ] 能不看源码画出主调用链。
- [ ] 能解释至少三个关键分支及其设计权衡。
- [ ] 完成全部实验，并阅读对应测试中的边界案例。
- [ ] 写出一个最小复刻、伪代码或状态转换表。
- [ ] 将仍不确定的问题标注为“事实缺口”或“设计取舍”。

## 导航

上一天：[Day 32｜runtime-test 与 Host Renderer 契约](./day-32-runtime-test-host.md)  
下一天：[Day 34｜mountElement 首次元素挂载](./day-34-mount-element.md)

