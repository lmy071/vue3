# Day 66：compiler-dom 平台扩展与静态字符串化

> 阶段：编译器｜建议投入：约 3 小时｜目标：形成可以通过代码、测试和实验复验的理解。

## 今日目标

- compiler-dom 向 baseCompile 注入 parserOptions、nodeTransforms、directiveTransforms
- DOM v-model/v-on/v-show 选择 runtime helper 并做元素合法性校验
- stringifyStatic 把连续可字符串化节点折叠为 createStaticVNode

## 源码入口

- [packages/compiler-dom/src/index.ts](../../../packages/compiler-dom/src/index.ts)
- [packages/compiler-dom/src/parserOptions.ts](../../../packages/compiler-dom/src/parserOptions.ts)
- [packages/compiler-dom/src/transforms/stringifyStatic.ts](../../../packages/compiler-dom/src/transforms/stringifyStatic.ts)
- [packages/compiler-dom/src/transforms/vModel.ts](../../../packages/compiler-dom/src/transforms/vModel.ts)
- [packages/compiler-dom/src/transforms/vOn.ts](../../../packages/compiler-dom/src/transforms/vOn.ts)

## 核心机制

1. compiler-dom 向 baseCompile 注入 parserOptions、nodeTransforms、directiveTransforms
2. DOM v-model/v-on/v-show 选择 runtime helper 并做元素合法性校验
3. stringifyStatic 把连续可字符串化节点折叠为 createStaticVNode

不要从第一行机械读到最后一行。先确定入口输入和外部结果，再围绕上面的机制追踪分支；开发警告、compat 和复杂类型分支第一遍只做标记。

## 主调用链

```text
compiler-dom.compile → baseCompile(merged DOM options) → core transforms + DOM transforms → DOM runtime helpers/static HTML
```

阅读时给链路中的每个箭头补上：调用函数、关键参数、被修改的状态，以及它属于同步执行、批处理还是异步队列。

## 精读步骤

1. 打开 `packages/compiler-dom/src/index.ts`，定位公共入口、核心数据结构和主要分派点；记录它向下调用的 2～4 个函数。
2. 打开 `packages/compiler-dom/src/parserOptions.ts`，定位公共入口、核心数据结构和主要分派点；记录它向下调用的 2～4 个函数。
3. 打开 `packages/compiler-dom/src/transforms/stringifyStatic.ts`，定位公共入口、核心数据结构和主要分派点；记录它向下调用的 2～4 个函数。
4. 打开 `packages/compiler-dom/src/transforms/vModel.ts`，定位公共入口、核心数据结构和主要分派点；记录它向下调用的 2～4 个函数。
5. 打开 `packages/compiler-dom/src/transforms/vOn.ts`，定位公共入口、核心数据结构和主要分派点；记录它向下调用的 2～4 个函数。
6. 全仓搜索今日核心函数的调用方，分别找出至少一个生产者和消费者。
7. 对照测试，用边界用例修正自己的初始推断。

## 动手实验

1. 比较 core 与 DOM v-model transform
2. 编译静态节点组观察 createStaticVNode
3. 测试 script/style 副作用标签被忽略

实验必须记录“输入、预期、实际结果、源码解释”，只记录最终输出不算完成。

## 测试与反证

- [packages/compiler-dom/__tests__/index.spec.ts](../../../packages/compiler-dom/__tests__/index.spec.ts)
- [packages/compiler-dom/__tests__/transforms/stringifyStatic.spec.ts](../../../packages/compiler-dom/__tests__/transforms/stringifyStatic.spec.ts)
- [packages/compiler-dom/__tests__/transforms/vModel.spec.ts](../../../packages/compiler-dom/__tests__/transforms/vModel.spec.ts)

```bash
pnpm vitest packages/compiler-dom/__tests__/index.spec.ts
pnpm vitest packages/compiler-dom/__tests__/transforms/stringifyStatic.spec.ts
pnpm vitest packages/compiler-dom/__tests__/transforms/vModel.spec.ts
```

若当前仓库基线阻止测试启动，记录首个环境/语法错误和阻断链，不要把它误判成今日主题的行为错误。

## 闭卷验收

1. 平台能力为何通过 options 注入？
2. 静态字符串化为何要做 HTML escaping？
3. DOM runtime helper 如何在 codegen 中解析？

## 今日完成标准

- [ ] 能不看源码画出主调用链。
- [ ] 能解释至少三个关键分支及其设计权衡。
- [ ] 完成全部实验，并阅读对应测试中的边界案例。
- [ ] 写出一个最小复刻、伪代码或状态转换表。
- [ ] 将仍不确定的问题标注为“事实缺口”或“设计取舍”。

## 导航

上一天：[Day 65｜Codegen Context 与 Render Function 输出](./day-65-compiler-codegen.md)  
下一天：[Day 67｜SFC Descriptor、模板与样式编译](./day-67-sfc-parse-template-style.md)

