# Day 03：开发构建、正式构建与产物格式

> 阶段：工程基线｜建议投入：约 3 小时｜目标：形成可以通过代码、测试和实验复验的理解。

## 今日目标

- 区分 dev watch 与多 target 正式构建
- 理解 esm-bundler、esm-browser、cjs、global 和 runtime-only
- 从 package buildOptions 追到 Rollup input/output

## 源码入口

- [scripts/dev.js](../../../scripts/dev.js)
- [scripts/build.js](../../../scripts/build.js)
- [rollup.config.js](../../../rollup.config.js)

## 核心机制

1. 区分 dev watch 与多 target 正式构建
2. 理解 esm-bundler、esm-browser、cjs、global 和 runtime-only
3. 从 package buildOptions 追到 Rollup input/output

不要从第一行机械读到最后一行。先确定入口输入和外部结果，再围绕上面的机制追踪分支；开发警告、compat 和复杂类型分支第一遍只做标记。

## 主调用链

```text
CLI 参数 → target/format 解析 → Rollup config → replace/alias/plugins → dist 文件
```

阅读时给链路中的每个箭头补上：调用函数、关键参数、被修改的状态，以及它属于同步执行、批处理还是异步队列。

## 精读步骤

1. 打开 `scripts/dev.js`，定位公共入口、核心数据结构和主要分派点；记录它向下调用的 2～4 个函数。
2. 打开 `scripts/build.js`，定位公共入口、核心数据结构和主要分派点；记录它向下调用的 2～4 个函数。
3. 打开 `rollup.config.js`，定位公共入口、核心数据结构和主要分派点；记录它向下调用的 2～4 个函数。
4. 全仓搜索今日核心函数的调用方，分别找出至少一个生产者和消费者。
5. 对照测试，用边界用例修正自己的初始推断。

## 动手实验

1. 构建 reactivity 的两种 format 并比较 wrapper
2. 追踪 vue full build 与 runtime-only 的不同入口
3. 为一个 target 记录完整 Rollup 插件链

实验必须记录“输入、预期、实际结果、源码解释”，只记录最终输出不算完成。

## 测试与反证

- [scripts/dev.js](../../../scripts/dev.js)
- [scripts/build.js](../../../scripts/build.js)

```bash
pnpm vitest scripts/dev.js
pnpm vitest scripts/build.js
```

若当前仓库基线阻止测试启动，记录首个环境/语法错误和阻断链，不要把它误判成今日主题的行为错误。

## 闭卷验收

1. esm-bundler 为什么适合 Vite？
2. runtime-only 省掉了什么？
3. PURE 注解如何配合 tree-shaking？

## 今日完成标准

- [ ] 能不看源码画出主调用链。
- [ ] 能解释至少三个关键分支及其设计权衡。
- [ ] 完成全部实验，并阅读对应测试中的边界案例。
- [ ] 写出一个最小复刻、伪代码或状态转换表。
- [ ] 将仍不确定的问题标注为“事实缺口”或“设计取舍”。

## 导航

上一天：[Day 02｜源码别名与 TypeScript 配置](./day-02-aliases-typescript.md)  
下一天：[Day 04｜测试分层、类型检查与可执行基线](./day-04-tests-baseline.md)
