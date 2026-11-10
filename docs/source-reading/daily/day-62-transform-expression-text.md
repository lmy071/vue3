# Day 62：表达式改写、文本合并与作用域

> 阶段：编译器｜建议投入：约 3 小时｜目标：形成可以通过代码、测试和实验复验的理解。

## 今日目标

- prefixIdentifiers 模式把自由变量改写为 _ctx.xxx，同时保护 local identifiers
- Babel AST walk 区分引用、声明、属性 key 与 shorthand
- 相邻 Text/Interpolation 合并为 CompoundExpression，再生成 TEXT flag

## 源码入口

- [packages/compiler-core/src/transforms/transformExpression.ts](../../../packages/compiler-core/src/transforms/transformExpression.ts)
- [packages/compiler-core/src/transforms/transformText.ts](../../../packages/compiler-core/src/transforms/transformText.ts)
- [packages/compiler-core/src/validateExpression.ts](../../../packages/compiler-core/src/validateExpression.ts)

## 核心机制

1. prefixIdentifiers 模式把自由变量改写为 _ctx.xxx，同时保护 local identifiers
2. Babel AST walk 区分引用、声明、属性 key 与 shorthand
3. 相邻 Text/Interpolation 合并为 CompoundExpression，再生成 TEXT flag

不要从第一行机械读到最后一行。先确定入口输入和外部结果，再围绕上面的机制追踪分支；开发警告、compat 和复杂类型分支第一遍只做标记。

## 主调用链

```text
SimpleExpression → parse JS expression → walk identifiers/scopes → rewrite → Text transform merges → createTextVNode
```

阅读时给链路中的每个箭头补上：调用函数、关键参数、被修改的状态，以及它属于同步执行、批处理还是异步队列。

## 精读步骤

1. 打开 `packages/compiler-core/src/transforms/transformExpression.ts`，定位公共入口、核心数据结构和主要分派点；记录它向下调用的 2～4 个函数。
2. 打开 `packages/compiler-core/src/transforms/transformText.ts`，定位公共入口、核心数据结构和主要分派点；记录它向下调用的 2～4 个函数。
3. 打开 `packages/compiler-core/src/validateExpression.ts`，定位公共入口、核心数据结构和主要分派点；记录它向下调用的 2～4 个函数。
4. 全仓搜索今日核心函数的调用方，分别找出至少一个生产者和消费者。
5. 对照测试，用边界用例修正自己的初始推断。

## 动手实验

1. 比较 foo、obj.foo、{foo}、x=>x+foo 的改写
2. 观察 v-for/slot local 变量不加 _ctx
3. 验证相邻文本合并后的 codegen

实验必须记录“输入、预期、实际结果、源码解释”，只记录最终输出不算完成。

## 测试与反证

- [packages/compiler-core/__tests__/transforms/transformExpressions.spec.ts](../../../packages/compiler-core/__tests__/transforms/transformExpressions.spec.ts)
- [packages/compiler-core/__tests__/transforms/transformText.spec.ts](../../../packages/compiler-core/__tests__/transforms/transformText.spec.ts)

```bash
pnpm vitest packages/compiler-core/__tests__/transforms/transformExpressions.spec.ts
pnpm vitest packages/compiler-core/__tests__/transforms/transformText.spec.ts
```

若当前仓库基线阻止测试启动，记录首个环境/语法错误和阻断链，不要把它误判成今日主题的行为错误。

## 闭卷验收

1. 为什么不能用正则前缀化标识符？
2. shorthand property 如何改写？
3. 动态文本为何需要 TEXT PatchFlag？

## 今日完成标准

- [ ] 能不看源码画出主调用链。
- [ ] 能解释至少三个关键分支及其设计权衡。
- [ ] 完成全部实验，并阅读对应测试中的边界案例。
- [ ] 写出一个最小复刻、伪代码或状态转换表。
- [ ] 将仍不确定的问题标注为“事实缺口”或“设计取舍”。

## 导航

上一天：[Day 61｜v-if 与 v-for 结构改写](./day-61-transform-if-for.md)  
下一天：[Day 63｜Element、Props 与指令 Transform](./day-63-transform-element-props.md)

