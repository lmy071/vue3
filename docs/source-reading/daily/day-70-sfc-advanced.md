# Day 70：Top-level Await、Scoped CSS、资源 URL 与 CSS Vars

> 阶段：SFC｜建议投入：约 3 小时｜目标：形成可以通过代码、测试和实验复验的理解。

## 今日目标

- top-level await 被改写为 withAsyncContext 以保存/恢复组件实例
- scoped CSS 重写 selector、keyframes 与 animation 名称
- CSS v-bind 生成变量名并在 script 注入 useCssVars，资源 URL transform 改写静态资源 import

## 源码入口

- [packages/compiler-sfc/src/script/topLevelAwait.ts](../../../packages/compiler-sfc/src/script/topLevelAwait.ts)
- [packages/compiler-sfc/src/style/pluginScoped.ts](../../../packages/compiler-sfc/src/style/pluginScoped.ts)
- [packages/compiler-sfc/src/style/cssVars.ts](../../../packages/compiler-sfc/src/style/cssVars.ts)
- [packages/compiler-sfc/src/template/transformAssetUrl.ts](../../../packages/compiler-sfc/src/template/transformAssetUrl.ts)

## 核心机制

1. top-level await 被改写为 withAsyncContext 以保存/恢复组件实例
2. scoped CSS 重写 selector、keyframes 与 animation 名称
3. CSS v-bind 生成变量名并在 script 注入 useCssVars，资源 URL transform 改写静态资源 import

不要从第一行机械读到最后一行。先确定入口输入和外部结果，再围绕上面的机制追踪分支；开发警告、compat 和复杂类型分支第一遍只做标记。

## 主调用链

```text
SFC advanced syntax → AST/PostCSS transforms → helper imports + rewritten code/style → bundler/runtime
```

阅读时给链路中的每个箭头补上：调用函数、关键参数、被修改的状态，以及它属于同步执行、批处理还是异步队列。

## 精读步骤

1. 打开 `packages/compiler-sfc/src/script/topLevelAwait.ts`，定位公共入口、核心数据结构和主要分派点；记录它向下调用的 2～4 个函数。
2. 打开 `packages/compiler-sfc/src/style/pluginScoped.ts`，定位公共入口、核心数据结构和主要分派点；记录它向下调用的 2～4 个函数。
3. 打开 `packages/compiler-sfc/src/style/cssVars.ts`，定位公共入口、核心数据结构和主要分派点；记录它向下调用的 2～4 个函数。
4. 打开 `packages/compiler-sfc/src/template/transformAssetUrl.ts`，定位公共入口、核心数据结构和主要分派点；记录它向下调用的 2～4 个函数。
5. 全仓搜索今日核心函数的调用方，分别找出至少一个生产者和消费者。
6. 对照测试，用边界用例修正自己的初始推断。

## 动手实验

1. 编译含两个 await 的 script setup
2. 比较 :deep/:slotted/:global selector 输出
3. 追踪 style v-bind(foo) 从 CSS 到 useCssVars

实验必须记录“输入、预期、实际结果、源码解释”，只记录最终输出不算完成。

## 测试与反证

- [packages/compiler-sfc/__tests__/compileScript.spec.ts](../../../packages/compiler-sfc/__tests__/compileScript.spec.ts)
- [packages/compiler-sfc/__tests__/cssVars.spec.ts](../../../packages/compiler-sfc/__tests__/cssVars.spec.ts)
- [packages/compiler-sfc/__tests__/templateTransformAssetUrl.spec.ts](../../../packages/compiler-sfc/__tests__/templateTransformAssetUrl.spec.ts)

```bash
pnpm vitest packages/compiler-sfc/__tests__/compileScript.spec.ts
pnpm vitest packages/compiler-sfc/__tests__/cssVars.spec.ts
pnpm vitest packages/compiler-sfc/__tests__/templateTransformAssetUrl.spec.ts
```

若当前仓库基线阻止测试启动，记录首个环境/语法错误和阻断链，不要把它误判成今日主题的行为错误。

## 闭卷验收

1. await 前后为什么要恢复 currentInstance？
2. scoped CSS 如何与 scopeId 属性配合？
3. asset URL transform 与 bundler 的职责边界是什么？

## 今日完成标准

- [ ] 能不看源码画出主调用链。
- [ ] 能解释至少三个关键分支及其设计权衡。
- [ ] 完成全部实验，并阅读对应测试中的边界案例。
- [ ] 写出一个最小复刻、伪代码或状态转换表。
- [ ] 将仍不确定的问题标注为“事实缺口”或“设计取舍”。

## 导航

上一天：[Day 69｜defineProps/Emits/Model/Slots 与类型解析](./day-69-sfc-macros-types.md)  
下一天：[Day 71｜SSR 编译器与专用 Helpers](./day-71-compiler-ssr.md)

