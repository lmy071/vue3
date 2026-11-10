# Day 55：Custom Element、CSS Module 与 CSS Vars

> 阶段：DOM 平台｜建议投入：约 3 小时｜目标：形成可以通过代码、测试和实验复验的理解。

## 今日目标

- VueElement 把 Web Component 生命周期、attributes、props、shadow root 接入 Vue app
- attribute/property 反射必须避免循环并做类型转换
- useCssVars 通过 component update、MutationObserver 与 Teleport 更新变量

## 源码入口

- [packages/runtime-dom/src/apiCustomElement.ts](../../../packages/runtime-dom/src/apiCustomElement.ts)
- [packages/runtime-dom/src/helpers/useCssModule.ts](../../../packages/runtime-dom/src/helpers/useCssModule.ts)
- [packages/runtime-dom/src/helpers/useCssVars.ts](../../../packages/runtime-dom/src/helpers/useCssVars.ts)

## 核心机制

1. VueElement 把 Web Component 生命周期、attributes、props、shadow root 接入 Vue app
2. attribute/property 反射必须避免循环并做类型转换
3. useCssVars 通过 component update、MutationObserver 与 Teleport 更新变量

不要从第一行机械读到最后一行。先确定入口输入和外部结果，再围绕上面的机制追踪分支；开发警告、compat 和复杂类型分支第一遍只做标记。

## 主调用链

```text
customElements.define → VueElement connected → resolveDef → createApp/mount；state → useCssVars effect → style.setProperty
```

阅读时给链路中的每个箭头补上：调用函数、关键参数、被修改的状态，以及它属于同步执行、批处理还是异步队列。

## 精读步骤

1. 打开 `packages/runtime-dom/src/apiCustomElement.ts`，定位公共入口、核心数据结构和主要分派点；记录它向下调用的 2～4 个函数。
2. 打开 `packages/runtime-dom/src/helpers/useCssModule.ts`，定位公共入口、核心数据结构和主要分派点；记录它向下调用的 2～4 个函数。
3. 打开 `packages/runtime-dom/src/helpers/useCssVars.ts`，定位公共入口、核心数据结构和主要分派点；记录它向下调用的 2～4 个函数。
4. 全仓搜索今日核心函数的调用方，分别找出至少一个生产者和消费者。
5. 对照测试，用边界用例修正自己的初始推断。

## 动手实验

1. 定义含 Boolean/Number props 的 custom element
2. 比较 shadowRoot true/false 的 style 注入
3. 验证 Teleport 节点 CSS vars 更新

实验必须记录“输入、预期、实际结果、源码解释”，只记录最终输出不算完成。

## 测试与反证

- [packages/runtime-dom/__tests__/customElement.spec.ts](../../../packages/runtime-dom/__tests__/customElement.spec.ts)
- [packages/runtime-dom/__tests__/helpers/useCssVars.spec.ts](../../../packages/runtime-dom/__tests__/helpers/useCssVars.spec.ts)

```bash
pnpm vitest packages/runtime-dom/__tests__/customElement.spec.ts
pnpm vitest packages/runtime-dom/__tests__/helpers/useCssVars.spec.ts
```

若当前仓库基线阻止测试启动，记录首个环境/语法错误和阻断链，不要把它误判成今日主题的行为错误。

## 闭卷验收

1. Custom Element 重连为何可能延迟卸载？
2. attribute 与 property 反射如何防循环？
3. CSS vars 为什么要处理 Fragment/Teleport？

## 今日完成标准

- [ ] 能不看源码画出主调用链。
- [ ] 能解释至少三个关键分支及其设计权衡。
- [ ] 完成全部实验，并阅读对应测试中的边界案例。
- [ ] 写出一个最小复刻、伪代码或状态转换表。
- [ ] 将仍不确定的问题标注为“事实缺口”或“设计取舍”。

## 导航

上一天：[Day 54｜Suspense、异步依赖与边界切换](./day-54-suspense.md)  
下一天：[Day 56｜AST 节点、SourceLocation 与 VNodeCall](./day-56-compiler-ast.md)

