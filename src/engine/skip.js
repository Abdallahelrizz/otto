// Sentinel value propagated through skipped branches (e.g. inactive side of an IF node).
// Defined here to avoid circular imports between executor and node handlers.
export const SKIP = Symbol('SKIP');
