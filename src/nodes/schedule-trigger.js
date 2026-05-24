// Schedule trigger is fired by BullMQ job schedulers for active workflows.
export async function scheduleTrigger({ input }) {
  return input ?? {};
}
