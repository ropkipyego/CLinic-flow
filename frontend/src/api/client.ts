const API_BASE = import.meta.env.VITE_API_URL || "/api/v1";

export type ApiError = {
  message: string;
  code?: string;
  details?: unknown;
};

export class ApiRequestError extends Error {
  status: number;
  code?: string;
  constructor(message: string, status: number, code?: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

function token(): string | null {
  return localStorage.getItem("clinicflow_token");
}

export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  if (!headers.has("Content-Type") && init.body) headers.set("Content-Type", "application/json");
  const t = token();
  if (t) headers.set("Authorization", `Bearer ${t}`);

  let res: Response;
  try {
    res = await fetch(`${API_BASE}${path}`, { ...init, headers });
  } catch {
    throw new ApiRequestError("Unable to reach the server. Please check your connection and try again.", 0);
  }

  const text = await res.text();
  const payload = text ? JSON.parse(text) : null;
  if (!res.ok || payload?.success === false) {
    const message = payload?.error?.message || `Request failed (${res.status}).`;
    if (res.status === 401) {
      localStorage.removeItem("clinicflow_token");
    }
    throw new ApiRequestError(message, res.status, payload?.error?.code);
  }
  return payload.data as T;
}

export const get = <T>(path: string) => api<T>(path);
export const post = <T>(path: string, body?: unknown) =>
  api<T>(path, { method: "POST", body: body !== undefined ? JSON.stringify(body) : undefined });
export const put = <T>(path: string, body?: unknown) =>
  api<T>(path, { method: "PUT", body: body !== undefined ? JSON.stringify(body) : undefined });
export const patch = <T>(path: string, body?: unknown) =>
  api<T>(path, { method: "PATCH", body: body !== undefined ? JSON.stringify(body) : undefined });
