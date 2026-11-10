# Day 09：BaseReactiveHandler.get 读取路径

> 阶段：响应式系统｜建议投入：约 3 小时｜目标：形成可以通过代码、测试和实验复验的理解。

## 今日目标

- 按内部 flags、数组 instrumentation、Reflect.get、track、包装顺序理解热路径
- 区分 shallow、readonly 与普通 reactive 的读取行为
- 掌握普通属性 ref 解包和数组整数索引保留 ref 的边界

## 源码入口

- [packages/reactivity/src/baseHandlers.ts](../../../packages/reactivity/src/baseHandlers.ts)
- [packages/reactivity/src/reactive.ts](../../../packages/reactivity/src/reactive.ts)

## 核心机制

1. 按内部 flags、数组 instrumentation、Reflect.get、track、包装顺序理解热路径
2. 区分 shallow、readonly 与普通 reactive 的读取行为
3. 掌握普通属性 ref 解包和数组整数索引保留 ref 的边界

不要从第一行机械读到最后一行。先确定入口输入和外部结果，再围绕上面的机制追踪分支；开发警告、compat 和复杂类型分支第一遍只做标记。

## 主调用链

```text
proxy.key → get trap → 特殊 flag/数组分支 → Reflect.get → track → ref/object 包装
```

阅读时给链路中的每个箭头补上：调用函数、关键参数、被修改的状态，以及它属于同步执行、批处理还是异步队列。

## 精读步骤

1. 打开 `packages/reactivity/src/baseHandlers.ts`，定位公共入口、核心数据结构和主要分派点；记录它向下调用的 2～4 个函数。
2. 打开 `packages/reactivity/src/reactive.ts`，定位公共入口、核心数据结构和主要分派点；记录它向下调用的 2～4 个函数。
3. 全仓搜索今日核心函数的调用方，分别找出至少一个生产者和消费者。
4. 对照测试，用边界用例修正自己的初始推断。

## 动手实验

1. 给 getter 各分支做输入输出表
2. 验证嵌套对象代理是惰性创建
3. 比较 object.r 与 array[0] 的 ref 读取

实验必须记录“输入、预期、实际结果、源码解释”，只记录最终输出不算完成。

## 测试与反证

- [packages/reactivity/__tests__/reactive.spec.ts](../../../packages/reactivity/__tests__/reactive.spec.ts)
- [packages/reactivity/__tests__/reactiveArray.spec.ts](../../../packages/reactivity/__tests__/reactiveArray.spec.ts)

```bash
pnpm vitest packages/reactivity/__tests__/reactive.spec.ts
pnpm vitest packages/reactivity/__tests__/reactiveArray.spec.ts
```

若当前仓库基线阻止测试启动，记录首个环境/语法错误和阻断链，不要把它误判成今日主题的行为错误。

## 闭卷验收

1. 为什么嵌套代理是惰性的？
2. 数组索引为什么不解包 ref？
3. readonly getter 是否 track？

## 今日完成标准

- [ ] 能不看源码画出主调用链。
- [ ] 能解释至少三个关键分支及其设计权衡。
- [ ] 完成全部实验，并阅读对应测试中的边界案例。
- [ ] 写出一个最小复刻、伪代码或状态转换表。
- [ ] 将仍不确定的问题标注为“事实缺口”或“设计取舍”。

## 导航

上一天：[Day 08｜reactive 工厂与代理缓存](./day-08-reactive-factory.md)  
下一天：[Day 10｜setter、delete、has 与 ownKeys](./day-10-base-mutations.md)

