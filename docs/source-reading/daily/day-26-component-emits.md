# Day 26：Emits 规范化与事件派发

> 阶段：运行时模型｜建议投入：约 3 小时｜目标：形成可以通过代码、测试和实验复验的理解。

## 今日目标

- normalizeEmitsOptions 合并与缓存声明
- emit 处理校验、v-model modifiers、camel/hyphen 事件名
- once handler 和普通 handler 的调用记录

## 源码入口

- [packages/runtime-core/src/componentEmits.ts](../../../packages/runtime-core/src/componentEmits.ts)
- [packages/shared/src/general.ts](../../../packages/shared/src/general.ts)

## 核心机制

1. normalizeEmitsOptions 合并与缓存声明
2. emit 处理校验、v-model modifiers、camel/hyphen 事件名
3. once handler 和普通 handler 的调用记录

不要从第一行机械读到最后一行。先确定入口输入和外部结果，再围绕上面的机制追踪分支；开发警告、compat 和复杂类型分支第一遍只做标记。

## 主调用链

```text
setup context emit → emit(instance,event,args) → modifier transform → resolve handler → error-handled call
```

阅读时给链路中的每个箭头补上：调用函数、关键参数、被修改的状态，以及它属于同步执行、批处理还是异步队列。

## 精读步骤

1. 打开 `packages/runtime-core/src/componentEmits.ts`，定位公共入口、核心数据结构和主要分派点；记录它向下调用的 2～4 个函数。
2. 打开 `packages/shared/src/general.ts`，定位公共入口、核心数据结构和主要分派点；记录它向下调用的 2～4 个函数。
3. 全仓搜索今日核心函数的调用方，分别找出至少一个生产者和消费者。
4. 对照测试，用边界用例修正自己的初始推断。

## 动手实验

1. 验证 camelCase 与 kebab-case 监听器匹配
2. 验证 model trim/number modifiers
3. 验证 emit once 只执行一次

实验必须记录“输入、预期、实际结果、源码解释”，只记录最终输出不算完成。

## 测试与反证

- [packages/runtime-core/__tests__/componentEmits.spec.ts](../../../packages/runtime-core/__tests__/componentEmits.spec.ts)

```bash
pnpm vitest packages/runtime-core/__tests__/componentEmits.spec.ts
```

若当前仓库基线阻止测试启动，记录首个环境/语法错误和阻断链，不要把它误判成今日主题的行为错误。

## 闭卷验收

1. emit listener 为什么不进入 attrs？
2. 事件名规范化解决什么模板/JS 差异？
3. validator 只在什么环境工作？

## 今日完成标准

- [ ] 能不看源码画出主调用链。
- [ ] 能解释至少三个关键分支及其设计权衡。
- [ ] 完成全部实验，并阅读对应测试中的边界案例。
- [ ] 写出一个最小复刻、伪代码或状态转换表。
- [ ] 将仍不确定的问题标注为“事实缺口”或“设计取舍”。

## 导航

上一天：[Day 25｜Props 声明规范化、初始化与更新](./day-25-component-props.md)  
下一天：[Day 27｜Slots 初始化、更新与渲染上下文](./day-27-component-slots.md)

