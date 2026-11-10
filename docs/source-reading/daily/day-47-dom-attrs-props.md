# Day 47：patchProp、Attributes 与 DOM Properties

> 阶段：DOM 平台｜建议投入：约 3 小时｜目标：形成可以通过代码、测试和实验复验的理解。

## 今日目标

- patchProp 按 class/style/event/property/attribute 分派
- shouldSetAsProp 处理 form/list/type/width 等 DOM 特例
- patchDOMProp 处理 innerHTML/textContent、value 和失败回退

## 源码入口

- [packages/runtime-dom/src/patchProp.ts](../../../packages/runtime-dom/src/patchProp.ts)
- [packages/runtime-dom/src/modules/attrs.ts](../../../packages/runtime-dom/src/modules/attrs.ts)
- [packages/runtime-dom/src/modules/props.ts](../../../packages/runtime-dom/src/modules/props.ts)

## 核心机制

1. patchProp 按 class/style/event/property/attribute 分派
2. shouldSetAsProp 处理 form/list/type/width 等 DOM 特例
3. patchDOMProp 处理 innerHTML/textContent、value 和失败回退

不要从第一行机械读到最后一行。先确定入口输入和外部结果，再围绕上面的机制追踪分支；开发警告、compat 和复杂类型分支第一遍只做标记。

## 主调用链

```text
renderer hostPatchProp → patchProp decision → patchAttr 或 patchDOMProp → DOM side effect
```

阅读时给链路中的每个箭头补上：调用函数、关键参数、被修改的状态，以及它属于同步执行、批处理还是异步队列。

## 精读步骤

1. 打开 `packages/runtime-dom/src/patchProp.ts`，定位公共入口、核心数据结构和主要分派点；记录它向下调用的 2～4 个函数。
2. 打开 `packages/runtime-dom/src/modules/attrs.ts`，定位公共入口、核心数据结构和主要分派点；记录它向下调用的 2～4 个函数。
3. 打开 `packages/runtime-dom/src/modules/props.ts`，定位公共入口、核心数据结构和主要分派点；记录它向下调用的 2～4 个函数。
4. 全仓搜索今日核心函数的调用方，分别找出至少一个生产者和消费者。
5. 对照测试，用边界用例修正自己的初始推断。

## 动手实验

1. 比较 input value attribute 与 property
2. 验证 v-bind .prop/.attr 强制前缀
3. 测试布尔属性空字符串与 false

实验必须记录“输入、预期、实际结果、源码解释”，只记录最终输出不算完成。

## 测试与反证

- [packages/runtime-dom/__tests__/patchAttrs.spec.ts](../../../packages/runtime-dom/__tests__/patchAttrs.spec.ts)
- [packages/runtime-dom/__tests__/patchProps.spec.ts](../../../packages/runtime-dom/__tests__/patchProps.spec.ts)

```bash
pnpm vitest packages/runtime-dom/__tests__/patchAttrs.spec.ts
pnpm vitest packages/runtime-dom/__tests__/patchProps.spec.ts
```

若当前仓库基线阻止测试启动，记录首个环境/语法错误和阻断链，不要把它误判成今日主题的行为错误。

## 闭卷验收

1. attribute 与 property 为什么不能一律选择其一？
2. 设置 innerHTML 前为何要 unmount 旧 children？
3. value 为什么保存 _value？

## 今日完成标准

- [ ] 能不看源码画出主调用链。
- [ ] 能解释至少三个关键分支及其设计权衡。
- [ ] 完成全部实验，并阅读对应测试中的边界案例。
- [ ] 写出一个最小复刻、伪代码或状态转换表。
- [ ] 将仍不确定的问题标注为“事实缺口”或“设计取舍”。

## 导航

上一天：[Day 46｜runtime-dom 入口与 nodeOps](./day-46-runtime-dom-entry-nodeops.md)  
下一天：[Day 48｜Class、Style 与事件 Invoker](./day-48-dom-class-style-events.md)

