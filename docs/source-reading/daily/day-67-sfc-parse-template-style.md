# Day 67：SFC Descriptor、模板与样式编译

> 阶段：SFC｜建议投入：约 3 小时｜目标：形成可以通过代码、测试和实验复验的理解。

## 今日目标

- parse 复用 compiler-dom AST，提取 template/script/scriptSetup/styles/customBlocks
- descriptor cache key 包含 source/options
- compileTemplate 注入 asset URL/scoped/slotted，compileStyle 组织 PostCSS 与 preprocessors

## 源码入口

- [packages/compiler-sfc/src/parse.ts](../../../packages/compiler-sfc/src/parse.ts)
- [packages/compiler-sfc/src/compileTemplate.ts](../../../packages/compiler-sfc/src/compileTemplate.ts)
- [packages/compiler-sfc/src/compileStyle.ts](../../../packages/compiler-sfc/src/compileStyle.ts)

## 核心机制

1. parse 复用 compiler-dom AST，提取 template/script/scriptSetup/styles/customBlocks
2. descriptor cache key 包含 source/options
3. compileTemplate 注入 asset URL/scoped/slotted，compileStyle 组织 PostCSS 与 preprocessors

不要从第一行机械读到最后一行。先确定入口输入和外部结果，再围绕上面的机制追踪分支；开发警告、compat 和复杂类型分支第一遍只做标记。

## 主调用链

```text
.vue source → parse descriptor → compileTemplate/compiler-dom；style → preprocess → PostCSS plugins → code/map
```

阅读时给链路中的每个箭头补上：调用函数、关键参数、被修改的状态，以及它属于同步执行、批处理还是异步队列。

## 精读步骤

1. 打开 `packages/compiler-sfc/src/parse.ts`，定位公共入口、核心数据结构和主要分派点；记录它向下调用的 2～4 个函数。
2. 打开 `packages/compiler-sfc/src/compileTemplate.ts`，定位公共入口、核心数据结构和主要分派点；记录它向下调用的 2～4 个函数。
3. 打开 `packages/compiler-sfc/src/compileStyle.ts`，定位公共入口、核心数据结构和主要分派点；记录它向下调用的 2～4 个函数。
4. 全仓搜索今日核心函数的调用方，分别找出至少一个生产者和消费者。
5. 对照测试，用边界用例修正自己的初始推断。

## 动手实验

1. 解析包含所有 block 的 SFC 并打印 descriptor
2. 比较 scoped/slotted compileTemplate 输出
3. 编译 Sass/CSS Modules 前先记录缺失依赖错误

实验必须记录“输入、预期、实际结果、源码解释”，只记录最终输出不算完成。

## 测试与反证

- [packages/compiler-sfc/__tests__/parse.spec.ts](../../../packages/compiler-sfc/__tests__/parse.spec.ts)
- [packages/compiler-sfc/__tests__/compileTemplate.spec.ts](../../../packages/compiler-sfc/__tests__/compileTemplate.spec.ts)
- [packages/compiler-sfc/__tests__/compileStyle.spec.ts](../../../packages/compiler-sfc/__tests__/compileStyle.spec.ts)

```bash
pnpm vitest packages/compiler-sfc/__tests__/parse.spec.ts
pnpm vitest packages/compiler-sfc/__tests__/compileTemplate.spec.ts
pnpm vitest packages/compiler-sfc/__tests__/compileStyle.spec.ts
```

若当前仓库基线阻止测试启动，记录首个环境/语法错误和阻断链，不要把它误判成今日主题的行为错误。

## 闭卷验收

1. SFC parser 为什么产出 descriptor 而非一个 render AST？
2. scoped 信息如何进入模板 codegen？
3. source map 如何跨分块保持位置？

## 今日完成标准

- [ ] 能不看源码画出主调用链。
- [ ] 能解释至少三个关键分支及其设计权衡。
- [ ] 完成全部实验，并阅读对应测试中的边界案例。
- [ ] 写出一个最小复刻、伪代码或状态转换表。
- [ ] 将仍不确定的问题标注为“事实缺口”或“设计取舍”。

## 导航

上一天：[Day 66｜compiler-dom 平台扩展与静态字符串化](./day-66-compiler-dom.md)  
下一天：[Day 68｜compileScript 上下文与 Binding Metadata](./day-68-sfc-compile-script.md)

