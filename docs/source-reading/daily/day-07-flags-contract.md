# Day 07：ShapeFlags、PatchFlags 与 SlotFlags

> 阶段：共享协议｜建议投入：约 3 小时｜目标：形成可以通过代码、测试和实验复验的理解。

## 今日目标

- ShapeFlags 描述 VNode 结构，PatchFlags 描述编译器已知的变化集合
- 正数 PatchFlags 可按位组合，CACHED/BAIL 必须严格相等
- SlotFlags 是互斥分类，FORWARDED=3 不是位组合

## 源码入口

- [packages/shared/src/shapeFlags.ts](../../../packages/shared/src/shapeFlags.ts)
- [packages/shared/src/patchFlags.ts](../../../packages/shared/src/patchFlags.ts)
- [packages/shared/src/slotFlags.ts](../../../packages/shared/src/slotFlags.ts)

## 核心机制

1. ShapeFlags 描述 VNode 结构，PatchFlags 描述编译器已知的变化集合
2. 正数 PatchFlags 可按位组合，CACHED/BAIL 必须严格相等
3. SlotFlags 是互斥分类，FORWARDED=3 不是位组合

不要从第一行机械读到最后一行。先确定入口输入和外部结果，再围绕上面的机制追踪分支；开发警告、compat 和复杂类型分支第一遍只做标记。

## 主调用链

```text
compiler transform → PatchFlag → codegen → VNode.patchFlag → renderer 快路径
```

阅读时给链路中的每个箭头补上：调用函数、关键参数、被修改的状态，以及它属于同步执行、批处理还是异步队列。

## 精读步骤

1. 打开 `packages/shared/src/shapeFlags.ts`，定位公共入口、核心数据结构和主要分派点；记录它向下调用的 2～4 个函数。
2. 打开 `packages/shared/src/patchFlags.ts`，定位公共入口、核心数据结构和主要分派点；记录它向下调用的 2～4 个函数。
3. 打开 `packages/shared/src/slotFlags.ts`，定位公共入口、核心数据结构和主要分派点；记录它向下调用的 2～4 个函数。
4. 全仓搜索今日核心函数的调用方，分别找出至少一个生产者和消费者。
5. 对照测试，用边界用例修正自己的初始推断。

## 动手实验

1. 手算 ELEMENT|TEXT_CHILDREN 与 CLASS|STYLE|PROPS
2. 从 transformElement 追到 renderer.patchElement
3. 写 decodePatchFlags，仅解析正数二次幂成员

实验必须记录“输入、预期、实际结果、源码解释”，只记录最终输出不算完成。

## 测试与反证

- [packages/compiler-core/__tests__/compile.spec.ts](../../../packages/compiler-core/__tests__/compile.spec.ts)
- [packages/runtime-core/__tests__/rendererOptimizedMode.spec.ts](../../../packages/runtime-core/__tests__/rendererOptimizedMode.spec.ts)

```bash
pnpm vitest packages/compiler-core/__tests__/compile.spec.ts
pnpm vitest packages/runtime-core/__tests__/rendererOptimizedMode.spec.ts
```

若当前仓库基线阻止测试启动，记录首个环境/语法错误和阻断链，不要把它误判成今日主题的行为错误。

## 闭卷验收

1. PatchFlag 是否证明值已经变化？
2. FULL_PROPS 与 PROPS 的差异是什么？
3. 为什么负数 flag 不能做位与检查？

## 今日完成标准

- [ ] 能不看源码画出主调用链。
- [ ] 能解释至少三个关键分支及其设计权衡。
- [ ] 完成全部实验，并阅读对应测试中的边界案例。
- [ ] 写出一个最小复刻、伪代码或状态转换表。
- [ ] 将仍不确定的问题标注为“事实缺口”或“设计取舍”。

## 导航

上一天：[Day 06｜输入规范化、展示与 HTML 安全](./day-06-shared-normalization-security.md)  
下一天：[Day 08｜reactive 工厂与代理缓存](./day-08-reactive-factory.md)

