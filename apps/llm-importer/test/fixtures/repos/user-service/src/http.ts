/** Calls notification-service through the API gateway. */
export async function sendNotification(payload: unknown) {
  return fetch('/api/notifications/v1/send', { method: 'POST', body: JSON.stringify(payload) });
}
