# Day 06：输入规范化、展示与 HTML 安全

> 阶段：共享协议｜建议投入：约 3 小时｜目标：形成可以通过代码、测试和实验复验的理解。

## 今日目标

- 理解 class/style 多形态输入的递归归一与覆盖顺序
- 区分展示语义 toDisplayString 和 HTML 上下文转义 escapeHtml
- 理解 boolean attr、安全属性名和值的独立检查

## 源码入口

- [packages/shared/src/normalizeProp.ts](../../../packages/shared/src/normalizeProp.ts)
- [packages/shared/src/toDisplayString.ts](../../../packages/shared/src/toDisplayString.ts)
- [packages/shared/src/escapeHtml.ts](../../../packages/shared/src/escapeHtml.ts)
- [packages/shared/src/domAttrConfig.ts](../../../packages/shared/src/domAttrConfig.ts)

## 核心机制

1. 理解 class/style 多形态输入的递归归一与覆盖顺序
2. 区分展示语义 toDisplayString 和 HTML 上下文转义 escapeHtml
3. 理解 boolean attr、安全属性名和值的独立检查

不要从第一行机械读到最后一行。先确定入口输入和外部结果，再围绕上面的机制追踪分支；开发警告、compat 和复杂类型分支第一遍只做标记。

## 主调用链

```text
用户值 → normalize/toDisplayString → runtime 或 SSR consumer → patch/escape → DOM/HTML
```

阅读时给链路中的每个箭头补上：调用函数、关键参数、被修改的状态，以及它属于同步执行、批处理还是异步队列。

## 精读步骤

1. 打开 `packages/shared/src/normalizeProp.ts`，定位公共入口、核心数据结构和主要分派点；记录它向下调用的 2～4 个函数。
2. 打开 `packages/shared/src/toDisplayString.ts`，定位公共入口、核心数据结构和主要分派点；记录它向下调用的 2～4 个函数。
3. 打开 `packages/shared/src/escapeHtml.ts`，定位公共入口、核心数据结构和主要分派点；记录它向下调用的 2～4 个函数。
4. 打开 `packages/shared/src/domAttrConfig.ts`，定位公共入口、核心数据结构和主要分派点；记录它向下调用的 2～4 个函数。
5. 全仓搜索今日核心函数的调用方，分别找出至少一个生产者和消费者。
6. 对照测试，用边界用例修正自己的初始推断。

## 动手实验

1. 手写 normalizeClass 与简化 normalizeStyle
2. 验证 CSS url 中分号不会被错误切分
3. 用恶意字符串走 ssrInterpolate，观察转义结果

实验必须记录“输入、预期、实际结果、源码解释”，只记录最终输出不算完成。

## 测试与反证

- [packages/shared/__tests__/normalizeProp.spec.ts](../../../packages/shared/__tests__/normalizeProp.spec.ts)
- [packages/shared/__tests__/escapeHtml.spec.ts](../../../packages/shared/__tests__/escapeHtml.spec.ts)
- [packages/shared/__tests__/toDisplayString.spec.ts](../../../packages/shared/__tests__/toDisplayString.spec.ts)

```bash
pnpm vitest packages/shared/__tests__/normalizeProp.spec.ts
pnpm vitest packages/shared/__tests__/escapeHtml.spec.ts
pnpm vitest packages/shared/__tests__/toDisplayString.spec.ts
```

若当前仓库基线阻止测试启动，记录首个环境/语法错误和阻断链，不要把它误判成今日主题的行为错误。

## 闭卷验收

1. normalizeProps 是否复制对象？
2. SSR 插值为何不能只调用 String？
3. 安全属性名和安全属性值有什么区别？

## 今日完成标准

- [ ] 能不看源码画出主调用链。
- [ ] 能解释至少三个关键分支及其设计权衡。
- [ ] 完成全部实验，并阅读对应测试中的边界案例。
- [ ] 写出一个最小复刻、伪代码或状态转换表。
- [ ] 将仍不确定的问题标注为“事实缺口”或“设计取舍”。

## 导航

上一天：[Day 05｜general.ts 与 makeMap 基础工具](./day-05-shared-general.md)  
下一天：[Day 07｜ShapeFlags、PatchFlags 与 SlotFlags](./day-07-flags-contract.md)

