# Day 02：源码别名与 TypeScript 配置

> 阶段：工程基线｜建议投入：约 3 小时｜目标：形成可以通过代码、测试和实验复验的理解。

## 今日目标

- 理解测试和开发构建如何把 @vue/* 指向 packages/*/src
- 区分编辑器类型检查、构建声明文件和测试解析路径
- 识别全局编译常量声明及 DOM/Node lib 边界

## 源码入口

- [scripts/aliases.js](../../../scripts/aliases.js)
- [tsconfig.json](../../../tsconfig.json)
- [tsconfig.build.json](../../../tsconfig.build.json)

## 核心机制

1. 理解测试和开发构建如何把 @vue/* 指向 packages/*/src
2. 区分编辑器类型检查、构建声明文件和测试解析路径
3. 识别全局编译常量声明及 DOM/Node lib 边界

不要从第一行机械读到最后一行。先确定入口输入和外部结果，再围绕上面的机制追踪分支；开发警告、compat 和复杂类型分支第一遍只做标记。

## 主调用链

```text
import @vue/reactivity → alias entries → packages/reactivity/src/index.ts
```

阅读时给链路中的每个箭头补上：调用函数、关键参数、被修改的状态，以及它属于同步执行、批处理还是异步队列。

## 精读步骤

1. 打开 `scripts/aliases.js`，定位公共入口、核心数据结构和主要分派点；记录它向下调用的 2～4 个函数。
2. 打开 `tsconfig.json`，定位公共入口、核心数据结构和主要分派点；记录它向下调用的 2～4 个函数。
3. 打开 `tsconfig.build.json`，定位公共入口、核心数据结构和主要分派点；记录它向下调用的 2～4 个函数。
4. 全仓搜索今日核心函数的调用方，分别找出至少一个生产者和消费者。
5. 对照测试，用边界用例修正自己的初始推断。

## 动手实验

1. 追踪一个 @vue/shared import 的实际解析文件
2. 比较 tsconfig.json 与 tsconfig.build.json 的 include/options
3. 记录源码中 __DEV__ 等标识为何不会报未定义

实验必须记录“输入、预期、实际结果、源码解释”，只记录最终输出不算完成。

## 测试与反证

- [scripts/aliases.js](../../../scripts/aliases.js)
- [tsconfig.json](../../../tsconfig.json)

```bash
pnpm vitest scripts/aliases.js
pnpm vitest tsconfig.json
```

若当前仓库基线阻止测试启动，记录首个环境/语法错误和阻断链，不要把它误判成今日主题的行为错误。

## 闭卷验收

1. alias 为什么对源码调试很关键？
2. 声明文件构建为何需要独立 tsconfig？
3. 路径别名和 package exports 各在哪个阶段生效？

## 今日完成标准

- [ ] 能不看源码画出主调用链。
- [ ] 能解释至少三个关键分支及其设计权衡。
- [ ] 完成全部实验，并阅读对应测试中的边界案例。
- [ ] 写出一个最小复刻、伪代码或状态转换表。
- [ ] 将仍不确定的问题标注为“事实缺口”或“设计取舍”。

## 导航

上一天：[Day 01｜仓库全景与包依赖](./day-01-repository-map.md)  
下一天：[Day 03｜开发构建、正式构建与产物格式](./day-03-build-system.md)

