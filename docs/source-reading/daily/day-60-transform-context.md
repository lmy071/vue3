# Day 60：Transform 遍历、Context 与退出回调

> 阶段：编译器｜建议投入：约 3 小时｜目标：形成可以通过代码、测试和实验复验的理解。

## 今日目标

- DFS 进入阶段按顺序运行 nodeTransforms，exitFns 逆序执行
- TransformContext 收集 helpers/components/directives/hoists/imports/caches/scopes
- replaceNode/removeNode 改写当前父节点 children

## 源码入口

- [packages/compiler-core/src/transform.ts](../../../packages/compiler-core/src/transform.ts)
- [packages/compiler-core/src/ast.ts](../../../packages/compiler-core/src/ast.ts)

## 核心机制

1. DFS 进入阶段按顺序运行 nodeTransforms，exitFns 逆序执行
2. TransformContext 收集 helpers/components/directives/hoists/imports/caches/scopes
3. replaceNode/removeNode 改写当前父节点 children

不要从第一行机械读到最后一行。先确定入口输入和外部结果，再围绕上面的机制追踪分支；开发警告、compat 和复杂类型分支第一遍只做标记。

## 主调用链

```text
transform(root) → traverseNode enter transforms → traverse children → reverse exitFns → createRootCodegen → hoist/cache
```

阅读时给链路中的每个箭头补上：调用函数、关键参数、被修改的状态，以及它属于同步执行、批处理还是异步队列。

## 精读步骤

1. 打开 `packages/compiler-core/src/transform.ts`，定位公共入口、核心数据结构和主要分派点；记录它向下调用的 2～4 个函数。
2. 打开 `packages/compiler-core/src/ast.ts`，定位公共入口、核心数据结构和主要分派点；记录它向下调用的 2～4 个函数。
3. 全仓搜索今日核心函数的调用方，分别找出至少一个生产者和消费者。
4. 对照测试，用边界用例修正自己的初始推断。

## 动手实验

1. 写一个记录 enter/exit 顺序的 transform
2. 写一个替换 Text 节点的 transform
3. 观察 helper 引用计数新增与移除

实验必须记录“输入、预期、实际结果、源码解释”，只记录最终输出不算完成。

## 测试与反证

- [packages/compiler-core/__tests__/transform.spec.ts](../../../packages/compiler-core/__tests__/transform.spec.ts)

```bash
pnpm vitest packages/compiler-core/__tests__/transform.spec.ts
```

若当前仓库基线阻止测试启动，记录首个环境/语法错误和阻断链，不要把它误判成今日主题的行为错误。

## 闭卷验收

1. 为什么 element transform 常在 exit 阶段完成？
2. helper 用 Symbol 和引用计数解决什么？
3. 结构指令如何安全替换当前节点？

## 今日完成标准

- [ ] 能不看源码画出主调用链。
- [ ] 能解释至少三个关键分支及其设计权衡。
- [ ] 完成全部实验，并阅读对应测试中的边界案例。
- [ ] 写出一个最小复刻、伪代码或状态转换表。
- [ ] 将仍不确定的问题标注为“事实缺口”或“设计取舍”。

## 导航

上一天：[Day 59｜属性、指令、表达式与命名空间](./day-59-compiler-parser-directives.md)  
下一天：[Day 61｜v-if 与 v-for 结构改写](./day-61-transform-if-for.md)

