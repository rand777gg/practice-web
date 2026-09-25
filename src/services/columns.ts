/**
 * 列集的类型工具。
 *
 * 为什么需要：字段集是一段字符串，而 mapper 读的是具体字段。两者分开写就一定会漂移 ——
 * 少写一列不会报错，只会在某个页面上读到 undefined，而且往往只在特定分支里出现。
 * 这里把「列集字符串必须覆盖 mapper 读的全部字段」变成编译期检查。
 */

/** 逗号分隔的列集字符串 → 字段名联合类型 */
export type SelectKeys<S extends string> = S extends `${infer Head}, ${infer Rest}` ? Head | SelectKeys<Rest> : S

/** 漏掉的列；为空即通过 */
export type MissingColumns<T, Columns extends string> = Exclude<keyof T, SelectKeys<Columns>>

/** 断言类型：覆盖完整时是 unknown（不干扰），否则报出缺了哪些列 */
export type ColumnsCovered<T, Columns extends string> =
  MissingColumns<T, Columns> extends never ? unknown : { __missing_columns__: MissingColumns<T, Columns> }

/**
 * 建一个列集常量：`const COLS = assertColumns<RowType>()('a, b, c')`
 * 返回的是原字面量类型（PostgREST 的 select 解析需要字面量），漏列则在赋值处编译失败。
 */
export function assertColumns<T>() {
  return <S extends string>(columns: S & ColumnsCovered<T, S>): S => columns
}
