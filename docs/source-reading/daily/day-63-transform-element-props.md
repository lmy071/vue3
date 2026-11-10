# Day 63：Element、Props 与指令 Transform

> 阶段：编译器｜建议投入：约 3 小时｜目标：形成可以通过代码、测试和实验复验的理解。

## 今日目标

- transformElement 在 exit 时汇总 tag、props、children、directives 与 patchFlag
- buildProps 合并静态属性、动态绑定、spread、事件和 runtime directives
- 动态 key、class/style、固定 props、hydration event 分别产生不同标志

## 源码入口

- [packages/compiler-core/src/transforms/transformElement.ts](../../../packages/compiler-core/src/transforms/transformElement.ts)
- [packages/compiler-core/src/transforms/vBind.ts](../../../packages/compiler-core/src/transforms/vBind.ts)
- [packages/compiler-core/src/transforms/vOn.ts](../../../packages/compiler-core/src/transforms/vOn.ts)
- [packages/compiler-core/src/transforms/vModel.ts](../../../packages/compiler-core/src/transforms/vModel.ts)

## 核心机制

1. transformElement 在 exit 时汇总 tag、props、children、directives 与 patchFlag
2. buildProps 合并静态属性、动态绑定、spread、事件和 runtime directives
3. 动态 key、class/style、固定 props、hydration event 分别产生不同标志

不要从第一行机械读到最后一行。先确定入口输入和外部结果，再围绕上面的机制追踪分支；开发警告、compat 和复杂类型分支第一遍只做标记。

## 主调用链

```text
Element exit → resolve component/tag → buildProps/directiveTransforms → analyze patch flags/dynamicProps → createVNodeCall
```

阅读时给链路中的每个箭头补上：调用函数、关键参数、被修改的状态，以及它属于同步执行、批处理还是异步队列。

## 精读步骤

1. 打开 `packages/compiler-core/src/transforms/transformElement.ts`，定位公共入口、核心数据结构和主要分派点；记录它向下调用的 2～4 个函数。
2. 打开 `packages/compiler-core/src/transforms/vBind.ts`，定位公共入口、核心数据结构和主要分派点；记录它向下调用的 2～4 个函数。
3. 打开 `packages/compiler-core/src/transforms/vOn.ts`，定位公共入口、核心数据结构和主要分派点；记录它向下调用的 2～4 个函数。
4. 打开 `packages/compiler-core/src/transforms/vModel.ts`，定位公共入口、核心数据结构和主要分派点；记录它向下调用的 2～4 个函数。
5. 全仓搜索今日核心函数的调用方，分别找出至少一个生产者和消费者。
6. 对照测试，用边界用例修正自己的初始推断。

## 动手实验

1. 对 :class/:style/:id/v-bind 对象打印 buildProps 结果
2. 写一个 noop directive transform
3. 从 v-on handler cache 追到生成代码

实验必须记录“输入、预期、实际结果、源码解释”，只记录最终输出不算完成。

## 测试与反证

- [packages/compiler-core/__tests__/transforms/transformElement.spec.ts](../../../packages/compiler-core/__tests__/transforms/transformElement.spec.ts)
- [packages/compiler-core/__tests__/transforms/vBind.spec.ts](../../../packages/compiler-core/__tests__/transforms/vBind.spec.ts)
- [packages/compiler-core/__tests__/transforms/vOn.spec.ts](../../../packages/compiler-core/__tests__/transforms/vOn.spec.ts)
- [packages/compiler-core/__tests__/transforms/vModel.spec.ts](../../../packages/compiler-core/__tests__/transforms/vModel.spec.ts)

```bash
pnpm vitest packages/compiler-core/__tests__/transforms/transformElement.spec.ts
pnpm vitest packages/compiler-core/__tests__/transforms/vBind.spec.ts
pnpm vitest packages/compiler-core/__tests__/transforms/vOn.spec.ts
pnpm vitest packages/compiler-core/__tests__/transforms/vModel.spec.ts
```

若当前仓库基线阻止测试启动，记录首个环境/语法错误和阻断链，不要把它误判成今日主题的行为错误。

## 闭卷验收

1. 为什么 transformElement 要等 children 完成？
2. FULL_PROPS 在何种绑定产生？
3. compile-time directive 与 runtime directive 如何区分？

## 今日完成标准

- [ ] 能不看源码画出主调用链。
- [ ] 能解释至少三个关键分支及其设计权衡。
- [ ] 完成全部实验，并阅读对应测试中的边界案例。
- [ ] 写出一个最小复刻、伪代码或状态转换表。
- [ ] 将仍不确定的问题标注为“事实缺口”或“设计取舍”。

## 导航

上一天：[Day 62｜表达式改写、文本合并与作用域](./day-62-transform-expression-text.md)  
下一天：[Day 64｜Slots、Memo、Once 与静态缓存](./day-64-transform-slots-cache.md)

