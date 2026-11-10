# Day 56：AST 节点、SourceLocation 与 VNodeCall

> 阶段：编译器｜建议投入：约 3 小时｜目标：形成可以通过代码、测试和实验复验的理解。

## 今日目标

- TemplateChildNode、ExpressionNode、JSChildNode 分属模板 AST 与 codegen AST
- SourceLocation 保存 source、offset、line、column
- VNodeCall 携带 tag/props/children/patchFlag/dynamicProps/directives/isBlock

## 源码入口

- [packages/compiler-core/src/ast.ts](../../../packages/compiler-core/src/ast.ts)
- [packages/compiler-core/src/runtimeHelpers.ts](../../../packages/compiler-core/src/runtimeHelpers.ts)

## 核心机制

1. TemplateChildNode、ExpressionNode、JSChildNode 分属模板 AST 与 codegen AST
2. SourceLocation 保存 source、offset、line、column
3. VNodeCall 携带 tag/props/children/patchFlag/dynamicProps/directives/isBlock

不要从第一行机械读到最后一行。先确定入口输入和外部结果，再围绕上面的机制追踪分支；开发警告、compat 和复杂类型分支第一遍只做标记。

## 主调用链

```text
template source → parser AST → transform codegenNode/VNodeCall → codegen string
```

阅读时给链路中的每个箭头补上：调用函数、关键参数、被修改的状态，以及它属于同步执行、批处理还是异步队列。

## 精读步骤

1. 打开 `packages/compiler-core/src/ast.ts`，定位公共入口、核心数据结构和主要分派点；记录它向下调用的 2～4 个函数。
2. 打开 `packages/compiler-core/src/runtimeHelpers.ts`，定位公共入口、核心数据结构和主要分派点；记录它向下调用的 2～4 个函数。
3. 全仓搜索今日核心函数的调用方，分别找出至少一个生产者和消费者。
4. 对照测试，用边界用例修正自己的初始推断。

## 动手实验

1. 为元素、插值、if、for 手画 AST
2. 标出 transform 前后新增字段
3. 追踪一个 runtime helper Symbol 到名称映射

实验必须记录“输入、预期、实际结果、源码解释”，只记录最终输出不算完成。

## 测试与反证

- [packages/compiler-core/__tests__/parse.spec.ts](../../../packages/compiler-core/__tests__/parse.spec.ts)
- [packages/compiler-core/__tests__/transform.spec.ts](../../../packages/compiler-core/__tests__/transform.spec.ts)

```bash
pnpm vitest packages/compiler-core/__tests__/parse.spec.ts
pnpm vitest packages/compiler-core/__tests__/transform.spec.ts
```

若当前仓库基线阻止测试启动，记录首个环境/语法错误和阻断链，不要把它误判成今日主题的行为错误。

## 闭卷验收

1. 为什么 transform 不直接输出字符串？
2. loc 为什么同时保留 source 与 offset？
3. VNodeCall 属于哪一层 AST？

## 今日完成标准

- [ ] 能不看源码画出主调用链。
- [ ] 能解释至少三个关键分支及其设计权衡。
- [ ] 完成全部实验，并阅读对应测试中的边界案例。
- [ ] 写出一个最小复刻、伪代码或状态转换表。
- [ ] 将仍不确定的问题标注为“事实缺口”或“设计取舍”。

## 导航

上一天：[Day 55｜Custom Element、CSS Module 与 CSS Vars](./day-55-custom-elements-css.md)  
下一天：[Day 57｜Tokenizer 状态机](./day-57-compiler-tokenizer.md)

