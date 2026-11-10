# Day 74：Vue 聚合入口、运行时编译与发布形态

> 阶段：工程复盘｜建议投入：约 3 小时｜目标：形成可以通过代码、测试和实验复验的理解。

## 今日目标

- full build 的 compileToFunction 连接 compiler-dom 与 registerRuntimeCompiler
- 模板与 options 生成 cache key，code 通过 new Function 绑定 runtime helpers
- runtime-only、browser/global/bundler 产物由入口与构建常量共同决定

## 源码入口

- [packages/vue/src/index.ts](../../../packages/vue/src/index.ts)
- [packages/vue/src/runtime.ts](../../../packages/vue/src/runtime.ts)
- [packages/runtime-core/src/component.ts](../../../packages/runtime-core/src/component.ts)
- [rollup.config.js](../../../rollup.config.js)

## 核心机制

1. full build 的 compileToFunction 连接 compiler-dom 与 registerRuntimeCompiler
2. 模板与 options 生成 cache key，code 通过 new Function 绑定 runtime helpers
3. runtime-only、browser/global/bundler 产物由入口与构建常量共同决定

不要从第一行机械读到最后一行。先确定入口输入和外部结果，再围绕上面的机制追踪分支；开发警告、compat 和复杂类型分支第一遍只做标记。

## 主调用链

```text
component template → finishComponentSetup → registered compileToFunction → compiler-dom code → new Function(Vue) → render
```

阅读时给链路中的每个箭头补上：调用函数、关键参数、被修改的状态，以及它属于同步执行、批处理还是异步队列。

## 精读步骤

1. 打开 `packages/vue/src/index.ts`，定位公共入口、核心数据结构和主要分派点；记录它向下调用的 2～4 个函数。
2. 打开 `packages/vue/src/runtime.ts`，定位公共入口、核心数据结构和主要分派点；记录它向下调用的 2～4 个函数。
3. 打开 `packages/runtime-core/src/component.ts`，定位公共入口、核心数据结构和主要分派点；记录它向下调用的 2～4 个函数。
4. 打开 `rollup.config.js`，定位公共入口、核心数据结构和主要分派点；记录它向下调用的 2～4 个函数。
5. 全仓搜索今日核心函数的调用方，分别找出至少一个生产者和消费者。
6. 对照测试，用边界用例修正自己的初始推断。

## 动手实验

1. 从 template option 跟到 render 函数
2. 比较 full 与 runtime-only 对 template 的行为
3. 查看同一 API 在不同 dist 格式的导出

实验必须记录“输入、预期、实际结果、源码解释”，只记录最终输出不算完成。

## 测试与反证

- [packages/vue/__tests__/runtimeCompilerOptions.spec.ts](../../../packages/vue/__tests__/runtimeCompilerOptions.spec.ts)
- [packages/vue/__tests__/e2e/Transition.spec.ts](../../../packages/vue/__tests__/e2e/Transition.spec.ts)

```bash
pnpm vitest packages/vue/__tests__/runtimeCompilerOptions.spec.ts
pnpm vitest packages/vue/__tests__/e2e/Transition.spec.ts
```

若当前仓库基线阻止测试启动，记录首个环境/语法错误和阻断链，不要把它误判成今日主题的行为错误。

## 闭卷验收

1. 为什么 runtime compiler 需显式 register？
2. compile cache key 包含 options 的原因是什么？
3. new Function 的安全边界是什么？

## 今日完成标准

- [ ] 能不看源码画出主调用链。
- [ ] 能解释至少三个关键分支及其设计权衡。
- [ ] 完成全部实验，并阅读对应测试中的边界案例。
- [ ] 写出一个最小复刻、伪代码或状态转换表。
- [ ] 将仍不确定的问题标注为“事实缺口”或“设计取舍”。

## 导航

上一天：[Day 73｜Hydration、Mismatch 分类与恢复](./day-73-hydration-deep-dive.md)  
下一天：[Day 75｜HMR、Devtools、Compat 与全内核验收](./day-75-final-synthesis.md)
