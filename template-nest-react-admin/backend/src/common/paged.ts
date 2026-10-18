/**
 * 列表接口的通用响应信封：`{ items, total, page, pageSize }`。
 *
 * **一个信封，不分页的资源也用它** —— 「不分页」是不分页的行为，不是另一种形状；
 * 两个形状会让前端的列表页各自写一套解析。
 *
 * `total` 是**筛完之后**的条数（不是本页条数），前端不要自己算。
 */
export interface Paged<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

/** 把「一次读全量」的列表包成信封：不分页时 `page` 固定 1、`pageSize` 就是条数。 */
export function toPaged<T>(items: T[]): Paged<T> {
  return { items, total: items.length, page: 1, pageSize: items.length };
}
