# Day 25：Props 声明规范化、初始化与更新

> 阶段：运行时模型｜建议投入：约 3 小时｜目标：形成可以通过代码、测试和实验复验的理解。

## 今日目标

- normalizePropsOptions 缓存声明并合并 mixins/extends
- initProps 区分 props 与 attrs 并建立 shallowReactive
- updateProps 在 optimized 与 full diff 间选择，处理 absent/default/boolean cast

## 源码入口

- [packages/runtime-core/src/componentProps.ts](../../../packages/runtime-core/src/componentProps.ts)
- [packages/runtime-core/src/apiSetupHelpers.ts](../../../packages/runtime-core/src/apiSetupHelpers.ts)

## 核心机制

1. normalizePropsOptions 缓存声明并合并 mixins/extends
2. initProps 区分 props 与 attrs 并建立 shallowReactive
3. updateProps 在 optimized 与 full diff 间选择，处理 absent/default/boolean cast

不要从第一行机械读到最后一行。先确定入口输入和外部结果，再围绕上面的机制追踪分支；开发警告、compat 和复杂类型分支第一遍只做标记。

## 主调用链

```text
component options → normalized props options → initProps(rawProps) → props/attrs → updateProps
```

阅读时给链路中的每个箭头补上：调用函数、关键参数、被修改的状态，以及它属于同步执行、批处理还是异步队列。

## 精读步骤

1. 打开 `packages/runtime-core/src/componentProps.ts`，定位公共入口、核心数据结构和主要分派点；记录它向下调用的 2～4 个函数。
2. 打开 `packages/runtime-core/src/apiSetupHelpers.ts`，定位公共入口、核心数据结构和主要分派点；记录它向下调用的 2～4 个函数。
3. 全仓搜索今日核心函数的调用方，分别找出至少一个生产者和消费者。
4. 对照测试，用边界用例修正自己的初始推断。

## 动手实验

1. 测试 Boolean/String 类型顺序对 cast 的影响
2. 追踪默认工厂的实例缓存
3. 比较声明 prop、透传 attr 和 emit listener

实验必须记录“输入、预期、实际结果、源码解释”，只记录最终输出不算完成。

## 测试与反证

- [packages/runtime-core/__tests__/componentProps.spec.ts](../../../packages/runtime-core/__tests__/componentProps.spec.ts)
- [packages/runtime-core/__tests__/rendererAttrsFallthrough.spec.ts](../../../packages/runtime-core/__tests__/rendererAttrsFallthrough.spec.ts)

```bash
pnpm vitest packages/runtime-core/__tests__/componentProps.spec.ts
pnpm vitest packages/runtime-core/__tests__/rendererAttrsFallthrough.spec.ts
```

若当前仓库基线阻止测试启动，记录首个环境/语法错误和阻断链，不要把它误判成今日主题的行为错误。

## 闭卷验收

1. 为什么 props 是 shallowReactive？
2. attrs 变化如何触发依赖？
3. 编译器 dynamicProps 如何加速 updateProps？

## 今日完成标准

- [ ] 能不看源码画出主调用链。
- [ ] 能解释至少三个关键分支及其设计权衡。
- [ ] 完成全部实验，并阅读对应测试中的边界案例。
- [ ] 写出一个最小复刻、伪代码或状态转换表。
- [ ] 将仍不确定的问题标注为“事实缺口”或“设计取舍”。

## 导航

上一天：[Day 24｜组件实例创建与 setup 流程](./day-24-component-instance-setup.md)  
下一天：[Day 26｜Emits 规范化与事件派发](./day-26-component-emits.md)

