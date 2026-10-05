export function createSearchDataSource({ search }) {
  if (typeof search !== 'function') throw new TypeError('search must be a function');
  return Object.freeze({ search });
}
