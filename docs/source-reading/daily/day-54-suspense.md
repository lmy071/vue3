# Day 54：Suspense、异步依赖与边界切换

> 阶段：内置组件｜建议投入：约 3 小时｜目标：形成可以通过代码、测试和实验复验的理解。

## 今日目标

- SuspenseBoundary 跟踪 deps、pendingBranch、activeBranch 与 effects
- 异步分支先挂隐藏容器，deps 清零后 resolve 到主容器
- pendingId 防止过期异步结果覆盖新分支

## 源码入口

- [packages/runtime-core/src/components/Suspense.ts](../../../packages/runtime-core/src/components/Suspense.ts)
- [packages/runtime-core/src/apiAsyncComponent.ts](../../../packages/runtime-core/src/apiAsyncComponent.ts)
- [packages/runtime-core/src/renderer.ts](../../../packages/runtime-core/src/renderer.ts)

## 核心机制

1. SuspenseBoundary 跟踪 deps、pendingBranch、activeBranch 与 effects
2. 异步分支先挂隐藏容器，deps 清零后 resolve 到主容器
3. pendingId 防止过期异步结果覆盖新分支

不要从第一行机械读到最后一行。先确定入口输入和外部结果，再围绕上面的机制追踪分支；开发警告、compat 和复杂类型分支第一遍只做标记。

## 主调用链

```text
processSuspense → mount pending in hidden container + fallback → registerDep → deps-- → resolve/move branch/flush effects
```

阅读时给链路中的每个箭头补上：调用函数、关键参数、被修改的状态，以及它属于同步执行、批处理还是异步队列。

## 精读步骤

1. 打开 `packages/runtime-core/src/components/Suspense.ts`，定位公共入口、核心数据结构和主要分派点；记录它向下调用的 2～4 个函数。
2. 打开 `packages/runtime-core/src/apiAsyncComponent.ts`，定位公共入口、核心数据结构和主要分派点；记录它向下调用的 2～4 个函数。
3. 打开 `packages/runtime-core/src/renderer.ts`，定位公共入口、核心数据结构和主要分派点；记录它向下调用的 2～4 个函数。
4. 全仓搜索今日核心函数的调用方，分别找出至少一个生产者和消费者。
5. 对照测试，用边界用例修正自己的初始推断。

## 动手实验

1. 异步 setup 成功、失败、快速切换各做实验
2. 验证 timeout 对 fallback 时机
3. 记录 nested suspense effects 向父边界合并

实验必须记录“输入、预期、实际结果、源码解释”，只记录最终输出不算完成。

## 测试与反证

- [packages/runtime-core/__tests__/components/Suspense.spec.ts](../../../packages/runtime-core/__tests__/components/Suspense.spec.ts)
- [packages/runtime-core/__tests__/apiAsyncComponent.spec.ts](../../../packages/runtime-core/__tests__/apiAsyncComponent.spec.ts)

```bash
pnpm vitest packages/runtime-core/__tests__/components/Suspense.spec.ts
pnpm vitest packages/runtime-core/__tests__/apiAsyncComponent.spec.ts
```

若当前仓库基线阻止测试启动，记录首个环境/语法错误和阻断链，不要把它误判成今日主题的行为错误。

## 闭卷验收

1. 隐藏容器解决什么问题？
2. pendingId 为什么必要？
3. Suspense 与 async component loadingComponent 如何协作？

## 今日完成标准

- [ ] 能不看源码画出主调用链。
- [ ] 能解释至少三个关键分支及其设计权衡。
- [ ] 完成全部实验，并阅读对应测试中的边界案例。
- [ ] 写出一个最小复刻、伪代码或状态转换表。
- [ ] 将仍不确定的问题标注为“事实缺口”或“设计取舍”。

## 导航

上一天：[Day 53｜Teleport 的双容器渲染与移动](./day-53-teleport.md)  
下一天：[Day 55｜Custom Element、CSS Module 与 CSS Vars](./day-55-custom-elements-css.md)

