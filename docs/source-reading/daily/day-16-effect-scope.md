# Day 16：EffectScope 与资源生命周期

> 阶段：响应式系统｜建议投入：约 3 小时｜目标：形成可以通过代码、测试和实验复验的理解。

## 今日目标

- scope 收集 effects、cleanups 与 child scopes
- 非 detached scope 建立父子树，停止时递归释放
- 数组末项交换实现 child scope O(1) 移除

## 源码入口

- [packages/reactivity/src/effectScope.ts](../../../packages/reactivity/src/effectScope.ts)
- [packages/runtime-core/src/component.ts](../../../packages/runtime-core/src/component.ts)

## 核心机制

1. scope 收集 effects、cleanups 与 child scopes
2. 非 detached scope 建立父子树，停止时递归释放
3. 数组末项交换实现 child scope O(1) 移除

不要从第一行机械读到最后一行。先确定入口输入和外部结果，再围绕上面的机制追踪分支；开发警告、compat 和复杂类型分支第一遍只做标记。

## 主调用链

```text
effectScope.run → activeEffectScope → recordEffectScope → scope.stop → effects/cleanups/children
```

阅读时给链路中的每个箭头补上：调用函数、关键参数、被修改的状态，以及它属于同步执行、批处理还是异步队列。

## 精读步骤

1. 打开 `packages/reactivity/src/effectScope.ts`，定位公共入口、核心数据结构和主要分派点；记录它向下调用的 2～4 个函数。
2. 打开 `packages/runtime-core/src/component.ts`，定位公共入口、核心数据结构和主要分派点；记录它向下调用的 2～4 个函数。
3. 全仓搜索今日核心函数的调用方，分别找出至少一个生产者和消费者。
4. 对照测试，用边界用例修正自己的初始推断。

## 动手实验

1. 创建父子与 detached scope 比较 stop
2. 验证 onScopeDispose 的调用顺序
3. 定位组件实例创建自身 scope 的位置

实验必须记录“输入、预期、实际结果、源码解释”，只记录最终输出不算完成。

## 测试与反证

- [packages/reactivity/__tests__/effectScope.spec.ts](../../../packages/reactivity/__tests__/effectScope.spec.ts)

```bash
pnpm vitest packages/reactivity/__tests__/effectScope.spec.ts
```

若当前仓库基线阻止测试启动，记录首个环境/语法错误和阻断链，不要把它误判成今日主题的行为错误。

## 闭卷验收

1. detached scope 适合什么场景？
2. 为何 scope.stop 要防止重复？
3. 组件卸载如何借助 scope？

## 今日完成标准

- [ ] 能不看源码画出主调用链。
- [ ] 能解释至少三个关键分支及其设计权衡。
- [ ] 完成全部实验，并阅读对应测试中的边界案例。
- [ ] 写出一个最小复刻、伪代码或状态转换表。
- [ ] 将仍不确定的问题标注为“事实缺口”或“设计取舍”。

## 导航

上一天：[Day 15｜trigger、notify 与响应式批处理](./day-15-effect-notify-batch.md)  
下一天：[Day 17｜ref、toRef、proxyRefs 与 customRef](./day-17-ref-system.md)

