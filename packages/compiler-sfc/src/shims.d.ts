/**
 * compiler-sfc 类型声明补丁
 *
 * merge-source-map 的类型声明。Vue 使用 source-map-js，
 * 但部分工具（如 @vitejs/plugin-vue）依赖 merge-source-map 包，
 * 此处为缺少类型声明的 merge-source-map 提供基本类型。
 */
declare module 'merge-source-map' {
  export default function merge(oldMap: object, newMap: object): object
}
