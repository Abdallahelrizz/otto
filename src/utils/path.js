export function getByPath(obj, path) {
  return String(path).trim().split('.').reduce((acc, key) => acc?.[key], obj);
}
