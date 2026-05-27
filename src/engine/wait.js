export const WAIT = Symbol('WAIT');

export function isWaitDescriptor(value) {
  return value != null && typeof value === 'object' && value[WAIT] === true;
}
