# Day 49：v-model、v-show 与事件修饰符

> 阶段：DOM 平台｜建议投入：约 3 小时｜目标：形成可以通过代码、测试和实验复验的理解。

## 今日目标

- v-model 按 text/checkbox/radio/select/dynamic 分派，处理 composition 与 modifiers
- v-show 保存原 display 并与 transition 协作
- withModifiers/withKeys 返回带缓存的守卫函数

## 源码入口

- [packages/runtime-dom/src/directives/vModel.ts](../../../packages/runtime-dom/src/directives/vModel.ts)
- [packages/runtime-dom/src/directives/vShow.ts](../../../packages/runtime-dom/src/directives/vShow.ts)
- [packages/runtime-dom/src/directives/vOn.ts](../../../packages/runtime-dom/src/directives/vOn.ts)

## 核心机制

1. v-model 按 text/checkbox/radio/select/dynamic 分派，处理 composition 与 modifiers
2. v-show 保存原 display 并与 transition 协作
3. withModifiers/withKeys 返回带缓存的守卫函数

不要从第一行机械读到最后一行。先确定入口输入和外部结果，再围绕上面的机制追踪分支；开发警告、compat 和复杂类型分支第一遍只做标记。

## 主调用链

```text
compiler directive helper → runtime directive hooks → DOM listeners/properties → assigner 更新模型
```

阅读时给链路中的每个箭头补上：调用函数、关键参数、被修改的状态，以及它属于同步执行、批处理还是异步队列。

## 精读步骤

1. 打开 `packages/runtime-dom/src/directives/vModel.ts`，定位公共入口、核心数据结构和主要分派点；记录它向下调用的 2～4 个函数。
2. 打开 `packages/runtime-dom/src/directives/vShow.ts`，定位公共入口、核心数据结构和主要分派点；记录它向下调用的 2～4 个函数。
3. 打开 `packages/runtime-dom/src/directives/vOn.ts`，定位公共入口、核心数据结构和主要分派点；记录它向下调用的 2～4 个函数。
4. 全仓搜索今日核心函数的调用方，分别找出至少一个生产者和消费者。
5. 对照测试，用边界用例修正自己的初始推断。

## 动手实验

1. 验证中文输入 composition 期间不更新
2. 测试 checkbox 数组与 Set 模型
3. 组合 stop/prevent/self 和 key modifiers

实验必须记录“输入、预期、实际结果、源码解释”，只记录最终输出不算完成。

## 测试与反证

- [packages/runtime-dom/__tests__/directives/vModel.spec.ts](../../../packages/runtime-dom/__tests__/directives/vModel.spec.ts)
- [packages/runtime-dom/__tests__/directives/vShow.spec.ts](../../../packages/runtime-dom/__tests__/directives/vShow.spec.ts)
- [packages/runtime-dom/__tests__/directives/vOn.spec.ts](../../../packages/runtime-dom/__tests__/directives/vOn.spec.ts)

```bash
pnpm vitest packages/runtime-dom/__tests__/directives/vModel.spec.ts
pnpm vitest packages/runtime-dom/__tests__/directives/vShow.spec.ts
pnpm vitest packages/runtime-dom/__tests__/directives/vOn.spec.ts
```

若当前仓库基线阻止测试启动，记录首个环境/语法错误和阻断链，不要把它误判成今日主题的行为错误。

## 闭卷验收

1. v-model 为什么是多套 directive？
2. v-show 与 v-if 的生命周期差异是什么？
3. modifier 顺序为什么可能影响结果？

## 今日完成标准

- [ ] 能不看源码画出主调用链。
- [ ] 能解释至少三个关键分支及其设计权衡。
- [ ] 完成全部实验，并阅读对应测试中的边界案例。
- [ ] 写出一个最小复刻、伪代码或状态转换表。
- [ ] 将仍不确定的问题标注为“事实缺口”或“设计取舍”。

## 导航

上一天：[Day 48｜Class、Style 与事件 Invoker](./day-48-dom-class-style-events.md)  
下一天：[Day 50｜BaseTransition 状态机](./day-50-base-transition.md)

