# Day 57：Tokenizer 状态机

> 阶段：编译器｜建议投入：约 3 小时｜目标：形成可以通过代码、测试和实验复验的理解。

## 今日目标

- Tokenizer 单次扫描通过状态转换识别 tag、attr、directive、text、interpolation
- sectionStart、index、delimiterOpen/Close 支撑精确切片
- 回调把 token 交给 parser 建立有层级 AST

## 源码入口

- [packages/compiler-core/src/tokenizer.ts](../../../packages/compiler-core/src/tokenizer.ts)
- [packages/compiler-core/src/parser.ts](../../../packages/compiler-core/src/parser.ts)

## 核心机制

1. Tokenizer 单次扫描通过状态转换识别 tag、attr、directive、text、interpolation
2. sectionStart、index、delimiterOpen/Close 支撑精确切片
3. 回调把 token 交给 parser 建立有层级 AST

不要从第一行机械读到最后一行。先确定入口输入和外部结果，再围绕上面的机制追踪分支；开发警告、compat 和复杂类型分支第一遍只做标记。

## 主调用链

```text
parse input chars → tokenizer state transitions → ontext/onopentag/onattrib*/oninterpolation → parser callbacks
```

阅读时给链路中的每个箭头补上：调用函数、关键参数、被修改的状态，以及它属于同步执行、批处理还是异步队列。

## 精读步骤

1. 打开 `packages/compiler-core/src/tokenizer.ts`，定位公共入口、核心数据结构和主要分派点；记录它向下调用的 2～4 个函数。
2. 打开 `packages/compiler-core/src/parser.ts`，定位公共入口、核心数据结构和主要分派点；记录它向下调用的 2～4 个函数。
3. 全仓搜索今日核心函数的调用方，分别找出至少一个生产者和消费者。
4. 对照测试，用边界用例修正自己的初始推断。

## 动手实验

1. 跟踪 `<div :id="x">{{msg}}</div>` 的状态序列
2. 测试自定义 delimiters
3. 记录错误字符 offset 如何上报

实验必须记录“输入、预期、实际结果、源码解释”，只记录最终输出不算完成。

## 测试与反证

- [packages/compiler-core/__tests__/parse.spec.ts](../../../packages/compiler-core/__tests__/parse.spec.ts)

```bash
pnpm vitest packages/compiler-core/__tests__/parse.spec.ts
```

若当前仓库基线阻止测试启动，记录首个环境/语法错误和阻断链，不要把它误判成今日主题的行为错误。

## 闭卷验收

1. Tokenizer 与 Parser 为什么分层？
2. 状态机相对大正则的优势是什么？
3. 插值内部何时交给表达式 parser？

## 今日完成标准

- [ ] 能不看源码画出主调用链。
- [ ] 能解释至少三个关键分支及其设计权衡。
- [ ] 完成全部实验，并阅读对应测试中的边界案例。
- [ ] 写出一个最小复刻、伪代码或状态转换表。
- [ ] 将仍不确定的问题标注为“事实缺口”或“设计取舍”。

## 导航

上一天：[Day 56｜AST 节点、SourceLocation 与 VNodeCall](./day-56-compiler-ast.md)  
下一天：[Day 58｜元素、文本、插值与注释解析](./day-58-compiler-parser-basics.md)

