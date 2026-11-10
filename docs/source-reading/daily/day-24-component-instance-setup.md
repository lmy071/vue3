# Day 24：组件实例创建与 setup 流程

> 阶段：运行时模型｜建议投入：约 3 小时｜目标：形成可以通过代码、测试和实验复验的理解。

## 今日目标

- createComponentInstance 建立父子、appContext、scope、proxy 和渲染状态
- setupComponent 分流有状态/函数组件与 SSR
- setup 返回对象或函数，finishComponentSetup 最终确定 render

## 源码入口

- [packages/runtime-core/src/component.ts](../../../packages/runtime-core/src/component.ts)
- [packages/runtime-core/src/apiSetupHelpers.ts](../../../packages/runtime-core/src/apiSetupHelpers.ts)

## 核心机制

1. createComponentInstance 建立父子、appContext、scope、proxy 和渲染状态
2. setupComponent 分流有状态/函数组件与 SSR
3. setup 返回对象或函数，finishComponentSetup 最终确定 render

不要从第一行机械读到最后一行。先确定入口输入和外部结果，再围绕上面的机制追踪分支；开发警告、compat 和复杂类型分支第一遍只做标记。

## 主调用链

```text
mountComponent → createComponentInstance → setupComponent → setupStatefulComponent → handleSetupResult → finishComponentSetup
```

阅读时给链路中的每个箭头补上：调用函数、关键参数、被修改的状态，以及它属于同步执行、批处理还是异步队列。

## 精读步骤

1. 打开 `packages/runtime-core/src/component.ts`，定位公共入口、核心数据结构和主要分派点；记录它向下调用的 2～4 个函数。
2. 打开 `packages/runtime-core/src/apiSetupHelpers.ts`，定位公共入口、核心数据结构和主要分派点；记录它向下调用的 2～4 个函数。
3. 全仓搜索今日核心函数的调用方，分别找出至少一个生产者和消费者。
4. 对照测试，用边界用例修正自己的初始推断。

## 动手实验

1. 给组件实例字段按身份/输入/状态/渲染/生命周期分类
2. 跟踪 currentInstance 设置与恢复
3. 比较 setup 返回 render 函数和 state 对象

实验必须记录“输入、预期、实际结果、源码解释”，只记录最终输出不算完成。

## 测试与反证

- [packages/runtime-core/__tests__/component.spec.ts](../../../packages/runtime-core/__tests__/component.spec.ts)
- [packages/runtime-core/__tests__/apiSetupContext.spec.ts](../../../packages/runtime-core/__tests__/apiSetupContext.spec.ts)

```bash
pnpm vitest packages/runtime-core/__tests__/component.spec.ts
pnpm vitest packages/runtime-core/__tests__/apiSetupContext.spec.ts
```

若当前仓库基线阻止测试启动，记录首个环境/语法错误和阻断链，不要把它误判成今日主题的行为错误。

## 闭卷验收

1. 为什么 setup 期间需要 currentInstance？
2. 组件 scope 在何时创建？
3. 运行时模板编译器在哪里接入 finishComponentSetup？

## 今日完成标准

- [ ] 能不看源码画出主调用链。
- [ ] 能解释至少三个关键分支及其设计权衡。
- [ ] 完成全部实验，并阅读对应测试中的边界案例。
- [ ] 写出一个最小复刻、伪代码或状态转换表。
- [ ] 将仍不确定的问题标注为“事实缺口”或“设计取舍”。

## 导航

上一天：[Day 23｜h API 与编译器运行时 Helpers](./day-23-h-render-helpers.md)  
下一天：[Day 25｜Props 声明规范化、初始化与更新](./day-25-component-props.md)

