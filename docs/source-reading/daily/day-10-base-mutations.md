# Day 10：setter、delete、has 与 ownKeys

> 阶段：响应式系统｜建议投入：约 3 小时｜目标：形成可以通过代码、测试和实验复验的理解。

## 今日目标

- 区分 ADD 与 SET，理解数组索引和 length
- 理解 receiver/raw 检查避免原型链重复触发
- has 与 ownKeys 分别建立 key 查询和迭代依赖

## 源码入口

- [packages/reactivity/src/baseHandlers.ts](../../../packages/reactivity/src/baseHandlers.ts)
- [packages/reactivity/src/dep.ts](../../../packages/reactivity/src/dep.ts)

## 核心机制

1. 区分 ADD 与 SET，理解数组索引和 length
2. 理解 receiver/raw 检查避免原型链重复触发
3. has 与 ownKeys 分别建立 key 查询和迭代依赖

不要从第一行机械读到最后一行。先确定入口输入和外部结果，再围绕上面的机制追踪分支；开发警告、compat 和复杂类型分支第一遍只做标记。

## 主调用链

```text
set/delete/has/ownKeys trap → 操作类型判断 → Reflect → trigger/track
```

阅读时给链路中的每个箭头补上：调用函数、关键参数、被修改的状态，以及它属于同步执行、批处理还是异步队列。

## 精读步骤

1. 打开 `packages/reactivity/src/baseHandlers.ts`，定位公共入口、核心数据结构和主要分派点；记录它向下调用的 2～4 个函数。
2. 打开 `packages/reactivity/src/dep.ts`，定位公共入口、核心数据结构和主要分派点；记录它向下调用的 2～4 个函数。
3. 全仓搜索今日核心函数的调用方，分别找出至少一个生产者和消费者。
4. 对照测试，用边界用例修正自己的初始推断。

## 动手实验

1. 用原型链对象验证 receiver 检查
2. 记录 Object.keys、in、delete 的依赖类型
3. 验证值未变化与 NaN 写入不触发

实验必须记录“输入、预期、实际结果、源码解释”，只记录最终输出不算完成。

## 测试与反证

- [packages/reactivity/__tests__/effect.spec.ts](../../../packages/reactivity/__tests__/effect.spec.ts)
- [packages/reactivity/__tests__/reactiveArray.spec.ts](../../../packages/reactivity/__tests__/reactiveArray.spec.ts)

```bash
pnpm vitest packages/reactivity/__tests__/effect.spec.ts
pnpm vitest packages/reactivity/__tests__/reactiveArray.spec.ts
```

若当前仓库基线阻止测试启动，记录首个环境/语法错误和阻断链，不要把它误判成今日主题的行为错误。

## 闭卷验收

1. ADD 为何要触发迭代依赖？
2. 数组 ownKeys 为什么追踪 length？
3. Reflect.set 成功是否必然 trigger？

## 今日完成标准

- [ ] 能不看源码画出主调用链。
- [ ] 能解释至少三个关键分支及其设计权衡。
- [ ] 完成全部实验，并阅读对应测试中的边界案例。
- [ ] 写出一个最小复刻、伪代码或状态转换表。
- [ ] 将仍不确定的问题标注为“事实缺口”或“设计取舍”。

## 导航

上一天：[Day 09｜BaseReactiveHandler.get 读取路径](./day-09-base-getter.md)  
下一天：[Day 11｜数组方法的响应式适配](./day-11-array-instrumentations.md)

