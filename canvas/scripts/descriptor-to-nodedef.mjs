// canvas/scripts/descriptor-to-nodedef.mjs
// Pure mapping: a backend service descriptor -> a frontend NodeTypeDef-shaped object.
// Used by gen-nodes.mjs to emit canvas/src/generated/serviceNodeDefs.ts.

const CRED_TYPES = {
  bearer: ['api_key', 'bearer_token'],
  header: ['api_key', 'bearer_token'],
  basic: ['basic'],
  query: ['api_key'],
};

export function humanize(key) {
  return String(key)
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2') // camelCase -> camel Case
    .replace(/[_-]+/g, ' ')                  // snake/kebab -> spaces
    .trim()
    .split(/\s+/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

export function descriptorToNodeDef(d) {
  const opKeys = Object.keys(d.operations ?? {});
  const defaultOperation = d.defaultOperation ?? opKeys[0];

  const operations = {};
  for (const [opKey, op] of Object.entries(d.operations ?? {})) {
    operations[opKey] = {
      label: op.label ?? humanize(opKey),
      fields: (op.fields ?? []).map((f) => ({
        key: f.key,
        label: f.label ?? humanize(f.key),
        type: f.type ?? 'text',
        ...(f.required ? { required: true } : {}),
      })),
    };
  }

  const color = d.serviceColor ?? '#64748b';
  return {
    type: d.type,
    category: d.category ?? 'integrations',
    label: d.label,
    description: d.description ?? `Work with ${d.label}`,
    color,
    tint: 'service',
    serviceColor: color,
    serviceCatalog: d.credential?.catalog,
    credentialTypes: CRED_TYPES[d.auth?.kind] ?? ['api_key'],
    operations,
    defaultConfig: { credentialId: '', operation: defaultOperation },
    fields: [],
    handles: { in: [{ id: 'input' }], out: [{ id: 'output' }] },
  };
}
