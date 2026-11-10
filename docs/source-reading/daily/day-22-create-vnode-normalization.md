# Day 22：createVNode、normalizeChildren 与 Block

> 阶段：运行时模型｜建议投入：约 3 小时｜目标：形成可以通过代码、测试和实验复验的理解。

## 今日目标

- createVNode 处理 class/style、响应式 props、组件 class 与 shapeFlag
- normalizeVNode/normalizeChildren 把任意 render 输出变成稳定结构
- openBlock/createBlock 收集 dynamicChildren 连接编译器优化

## 源码入口

- [packages/runtime-core/src/vnode.ts](../../../packages/runtime-core/src/vnode.ts)
- [packages/runtime-core/src/internalObject.ts](../../../packages/runtime-core/src/internalObject.ts)

## 核心机制

1. createVNode 处理 class/style、响应式 props、组件 class 与 shapeFlag
2. normalizeVNode/normalizeChildren 把任意 render 输出变成稳定结构
3. openBlock/createBlock 收集 dynamicChildren 连接编译器优化

不要从第一行机械读到最后一行。先确定入口输入和外部结果，再围绕上面的机制追踪分支；开发警告、compat 和复杂类型分支第一遍只做标记。

## 主调用链

```text
createVNode(type,props,children,patchFlag) → shapeFlag → normalizeChildren → block tracking
```

阅读时给链路中的每个箭头补上：调用函数、关键参数、被修改的状态，以及它属于同步执行、批处理还是异步队列。

## 精读步骤

1. 打开 `packages/runtime-core/src/vnode.ts`，定位公共入口、核心数据结构和主要分派点；记录它向下调用的 2～4 个函数。
2. 打开 `packages/runtime-core/src/internalObject.ts`，定位公共入口、核心数据结构和主要分派点；记录它向下调用的 2～4 个函数。
3. 全仓搜索今日核心函数的调用方，分别找出至少一个生产者和消费者。
4. 对照测试，用边界用例修正自己的初始推断。

## 动手实验

1. 对 string/array/object/function children 记录结果
2. 比较 createVNode 与 createBlock 的 dynamicChildren
3. 验证 reactive props 被复制后规范化

实验必须记录“输入、预期、实际结果、源码解释”，只记录最终输出不算完成。

## 测试与反证

- [packages/runtime-core/__tests__/vnode.spec.ts](../../../packages/runtime-core/__tests__/vnode.spec.ts)
- [packages/runtime-core/__tests__/rendererOptimizedMode.spec.ts](../../../packages/runtime-core/__tests__/rendererOptimizedMode.spec.ts)

```bash
pnpm vitest packages/runtime-core/__tests__/vnode.spec.ts
pnpm vitest packages/runtime-core/__tests__/rendererOptimizedMode.spec.ts
```

若当前仓库基线阻止测试启动，记录首个环境/语法错误和阻断链，不要把它误判成今日主题的行为错误。

## 闭卷验收

1. 为什么 children 需要统一规范化？
2. block tree 跳过了什么？
3. 手写 render function 为什么通常没有同等优化保证？

## 今日完成标准

- [ ] 能不看源码画出主调用链。
- [ ] 能解释至少三个关键分支及其设计权衡。
- [ ] 完成全部实验，并阅读对应测试中的边界案例。
- [ ] 写出一个最小复刻、伪代码或状态转换表。
- [ ] 将仍不确定的问题标注为“事实缺口”或“设计取舍”。

## 导航

上一天：[Day 21｜VNode 数据模型与特殊节点](./day-21-vnode-model.md)  
下一天：[Day 23｜h API 与编译器运行时 Helpers](./day-23-h-render-helpers.md)

