# Day 19：watch source、traverse 与 cleanup

> 阶段：响应式系统｜建议投入：约 3 小时｜目标：形成可以通过代码、测试和实验复验的理解。

## 今日目标

- ref/reactive/getter/多 source 统一成 getter
- deep watch 通过 traverse 主动读取建立依赖
- callback old/new 比较、cleanup、once、pause/resume 由核心 watch 管理

## 源码入口

- [packages/reactivity/src/watch.ts](../../../packages/reactivity/src/watch.ts)
- [packages/reactivity/src/effect.ts](../../../packages/reactivity/src/effect.ts)

## 核心机制

1. ref/reactive/getter/多 source 统一成 getter
2. deep watch 通过 traverse 主动读取建立依赖
3. callback old/new 比较、cleanup、once、pause/resume 由核心 watch 管理

不要从第一行机械读到最后一行。先确定入口输入和外部结果，再围绕上面的机制追踪分支；开发警告、compat 和复杂类型分支第一遍只做标记。

## 主调用链

```text
watch(source,cb) → normalize getter → ReactiveEffect → scheduler(job) → run getter → compare → cleanup → cb
```

阅读时给链路中的每个箭头补上：调用函数、关键参数、被修改的状态，以及它属于同步执行、批处理还是异步队列。

## 精读步骤

1. 打开 `packages/reactivity/src/watch.ts`，定位公共入口、核心数据结构和主要分派点；记录它向下调用的 2～4 个函数。
2. 打开 `packages/reactivity/src/effect.ts`，定位公共入口、核心数据结构和主要分派点；记录它向下调用的 2～4 个函数。
3. 全仓搜索今日核心函数的调用方，分别找出至少一个生产者和消费者。
4. 对照测试，用边界用例修正自己的初始推断。

## 动手实验

1. 验证单 source 与多 source old/new
2. 构造循环引用对象测试 traverse seen
3. 记录 cleanup 在重跑和 stop 前的时机

实验必须记录“输入、预期、实际结果、源码解释”，只记录最终输出不算完成。

## 测试与反证

- [packages/reactivity/__tests__/watch.spec.ts](../../../packages/reactivity/__tests__/watch.spec.ts)

```bash
pnpm vitest packages/reactivity/__tests__/watch.spec.ts
```

若当前仓库基线阻止测试启动，记录首个环境/语法错误和阻断链，不要把它误判成今日主题的行为错误。

## 闭卷验收

1. deep watch 为什么不能只订阅根对象？
2. watchEffect 与 watch callback 的首次执行有何差异？
3. pause 期间触发如何在 resume 后处理？

## 今日完成标准

- [ ] 能不看源码画出主调用链。
- [ ] 能解释至少三个关键分支及其设计权衡。
- [ ] 完成全部实验，并阅读对应测试中的边界案例。
- [ ] 写出一个最小复刻、伪代码或状态转换表。
- [ ] 将仍不确定的问题标注为“事实缺口”或“设计取舍”。

## 导航

上一天：[Day 18｜computed 的双重身份与版本快路径](./day-18-computed-system.md)  
下一天：[Day 20｜响应式全链路复刻与验收](./day-20-reactivity-synthesis.md)

