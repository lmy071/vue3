# Day 64：Slots、Memo、Once 与静态缓存

> 阶段：编译器｜建议投入：约 3 小时｜目标：形成可以通过代码、测试和实验复验的理解。

## 今日目标

- buildSlots 识别 stable/dynamic/forwarded 与动态 slot 分支
- v-once 用 render cache 跳过后续创建，v-memo 用依赖数组决定复用
- cacheStatic 提升常量或缓存 VNode，需尊重 scope/props/directives

## 源码入口

- [packages/compiler-core/src/transforms/vSlot.ts](../../../packages/compiler-core/src/transforms/vSlot.ts)
- [packages/compiler-core/src/transforms/vMemo.ts](../../../packages/compiler-core/src/transforms/vMemo.ts)
- [packages/compiler-core/src/transforms/vOnce.ts](../../../packages/compiler-core/src/transforms/vOnce.ts)
- [packages/compiler-core/src/transforms/cacheStatic.ts](../../../packages/compiler-core/src/transforms/cacheStatic.ts)

## 核心机制

1. buildSlots 识别 stable/dynamic/forwarded 与动态 slot 分支
2. v-once 用 render cache 跳过后续创建，v-memo 用依赖数组决定复用
3. cacheStatic 提升常量或缓存 VNode，需尊重 scope/props/directives

不要从第一行机械读到最后一行。先确定入口输入和外部结果，再围绕上面的机制追踪分支；开发警告、compat 和复杂类型分支第一遍只做标记。

## 主调用链

```text
slot template/directives → slot functions + SlotFlag；static analysis → hoists/cache expressions → codegen declarations/cache access
```

阅读时给链路中的每个箭头补上：调用函数、关键参数、被修改的状态，以及它属于同步执行、批处理还是异步队列。

## 精读步骤

1. 打开 `packages/compiler-core/src/transforms/vSlot.ts`，定位公共入口、核心数据结构和主要分派点；记录它向下调用的 2～4 个函数。
2. 打开 `packages/compiler-core/src/transforms/vMemo.ts`，定位公共入口、核心数据结构和主要分派点；记录它向下调用的 2～4 个函数。
3. 打开 `packages/compiler-core/src/transforms/vOnce.ts`，定位公共入口、核心数据结构和主要分派点；记录它向下调用的 2～4 个函数。
4. 打开 `packages/compiler-core/src/transforms/cacheStatic.ts`，定位公共入口、核心数据结构和主要分派点；记录它向下调用的 2～4 个函数。
5. 全仓搜索今日核心函数的调用方，分别找出至少一个生产者和消费者。
6. 对照测试，用边界用例修正自己的初始推断。

## 动手实验

1. 比较静态 slot、v-if slot、v-for slot
2. 编译 v-once/v-memo 并标注缓存槽
3. 找出不能 hoist 的含 scope 变量节点

实验必须记录“输入、预期、实际结果、源码解释”，只记录最终输出不算完成。

## 测试与反证

- [packages/compiler-core/__tests__/transforms/vSlot.spec.ts](../../../packages/compiler-core/__tests__/transforms/vSlot.spec.ts)
- [packages/compiler-core/__tests__/transforms/vMemo.spec.ts](../../../packages/compiler-core/__tests__/transforms/vMemo.spec.ts)
- [packages/compiler-core/__tests__/transforms/vOnce.spec.ts](../../../packages/compiler-core/__tests__/transforms/vOnce.spec.ts)
- [packages/compiler-core/__tests__/transforms/cacheStatic.spec.ts](../../../packages/compiler-core/__tests__/transforms/cacheStatic.spec.ts)

```bash
pnpm vitest packages/compiler-core/__tests__/transforms/vSlot.spec.ts
pnpm vitest packages/compiler-core/__tests__/transforms/vMemo.spec.ts
pnpm vitest packages/compiler-core/__tests__/transforms/vOnce.spec.ts
pnpm vitest packages/compiler-core/__tests__/transforms/cacheStatic.spec.ts
```

若当前仓库基线阻止测试启动，记录首个环境/语法错误和阻断链，不要把它误判成今日主题的行为错误。

## 闭卷验收

1. FORWARDED slot 为什么需运行时细化？
2. hoist 与 cache 的生命周期差异是什么？
3. 静态分析为何要考虑 runtime directive？

## 今日完成标准

- [ ] 能不看源码画出主调用链。
- [ ] 能解释至少三个关键分支及其设计权衡。
- [ ] 完成全部实验，并阅读对应测试中的边界案例。
- [ ] 写出一个最小复刻、伪代码或状态转换表。
- [ ] 将仍不确定的问题标注为“事实缺口”或“设计取舍”。

## 导航

上一天：[Day 63｜Element、Props 与指令 Transform](./day-63-transform-element-props.md)  
下一天：[Day 65｜Codegen Context 与 Render Function 输出](./day-65-compiler-codegen.md)

