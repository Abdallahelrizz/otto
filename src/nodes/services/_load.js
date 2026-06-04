// src/nodes/services/_load.js
// Runtime registry: reuses the validated descriptors from _descriptors.js and builds a
// type→handler map by wrapping each in the request engine. Imported by src/nodes/index.js.
// (Build-time codegen imports _descriptors.js directly to avoid loading the engine.)
import { makeServiceHandler } from './_engine.js';
import { serviceDescriptors } from './_descriptors.js';

export { serviceDescriptors };

export const serviceHandlers = new Map(
  serviceDescriptors.map((descriptor) => [descriptor.type, makeServiceHandler(descriptor)]),
);
