export function toJson(value) {
  if (value && typeof value === 'object' && 'json' in value) return value.json ?? {};
  return withoutBinary(value);
}

export function normalizeItems(value) {
  if (Array.isArray(value)) return value.map((item, index) => normalizeItem(item, index));
  if (Array.isArray(value?.items)) return value.items.map((item, index) => normalizeItem(item, index));
  if (Array.isArray(value?.json)) return value.json.map((item, index) => normalizeItem(item, index));
  return [normalizeItem(value, 0)];
}

export function normalizeItem(value, index = null) {
  if (value && typeof value === 'object' && ('json' in value || 'binary' in value)) {
    return {
      json: value.json ?? withoutBinary(value),
      binary: value.binary ?? {},
      pairedItem: value.pairedItem ?? (index == null ? null : { item: index }),
      ...(value.source !== undefined ? { source: value.source } : {}),
      ...(value.data !== undefined ? { data: value.data } : {}),
    };
  }

  return {
    json: value?.data ?? value ?? {},
    binary: value?.binary ?? {},
    pairedItem: index == null ? null : { item: index },
    ...(value?.source !== undefined ? { source: value.source } : {}),
    ...(value?.data !== undefined ? { data: value.data } : { data: value }),
  };
}

export function makeItem(json, options = {}) {
  return {
    json: json ?? {},
    binary: options.binary ?? {},
    pairedItem: options.pairedItem ?? null,
    ...(options.source !== undefined ? { source: options.source } : {}),
    ...(options.data !== undefined ? { data: options.data } : { data: json }),
  };
}

export function withoutBinary(value) {
  if (!value || typeof value !== 'object') return value ?? {};
  const { binary: _binary, ...rest } = value;
  return rest;
}
