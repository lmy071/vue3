# Day 14：ReactiveEffect.run 与增量清理

> 阶段：响应式系统｜建议投入：约 3 小时｜目标：形成可以通过代码、测试和实验复验的理解。

## 今日目标

- run 前 prepareDeps 把旧 link 标成未使用
- 执行时 activeSub/shouldTrack 必须支持嵌套恢复
- cleanupDeps 删除本轮未再次访问的依赖边

## 源码入口

- [packages/reactivity/src/effect.ts](../../../packages/reactivity/src/effect.ts)
- [packages/reactivity/src/dep.ts](../../../packages/reactivity/src/dep.ts)

## 核心机制

1. run 前 prepareDeps 把旧 link 标成未使用
2. 执行时 activeSub/shouldTrack 必须支持嵌套恢复
3. cleanupDeps 删除本轮未再次访问的依赖边

不要从第一行机械读到最后一行。先确定入口输入和外部结果，再围绕上面的机制追踪分支；开发警告、compat 和复杂类型分支第一遍只做标记。

## 主调用链

```text
run → cleanupEffect → prepareDeps → set activeSub → fn → cleanupDeps → restore context
```

阅读时给链路中的每个箭头补上：调用函数、关键参数、被修改的状态，以及它属于同步执行、批处理还是异步队列。

## 精读步骤

1. 打开 `packages/reactivity/src/effect.ts`，定位公共入口、核心数据结构和主要分派点；记录它向下调用的 2～4 个函数。
2. 打开 `packages/reactivity/src/dep.ts`，定位公共入口、核心数据结构和主要分派点；记录它向下调用的 2～4 个函数。
3. 全仓搜索今日核心函数的调用方，分别找出至少一个生产者和消费者。
4. 对照测试，用边界用例修正自己的初始推断。

## 动手实验

1. 跟踪 ok?a:b 条件依赖切换
2. 构造嵌套 effect 验证 activeSub 恢复
3. 记录 stop 后手动 runner 的行为

实验必须记录“输入、预期、实际结果、源码解释”，只记录最终输出不算完成。

## 测试与反证

- [packages/reactivity/__tests__/effect.spec.ts](../../../packages/reactivity/__tests__/effect.spec.ts)

```bash
pnpm vitest packages/reactivity/__tests__/effect.spec.ts
```

若当前仓库基线阻止测试启动，记录首个环境/语法错误和阻断链，不要把它误判成今日主题的行为错误。

## 闭卷验收

1. version=-1 表示什么？
2. 为什么 finally 中必须恢复上下文？
3. stop 与暂停的语义有何不同？

## 今日完成标准

- [ ] 能不看源码画出主调用链。
- [ ] 能解释至少三个关键分支及其设计权衡。
- [ ] 完成全部实验，并阅读对应测试中的边界案例。
- [ ] 写出一个最小复刻、伪代码或状态转换表。
- [ ] 将仍不确定的问题标注为“事实缺口”或“设计取舍”。

## 导航

上一天：[Day 13｜Dep、Link 与依赖图](./day-13-dep-link-model.md)  
下一天：[Day 15｜trigger、notify 与响应式批处理](./day-15-effect-notify-batch.md)

