import { ClinicLogo } from "../../branding/ClinicLogo";

export function LpoDocument({
  tenant,
  po,
  reprint,
}: {
  tenant: any;
  po: any;
  reprint?: boolean;
}) {
  const lines = po?.lines || [];
  return (
    <div className="mx-auto max-w-3xl bg-white p-8 text-slate-900 print:max-w-none">
      {(reprint || po?.reprint || po?.duplicated) ? (
        <p className="mb-3 rounded border border-amber-300 bg-amber-50 px-3 py-1 text-center text-xs font-semibold uppercase tracking-wide text-amber-900">
          {reprint || po?.reprint ? "Duplicate / reprint" : "Copied from a previous LPO"}
        </p>
      ) : null}
      <header className="flex items-start justify-between gap-4 border-b border-slate-300 pb-4">
        <div className="flex items-center gap-3">
          <ClinicLogo className="h-12 w-12" />
          <div>
            <h1 className="text-xl font-semibold">{tenant?.name || "ClinicFlow"}</h1>
            <p className="text-sm text-slate-600">{tenant?.address}</p>
            <p className="text-sm text-slate-600">{[tenant?.phone, tenant?.email].filter(Boolean).join(" · ")}</p>
            {tenant?.taxPin ? <p className="text-sm text-slate-600">PIN {tenant.taxPin}</p> : null}
          </div>
        </div>
        <div className="text-right">
          <div className="text-xs uppercase tracking-wide text-slate-500">Local Purchase Order</div>
          <div className="text-2xl font-semibold">{po?.lpoNumber}</div>
          <div className="text-sm">Date {po?.orderDate}</div>
          <div className="text-sm capitalize">{String(po?.status || "").replaceAll("_", " ").toLowerCase()}</div>
        </div>
      </header>
      <section className="mt-4 grid grid-cols-2 gap-4 text-sm">
        <div>
          <h2 className="text-xs font-semibold uppercase text-slate-500">Vendor</h2>
          <p className="font-medium">{po?.supplier?.name}</p>
          <p>{po?.supplier?.contactName}</p>
          <p>{po?.supplier?.address || po?.supplier?.location}</p>
          <p>{po?.supplier?.phone} {po?.supplier?.email}</p>
          {po?.supplier?.taxPin ? <p>PIN {po.supplier.taxPin}</p> : null}
        </div>
        <div>
          <h2 className="text-xs font-semibold uppercase text-slate-500">Deliver to</h2>
          <p>{po?.deliveryLocation || tenant?.lpoDeliveryLocation || tenant?.address}</p>
          <p>Expected {po?.expectedDate || "—"}</p>
          <p>Quotation {po?.quotationNumber || "—"}</p>
          <p>Terms {po?.paymentTerms || tenant?.lpoPaymentTerms || "—"}</p>
        </div>
      </section>
      <table className="mt-6 w-full text-left text-sm">
        <thead>
          <tr className="border-y border-slate-300 text-xs uppercase tracking-wide text-slate-500">
            <th className="py-2">Item</th>
            <th className="py-2">ATEN / SKU</th>
            <th className="py-2">U/M</th>
            <th className="py-2 text-right">Qty ordered</th>
            <th className="py-2 text-right">Qty received</th>
            <th className="py-2 text-right">Outstanding</th>
            <th className="py-2 text-right">Unit cost</th>
            <th className="py-2 text-right">Amount</th>
          </tr>
        </thead>
        <tbody>
          {lines.map((line: any) => (
            <tr key={line.id} className="border-b border-slate-100">
              <td className="py-2">{line.medicine?.name}</td>
              <td className="py-2">{line.medicine?.sku}</td>
              <td className="py-2">{line.medicine?.unit}</td>
              <td className="py-2 text-right">{line.quantityOrdered}</td>
              <td className="py-2 text-right">{line.quantityReceived}</td>
              <td className="py-2 text-right">{line.outstanding}</td>
              <td className="py-2 text-right">{Number(line.unitCost).toFixed(2)}</td>
              <td className="py-2 text-right">{Number(line.lineTotal).toFixed(2)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="mt-4 ml-auto w-64 text-sm">
        <div className="flex justify-between"><span>Subtotal</span><span>{Number(po?.totals?.subtotal || 0).toFixed(2)}</span></div>
        <div className="flex justify-between"><span>Tax {po?.taxPercent || 0}%</span><span>{Number(po?.totals?.taxAmount || 0).toFixed(2)}</span></div>
        <div className="flex justify-between"><span>Delivery</span><span>{Number(po?.totals?.deliveryCharge || 0).toFixed(2)}</span></div>
        <div className="mt-1 flex justify-between border-t border-slate-300 pt-1 font-semibold"><span>Grand total</span><span>{Number(po?.totals?.grandTotal || 0).toFixed(2)}</span></div>
      </div>
      <p className="mt-6 text-sm">{po?.deliveryInstructions}</p>
      <p className="text-sm">{po?.notes}</p>
      <p className="mt-4 text-xs text-slate-500">{tenant?.lpoStandardTerms}</p>
      <section className="mt-10 grid grid-cols-3 gap-6 text-sm">
        <div>
          <p className="text-xs uppercase text-slate-500">Prepared by</p>
          <p className="mt-8 border-t border-slate-400 pt-1">{po?.createdBy ? `${po.createdBy.firstName} ${po.createdBy.lastName}` : ""}</p>
        </div>
        <div>
          <p className="text-xs uppercase text-slate-500">Approved by</p>
          <p className="mt-8 border-t border-slate-400 pt-1">{po?.approvedBy ? `${po.approvedBy.firstName} ${po.approvedBy.lastName}` : ""}</p>
        </div>
        <div>
          <p className="text-xs uppercase text-slate-500">Received by</p>
          <p className="mt-8 border-t border-slate-400 pt-1">&nbsp;</p>
        </div>
      </section>
    </div>
  );
}
