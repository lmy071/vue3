# Vue 3.5.35 内核：75 天源码学习总纲

本课程已经完全改为按天组织，不再使用周规划。Day 01～75 每天约 3 小时，总投入约 225 小时。

## 学习入口

- [75 天总导航](./docs/source-reading/daily/README.md)
- [Day 01：仓库全景与包依赖](./docs/source-reading/daily/day-01-repository-map.md)
- [Day 75：HMR、Devtools、Compat 与全内核验收](./docs/source-reading/daily/day-75-final-synthesis.md)

## 六条最终主链

```text
响应式：Proxy/ref → track/Dep/Link → trigger/batch → effect scheduler
更新：state write → queueJob → componentUpdateFn → renderComponentRoot → patch
挂载：createApp → render → patch → mountComponent → setupRenderEffect → host ops
编译：template → tokenizer/parser → transform → codegen → render function
SFC：descriptor → compileScript/template/style → bundler module → component
SSR：compiler-ssr → server renderer/buffer/stream → HTML → hydrateNode
```

## 使用规则

每天只打开一个 Day 文档，完成其中的源码入口、实验、测试和闭卷验收。未通过当天验收就顺延，不按自然周赶进度。每 5 天做一次累计回顾，但不另建周任务。

