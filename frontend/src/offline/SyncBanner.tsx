import { useEffect, useState } from "react";
import { flushQueue, isOnline, queuedCount, type QueuedMutation } from "./sync";
import { api } from "../api/client";
import { Icons } from "../components/icons";

export function SyncBanner() {
  const [online, setOnline] = useState(isOnline());
  const [pending, setPending] = useState(queuedCount());
  const [syncing, setSyncing] = useState(false);

  useEffect(() => {
    const refresh = () => {
      setOnline(isOnline());
      setPending(queuedCount());
    };
    window.addEventListener("online", refresh);
    window.addEventListener("offline", refresh);
    window.addEventListener("clinicflow-sync", refresh);
    return () => {
      window.removeEventListener("online", refresh);
      window.removeEventListener("offline", refresh);
      window.removeEventListener("clinicflow-sync", refresh);
    };
  }, []);

  useEffect(() => {
    if (!online || pending === 0) return;
    let cancelled = false;
    setSyncing(true);
    void flushQueue(async (item: QueuedMutation) => {
      await api(item.path, {
        method: item.method,
        body: item.body,
        skipQueue: true,
        headers: item.body ? { "Content-Type": "application/json" } : undefined,
      });
    }).finally(() => {
      if (!cancelled) {
        setSyncing(false);
        setPending(queuedCount());
      }
    });
    return () => {
      cancelled = true;
    };
  }, [online, pending]);

  if (online && pending === 0 && !syncing) return null;

  return (
    <div
      className={`mb-4 flex items-center gap-2 rounded-lg px-4 py-2 text-sm ${
        online ? "bg-sky-50 text-sky-900" : "bg-amber-50 text-amber-900"
      }`}
    >
      {online ? <Icons.sync className={`h-4 w-4 ${syncing ? "animate-spin" : ""}`} /> : <Icons.offline className="h-4 w-4" />}
      <span>
        {online
          ? syncing
            ? `Syncing ${pending} saved action${pending === 1 ? "" : "s"}…`
            : `${pending} action${pending === 1 ? "" : "s"} waiting to sync`
          : "You are offline. New work is saved on this computer and will sync when the clinic is back online."}
      </span>
    </div>
  );
}
