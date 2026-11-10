# Day 58：元素、文本、插值与注释解析

> 阶段：编译器｜建议投入：约 3 小时｜目标：形成可以通过代码、测试和实验复验的理解。

## 今日目标

- parser 维护 currentOpenTag、stack、currentProp 与 namespaces
- 文本节点会按 mode 解码 entities，连续文本在回调中累积
- end tag 完成元素 loc 并处理 whitespace/condense

## 源码入口

- [packages/compiler-core/src/parser.ts](../../../packages/compiler-core/src/parser.ts)
- [packages/compiler-core/src/tokenizer.ts](../../../packages/compiler-core/src/tokenizer.ts)
- [packages/compiler-core/src/errors.ts](../../../packages/compiler-core/src/errors.ts)

## 核心机制

1. parser 维护 currentOpenTag、stack、currentProp 与 namespaces
2. 文本节点会按 mode 解码 entities，连续文本在回调中累积
3. end tag 完成元素 loc 并处理 whitespace/condense

不要从第一行机械读到最后一行。先确定入口输入和外部结果，再围绕上面的机制追踪分支；开发警告、compat 和复杂类型分支第一遍只做标记。

## 主调用链

```text
baseParse → createParserContext → tokenizer.parse → callbacks mutate stack/root → createRoot
```

阅读时给链路中的每个箭头补上：调用函数、关键参数、被修改的状态，以及它属于同步执行、批处理还是异步队列。

## 精读步骤

1. 打开 `packages/compiler-core/src/parser.ts`，定位公共入口、核心数据结构和主要分派点；记录它向下调用的 2～4 个函数。
2. 打开 `packages/compiler-core/src/tokenizer.ts`，定位公共入口、核心数据结构和主要分派点；记录它向下调用的 2～4 个函数。
3. 打开 `packages/compiler-core/src/errors.ts`，定位公共入口、核心数据结构和主要分派点；记录它向下调用的 2～4 个函数。
4. 全仓搜索今日核心函数的调用方，分别找出至少一个生产者和消费者。
5. 对照测试，用边界用例修正自己的初始推断。

## 动手实验

1. 比较 DATA、RCDATA、RAWTEXT 容器
2. 解析多根、嵌套错误、缺失 end tag
3. 验证 HTML entity 与插值 source loc

实验必须记录“输入、预期、实际结果、源码解释”，只记录最终输出不算完成。

## 测试与反证

- [packages/compiler-core/__tests__/parse.spec.ts](../../../packages/compiler-core/__tests__/parse.spec.ts)

```bash
pnpm vitest packages/compiler-core/__tests__/parse.spec.ts
```

若当前仓库基线阻止测试启动，记录首个环境/语法错误和阻断链，不要把它误判成今日主题的行为错误。

## 闭卷验收

1. 为什么 script/style 与普通元素文本模式不同？
2. 元素 loc 在何时闭合？
3. 空白压缩属于 tokenizer 还是 parser 后处理？

## 今日完成标准

- [ ] 能不看源码画出主调用链。
- [ ] 能解释至少三个关键分支及其设计权衡。
- [ ] 完成全部实验，并阅读对应测试中的边界案例。
- [ ] 写出一个最小复刻、伪代码或状态转换表。
- [ ] 将仍不确定的问题标注为“事实缺口”或“设计取舍”。

## 导航

上一天：[Day 57｜Tokenizer 状态机](./day-57-compiler-tokenizer.md)  
下一天：[Day 59｜属性、指令、表达式与命名空间](./day-59-compiler-parser-directives.md)

