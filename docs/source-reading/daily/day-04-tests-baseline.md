# Day 04：测试分层、类型检查与可执行基线

> 阶段：工程基线｜建议投入：约 3 小时｜目标：形成可以通过代码、测试和实验复验的理解。

## 今日目标

- 理解 unit、unit-jsdom、unit-gc、e2e 的隔离目的
- 建立 commit、Node、pnpm、依赖和失败项记录
- 只做语义无关的最小语法修复并用测试反证

## 源码入口

- [vitest.config.ts](../../../vitest.config.ts)
- [scripts/setup-vitest.ts](../../../scripts/setup-vitest.ts)
- [packages-private/dts-test/README.md](../../../packages-private/dts-test/README.md)

## 核心机制

1. 理解 unit、unit-jsdom、unit-gc、e2e 的隔离目的
2. 建立 commit、Node、pnpm、依赖和失败项记录
3. 只做语义无关的最小语法修复并用测试反证

不要从第一行机械读到最后一行。先确定入口输入和外部结果，再围绕上面的机制追踪分支；开发警告、compat 和复杂类型分支第一遍只做标记。

## 主调用链

```text
测试文件 → Vitest project 选择 → alias/define/setup → Node/jsdom/gc 环境
```

阅读时给链路中的每个箭头补上：调用函数、关键参数、被修改的状态，以及它属于同步执行、批处理还是异步队列。

## 精读步骤

1. 打开 `vitest.config.ts`，定位公共入口、核心数据结构和主要分派点；记录它向下调用的 2～4 个函数。
2. 打开 `scripts/setup-vitest.ts`，定位公共入口、核心数据结构和主要分派点；记录它向下调用的 2～4 个函数。
3. 打开 `packages-private/dts-test/README.md`，定位公共入口、核心数据结构和主要分派点；记录它向下调用的 2～4 个函数。
4. 全仓搜索今日核心函数的调用方，分别找出至少一个生产者和消费者。
5. 对照测试，用边界用例修正自己的初始推断。

## 动手实验

1. 分别定位纯 reactivity 与 runtime-dom 测试所属 project
2. 运行 tsc 收集首个语法错误而非被级联错误淹没
3. 建立 baseline.md：版本、命令、结果、已知失败

实验必须记录“输入、预期、实际结果、源码解释”，只记录最终输出不算完成。

## 测试与反证

- [vitest.config.ts](../../../vitest.config.ts)
- [packages/shared/__tests__/normalizeProp.spec.ts](../../../packages/shared/__tests__/normalizeProp.spec.ts)

```bash
pnpm vitest vitest.config.ts
pnpm vitest packages/shared/__tests__/normalizeProp.spec.ts
```

若当前仓库基线阻止测试启动，记录首个环境/语法错误和阻断链，不要把它误判成今日主题的行为错误。

## 闭卷验收

1. 为什么 DOM 测试不应放进纯 Node project？
2. 如何证明注释修复没有改变语义？
3. 类型测试与运行时单测覆盖的风险有何不同？

## 今日完成标准

- [ ] 能不看源码画出主调用链。
- [ ] 能解释至少三个关键分支及其设计权衡。
- [ ] 完成全部实验，并阅读对应测试中的边界案例。
- [ ] 写出一个最小复刻、伪代码或状态转换表。
- [ ] 将仍不确定的问题标注为“事实缺口”或“设计取舍”。

## 导航

上一天：[Day 03｜开发构建、正式构建与产物格式](./day-03-build-system.md)  
下一天：[Day 05｜general.ts 与 makeMap 基础工具](./day-05-shared-general.md)

