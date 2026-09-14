const QUEUE_KEY = "clinicflow_outbox";
const CACHE_KEY = "clinicflow_httpcache";
const CACHE_TTL_MS = 5 * 60 * 1000;

export type QueuedMutation = {
  id: string;
  path: string;
  method: string;
  body?: string;
  createdAt: number;
  retries: number;
};

type CacheEntry = { at: number; data: unknown };

function loadQueue(): QueuedMutation[] {
  try {
    return JSON.parse(localStorage.getItem(QUEUE_KEY) || "[]") as QueuedMutation[];
  } catch {
    return [];
  }
}

function saveQueue(items: QueuedMutation[]) {
  localStorage.setItem(QUEUE_KEY, JSON.stringify(items));
}

export function queuedCount() {
  return loadQueue().length;
}

export function enqueueMutation(path: string, method: string, body?: string) {
  const items = loadQueue();
  items.push({
    id: crypto.randomUUID(),
    path,
    method,
    body,
    createdAt: Date.now(),
    retries: 0,
  });
  saveQueue(items);
  window.dispatchEvent(new Event("clinicflow-sync"));
}

export function cacheGet(path: string): unknown | null {
  try {
    const all = JSON.parse(localStorage.getItem(CACHE_KEY) || "{}") as Record<string, CacheEntry>;
    const hit = all[path];
    if (!hit) return null;
    if (Date.now() - hit.at > CACHE_TTL_MS) return null;
    return hit.data;
  } catch {
    return null;
  }
}

export function cacheSet(path: string, data: unknown) {
  try {
    const all = JSON.parse(localStorage.getItem(CACHE_KEY) || "{}") as Record<string, CacheEntry>;
    all[path] = { at: Date.now(), data };
    localStorage.setItem(CACHE_KEY, JSON.stringify(all));
  } catch {
    /* ignore */
  }
}

export function isOnline() {
  return typeof navigator === "undefined" ? true : navigator.onLine;
}

export async function flushQueue(send: (item: QueuedMutation) => Promise<void>) {
  const items = loadQueue();
  if (!items.length) return { flushed: 0, remaining: 0 };
  const remaining: QueuedMutation[] = [];
  let flushed = 0;
  for (const item of items) {
    try {
      await send(item);
      flushed += 1;
    } catch (error) {
      const status = error && typeof error === "object" && "status" in error ? Number((error as { status: number }).status) : 0;
      if (status >= 400 && status < 500) continue;
      remaining.push({ ...item, retries: item.retries + 1 });
    }
  }
  saveQueue(remaining);
  window.dispatchEvent(new Event("clinicflow-sync"));
  return { flushed, remaining: remaining.length };
}

export function shouldQueue(path: string, method: string) {
  if (method === "GET" || method === "HEAD") return false;
  if (path.startsWith("/auth")) return false;
  return true;
}

export function withClientRequestId(path: string, body: unknown) {
  if (!body || typeof body !== "object" || Array.isArray(body)) return body;
  const record = body as Record<string, unknown>;
  if (record.clientRequestId) return body;
  const needsKey =
    path.includes("/payments/encounters/") ||
    path.endsWith("/otc") ||
    path.endsWith("/walk-in") ||
    path.includes("/charges/encounters/");
  if (!needsKey) return body;
  return { ...record, clientRequestId: crypto.randomUUID() };
}
