import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { writeAudit } from "../lib/audit.js";
import { badRequest, notFound } from "../lib/errors.js";
import { money } from "../lib/serialize.js";
import { nextGrnNumber, nextLpoNumber, nextStockTakeNumber } from "../lib/sequences.js";
import { moveStock } from "./pharmacyService.js";

export const supplierSchema = z.object({
  name: z.string().min(1),
  phone: z.string().optional().nullable(),
  email: z.string().email().optional().nullable().or(z.literal("")),
  location: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
  active: z.boolean().optional(),
});

export const purchaseOrderSchema = z.object({
  supplierId: z.string().min(1),
  notes: z.string().optional().nullable(),
  expectedDate: z.string().optional().nullable(),
  lines: z
    .array(
      z.object({
        medicineId: z.string().uuid(),
        quantityOrdered: z.number().int().positive(),
        unitCost: z.number().nonnegative(),
      }),
    )
    .min(1),
});

export const receiveSchema = z.object({
  deliveryNote: z.string().optional().nullable(),
  invoiceNumber: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
  lines: z
    .array(
      z.object({
        purchaseOrderLineId: z.string().uuid(),
        quantityReceived: z.number().int().nonnegative(),
        quantityRejected: z.number().int().nonnegative().optional(),
        unitCost: z.number().nonnegative().optional(),
        batchNumber: z.string().optional().nullable(),
        expiryDate: z.string().optional().nullable(),
        notes: z.string().optional().nullable(),
      }),
    )
    .min(1),
});

export const stockTakeCountSchema = z.object({
  notes: z.string().optional().nullable(),
  lines: z.array(
    z.object({
      medicineId: z.string().uuid(),
      countedQty: z.number().int().nonnegative(),
    }),
  ),
});

function serializePo(po: {
  id: string;
  lpoNumber: string;
  status: string;
  notes: string | null;
  expectedDate: Date | null;
  issuedAt: Date | null;
  createdAt: Date;
  supplier: { id: string; name: string; phone: string | null };
  lines: Array<{
    id: string;
    medicineId: string;
    quantityOrdered: number;
    quantityReceived: number;
    unitCost: { toString(): string };
    medicine: { name: string; sku: string; unit: string };
  }>;
  receipts?: Array<{ id: string; grnNumber: string; receivedAt: Date }>;
}) {
  return {
    ...po,
    expectedDate: po.expectedDate ? po.expectedDate.toISOString().slice(0, 10) : null,
    lines: po.lines.map((line) => ({
      ...line,
      unitCost: money(line.unitCost as never),
      outstanding: Math.max(0, line.quantityOrdered - line.quantityReceived),
    })),
  };
}

export async function listSuppliers(tenantId: string) {
  return prisma.supplier.findMany({
    where: { tenantId },
    orderBy: { name: "asc" },
  });
}

export async function upsertSupplier(
  tenantId: string,
  actorId: string,
  input: z.infer<typeof supplierSchema>,
  id?: string,
) {
  const data = {
    name: input.name.trim(),
    phone: input.phone?.trim() || null,
    email: input.email?.trim() || null,
    location: input.location?.trim() || null,
    notes: input.notes?.trim() || null,
    active: input.active ?? true,
  };
  const supplier = id
    ? await prisma.supplier.findFirst({ where: { id, tenantId } }).then(async (existing) => {
        if (!existing) throw notFound("Supplier not found.");
        return prisma.supplier.update({ where: { id }, data });
      })
    : await prisma.supplier.create({ data: { tenantId, ...data } });
  await writeAudit({
    tenantId,
    userId: actorId,
    action: id ? "supplier.updated" : "supplier.created",
    entity: "supplier",
    entityId: supplier.id,
  });
  return supplier;
}

export async function listPurchaseOrders(tenantId: string) {
  const rows = await prisma.purchaseOrder.findMany({
    where: { tenantId },
    include: {
      supplier: { select: { id: true, name: true, phone: true } },
      lines: { include: { medicine: { select: { name: true, sku: true, unit: true } } } },
      receipts: { select: { id: true, grnNumber: true, receivedAt: true } },
    },
    orderBy: { createdAt: "desc" },
  });
  return rows.map(serializePo);
}

export async function getPurchaseOrder(tenantId: string, id: string) {
  const po = await prisma.purchaseOrder.findFirst({
    where: { id, tenantId },
    include: {
      supplier: { select: { id: true, name: true, phone: true } },
      lines: { include: { medicine: { select: { name: true, sku: true, unit: true } } } },
      receipts: { select: { id: true, grnNumber: true, receivedAt: true } },
    },
  });
  if (!po) throw notFound("Purchase order not found.");
  return serializePo(po);
}

export async function createPurchaseOrder(
  tenantId: string,
  actorId: string,
  input: z.infer<typeof purchaseOrderSchema>,
) {
  const supplier = await prisma.supplier.findFirst({ where: { id: input.supplierId, tenantId, active: true } });
  if (!supplier) throw notFound("Supplier not found.");
  const medicineIds = [...new Set(input.lines.map((l) => l.medicineId))];
  const medicines = await prisma.medicine.findMany({ where: { tenantId, id: { in: medicineIds } } });
  if (medicines.length !== medicineIds.length) throw badRequest("One or more stock items are invalid.");

  const po = await prisma.$transaction(async (tx) => {
    const lpoNumber = await nextLpoNumber(tx, tenantId);
    const created = await tx.purchaseOrder.create({
      data: {
        tenantId,
        lpoNumber,
        supplierId: input.supplierId,
        notes: input.notes?.trim() || null,
        expectedDate: input.expectedDate ? new Date(input.expectedDate) : null,
        createdById: actorId,
        status: "ISSUED",
        issuedAt: new Date(),
        lines: {
          create: input.lines.map((line) => ({
            tenantId,
            medicineId: line.medicineId,
            quantityOrdered: line.quantityOrdered,
            unitCost: line.unitCost,
          })),
        },
      },
      include: {
        supplier: { select: { id: true, name: true, phone: true } },
        lines: { include: { medicine: { select: { name: true, sku: true, unit: true } } } },
        receipts: { select: { id: true, grnNumber: true, receivedAt: true } },
      },
    });
    await writeAudit(
      {
        tenantId,
        userId: actorId,
        action: "purchase_order.created",
        entity: "purchase_order",
        entityId: created.id,
        metadata: { lpoNumber },
      },
      tx,
    );
    return created;
  });
  return serializePo(po);
}

export async function cancelPurchaseOrder(tenantId: string, actorId: string, id: string) {
  const po = await prisma.purchaseOrder.findFirst({ where: { id, tenantId } });
  if (!po) throw notFound("Purchase order not found.");
  if (po.status === "RECEIVED") throw badRequest("A fully received LPO cannot be cancelled.");
  if (po.status === "CANCELLED") throw badRequest("This LPO is already cancelled.");
  const updated = await prisma.purchaseOrder.update({
    where: { id },
    data: { status: "CANCELLED" },
    include: {
      supplier: { select: { id: true, name: true, phone: true } },
      lines: { include: { medicine: { select: { name: true, sku: true, unit: true } } } },
      receipts: { select: { id: true, grnNumber: true, receivedAt: true } },
    },
  });
  await writeAudit({
    tenantId,
    userId: actorId,
    action: "purchase_order.cancelled",
    entity: "purchase_order",
    entityId: id,
  });
  return serializePo(updated);
}

export async function receivePurchaseOrder(
  tenantId: string,
  actorId: string,
  purchaseOrderId: string,
  input: z.infer<typeof receiveSchema>,
) {
  const incoming = input.lines.filter((l) => l.quantityReceived > 0 || (l.quantityRejected || 0) > 0);
  if (!incoming.length) throw badRequest("Enter at least one quantity received.");

  return prisma.$transaction(async (tx) => {
    const po = await tx.purchaseOrder.findFirst({
      where: { id: purchaseOrderId, tenantId },
      include: { lines: true },
    });
    if (!po) throw notFound("Purchase order not found.");
    if (po.status === "CANCELLED") throw badRequest("This LPO was cancelled.");
    if (po.status === "RECEIVED") throw badRequest("This LPO is already fully received.");

    const grnNumber = await nextGrnNumber(tx, tenantId);
    const receipt = await tx.goodsReceipt.create({
      data: {
        tenantId,
        grnNumber,
        purchaseOrderId,
        deliveryNote: input.deliveryNote?.trim() || null,
        invoiceNumber: input.invoiceNumber?.trim() || null,
        notes: input.notes?.trim() || null,
        receivedById: actorId,
      },
    });

    for (const line of incoming) {
      const poLine = po.lines.find((l) => l.id === line.purchaseOrderLineId);
      if (!poLine) throw badRequest("A receive line does not belong to this LPO.");
      const outstanding = poLine.quantityOrdered - poLine.quantityReceived;
      if (line.quantityReceived > outstanding) {
        throw badRequest(`Cannot receive more than the outstanding quantity for this item (${outstanding}).`);
      }
      const unitCost = line.unitCost ?? money(poLine.unitCost);
      await tx.goodsReceiptLine.create({
        data: {
          tenantId,
          goodsReceiptId: receipt.id,
          purchaseOrderLineId: poLine.id,
          medicineId: poLine.medicineId,
          quantityReceived: line.quantityReceived,
          quantityRejected: line.quantityRejected ?? 0,
          unitCost,
          batchNumber: line.batchNumber?.trim() || null,
          expiryDate: line.expiryDate ? new Date(line.expiryDate) : null,
          notes: line.notes?.trim() || null,
        },
      });
      if (line.quantityReceived > 0) {
        await moveStock(tx, {
          tenantId,
          medicineId: poLine.medicineId,
          userId: actorId,
          type: "PURCHASE",
          quantity: line.quantityReceived,
          signedDelta: line.quantityReceived,
          reference: `${po.lpoNumber} / ${grnNumber}`,
          notes: input.deliveryNote?.trim() || "Goods received against LPO",
        });
        await tx.medicine.update({
          where: { id: poLine.medicineId },
          data: { costPrice: unitCost },
        });
      }
      await tx.purchaseOrderLine.update({
        where: { id: poLine.id },
        data: { quantityReceived: { increment: line.quantityReceived } },
      });
    }

    const refreshed = await tx.purchaseOrderLine.findMany({ where: { purchaseOrderId } });
    const allIn = refreshed.every((l) => l.quantityReceived >= l.quantityOrdered);
    const anyIn = refreshed.some((l) => l.quantityReceived > 0);
    await tx.purchaseOrder.update({
      where: { id: purchaseOrderId },
      data: { status: allIn ? "RECEIVED" : anyIn ? "PARTIAL" : po.status },
    });
    await writeAudit(
      {
        tenantId,
        userId: actorId,
        action: "goods_receipt.created",
        entity: "goods_receipt",
        entityId: receipt.id,
        metadata: { lpoNumber: po.lpoNumber, grnNumber },
      },
      tx,
    );

    return receipt.id;
  }).then(() => getPurchaseOrder(tenantId, purchaseOrderId));
}

export async function startStockTake(tenantId: string, actorId: string) {
  const open = await prisma.stockTake.findFirst({ where: { tenantId, status: "DRAFT" } });
  if (open) return getStockTake(tenantId, open.id);

  const medicines = await prisma.medicine.findMany({
    where: { tenantId, active: true },
    orderBy: { name: "asc" },
  });
  const take = await prisma.$transaction(async (tx) => {
    const takeNumber = await nextStockTakeNumber(tx, tenantId);
    return tx.stockTake.create({
      data: {
        tenantId,
        takeNumber,
        countedById: actorId,
        lines: {
          create: medicines.map((m) => ({
            tenantId,
            medicineId: m.id,
            systemQty: m.quantityOnHand,
          })),
        },
      },
    });
  });
  await writeAudit({
    tenantId,
    userId: actorId,
    action: "stock_take.started",
    entity: "stock_take",
    entityId: take.id,
  });
  return getStockTake(tenantId, take.id);
}

export async function listStockTakes(tenantId: string) {
  return prisma.stockTake.findMany({
    where: { tenantId },
    orderBy: { createdAt: "desc" },
    take: 20,
    include: { _count: { select: { lines: true } } },
  });
}

export async function getStockTake(tenantId: string, id: string) {
  const take = await prisma.stockTake.findFirst({
    where: { id, tenantId },
    include: {
      lines: {
        include: { medicine: { select: { name: true, sku: true, unit: true, quantityOnHand: true } } },
        orderBy: { medicine: { name: "asc" } },
      },
    },
  });
  if (!take) throw notFound("Stock take not found.");
  return take;
}

export async function saveStockTakeCounts(
  tenantId: string,
  id: string,
  input: z.infer<typeof stockTakeCountSchema>,
) {
  const take = await prisma.stockTake.findFirst({ where: { id, tenantId } });
  if (!take) throw notFound("Stock take not found.");
  if (take.status !== "DRAFT") throw badRequest("This stock take is already posted.");
  await prisma.$transaction(async (tx) => {
    if (input.notes !== undefined) {
      await tx.stockTake.update({ where: { id }, data: { notes: input.notes } });
    }
    for (const line of input.lines) {
      const existing = await tx.stockTakeLine.findFirst({ where: { stockTakeId: id, medicineId: line.medicineId } });
      if (!existing) continue;
      await tx.stockTakeLine.update({
        where: { id: existing.id },
        data: { countedQty: line.countedQty, variance: line.countedQty - existing.systemQty },
      });
    }
  });
  return getStockTake(tenantId, id);
}

export async function postStockTake(tenantId: string, actorId: string, id: string) {
  const take = await prisma.stockTake.findFirst({
    where: { id, tenantId },
    include: { lines: true },
  });
  if (!take) throw notFound("Stock take not found.");
  if (take.status !== "DRAFT") throw badRequest("This stock take is already posted.");
  const counted = take.lines.filter((l) => l.countedQty !== null);
  if (!counted.length) throw badRequest("Enter counted quantities before posting.");

  await prisma.$transaction(async (tx) => {
    for (const line of counted) {
      const variance = (line.countedQty ?? line.systemQty) - line.systemQty;
      if (variance === 0) continue;
      await moveStock(tx, {
        tenantId,
        medicineId: line.medicineId,
        userId: actorId,
        type: "STOCK_TAKE",
        quantity: Math.abs(variance),
        signedDelta: variance,
        reference: take.takeNumber,
        notes: variance > 0 ? "Stock take surplus" : "Stock take shortage",
        allowNegative: true,
      });
    }
    await tx.stockTake.update({
      where: { id },
      data: { status: "POSTED", postedAt: new Date(), countedById: actorId },
    });
    await writeAudit(
      {
        tenantId,
        userId: actorId,
        action: "stock_take.posted",
        entity: "stock_take",
        entityId: id,
        metadata: { takeNumber: take.takeNumber, lines: counted.length },
      },
      tx,
    );
  });
  return getStockTake(tenantId, id);
}
