export async function delayNode({ input, config }) {
  const { amount = 1, unit = 's' } = config;
  const multipliers = { ms: 1, s: 1_000, m: 60_000 };
  const ms = Number(amount) * (multipliers[unit] ?? 1_000);
  const capped = Math.min(ms, 5 * 60 * 1_000); // 5-minute cap
  await new Promise(r => setTimeout(r, capped));
  return input;
}
