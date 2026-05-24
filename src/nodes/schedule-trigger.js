// Schedule trigger — pass-through handler (the scheduler runner is a separate cron service, not yet wired)
export async function scheduleTrigger({ input }) {
  return input;
}
