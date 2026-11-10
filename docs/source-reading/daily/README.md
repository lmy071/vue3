# Vue 3.5.35 源码阅读：75 天学习资料

> 不使用周次。每天约 3 小时，总投入约 225 小时；每个 Day 都是独立、可验收的源码学习单元。

## 阶段地图

| 阶段 | 天数 | 核心目标 |
|---|---|---|
| 工程基线 | Day 01–04 | 仓库、别名、构建、测试与可执行基线 |
| 共享协议 | Day 05–07 | 通用工具、规范化、安全与 Flags |
| 响应式系统 | Day 08–20 | Proxy、集合、Dep/Link、effect、scope、ref、computed、watch |
| 运行时模型 | Day 21–31 | VNode、组件实例、props/emits/slots、App API、scheduler |
| 渲染器 | Day 32–45 | HostConfig、patch、组件更新、diff、LIS、卸载、hydration |
| DOM 与内置组件 | Day 46–55 | 真实 DOM、指令、Transition、KeepAlive、Teleport、Suspense、自定义元素 |
| 编译器 | Day 56–66 | AST、Tokenizer、Parser、Transform、Codegen、compiler-dom |
| SFC | Day 67–70 | Descriptor、compileScript、宏、Scoped CSS 与资源转换 |
| SSR | Day 71–73 | SSR 编译、字符串/流式渲染、Hydration |
| 工程复盘 | Day 74–75 | 发布形态、运行时编译、HMR、Devtools、Compat 与总验收 |

## 每日固定闭环

1. 先跑一个 10～30 行 API 实验，明确输入与外部结果。
2. 从当日列出的入口文件跟踪主调用链。
3. 记录对象模型、状态转换、调用链和设计权衡。
4. 阅读对应测试，用边界用例反证自己的推断。
5. 完成最小复刻或状态表。
6. 闭卷回答验收题后再进入下一天。

## Day 01～75

| Day | 阶段 | 主题 | 资料 |
|---:|---|---|---|
| 01 | 工程基线 | 仓库全景与包依赖 | [打开](./day-01-repository-map.md) |
| 02 | 工程基线 | 源码别名与 TypeScript 配置 | [打开](./day-02-aliases-typescript.md) |
| 03 | 工程基线 | 开发构建、正式构建与产物格式 | [打开](./day-03-build-system.md) |
| 04 | 工程基线 | 测试分层、类型检查与可执行基线 | [打开](./day-04-tests-baseline.md) |
| 05 | 共享协议 | general.ts 与 makeMap 基础工具 | [打开](./day-05-shared-general.md) |
| 06 | 共享协议 | 输入规范化、展示与 HTML 安全 | [打开](./day-06-shared-normalization-security.md) |
| 07 | 共享协议 | ShapeFlags、PatchFlags 与 SlotFlags | [打开](./day-07-flags-contract.md) |
| 08 | 响应式系统 | reactive 工厂与代理缓存 | [打开](./day-08-reactive-factory.md) |
| 09 | 响应式系统 | BaseReactiveHandler.get 读取路径 | [打开](./day-09-base-getter.md) |
| 10 | 响应式系统 | setter、delete、has 与 ownKeys | [打开](./day-10-base-mutations.md) |
| 11 | 响应式系统 | 数组方法的响应式适配 | [打开](./day-11-array-instrumentations.md) |
| 12 | 响应式系统 | Map、Set 与弱集合代理 | [打开](./day-12-collection-handlers.md) |
| 13 | 响应式系统 | Dep、Link 与依赖图 | [打开](./day-13-dep-link-model.md) |
| 14 | 响应式系统 | ReactiveEffect.run 与增量清理 | [打开](./day-14-effect-run-cleanup.md) |
| 15 | 响应式系统 | trigger、notify 与响应式批处理 | [打开](./day-15-effect-notify-batch.md) |
| 16 | 响应式系统 | EffectScope 与资源生命周期 | [打开](./day-16-effect-scope.md) |
| 17 | 响应式系统 | ref、toRef、proxyRefs 与 customRef | [打开](./day-17-ref-system.md) |
| 18 | 响应式系统 | computed 的双重身份与版本快路径 | [打开](./day-18-computed-system.md) |
| 19 | 响应式系统 | watch source、traverse 与 cleanup | [打开](./day-19-watch-core.md) |
| 20 | 响应式系统 | 响应式全链路复刻与验收 | [打开](./day-20-reactivity-synthesis.md) |
| 21 | 运行时模型 | VNode 数据模型与特殊节点 | [打开](./day-21-vnode-model.md) |
| 22 | 运行时模型 | createVNode、normalizeChildren 与 Block | [打开](./day-22-create-vnode-normalization.md) |
| 23 | 运行时模型 | h API 与编译器运行时 Helpers | [打开](./day-23-h-render-helpers.md) |
| 24 | 运行时模型 | 组件实例创建与 setup 流程 | [打开](./day-24-component-instance-setup.md) |
| 25 | 运行时模型 | Props 声明规范化、初始化与更新 | [打开](./day-25-component-props.md) |
| 26 | 运行时模型 | Emits 规范化与事件派发 | [打开](./day-26-component-emits.md) |
| 27 | 运行时模型 | Slots 初始化、更新与渲染上下文 | [打开](./day-27-component-slots.md) |
| 28 | 运行时模型 | 组件公开代理与 Options API 汇合 | [打开](./day-28-public-instance-options.md) |
| 29 | 运行时模型 | createApp、Provide/Inject 与生命周期 API | [打开](./day-29-app-context-apis.md) |
| 30 | 运行时模型 | 异步组件与错误边界 | [打开](./day-30-async-error-handling.md) |
| 31 | 运行时模型 | Scheduler、nextTick 与任务排序 | [打开](./day-31-runtime-scheduler.md) |
| 32 | 渲染器 | runtime-test 与 Host Renderer 契约 | [打开](./day-32-runtime-test-host.md) |
| 33 | 渲染器 | render、patch 与节点类型分派 | [打开](./day-33-renderer-patch-dispatch.md) |
| 34 | 渲染器 | mountElement 首次元素挂载 | [打开](./day-34-mount-element.md) |
| 35 | 渲染器 | patchElement 与 Props 快路径 | [打开](./day-35-patch-element.md) |
| 36 | 渲染器 | Fragment、Static VNode 与 Block Tree | [打开](./day-36-fragments-static-blocks.md) |
| 37 | 渲染器 | mountComponent 首次组件挂载 | [打开](./day-37-mount-component.md) |
| 38 | 渲染器 | setupRenderEffect 与首次组件渲染 | [打开](./day-38-setup-render-effect.md) |
| 39 | 渲染器 | 组件更新判定与更新分支 | [打开](./day-39-component-update-path.md) |
| 40 | 渲染器 | patchChildren 的文本、数组与空值转换 | [打开](./day-40-children-transitions.md) |
| 41 | 渲染器 | patchKeyedChildren 五阶段 | [打开](./day-41-keyed-diff.md) |
| 42 | 渲染器 | LIS 与最小移动 | [打开](./day-42-lis-move.md) |
| 43 | 渲染器 | 卸载、移动、Template Ref 与 Directives | [打开](./day-43-unmount-ref-directives.md) |
| 44 | 渲染器 | Hydration 核心遍历与节点接管 | [打开](./day-44-hydration-overview.md) |
| 45 | 渲染器 | Renderer 全链路复刻与验收 | [打开](./day-45-runtime-integration.md) |
| 46 | DOM 平台 | runtime-dom 入口与 nodeOps | [打开](./day-46-runtime-dom-entry-nodeops.md) |
| 47 | DOM 平台 | patchProp、Attributes 与 DOM Properties | [打开](./day-47-dom-attrs-props.md) |
| 48 | DOM 平台 | Class、Style 与事件 Invoker | [打开](./day-48-dom-class-style-events.md) |
| 49 | DOM 平台 | v-model、v-show 与事件修饰符 | [打开](./day-49-dom-directives.md) |
| 50 | 内置组件 | BaseTransition 状态机 | [打开](./day-50-base-transition.md) |
| 51 | 内置组件 | TransitionGroup 与 FLIP 列表动画 | [打开](./day-51-transition-group.md) |
| 52 | 内置组件 | KeepAlive 缓存、激活与淘汰 | [打开](./day-52-keep-alive.md) |
| 53 | 内置组件 | Teleport 的双容器渲染与移动 | [打开](./day-53-teleport.md) |
| 54 | 内置组件 | Suspense、异步依赖与边界切换 | [打开](./day-54-suspense.md) |
| 55 | DOM 平台 | Custom Element、CSS Module 与 CSS Vars | [打开](./day-55-custom-elements-css.md) |
| 56 | 编译器 | AST 节点、SourceLocation 与 VNodeCall | [打开](./day-56-compiler-ast.md) |
| 57 | 编译器 | Tokenizer 状态机 | [打开](./day-57-compiler-tokenizer.md) |
| 58 | 编译器 | 元素、文本、插值与注释解析 | [打开](./day-58-compiler-parser-basics.md) |
| 59 | 编译器 | 属性、指令、表达式与命名空间 | [打开](./day-59-compiler-parser-directives.md) |
| 60 | 编译器 | Transform 遍历、Context 与退出回调 | [打开](./day-60-transform-context.md) |
| 61 | 编译器 | v-if 与 v-for 结构改写 | [打开](./day-61-transform-if-for.md) |
| 62 | 编译器 | 表达式改写、文本合并与作用域 | [打开](./day-62-transform-expression-text.md) |
| 63 | 编译器 | Element、Props 与指令 Transform | [打开](./day-63-transform-element-props.md) |
| 64 | 编译器 | Slots、Memo、Once 与静态缓存 | [打开](./day-64-transform-slots-cache.md) |
| 65 | 编译器 | Codegen Context 与 Render Function 输出 | [打开](./day-65-compiler-codegen.md) |
| 66 | 编译器 | compiler-dom 平台扩展与静态字符串化 | [打开](./day-66-compiler-dom.md) |
| 67 | SFC | SFC Descriptor、模板与样式编译 | [打开](./day-67-sfc-parse-template-style.md) |
| 68 | SFC | compileScript 上下文与 Binding Metadata | [打开](./day-68-sfc-compile-script.md) |
| 69 | SFC | defineProps/Emits/Model/Slots 与类型解析 | [打开](./day-69-sfc-macros-types.md) |
| 70 | SFC | Top-level Await、Scoped CSS、资源 URL 与 CSS Vars | [打开](./day-70-sfc-advanced.md) |
| 71 | SSR | SSR 编译器与专用 Helpers | [打开](./day-71-compiler-ssr.md) |
| 72 | SSR | 服务端组件渲染、Buffer 与 Stream | [打开](./day-72-server-renderer.md) |
| 73 | SSR | Hydration、Mismatch 分类与恢复 | [打开](./day-73-hydration-deep-dive.md) |
| 74 | 工程复盘 | Vue 聚合入口、运行时编译与发布形态 | [打开](./day-74-vue-build-runtime.md) |
| 75 | 工程复盘 | HMR、Devtools、Compat 与全内核验收 | [打开](./day-75-final-synthesis.md) |

## 学习纪律

- 不以“看完文件”为完成标准，以能解释不变量、调用顺序和回退路径为准。
- 开发警告、compat、SSR、类型分支第一遍可以标记，但必须在对应 Day 回收。
- 注释只作导航，所有结论至少由源码、测试、实验三者中的两项支持。
- 某天未达成验收时顺延，不跳过实验，不需要等待自然日历。
- 每 5 天闭卷画一次累计调用链，但不建立周计划。

## 最终验收

- [ ] 画出包依赖图和响应式、挂载、更新、编译、SFC、SSR 六条主链。
- [ ] 解释一次 reactive 写入如何经批处理、scheduler、render effect 更新 DOM。
- [ ] 手算 keyed diff 与 LIS，并解释 compiler flags 如何让 renderer 走快路径。
- [ ] 把模板从 token/AST/transform/codegen 追到 VNode 和 DOM patch。
- [ ] 解释组件、内置组件、SSR 与 hydration 的关键状态机。
- [ ] 完成 mini-reactivity 与 mini-renderer，最终形成 1,500～3,000 行 mini-vue 或等价实现。

