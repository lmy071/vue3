# Day 08：reactive 工厂与代理缓存

> 阶段：响应式系统｜建议投入：约 3 小时｜目标：形成可以通过代码、测试和实验复验的理解。

## 今日目标

- 理解 reactive/readonly/shallow 的四张 WeakMap 缓存
- 掌握 TargetType COMMON/COLLECTION/INVALID 分类
- 理解 toRaw、markRaw、isReactive/isReadonly 的递归身份语义

## 源码入口

- [packages/reactivity/src/reactive.ts](../../../packages/reactivity/src/reactive.ts)
- [packages/reactivity/src/constants.ts](../../../packages/reactivity/src/constants.ts)

## 核心机制

1. 理解 reactive/readonly/shallow 的四张 WeakMap 缓存
2. 掌握 TargetType COMMON/COLLECTION/INVALID 分类
3. 理解 toRaw、markRaw、isReactive/isReadonly 的递归身份语义

不要从第一行机械读到最后一行。先确定入口输入和外部结果，再围绕上面的机制追踪分支；开发警告、compat 和复杂类型分支第一遍只做标记。

## 主调用链

```text
reactive(target) → createReactiveObject → targetTypeMap → proxyMap → new Proxy
```

阅读时给链路中的每个箭头补上：调用函数、关键参数、被修改的状态，以及它属于同步执行、批处理还是异步队列。

## 精读步骤

1. 打开 `packages/reactivity/src/reactive.ts`，定位公共入口、核心数据结构和主要分派点；记录它向下调用的 2～4 个函数。
2. 打开 `packages/reactivity/src/constants.ts`，定位公共入口、核心数据结构和主要分派点；记录它向下调用的 2～4 个函数。
3. 全仓搜索今日核心函数的调用方，分别找出至少一个生产者和消费者。
4. 对照测试，用边界用例修正自己的初始推断。

## 动手实验

1. 验证同一 raw 多次 reactive 的身份稳定
2. 验证 reactive(proxy) 与 readonly(reactive)
3. 测试不可扩展对象和 markRaw

实验必须记录“输入、预期、实际结果、源码解释”，只记录最终输出不算完成。

## 测试与反证

- [packages/reactivity/__tests__/reactive.spec.ts](../../../packages/reactivity/__tests__/reactive.spec.ts)
- [packages/reactivity/__tests__/readonly.spec.ts](../../../packages/reactivity/__tests__/readonly.spec.ts)

```bash
pnpm vitest packages/reactivity/__tests__/reactive.spec.ts
pnpm vitest packages/reactivity/__tests__/readonly.spec.ts
```

若当前仓库基线阻止测试启动，记录首个环境/语法错误和阻断链，不要把它误判成今日主题的行为错误。

## 闭卷验收

1. 为何缓存使用 WeakMap？
2. shallow 控制的是哪一层？
3. readonly 包装 reactive 后 isReactive 为何仍可能为 true？

## 今日完成标准

- [ ] 能不看源码画出主调用链。
- [ ] 能解释至少三个关键分支及其设计权衡。
- [ ] 完成全部实验，并阅读对应测试中的边界案例。
- [ ] 写出一个最小复刻、伪代码或状态转换表。
- [ ] 将仍不确定的问题标注为“事实缺口”或“设计取舍”。

## 导航

上一天：[Day 07｜ShapeFlags、PatchFlags 与 SlotFlags](./day-07-flags-contract.md)  
下一天：[Day 09｜BaseReactiveHandler.get 读取路径](./day-09-base-getter.md)

