# Day 75：HMR、Devtools、Compat 与全内核验收

> 阶段：工程复盘｜建议投入：约 3 小时｜目标：形成可以通过代码、测试和实验复验的理解。

## 今日目标

- HMR record/rerender/reload 通过实例集合与 scheduler 更新
- devtools hooks 暴露 app/component/performance 事件而不改变核心语义
- compat 通过编译/运行配置与包装层保留 Vue 2 行为，最终需回到六条主链验收

## 源码入口

- [packages/runtime-core/src/hmr.ts](../../../packages/runtime-core/src/hmr.ts)
- [packages/runtime-core/src/devtools.ts](../../../packages/runtime-core/src/devtools.ts)
- [packages/runtime-core/src/errorHandling.ts](../../../packages/runtime-core/src/errorHandling.ts)
- [packages/vue-compat/src/index.ts](../../../packages/vue-compat/src/index.ts)
- [packages/vue-compat/src/runtime.ts](../../../packages/vue-compat/src/runtime.ts)

## 核心机制

1. HMR record/rerender/reload 通过实例集合与 scheduler 更新
2. devtools hooks 暴露 app/component/performance 事件而不改变核心语义
3. compat 通过编译/运行配置与包装层保留 Vue 2 行为，最终需回到六条主链验收

不要从第一行机械读到最后一行。先确定入口输入和外部结果，再围绕上面的机制追踪分支；开发警告、compat 和复杂类型分支第一遍只做标记。

## 主调用链

```text
source edit → HMR runtime → dirtyComponents/instances → queueJob/reload；最终：API → reactivity → scheduler → render/compiler → patch/SSR
```

阅读时给链路中的每个箭头补上：调用函数、关键参数、被修改的状态，以及它属于同步执行、批处理还是异步队列。

## 精读步骤

1. 打开 `packages/runtime-core/src/hmr.ts`，定位公共入口、核心数据结构和主要分派点；记录它向下调用的 2～4 个函数。
2. 打开 `packages/runtime-core/src/devtools.ts`，定位公共入口、核心数据结构和主要分派点；记录它向下调用的 2～4 个函数。
3. 打开 `packages/runtime-core/src/errorHandling.ts`，定位公共入口、核心数据结构和主要分派点；记录它向下调用的 2～4 个函数。
4. 打开 `packages/vue-compat/src/index.ts`，定位公共入口、核心数据结构和主要分派点；记录它向下调用的 2～4 个函数。
5. 打开 `packages/vue-compat/src/runtime.ts`，定位公共入口、核心数据结构和主要分派点；记录它向下调用的 2～4 个函数。
6. 全仓搜索今日核心函数的调用方，分别找出至少一个生产者和消费者。
7. 对照测试，用边界用例修正自己的初始推断。

## 动手实验

1. 完成 1500～3000 行 mini-vue 或等价核心实现
2. 闭卷画响应式、挂载、更新、编译、SFC、SSR 六条链
3. 选择一个真实 issue，定位受影响包、测试层和设计权衡

实验必须记录“输入、预期、实际结果、源码解释”，只记录最终输出不算完成。

## 测试与反证

- [packages/runtime-core/__tests__/hmr.spec.ts](../../../packages/runtime-core/__tests__/hmr.spec.ts)
- [packages/vue-compat/__tests__/global.spec.ts](../../../packages/vue-compat/__tests__/global.spec.ts)

```bash
pnpm vitest packages/runtime-core/__tests__/hmr.spec.ts
pnpm vitest packages/vue-compat/__tests__/global.spec.ts
```

若当前仓库基线阻止测试启动，记录首个环境/语法错误和阻断链，不要把它误判成今日主题的行为错误。

## 闭卷验收

1. HMR rerender 与 reload 的边界是什么？
2. compat 为什么应最后阅读？
3. 你能否从任意公开 API 在 10 分钟内定位核心实现与测试？

## 今日完成标准

- [ ] 能不看源码画出主调用链。
- [ ] 能解释至少三个关键分支及其设计权衡。
- [ ] 完成全部实验，并阅读对应测试中的边界案例。
- [ ] 写出一个最小复刻、伪代码或状态转换表。
- [ ] 将仍不确定的问题标注为“事实缺口”或“设计取舍”。

## 导航

上一天：[Day 74｜Vue 聚合入口、运行时编译与发布形态](./day-74-vue-build-runtime.md)  
下一步：进行最终闭卷讲解、mini-vue 演示并选择真实 issue 贡献。

