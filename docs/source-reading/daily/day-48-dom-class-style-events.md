# Day 48：Class、Style 与事件 Invoker

> 阶段：DOM 平台｜建议投入：约 3 小时｜目标：形成可以通过代码、测试和实验复验的理解。

## 今日目标

- patchClass 合并 transition classes 并区分 SVG
- patchStyle 支持 cssText、对象 diff、数组值、important 与 vendor prefix
- 事件 invoker 稳定挂载一次，只更新 value，并用时间戳避免冒泡竞态

## 源码入口

- [packages/runtime-dom/src/modules/class.ts](../../../packages/runtime-dom/src/modules/class.ts)
- [packages/runtime-dom/src/modules/style.ts](../../../packages/runtime-dom/src/modules/style.ts)
- [packages/runtime-dom/src/modules/events.ts](../../../packages/runtime-dom/src/modules/events.ts)

## 核心机制

1. patchClass 合并 transition classes 并区分 SVG
2. patchStyle 支持 cssText、对象 diff、数组值、important 与 vendor prefix
3. 事件 invoker 稳定挂载一次，只更新 value，并用时间戳避免冒泡竞态

不要从第一行机械读到最后一行。先确定入口输入和外部结果，再围绕上面的机制追踪分支；开发警告、compat 和复杂类型分支第一遍只做标记。

## 主调用链

```text
patchProp → patchClass/patchStyle/patchEvent → el class/style/_vei → browser event
```

阅读时给链路中的每个箭头补上：调用函数、关键参数、被修改的状态，以及它属于同步执行、批处理还是异步队列。

## 精读步骤

1. 打开 `packages/runtime-dom/src/modules/class.ts`，定位公共入口、核心数据结构和主要分派点；记录它向下调用的 2～4 个函数。
2. 打开 `packages/runtime-dom/src/modules/style.ts`，定位公共入口、核心数据结构和主要分派点；记录它向下调用的 2～4 个函数。
3. 打开 `packages/runtime-dom/src/modules/events.ts`，定位公共入口、核心数据结构和主要分派点；记录它向下调用的 2～4 个函数。
4. 全仓搜索今日核心函数的调用方，分别找出至少一个生产者和消费者。
5. 对照测试，用边界用例修正自己的初始推断。

## 动手实验

1. 更新同一 click handler 验证无需 remove/add
2. 测试 style 从对象到字符串再到 null
3. 验证 Transition 临时 class 不被普通 class patch 覆盖

实验必须记录“输入、预期、实际结果、源码解释”，只记录最终输出不算完成。

## 测试与反证

- [packages/runtime-dom/__tests__/patchClass.spec.ts](../../../packages/runtime-dom/__tests__/patchClass.spec.ts)
- [packages/runtime-dom/__tests__/patchStyle.spec.ts](../../../packages/runtime-dom/__tests__/patchStyle.spec.ts)
- [packages/runtime-dom/__tests__/patchEvents.spec.ts](../../../packages/runtime-dom/__tests__/patchEvents.spec.ts)

```bash
pnpm vitest packages/runtime-dom/__tests__/patchClass.spec.ts
pnpm vitest packages/runtime-dom/__tests__/patchStyle.spec.ts
pnpm vitest packages/runtime-dom/__tests__/patchEvents.spec.ts
```

若当前仓库基线阻止测试启动，记录首个环境/语法错误和阻断链，不要把它误判成今日主题的行为错误。

## 闭卷验收

1. invoker 缓存解决什么性能与时序问题？
2. style 缺失旧 key 如何清理？
3. 事件名 modifiers 如何解析为 listener options？

## 今日完成标准

- [ ] 能不看源码画出主调用链。
- [ ] 能解释至少三个关键分支及其设计权衡。
- [ ] 完成全部实验，并阅读对应测试中的边界案例。
- [ ] 写出一个最小复刻、伪代码或状态转换表。
- [ ] 将仍不确定的问题标注为“事实缺口”或“设计取舍”。

## 导航

上一天：[Day 47｜patchProp、Attributes 与 DOM Properties](./day-47-dom-attrs-props.md)  
下一天：[Day 49｜v-model、v-show 与事件修饰符](./day-49-dom-directives.md)

