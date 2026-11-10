# Day 01：仓库全景与包依赖

> 阶段：工程基线｜建议投入：约 3 小时｜目标：形成可以通过代码、测试和实验复验的理解。

## 今日目标

- 区分 packages、packages-private、scripts 与根配置的职责
- 从各包 dependencies 还原 shared → reactivity → runtime-core → runtime-dom → vue 主依赖方向
- 理解 compiler、runtime、SSR 为何既解耦又在 vue 入口聚合

## 源码入口

- [package.json](../../../package.json)
- [pnpm-workspace.yaml](../../../pnpm-workspace.yaml)
- [README.md](../../../README.md)

## 核心机制

1. 区分 packages、packages-private、scripts 与根配置的职责
2. 从各包 dependencies 还原 shared → reactivity → runtime-core → runtime-dom → vue 主依赖方向
3. 理解 compiler、runtime、SSR 为何既解耦又在 vue 入口聚合

不要从第一行机械读到最后一行。先确定入口输入和外部结果，再围绕上面的机制追踪分支；开发警告、compat 和复杂类型分支第一遍只做标记。

## 主调用链

```text
公开 npm 包 → workspace 包配置 → 源码入口 → 构建产物
```

阅读时给链路中的每个箭头补上：调用函数、关键参数、被修改的状态，以及它属于同步执行、批处理还是异步队列。

## 精读步骤

1. 打开 `package.json`，定位公共入口、核心数据结构和主要分派点；记录它向下调用的 2～4 个函数。
2. 打开 `pnpm-workspace.yaml`，定位公共入口、核心数据结构和主要分派点；记录它向下调用的 2～4 个函数。
3. 打开 `README.md`，定位公共入口、核心数据结构和主要分派点；记录它向下调用的 2～4 个函数。
4. 全仓搜索今日核心函数的调用方，分别找出至少一个生产者和消费者。
5. 对照测试，用边界用例修正自己的初始推断。

## 动手实验

1. 列出所有 workspace 包及其 src/test 文件数
2. 画出运行时链、编译器链、SSR 链三张依赖图
3. 解释 server-renderer 与 vue 的循环依赖边界

实验必须记录“输入、预期、实际结果、源码解释”，只记录最终输出不算完成。

## 测试与反证

- [package.json](../../../package.json)
- [packages/vue/package.json](../../../packages/vue/package.json)

```bash
pnpm vitest package.json
pnpm vitest packages/vue/package.json
```

若当前仓库基线阻止测试启动，记录首个环境/语法错误和阻断链，不要把它误判成今日主题的行为错误。

## 闭卷验收

1. 为什么 runtime-core 不依赖 runtime-dom？
2. packages-private 为什么不进入发布主链？
3. shared 位于依赖图底部意味着什么约束？

## 今日完成标准

- [ ] 能不看源码画出主调用链。
- [ ] 能解释至少三个关键分支及其设计权衡。
- [ ] 完成全部实验，并阅读对应测试中的边界案例。
- [ ] 写出一个最小复刻、伪代码或状态转换表。
- [ ] 将仍不确定的问题标注为“事实缺口”或“设计取舍”。

## 导航

上一天：无，先完成环境准备。  
下一天：[Day 02｜源码别名与 TypeScript 配置](./day-02-aliases-typescript.md)

