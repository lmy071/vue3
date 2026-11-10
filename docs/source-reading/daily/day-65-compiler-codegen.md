# Day 65：Codegen Context 与 Render Function 输出

> 阶段：编译器｜建议投入：约 3 小时｜目标：形成可以通过代码、测试和实验复验的理解。

## 今日目标

- baseCompile 串联 parse → transform → generate
- CodegenContext 管理 push/indent/newline/helper/source map
- function/module 两种 mode 的 preamble、helpers 和 with block 不同

## 源码入口

- [packages/compiler-core/src/codegen.ts](../../../packages/compiler-core/src/codegen.ts)
- [packages/compiler-core/src/runtimeHelpers.ts](../../../packages/compiler-core/src/runtimeHelpers.ts)
- [packages/compiler-core/src/compile.ts](../../../packages/compiler-core/src/compile.ts)

## 核心机制

1. baseCompile 串联 parse → transform → generate
2. CodegenContext 管理 push/indent/newline/helper/source map
3. function/module 两种 mode 的 preamble、helpers 和 with block 不同

不要从第一行机械读到最后一行。先确定入口输入和外部结果，再围绕上面的机制追踪分支；开发警告、compat 和复杂类型分支第一遍只做标记。

## 主调用链

```text
baseCompile(source) → baseParse → get transforms/transform → generate(root) → {ast,code,preamble,map}
```

阅读时给链路中的每个箭头补上：调用函数、关键参数、被修改的状态，以及它属于同步执行、批处理还是异步队列。

## 精读步骤

1. 打开 `packages/compiler-core/src/codegen.ts`，定位公共入口、核心数据结构和主要分派点；记录它向下调用的 2～4 个函数。
2. 打开 `packages/compiler-core/src/runtimeHelpers.ts`，定位公共入口、核心数据结构和主要分派点；记录它向下调用的 2～4 个函数。
3. 打开 `packages/compiler-core/src/compile.ts`，定位公共入口、核心数据结构和主要分派点；记录它向下调用的 2～4 个函数。
4. 全仓搜索今日核心函数的调用方，分别找出至少一个生产者和消费者。
5. 对照测试，用边界用例修正自己的初始推断。

## 动手实验

1. 对同一模板输出 function 与 module mode
2. 逐段标注 preamble、helper destructure、hoist、render body
3. 从 VNodeCall 追到 genVNodeCall 参数

实验必须记录“输入、预期、实际结果、源码解释”，只记录最终输出不算完成。

## 测试与反证

- [packages/compiler-core/__tests__/compile.spec.ts](../../../packages/compiler-core/__tests__/compile.spec.ts)
- [packages/compiler-core/__tests__/codegen.spec.ts](../../../packages/compiler-core/__tests__/codegen.spec.ts)

```bash
pnpm vitest packages/compiler-core/__tests__/compile.spec.ts
pnpm vitest packages/compiler-core/__tests__/codegen.spec.ts
```

若当前仓库基线阻止测试启动，记录首个环境/语法错误和阻断链，不要把它误判成今日主题的行为错误。

## 闭卷验收

1. codegen 为什么消费 codegenNode 而非原模板节点？
2. helper alias 如何生成？
3. patchFlag 开发注释如何不影响数值？

## 今日完成标准

- [ ] 能不看源码画出主调用链。
- [ ] 能解释至少三个关键分支及其设计权衡。
- [ ] 完成全部实验，并阅读对应测试中的边界案例。
- [ ] 写出一个最小复刻、伪代码或状态转换表。
- [ ] 将仍不确定的问题标注为“事实缺口”或“设计取舍”。

## 导航

上一天：[Day 64｜Slots、Memo、Once 与静态缓存](./day-64-transform-slots-cache.md)  
下一天：[Day 66｜compiler-dom 平台扩展与静态字符串化](./day-66-compiler-dom.md)

