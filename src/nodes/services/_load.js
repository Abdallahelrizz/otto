// src/nodes/services/_load.js
// Auto-loads every *.service.js descriptor (excluding _-prefixed framework files),
// validates it, and builds a type→handler map. Uses top-level await so consumers
// that import this module get a fully-populated registry.
import { readdir } from 'fs/promises';
import { validateDescriptor } from './_validate.js';
import { makeServiceHandler } from './_engine.js';

const dir = new URL('./', import.meta.url);
const files = (await readdir(dir))
  .filter((f) => f.endsWith('.service.js') && !f.startsWith('_'));

export const serviceDescriptors = [];
export const serviceHandlers = new Map();

for (const file of files) {
  const mod = await import(new URL(file, dir));
  const descriptor = mod.default;
  validateDescriptor(descriptor);
  serviceDescriptors.push(descriptor);
  serviceHandlers.set(descriptor.type, makeServiceHandler(descriptor));
}
