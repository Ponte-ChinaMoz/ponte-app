// Comunicação com o servidor.
export class ApiError extends Error { constructor(status, message) { super(message); this.status = status; } }

export async function api(path, { method = 'GET', body } = {}) {
  let res;
  try {
    res = await fetch('/api' + path, {
      method,
      credentials: 'same-origin',
      headers: body !== undefined ? { 'Content-Type': 'application/json' } : {},
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new ApiError(0, 'offline');
  }
  let data = null;
  try { data = await res.json(); } catch { /* sem corpo */ }
  if (!res.ok) throw new ApiError(res.status, data?.error || 'Erro');
  return data;
}

export const get = (p) => api(p);
export const post = (p, body = {}) => api(p, { method: 'POST', body });
export const put = (p, body = {}) => api(p, { method: 'PUT', body });
export const patch = (p, body = {}) => api(p, { method: 'PATCH', body });
export const del = (p) => api(p, { method: 'DELETE', body: {} });
