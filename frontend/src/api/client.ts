import { cacheGet, cacheSet, enqueueMutation, isOnline, shouldQueue, withClientRequestId } from "../offline/sync";

const API_BASE = import.meta.env.VITE_API_URL || "/api/v1";

export type ApiError = {
  message: string;
  code?: string;
  details?: unknown;
};

export class ApiRequestError extends Error {
  status: number;
  code?: string;
  queued?: boolean;
  constructor(message: string, status: number, code?: string, queued = false) {
    super(message);
    this.status = status;
    this.code = code;
    this.queued = queued;
  }
}

function token(): string | null {
  return localStorage.getItem("clinicflow_token");
}

export async function api<T>(path: string, init: RequestInit & { skipQueue?: boolean } = {}): Promise<T> {
  const method = (init.method || "GET").toUpperCase();
  const skipQueue = Boolean(init.skipQueue);
  let body = init.body;
  if (typeof body === "string") {
    try {
      const parsed = JSON.parse(body);
      const tagged = withClientRequestId(path, parsed);
      if (tagged !== parsed) body = JSON.stringify(tagged);
    } catch {
      /* keep original body */
    }
  }

  const headers = new Headers(init.headers);
  if (!headers.has("Content-Type") && body) headers.set("Content-Type", "application/json");
  const t = token();
  if (t) headers.set("Authorization", `Bearer ${t}`);

  let res: Response;
  try {
    res = await fetch(`${API_BASE}${path}`, { ...init, method, body, headers });
  } catch {
    if (method === "GET") {
      const cached = cacheGet(path);
      if (cached !== null) return cached as T;
    }
    if (shouldQueue(path, method) && !isOnline()) {
      enqueueMutation(path, method, typeof body === "string" ? body : undefined);
      throw new ApiRequestError("Saved on this computer. It will sync when the clinic is back online.", 0, "OFFLINE_QUEUED", true);
    }
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
  if (method === "GET") cacheSet(path, payload.data);
  return payload.data as T;
}

export const get = <T>(path: string) => api<T>(path);
export const post = <T>(path: string, body?: unknown) =>
  api<T>(path, { method: "POST", body: body !== undefined ? JSON.stringify(withClientRequestId(path, body)) : undefined });
export const put = <T>(path: string, body?: unknown) =>
  api<T>(path, { method: "PUT", body: body !== undefined ? JSON.stringify(body) : undefined });
export const patch = <T>(path: string, body?: unknown) =>
  api<T>(path, { method: "PATCH", body: body !== undefined ? JSON.stringify(body) : undefined });
