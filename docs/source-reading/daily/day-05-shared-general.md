# Day 05：general.ts 与 makeMap 基础工具

> 阶段：共享协议｜建议投入：约 3 小时｜目标：形成可以通过代码、测试和实验复验的理解。

## 今日目标

- 按哨兵、类型守卫、对象操作、命名转换、变化判断分类
- 理解 Object.is、hasOwnProperty.call 和 null-prototype 字典
- 理解 makeMap、字符串缓存与 PURE 注解的性能/体积权衡

## 源码入口

- [packages/shared/src/general.ts](../../../packages/shared/src/general.ts)
- [packages/shared/src/makeMap.ts](../../../packages/shared/src/makeMap.ts)
- [packages/shared/src/index.ts](../../../packages/shared/src/index.ts)

## 核心机制

1. 按哨兵、类型守卫、对象操作、命名转换、变化判断分类
2. 理解 Object.is、hasOwnProperty.call 和 null-prototype 字典
3. 理解 makeMap、字符串缓存与 PURE 注解的性能/体积权衡

不要从第一行机械读到最后一行。先确定入口输入和外部结果，再围绕上面的机制追踪分支；开发警告、compat 和复杂类型分支第一遍只做标记。

## 主调用链

```text
固定逗号集合 → makeMap 初始化 → predicate 常数时间查询 → 未使用时 tree-shake
```

阅读时给链路中的每个箭头补上：调用函数、关键参数、被修改的状态，以及它属于同步执行、批处理还是异步队列。

## 精读步骤

1. 打开 `packages/shared/src/general.ts`，定位公共入口、核心数据结构和主要分派点；记录它向下调用的 2～4 个函数。
2. 打开 `packages/shared/src/makeMap.ts`，定位公共入口、核心数据结构和主要分派点；记录它向下调用的 2～4 个函数。
3. 打开 `packages/shared/src/index.ts`，定位公共入口、核心数据结构和主要分派点；记录它向下调用的 2～4 个函数。
4. 全仓搜索今日核心函数的调用方，分别找出至少一个生产者和消费者。
5. 对照测试，用边界用例修正自己的初始推断。

## 动手实验

1. 手写 makeMap 并支持空字符串 key
2. 验证 isOn、isIntegerKey、hasChanged 的边界
3. 全仓追踪 toHandlerKey 与 hasChanged 的消费者

实验必须记录“输入、预期、实际结果、源码解释”，只记录最终输出不算完成。

## 测试与反证

- [packages/shared/src/general.ts](../../../packages/shared/src/general.ts)
- [packages/shared/src/makeMap.ts](../../../packages/shared/src/makeMap.ts)

```bash
pnpm vitest packages/shared/src/general.ts
pnpm vitest packages/shared/src/makeMap.ts
```

若当前仓库基线阻止测试启动，记录首个环境/语法错误和阻断链，不要把它误判成今日主题的行为错误。

## 闭卷验收

1. hasChanged(NaN, NaN) 为什么为 false？
2. isOn 为什么不用简单 startsWith？
3. EMPTY_OBJ 为何只在 dev 冻结？

## 今日完成标准

- [ ] 能不看源码画出主调用链。
- [ ] 能解释至少三个关键分支及其设计权衡。
- [ ] 完成全部实验，并阅读对应测试中的边界案例。
- [ ] 写出一个最小复刻、伪代码或状态转换表。
- [ ] 将仍不确定的问题标注为“事实缺口”或“设计取舍”。

## 导航

上一天：[Day 04｜测试分层、类型检查与可执行基线](./day-04-tests-baseline.md)  
下一天：[Day 06｜输入规范化、展示与 HTML 安全](./day-06-shared-normalization-security.md)

