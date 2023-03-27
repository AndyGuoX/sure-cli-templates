/**
 * @description 判断变量是否是数组且不为空
 * @param data
 * @returns {boolean}
 */
export const isNotEmptyArray = (data) => {
  return Array.isArray(data) && data.length > 0;
};

/**
 * @description 判断变量是否为对象且不为空
 * @param data
 * @returns {boolean}
 */
export const isNotEmptyObject = (data) => {
  return Object.prototype.toString.call(data) === '[object Object]' && Object.keys(data).length > 0;
};

/**
 * 获取URL参数
 * @returns {Object}
 */
export function getUrlParams() {
  // 兼容hash在前和在后的情况
  const search = location.search ? location.search.split('?')[1] : '';
  const hashSearch = location.hash ? location.hash.split('?')[1] : '';
  const query = `${search}&${hashSearch}`;

  const vars = query.split('&');
  const params = {};
  for (let i = 0; i < vars.length; i++) {
    const pair = vars[i].split('=');
    if (pair[1]) {
      params[pair[0]] = pair[1];
    }
  }

  return params;
}
