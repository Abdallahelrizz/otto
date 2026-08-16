export function getByPath(obj, path) {
  const keys = String(path).trim().split('.');
  // Prototype meta-properties previously let untrusted dotted paths escape own data.
  if (keys.some((key) => key === '__proto__' || key === 'prototype' || key === 'constructor')) return undefined;
  return keys.reduce((acc, key) => acc == null || !Object.hasOwn(acc, key) ? undefined : acc[key], obj);
}
