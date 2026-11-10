# Day 50：BaseTransition 状态机

> 阶段：内置组件｜建议投入：约 3 小时｜目标：形成可以通过代码、测试和实验复验的理解。

## 今日目标

- runtime-core 定义平台无关 transition 协议，runtime-dom 实现 CSS/DOM hooks
- resolveTransitionHooks 连接 VNode mount/unmount 与 enter/leave
- out-in、in-out、appear、persisted 改变状态和延迟策略

## 源码入口

- [packages/runtime-core/src/components/BaseTransition.ts](../../../packages/runtime-core/src/components/BaseTransition.ts)
- [packages/runtime-dom/src/components/Transition.ts](../../../packages/runtime-dom/src/components/Transition.ts)

## 核心机制

1. runtime-core 定义平台无关 transition 协议，runtime-dom 实现 CSS/DOM hooks
2. resolveTransitionHooks 连接 VNode mount/unmount 与 enter/leave
3. out-in、in-out、appear、persisted 改变状态和延迟策略

不要从第一行机械读到最后一行。先确定入口输入和外部结果，再围绕上面的机制追踪分支；开发警告、compat 和复杂类型分支第一遍只做标记。

## 主调用链

```text
Transition render → BaseTransition clone hooks → renderer beforeEnter/enter/leave → DOM CSS hooks → done
```

阅读时给链路中的每个箭头补上：调用函数、关键参数、被修改的状态，以及它属于同步执行、批处理还是异步队列。

## 精读步骤

1. 打开 `packages/runtime-core/src/components/BaseTransition.ts`，定位公共入口、核心数据结构和主要分派点；记录它向下调用的 2～4 个函数。
2. 打开 `packages/runtime-dom/src/components/Transition.ts`，定位公共入口、核心数据结构和主要分派点；记录它向下调用的 2～4 个函数。
3. 全仓搜索今日核心函数的调用方，分别找出至少一个生产者和消费者。
4. 对照测试，用边界用例修正自己的初始推断。

## 动手实验

1. 记录 enter 与 leave 的 class/事件时序
2. 比较 appear false/true 首次挂载
3. 验证快速切换时 cancelled hook

实验必须记录“输入、预期、实际结果、源码解释”，只记录最终输出不算完成。

## 测试与反证

- [packages/runtime-core/__tests__/components/BaseTransition.spec.ts](../../../packages/runtime-core/__tests__/components/BaseTransition.spec.ts)
- [packages/vue/__tests__/e2e/Transition.spec.ts](../../../packages/vue/__tests__/e2e/Transition.spec.ts)

```bash
pnpm vitest packages/runtime-core/__tests__/components/BaseTransition.spec.ts
pnpm vitest packages/vue/__tests__/e2e/Transition.spec.ts
```

若当前仓库基线阻止测试启动，记录首个环境/语法错误和阻断链，不要把它误判成今日主题的行为错误。

## 闭卷验收

1. 为什么 BaseTransition 放 runtime-core？
2. done callback 如何解除 delayed leave？
3. persisted 模式适合 v-show 的原因是什么？

## 今日完成标准

- [ ] 能不看源码画出主调用链。
- [ ] 能解释至少三个关键分支及其设计权衡。
- [ ] 完成全部实验，并阅读对应测试中的边界案例。
- [ ] 写出一个最小复刻、伪代码或状态转换表。
- [ ] 将仍不确定的问题标注为“事实缺口”或“设计取舍”。

## 导航

上一天：[Day 49｜v-model、v-show 与事件修饰符](./day-49-dom-directives.md)  
下一天：[Day 51｜TransitionGroup 与 FLIP 列表动画](./day-51-transition-group.md)
