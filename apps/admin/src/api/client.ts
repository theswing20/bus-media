/** Токен админки хранится в localStorage: при первом заходе спросим. */
export function getToken(): string {
  let t = localStorage.getItem("adminToken");
  if (!t) { t = prompt("Админский токен (ADMIN_TOKEN из .env)") ?? ""; localStorage.setItem("adminToken", t); }
  return t;
}

export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const isForm = init.body instanceof FormData;
  const res = await fetch(`/api/admin${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${getToken()}`, ...(isForm ? {} : { "Content-Type": "application/json" }), ...(init.headers ?? {}) },
  });
  if (res.status === 401) { localStorage.removeItem("adminToken"); location.reload(); }
  if (!res.ok) throw new Error(`${res.status}: ${await res.text()}`);
  return res.json();
}
