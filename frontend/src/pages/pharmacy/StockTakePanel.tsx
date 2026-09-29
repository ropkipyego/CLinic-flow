import { FormEvent, useEffect, useState } from "react";
import { get, patch, post } from "../../api/client";
import { Button, Empty, Field, StatusBadge, Table, inputClass } from "../../components/ui";

export function StockTakePanel({
  onError,
  onOk,
  onStockChanged,
}: {
  onError: (m: string) => void;
  onOk: (m: string) => void;
  onStockChanged: () => Promise<void>;
}) {
  const [takes, setTakes] = useState<any[]>([]);
  const [current, setCurrent] = useState<any>(null);
  const [counts, setCounts] = useState<Record<string, string>>({});

  async function load() {
    try {
      setTakes(await get("/procurement/stock-takes"));
    } catch (e) {
      onError(e instanceof Error ? e.message : "Unable to load stock takes.");
    }
  }

  useEffect(() => {
    void load();
  }, []);

  function applyTake(take: any) {
    setCurrent(take);
    const next: Record<string, string> = {};
    for (const line of take.lines || []) {
      next[line.medicineId] = line.countedQty != null ? String(line.countedQty) : "";
    }
    setCounts(next);
  }

  async function start() {
    try {
      const take = await post<any>("/procurement/stock-takes", {});
      applyTake(take);
      onOk(`Stock take ${take.takeNumber} opened. Enter physical counts, then post.`);
      await load();
    } catch (err) {
      onError(err instanceof Error ? err.message : "Unable to start a stock take.");
    }
  }

  async function openTake(id: string) {
    try {
      applyTake(await get(`/procurement/stock-takes/${id}`));
    } catch (err) {
      onError(err instanceof Error ? err.message : "Unable to open that stock take.");
    }
  }

  async function saveCounts(e: FormEvent) {
    e.preventDefault();
    if (!current) return;
    try {
      const take = await patch<any>(`/procurement/stock-takes/${current.id}`, {
        lines: Object.entries(counts)
          .filter(([, qty]) => qty !== "")
          .map(([medicineId, countedQty]) => ({ medicineId, countedQty: Number(countedQty) })),
      });
      applyTake(take);
      onOk("Counts saved. Post when the physical count is finished.");
    } catch (err) {
      onError(err instanceof Error ? err.message : "Unable to save counts.");
    }
  }

  async function postTake() {
    if (!current) return;
    try {
      const take = await post<any>(`/procurement/stock-takes/${current.id}/post`, {});
      applyTake(take);
      onOk(`${take.takeNumber} posted. Variances are now on the shelf.`);
      await load();
      await onStockChanged();
    } catch (err) {
      onError(err instanceof Error ? err.message : "Unable to post the stock take.");
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-slate-500">Count what is on the shelf. Posting adjusts stock to the counted quantity and records the variance.</p>
        <Button onClick={() => void start()}>Start stock take</Button>
      </div>
      {takes.length === 0 ? <Empty title="No stock takes yet." /> : (
        <Table headers={["Number", "Status", "Lines", "When", ""]}>
          {takes.map((t) => (
            <tr key={t.id}>
              <td className="px-3 py-2">{t.takeNumber}</td>
              <td className="px-3 py-2"><StatusBadge status={t.status} /></td>
              <td className="px-3 py-2">{t._count?.lines ?? "—"}</td>
              <td className="px-3 py-2">{new Date(t.createdAt).toLocaleString()}</td>
              <td className="px-3 py-2"><Button variant="secondary" onClick={() => void openTake(t.id)}>Open</Button></td>
            </tr>
          ))}
        </Table>
      )}
      {current ? (
        <form onSubmit={(e) => void saveCounts(e)} className="space-y-3 rounded-xl border border-slate-200 bg-white p-4">
          <h2 className="text-sm font-semibold">{current.takeNumber} · {current.status}</h2>
          <Table headers={["Item", "System", "Counted", "Variance"]}>
            {(current.lines || []).map((line: any) => {
              const counted = counts[line.medicineId];
              const variance = counted === "" || counted == null ? "—" : Number(counted) - line.systemQty;
              return (
                <tr key={line.id}>
                  <td className="px-3 py-2">{line.medicine?.name}<div className="text-xs text-slate-500">{line.medicine?.sku}</div></td>
                  <td className="px-3 py-2">{line.systemQty}</td>
                  <td className="px-3 py-2">
                    <Field label="">
                      <input
                        className={inputClass}
                        value={counted ?? ""}
                        disabled={current.status !== "DRAFT"}
                        onChange={(e) => setCounts((s) => ({ ...s, [line.medicineId]: e.target.value }))}
                      />
                    </Field>
                  </td>
                  <td className={`px-3 py-2 ${typeof variance === "number" && variance !== 0 ? "font-medium text-amber-700" : ""}`}>{variance}</td>
                </tr>
              );
            })}
          </Table>
          {current.status === "DRAFT" ? (
            <div className="flex gap-2">
              <Button type="submit">Save counts</Button>
              <Button variant="secondary" onClick={() => void postTake()}>Post and adjust stock</Button>
            </div>
          ) : (
            <p className="text-sm text-slate-500">Posted {current.postedAt ? new Date(current.postedAt).toLocaleString() : ""}.</p>
          )}
        </form>
      ) : null}
    </div>
  );
}
