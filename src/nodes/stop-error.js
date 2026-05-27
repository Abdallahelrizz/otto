export async function stopError({ config }) {
  const message = config.message || 'Workflow stopped';
  const error = new Error(message);
  error.code = 'STOP_ERROR';
  throw error;
}
