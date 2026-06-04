// src/nodes/services/_descriptors.js
// Loads and validates every *.service.js descriptor WITHOUT instantiating runtime
// handlers. This keeps build-time codegen (canvas `npm run gen:nodes`) able to import
// the raw descriptors without dragging in the request engine (_engine.js →
// service-utils.js → safe-fetch.js and backend-only deps). The descriptors are pure
// data and _validate.js uses only node builtins, so this module is self-contained
// within src/nodes/services/ — which is all the Docker canvas-build stage needs.
import { readdir } from 'fs/promises';
import { validateDescriptor } from './_validate.js';

const dir = new URL('./', import.meta.url);
const files = (await readdir(dir))
  .filter((f) => f.endsWith('.service.js') && !f.startsWith('_'));

export const serviceDescriptors = [];

for (const file of files) {
  const mod = await import(new URL(file, dir));
  const descriptor = mod.default;
  validateDescriptor(descriptor);
  serviceDescriptors.push(descriptor);
}
