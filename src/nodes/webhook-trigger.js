/**
 * Webhook / Manual trigger node.
 * Simply passes the incoming trigger payload through as output.
 * The actual HTTP receiving is handled by the routes layer — by the time
 * this node executes, `input` already contains the trigger payload.
 */
export async function webhookTrigger({ input }) {
  return input;
}
