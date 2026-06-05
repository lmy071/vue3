# Vue 3 源码 Packages 目录结构说明

> Vue 3 采用 **monorepo** 架构（pnpm workspace），将框架按功能拆分为 12 个独立包。各包之间有严格的分层依赖关系，从底层的能力模块到上层的编译器和运行时，最终汇总为 `vue` 全量包。

## 📁 包目录总览

```
packages/
├── shared/              # 🔧 内部工具函数和常量（最底层）
├── reactivity/          # ⚡ 响应式系统（可独立使用）
├── runtime-core/        # 🧠 平台无关的运行时核心
├── runtime-dom/         # 🌐 DOM 平台的运行时
├── runtime-test/        # 🧪 轻量测试渲染器（Vue 内部测试用）
├── compiler-core/       # 🔨 平台无关的编译器核心
├── compiler-dom/        # 🖥️ DOM 平台的编译器
├── compiler-sfc/        # 📄 单文件组件（.vue）编译器
├── compiler-ssr/        # 🖧 SSR 编译器
├── server-renderer/     # 🖥️ 服务端渲染运行时
├── vue-compat/          # 🔄 Vue 2 → Vue 3 迁移兼容层
└── vue/                 # 🎯 全量入口（包含编译+运行）
```

---

## 🔧 `shared` — 内部工具函数和常量

**npm**: `@vue/shared`

所有包共享的基础设施。提供跨包公用的工具函数、类型守卫、常量定义。

**核心内容**：
- `PatchFlags` / `ShapeFlags` / `SlotFlags` 等位标志枚举
- `camelize` / `capitalize` / `toHandlerKey` 等字符串工具
- `isString` / `isArray` / `isObject` / `isFunction` 等类型判断
- `makeMap`：将字符串转换为高效查找 Map
- `hasChanged`：值变更检测（`!Object.is`）
- `genPropsAccessExp`：生成安全的 props 访问表达式
- `normalizeClass` / `normalizeStyle` / `toDisplayString` 等规范化函数

**定位**：最底层零依赖包，不导出任何 Vue 公开 API。

---

## ⚡ `reactivity` — 响应式系统

**npm**: `@vue/reactivity`

Vue 3 的响应式引擎，可**独立于 Vue 使用**。基于 ES6 Proxy 实现，替代 Vue 2 的 `Object.defineProperty`。

**核心 API**：
| API | 用途 |
|-----|------|
| `ref()` / `shallowRef()` | 创建响应式引用 |
| `reactive()` / `shallowReactive()` | 创建响应式对象 |
| `readonly()` / `shallowReadonly()` | 创建只读代理 |
| `computed()` | 计算属性 |
| `watch()` / `watchEffect()` | 副作用侦听 |
| `effect()` | 底层副作用函数 |
| `toRef()` / `toRefs()` / `toRaw()` | 响应式转换工具 |
| `isRef()` / `isReactive()` / `isReadonly()` | 状态检测 |

**核心机制**：
- **track（追踪）**：在 effect 运行时收集被访问的响应式数据
- **trigger（触发）**：当响应式数据变化时通知依赖的 effect 重新执行
- **Dep**：依赖集合，存储与某个 key 关联的所有 effect
- **ReactiveEffect**：封装了 `fn` + `scheduler` 的可调度副作用

**依赖关系**：仅依赖 `shared`。

---

## 🧠 `runtime-core` — 平台无关的运行时核心

**npm**: `@vue/runtime-core`

**仅用于类型定义和构建自定义渲染器，不直接用于应用开发。**

与平台（DOM / Native / Canvas）解耦的运行时核心层。定义了组件实例、虚拟 DOM 系统、生命周期、依赖注入等所有框架机制。

**核心模块**：

| 模块 | 职责 |
|------|------|
| `vnode.ts` | VNode 创建与规范化（`createVNode`、`h`） |
| `component.ts` | 组件实例创建、挂载、更新（`createComponentInstance`、`setupComponent`） |
| `renderer.ts` | 通用渲染器工厂（接收平台节点操作回调） |
| `scheduler.ts` | 异步任务调度队列 |
| `componentProps.ts` | Props 解析、验证与更新 |
| `componentEmits.ts` | 事件声明与规范化 |
| `componentSlots.ts` | Slot 初始化与管理 |
| `apiCreateApp.ts` | `createApp()` 的基础实现 |
| `apiLifecycle.ts` | 生命周期钩子注册（`onMounted`、`onUpdated` 等） |
| `apiInject.ts` | 依赖注入系统（`provide` / `inject`） |
| `directives.ts` | 自定义指令生命周期 |
| `hydration.ts` | SSR 客户端注水（hydration） |
| `hmr.ts` | 模块热替换支持 |

**核心类型**：
- `VNode` / `VNodeTypes` / `VNodeChild` → 虚拟节点
- `ComponentInternalInstance` → 组件内部实例（~500 个属性）
- `RenderFunction` / `ComponentOptions` / `SetupContext`

**依赖关系**：`reactivity` → `shared`。不依赖任何 DOM API。

---

## 🌐 `runtime-dom` — DOM 平台的运行时

**npm**: `@vue/runtime-dom`

面向浏览器 DOM 的运行时，是 `runtime-core` 的 DOM 平台实现。这是开发者在项目中实际使用的运行时。

**核心职责**：
1. **平台适配**：为 `runtime-core` 的渲染器提供 DOM 操作回调
   - `createElement` / `createText` / `createComment` → `document.createElement` 等
   - `insert` / `remove` / `setElementText` → DOM 操作
   - `patchProp` → 处理 HTML attribute、DOM property、class、style、event 的差异更新
2. **扩展 VNode 类型**：添加 `class` / `style` 的运行时规范化
3. **事件系统**：事件修饰符（`.passive` / `.capture` / `.once`）的运行时支持
4. **Transition 组件**：`<Transition>` / `<TransitionGroup>` 的 DOM 实现

**依赖关系**：`runtime-core` → `reactivity` → `shared`。

---

## 🧪 `runtime-test` — 轻量测试渲染器

**npm**: `@vue/runtime-test`

**Vue 内部测试专用**。提供一个极简的、不走真实 DOM 的渲染器，输出的 VNode 树是一个普通 JS 对象，便于断言验证。

**用途**：
- 确保 `runtime-core` 的逻辑与 DOM 解耦
- 测试速度远超 JSDOM（纯 JS 对象操作，无 DOM 模拟开销）
- 可作为自定义渲染器的参考实现

**依赖关系**：`runtime-core` → `shared`。不发布到 npm 供外部使用。

---

## 🔨 `compiler-core` — 平台无关的编译器核心

**npm**: `@vue/compiler-core`

模板编译器的核心实现，与平台无关。负责将 Vue 模板字符串解析为 AST（抽象语法树），再转换为可执行的渲染函数 AST。

**编译流程（三阶段）**：

```
模板字符串 → parse → AST → transform → JavaScript AST → generate → 渲染函数代码
```

| 阶段 | 职责 | 核心文件 |
|------|------|---------|
| **parse** | 将模板字符串解析为 AST | `parse.ts`、`tokenizer.ts` |
| **transform** | AST 节点转换（指令、插值、静态提升等） | `transform.ts`、`transforms/` 下 15 个文件 |
| **generate** | 将 JavaScript AST 生成可执行代码 | `codegen.ts` |

**transforms 目录**（你已全部注释）：
`vOnce` / `vMemo` / `vBind` / `vOn` / `vModel` / `vFor` / `vIf` / `vSlot` / `transformText` / `transformSlotOutlet` / `transformElement` / `transformExpression` / `transformVBindShorthand` / `cacheStatic` / `noopDirectiveTransform`

**依赖关系**：仅依赖 `shared` + `@babel/parser`。

---

## 🖥️ `compiler-dom` — DOM 平台的编译器

**npm**: `@vue/compiler-dom`

在 `compiler-core` 基础上，添加 DOM 平台特有的编译优化和指令处理。

**核心扩展**：
- 事件修饰符的编译时处理（`.passive` / `.capture` 等）
- 特殊 HTML 标签和属性的处理（`<input>` 的 type 动态切换、`<textarea>` 的 value 绑定等）
- DOM 特定的内置组件（`<Transition>` / `<TransitionGroup>` / `<Teleport>` / `<KeepAlive>`）
- 警告信息中嵌入正确的标签名和属性名

**依赖关系**：`compiler-core` → `shared`。

---

## 📄 `compiler-sfc` — 单文件组件编译器

**npm**: `@vue/compiler-sfc`

**自 3.2.13+ 已内置在 `vue` 包中，可通过 `vue/compiler-sfc` 深导入访问。**

将 `.vue` 单文件组件（SFC）拆分为 `<template>`、`<script>`、`<style>` 三部分并分别编译。

**核心模块**：

| 模块 | 职责 |
|------|------|
| `parse.ts` | 解析 `.vue` 文件的三个块（template / script / style） |
| `compileTemplate.ts` | 将 template 块编译为 `render` 函数 |
| `compileScript.ts` | 编译 `<script setup>` 语法糖（类型推导、ref 展开、defineProps 等宏） |
| `compileStyle.ts` | 编译 `<style>` 块（scoped、CSS Modules、预处理器支持） |
| `templateUtils.ts` | template AST 遍历和转换工具 |
| `styleUtils.ts` | scoped style 的 hash 生成和选择器注入 |

**关键特性**：
- `<script setup>` 编译时语法糖
- `defineProps` / `defineEmits` / `defineExpose` 宏的编译时处理
- Scoped CSS 的 hash 和 attribute 注入
- CSS Modules 支持
- CSS `v-bind()`：在 style 中引用组件数据

**依赖关系**：`compiler-core` + `compiler-dom` + `compiler-ssr` + `shared`。

---

## 🖧 `compiler-ssr` — SSR 编译器

**npm**: `@vue/compiler-ssr`

生成服务端渲染代码的编译器。将模板编译为字符串拼接代码，替代客户端的 VNode 创建。

**与客户端编译的核心区别**：
- 输出是字符串拼接而非 `createVNode` 调用
- 不需要 patchFlag、静态提升等客户端优化
- 不需要虚拟 DOM diff

**依赖关系**：`compiler-dom` + `shared`。

---

## 🖥️ `server-renderer` — 服务端渲染运行时

**npm**: `@vue/server-renderer`

**自 3.2.13+ 已内置在 `vue` 包中，可通过 `vue/server-renderer` 深导入访问。**

服务器端渲染的运行时支持，负责将 Vue 组件渲染为 HTML 字符串。

**核心 API**：
| API | 用途 |
|-----|------|
| `renderToString()` | 将 Vue 应用渲染为 HTML 字符串 |
| `renderToNodeStream()` | Node.js Stream 渲染（流式输出） |
| `renderToWebStream()` | Web Stream 渲染 |
| `renderToSimpleStream()` | 简单 Stream 渲染（渐进式 SSR） |

**与客户端渲染的关键差异**：
- 不创建真实 DOM，生成 HTML 字符串
- 没有响应式更新（渲染一次后无需追踪变化）
- 生命周期只执行 `beforeCreate` / `created`（无 `mounted` 等）
- 支持 Teleport 的 HTML 输出

**依赖关系**：`runtime-core` + `shared`。

---

## 🔄 `vue-compat` — Vue 2 迁移兼容层

**npm**: `@vue/compat`

"迁移构建"（Migration Build）。提供一个行为可配置的 Vue 2 兼容层，使 Vue 2 项目能逐步迁移到 Vue 3。

**核心机制**：
- 默认以 **Vue 2 模式**运行——大部分公开 API 行为与 Vue 2 完全一致
- 对 Vue 3 中已变更或废弃的功能，运行时发出**警告**
- 兼容性可按**组件粒度**启用/禁用（`compatConfig`）
- 编译器也做相应兼容处理（如 `v-bind` 对象合并顺序）

**典型兼容场景**：
- `v-bind` 对象顺序（Vue 2: 后声明的覆盖前声明）
- `$listeners` 移除（Vue 3 整合进 `$attrs`）
- 过滤器（filters）
- `Vue.extend` / `Vue.component` 等全局 API

**依赖关系**：`vue` + `shared`。

---

## 🎯 `vue` — 全量入口

**npm**: `vue`

最终发布给用户使用的全量包。整合了编译器和运行时，提供所有公开 API。

**入口结构与体积优化**：

```
vue
├── dist/vue.global.js       # 浏览器全局构建（含编译+运行）
├── dist/vue.runtime.global.js # 浏览器运行时构建（不含编译器）
├── dist/vue.esm-browser.js  # 浏览器 ESM 构建
└── dist/vue.cjs.js          # Node.js CommonJS 构建
```

**工作模式**：
- **运行时 + 编译器**：支持 `template` 选项，模板在客户端编译
- **仅运行时**：需要预编译模板（配合构建工具），体积更小

**依赖关系**：`compiler-dom` + `compiler-sfc` + `runtime-dom` → `compiler-core` + `runtime-core` → `reactivity` → `shared`。（全量依赖链）

---

## 📊 依赖关系图

```
                         ┌─────────────┐
                         │    vue      │  ← 全量入口
                         └──────┬──────┘
                    ┌───────────┼───────────┐
                    │           │           │
              ┌─────┴─────┐ ┌──┴───┐ ┌─────┴──────────┐
              │ compiler- │ │ comp-│ │  server-       │
              │   sfc     │ │ iler-│ │  renderer      │
              └─────┬─────┘ │  ssr │ └───────┬────────┘
                    │       └──┬───┘         │
              ┌─────┴──────┐  │    ┌────────┴────────┐
              │ compiler-  │  │    │   runtime-dom   │
              │   dom      │──┘    └───────┬────────┘
              └──────┬─────┘               │
                     │              ┌──────┴────────┐
              ┌──────┴──────┐      │  runtime-core  │
              │ compiler-   │      └───────┬────────┘
              │   core      │              │
              └──────┬──────┘       ┌──────┴────────┐
                     │              │  reactivity    │
                     │              └───────┬────────┘
                     │                     │
                     └──────────┬──────────┘
                           ┌────┴────┐
                           │ shared  │  ← 最底层
                           └─────────┘
```

**关键设计原则**：
1. **编译与运行分离**：用户可以在构建时预编译模板，runtime-only 版本体积缩小 ~30%
2. **核心与平台解耦**：`runtime-core` 是渲染器框架，`runtime-dom` 是浏览器适配层
3. **编译器分层**：`compiler-core` 是编译流程框架，`compiler-dom`/`compiler-ssr` 是平台适配
4. **响应式可独立**：`@vue/reactivity` 是纯数据层，可脱离 Vue 在其他项目中使用

---

*生成时间：2026-06-05 | 基于 Vue 3 v3.5.35 源码结构*
