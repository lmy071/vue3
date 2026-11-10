# Day 69：defineProps/Emits/Model/Slots 与类型解析

> 阶段：SFC｜建议投入：约 3 小时｜目标：形成可以通过代码、测试和实验复验的理解。

## 今日目标

- 宏只在编译期识别，不能把 local setup 变量用于需提升的 options
- runtime 声明和 type 声明互斥，类型经有限 AST 解析生成 runtime props/emits
- defineModel 同时生成 prop、update event 与 useModel 调用

## 源码入口

- [packages/compiler-sfc/src/script/defineProps.ts](../../../packages/compiler-sfc/src/script/defineProps.ts)
- [packages/compiler-sfc/src/script/defineEmits.ts](../../../packages/compiler-sfc/src/script/defineEmits.ts)
- [packages/compiler-sfc/src/script/defineModel.ts](../../../packages/compiler-sfc/src/script/defineModel.ts)
- [packages/compiler-sfc/src/script/defineSlots.ts](../../../packages/compiler-sfc/src/script/defineSlots.ts)
- [packages/compiler-sfc/src/script/resolveType.ts](../../../packages/compiler-sfc/src/script/resolveType.ts)

## 核心机制

1. 宏只在编译期识别，不能把 local setup 变量用于需提升的 options
2. runtime 声明和 type 声明互斥，类型经有限 AST 解析生成 runtime props/emits
3. defineModel 同时生成 prop、update event 与 useModel 调用

不要从第一行机械读到最后一行。先确定入口输入和外部结果，再围绕上面的机制追踪分支；开发警告、compat 和复杂类型分支第一遍只做标记。

## 主调用链

```text
macro CallExpression → processDefine* → record declarations/type → genRuntimeProps/Emits → replace/remove source → setup code
```

阅读时给链路中的每个箭头补上：调用函数、关键参数、被修改的状态，以及它属于同步执行、批处理还是异步队列。

## 精读步骤

1. 打开 `packages/compiler-sfc/src/script/defineProps.ts`，定位公共入口、核心数据结构和主要分派点；记录它向下调用的 2～4 个函数。
2. 打开 `packages/compiler-sfc/src/script/defineEmits.ts`，定位公共入口、核心数据结构和主要分派点；记录它向下调用的 2～4 个函数。
3. 打开 `packages/compiler-sfc/src/script/defineModel.ts`，定位公共入口、核心数据结构和主要分派点；记录它向下调用的 2～4 个函数。
4. 打开 `packages/compiler-sfc/src/script/defineSlots.ts`，定位公共入口、核心数据结构和主要分派点；记录它向下调用的 2～4 个函数。
5. 打开 `packages/compiler-sfc/src/script/resolveType.ts`，定位公共入口、核心数据结构和主要分派点；记录它向下调用的 2～4 个函数。
6. 全仓搜索今日核心函数的调用方，分别找出至少一个生产者和消费者。
7. 对照测试，用边界用例修正自己的初始推断。

## 动手实验

1. 分别编译 runtime 与 type props
2. 测试 withDefaults 与 reactive props destructure
3. 追踪 defineModel 生成的 prop、emit、helper

实验必须记录“输入、预期、实际结果、源码解释”，只记录最终输出不算完成。

## 测试与反证

- [packages/compiler-sfc/__tests__/compileScript/defineProps.spec.ts](../../../packages/compiler-sfc/__tests__/compileScript/defineProps.spec.ts)
- [packages/compiler-sfc/__tests__/compileScript/defineEmits.spec.ts](../../../packages/compiler-sfc/__tests__/compileScript/defineEmits.spec.ts)
- [packages/compiler-sfc/__tests__/compileScript/defineModel.spec.ts](../../../packages/compiler-sfc/__tests__/compileScript/defineModel.spec.ts)
- [packages/compiler-sfc/__tests__/compileScript/resolveType.spec.ts](../../../packages/compiler-sfc/__tests__/compileScript/resolveType.spec.ts)

```bash
pnpm vitest packages/compiler-sfc/__tests__/compileScript/defineProps.spec.ts
pnpm vitest packages/compiler-sfc/__tests__/compileScript/defineEmits.spec.ts
pnpm vitest packages/compiler-sfc/__tests__/compileScript/defineModel.spec.ts
pnpm vitest packages/compiler-sfc/__tests__/compileScript/resolveType.spec.ts
```

若当前仓库基线阻止测试启动，记录首个环境/语法错误和阻断链，不要把它误判成今日主题的行为错误。

## 闭卷验收

1. 为什么宏不是真实运行时函数？
2. 类型解析为何不等同 TypeScript checker？
3. defineProps destructure 默认值如何保留响应性？

## 今日完成标准

- [ ] 能不看源码画出主调用链。
- [ ] 能解释至少三个关键分支及其设计权衡。
- [ ] 完成全部实验，并阅读对应测试中的边界案例。
- [ ] 写出一个最小复刻、伪代码或状态转换表。
- [ ] 将仍不确定的问题标注为“事实缺口”或“设计取舍”。

## 导航

上一天：[Day 68｜compileScript 上下文与 Binding Metadata](./day-68-sfc-compile-script.md)  
下一天：[Day 70｜Top-level Await、Scoped CSS、资源 URL 与 CSS Vars](./day-70-sfc-advanced.md)

