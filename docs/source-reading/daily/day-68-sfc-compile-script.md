# Day 68：compileScript 上下文与 Binding Metadata

> 阶段：SFC｜建议投入：约 3 小时｜目标：形成可以通过代码、测试和实验复验的理解。

## 今日目标

- ScriptCompileContext 分别解析普通 script 与 script setup AST，并跟踪 imports/macros/bindings
- compileScript 合并两个 block、改写 default export、生成 setup 函数
- BindingTypes 告诉模板哪些标识符是 props、ref、setup const 或可变 binding

## 源码入口

- [packages/compiler-sfc/src/compileScript.ts](../../../packages/compiler-sfc/src/compileScript.ts)
- [packages/compiler-sfc/src/script/context.ts](../../../packages/compiler-sfc/src/script/context.ts)
- [packages/compiler-sfc/src/script/analyzeScriptBindings.ts](../../../packages/compiler-sfc/src/script/analyzeScriptBindings.ts)
- [packages/compiler-sfc/src/script/normalScript.ts](../../../packages/compiler-sfc/src/script/normalScript.ts)

## 核心机制

1. ScriptCompileContext 分别解析普通 script 与 script setup AST，并跟踪 imports/macros/bindings
2. compileScript 合并两个 block、改写 default export、生成 setup 函数
3. BindingTypes 告诉模板哪些标识符是 props、ref、setup const 或可变 binding

不要从第一行机械读到最后一行。先确定入口输入和外部结果，再围绕上面的机制追踪分支；开发警告、compat 和复杂类型分支第一遍只做标记。

## 主调用链

```text
descriptor → ScriptCompileContext → analyze imports/declarations/macros → rewrite MagicString → generate setup/default export + bindings/map
```

阅读时给链路中的每个箭头补上：调用函数、关键参数、被修改的状态，以及它属于同步执行、批处理还是异步队列。

## 精读步骤

1. 打开 `packages/compiler-sfc/src/compileScript.ts`，定位公共入口、核心数据结构和主要分派点；记录它向下调用的 2～4 个函数。
2. 打开 `packages/compiler-sfc/src/script/context.ts`，定位公共入口、核心数据结构和主要分派点；记录它向下调用的 2～4 个函数。
3. 打开 `packages/compiler-sfc/src/script/analyzeScriptBindings.ts`，定位公共入口、核心数据结构和主要分派点；记录它向下调用的 2～4 个函数。
4. 打开 `packages/compiler-sfc/src/script/normalScript.ts`，定位公共入口、核心数据结构和主要分派点；记录它向下调用的 2～4 个函数。
5. 全仓搜索今日核心函数的调用方，分别找出至少一个生产者和消费者。
6. 对照测试，用边界用例修正自己的初始推断。

## 动手实验

1. 编译普通 script、script setup、两者并存三种 SFC
2. 打印 bindings 并对应模板解包策略
3. 追踪 rewriteDefault 产生的 __default__

实验必须记录“输入、预期、实际结果、源码解释”，只记录最终输出不算完成。

## 测试与反证

- [packages/compiler-sfc/__tests__/compileScript.spec.ts](../../../packages/compiler-sfc/__tests__/compileScript.spec.ts)
- [packages/compiler-sfc/__tests__/rewriteDefault.spec.ts](../../../packages/compiler-sfc/__tests__/rewriteDefault.spec.ts)

```bash
pnpm vitest packages/compiler-sfc/__tests__/compileScript.spec.ts
pnpm vitest packages/compiler-sfc/__tests__/rewriteDefault.spec.ts
```

若当前仓库基线阻止测试启动，记录首个环境/语法错误和阻断链，不要把它误判成今日主题的行为错误。

## 闭卷验收

1. 为何使用 MagicString 而非重新 codegen 整个 JS AST？
2. binding metadata 谁消费？
3. 普通 script 与 setup 的默认导出如何合并？

## 今日完成标准

- [ ] 能不看源码画出主调用链。
- [ ] 能解释至少三个关键分支及其设计权衡。
- [ ] 完成全部实验，并阅读对应测试中的边界案例。
- [ ] 写出一个最小复刻、伪代码或状态转换表。
- [ ] 将仍不确定的问题标注为“事实缺口”或“设计取舍”。

## 导航

上一天：[Day 67｜SFC Descriptor、模板与样式编译](./day-67-sfc-parse-template-style.md)  
下一天：[Day 69｜defineProps/Emits/Model/Slots 与类型解析](./day-69-sfc-macros-types.md)

