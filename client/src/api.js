// Thin fetch wrapper: throws an Error with the server's message on non-2xx.
async function request(path, options = {}) {
  const res = await fetch(path, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...options.headers },
  });
  const body = await res.json().catch(() => null);
  if (!res.ok) {
    const detail = body?.error?.details?.map((d) => d.message).join(', ');
    throw new Error(detail || body?.error?.message || `Request failed (${res.status})`);
  }
  return body;
}

export const listTickets = ({ status, page, limit = 6 }) => {
  const params = new URLSearchParams({ page, limit });
  if (status) params.set('status', status);
  return request(`/tickets?${params}`);
};

export const getStats = () => request('/tickets/stats');

// A fresh key per form submission: double-clicks or retries of the same submit can't duplicate.
export const createTicket = (data, idempotencyKey) =>
  request('/tickets', {
    method: 'POST',
    headers: { 'Idempotency-Key': idempotencyKey },
    body: JSON.stringify(data),
  });

export const updateTicket = (id, changes) =>
  request(`/tickets/${id}`, { method: 'PATCH', body: JSON.stringify(changes) });
