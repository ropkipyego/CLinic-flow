import { z } from "zod";
import { prisma, type TxClient } from "../lib/prisma.js";
import { writeAudit } from "../lib/audit.js";
import { badRequest, notFound } from "../lib/errors.js";
import { isUniqueConstraintError } from "../lib/prismaErrors.js";
import { money } from "../lib/serialize.js";
import { nextGrnNumber, nextLpoNumber, nextStockTakeNumber } from "../lib/sequences.js";
import { moveStock } from "./pharmacyService.js";

export const supplierSchema = z.object({
  name: z.string().min(1),
  phone: z.string().optional().nullable(),
  email: z.string().email().optional().nullable().or(z.literal("")),
  location: z.string().optional().nullable(),
  contactName: z.string().optional().nullable(),
  address: z.string().optional().nullable(),
  taxPin: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
  active: z.boolean().optional(),
});

const lpoLineSchema = z.object({
  medicineId: z.string().uuid(),
  quantityOrdered: z.number().int().positive(),
  unitCost: z.number().nonnegative(),
});

export const purchaseOrderSchema = z.object({
  supplierId: z.string().min(1),
  notes: z.string().optional().nullable(),
  expectedDate: z.string().optional().nullable(),
  orderDate: z.string().optional().nullable(),
  deliveryLocation: z.string().optional().nullable(),
  paymentTerms: z.string().optional().nullable(),
  deliveryInstructions: z.string().optional().nullable(),
  quotationNumber: z.string().optional().nullable(),
  taxPercent: z.number().min(0).max(100).optional(),
  deliveryCharge: z.number().nonnegative().optional(),
  lines: z.array(lpoLineSchema).min(1),
});

export const receiveSchema = z.object({
  deliveryNote: z.string().optional().nullable(),
  invoiceNumber: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
  clientRequestId: z.string().uuid().optional().nullable(),
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
      batchNumber: z.string().optional().nullable(),
      expiryDate: z.string().optional().nullable(),
      notes: z.string().optional().nullable(),
    }),
  ),
});

const poInclude = {
  supplier: true,
  createdBy: { select: { id: true, firstName: true, lastName: true, email: true } },
  approvedBy: { select: { id: true, firstName: true, lastName: true, email: true } },
  lines: { include: { medicine: { select: { name: true, sku: true, unit: true } } } },
  receipts: { select: { id: true, grnNumber: true, receivedAt: true, deliveryNote: true, invoiceNumber: true } },
} as const;

function serializePo(po: {
  id: string;
  lpoNumber: string;
  status: string;
  notes: string | null;
  expectedDate: Date | null;
  orderDate?: Date | null;
  issuedAt: Date | null;
  submittedAt?: Date | null;
  approvedAt?: Date | null;
  deliveryLocation?: string | null;
  paymentTerms?: string | null;
  deliveryInstructions?: string | null;
  quotationNumber?: string | null;
  taxPercent?: { toString(): string } | number;
  deliveryCharge?: { toString(): string } | number;
  reprintCount?: number;
  duplicatedFromId?: string | null;
  createdAt: Date;
  supplier: {
    id: string;
    name: string;
    phone: string | null;
    email?: string | null;
    address?: string | null;
    contactName?: string | null;
    taxPin?: string | null;
    location?: string | null;
  };
  createdBy?: { firstName: string; lastName: string; email: string } | null;
  approvedBy?: { firstName: string; lastName: string; email: string } | null;
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
  const lines = po.lines.map((line) => {
    const unitCost = money(line.unitCost as never);
    const outstanding = Math.max(0, line.quantityOrdered - line.quantityReceived);
    return {
      ...line,
      unitCost,
      lineTotal: Number((unitCost * line.quantityOrdered).toFixed(2)),
      outstanding,
    };
  });
  const subtotal = lines.reduce((sum, l) => sum + l.lineTotal, 0);
  const taxPercent = money(po.taxPercent as never);
  const deliveryCharge = money(po.deliveryCharge as never);
  const taxAmount = Number(((subtotal * taxPercent) / 100).toFixed(2));
  return {
    ...po,
    expectedDate: po.expectedDate ? po.expectedDate.toISOString().slice(0, 10) : null,
    orderDate: po.orderDate ? po.orderDate.toISOString().slice(0, 10) : po.createdAt.toISOString().slice(0, 10),
    taxPercent,
    deliveryCharge,
    reprintCount: po.reprintCount ?? 0,
    duplicated: Boolean(po.duplicatedFromId),
    reprint: (po.reprintCount ?? 0) > 0,
    lines,
    totals: {
      subtotal: Number(subtotal.toFixed(2)),
      taxAmount,
      deliveryCharge,
      grandTotal: Number((subtotal + taxAmount + deliveryCharge).toFixed(2)),
    },
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
    contactName: input.contactName?.trim() || null,
    address: input.address?.trim() || null,
    taxPin: input.taxPin?.trim() || null,
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

export async function listPurchaseOrders(
  tenantId: string,
  filters?: { q?: string; status?: string; supplierId?: string; from?: string; to?: string },
) {
  const q = filters?.q?.trim();
  const rows = await prisma.purchaseOrder.findMany({
    where: {
      tenantId,
      ...(filters?.status ? { status: filters.status as never } : {}),
      ...(filters?.supplierId ? { supplierId: filters.supplierId } : {}),
      ...(filters?.from || filters?.to
        ? {
            orderDate: {
              ...(filters.from ? { gte: new Date(filters.from) } : {}),
              ...(filters.to ? { lte: new Date(filters.to) } : {}),
            },
          }
        : {}),
      ...(q
        ? {
            OR: [
              { lpoNumber: { contains: q, mode: "insensitive" } },
              { quotationNumber: { contains: q, mode: "insensitive" } },
              { supplier: { name: { contains: q, mode: "insensitive" } } },
            ],
          }
        : {}),
    },
    include: poInclude,
    orderBy: { createdAt: "desc" },
  });
  return rows.map(serializePo);
}

export async function getPurchaseOrder(tenantId: string, id: string) {
  const po = await prisma.purchaseOrder.findFirst({
    where: { id, tenantId },
    include: poInclude,
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
        orderDate: input.orderDate ? new Date(input.orderDate) : new Date(),
        deliveryLocation: input.deliveryLocation?.trim() || null,
        paymentTerms: input.paymentTerms?.trim() || null,
        deliveryInstructions: input.deliveryInstructions?.trim() || null,
        quotationNumber: input.quotationNumber?.trim() || null,
        taxPercent: input.taxPercent ?? 0,
        deliveryCharge: input.deliveryCharge ?? 0,
        createdById: actorId,
        status: "DRAFT",
        lines: {
          create: input.lines.map((line) => ({
            tenantId,
            medicineId: line.medicineId,
            quantityOrdered: line.quantityOrdered,
            unitCost: line.unitCost,
          })),
        },
      },
      include: poInclude,
    });
    await writeAudit(
      {
        tenantId,
        userId: actorId,
        action: "purchase_order.created",
        entity: "purchase_order",
        entityId: created.id,
        metadata: { lpoNumber, status: "DRAFT" },
      },
      tx,
    );
    return created;
  });
  return serializePo(po);
}

export async function updatePurchaseOrder(
  tenantId: string,
  actorId: string,
  id: string,
  input: z.infer<typeof purchaseOrderSchema>,
) {
  const existing = await prisma.purchaseOrder.findFirst({ where: { id, tenantId }, include: { lines: true } });
  if (!existing) throw notFound("Purchase order not found.");
  if (existing.status !== "DRAFT") throw badRequest("Only a draft LPO can be edited.");
  const supplier = await prisma.supplier.findFirst({ where: { id: input.supplierId, tenantId, active: true } });
  if (!supplier) throw notFound("Supplier not found.");
  await prisma.$transaction(async (tx) => {
    await tx.purchaseOrderLine.deleteMany({ where: { purchaseOrderId: id } });
    await tx.purchaseOrder.update({
      where: { id },
      data: {
        supplierId: input.supplierId,
        notes: input.notes?.trim() || null,
        expectedDate: input.expectedDate ? new Date(input.expectedDate) : null,
        orderDate: input.orderDate ? new Date(input.orderDate) : existing.orderDate,
        deliveryLocation: input.deliveryLocation?.trim() || null,
        paymentTerms: input.paymentTerms?.trim() || null,
        deliveryInstructions: input.deliveryInstructions?.trim() || null,
        quotationNumber: input.quotationNumber?.trim() || null,
        taxPercent: input.taxPercent ?? 0,
        deliveryCharge: input.deliveryCharge ?? 0,
        lines: {
          create: input.lines.map((line) => ({
            tenantId,
            medicineId: line.medicineId,
            quantityOrdered: line.quantityOrdered,
            unitCost: line.unitCost,
          })),
        },
      },
    });
    await writeAudit(
      { tenantId, userId: actorId, action: "purchase_order.updated", entity: "purchase_order", entityId: id },
      tx,
    );
  });
  return getPurchaseOrder(tenantId, id);
}

async function lockPurchaseOrder(tx: TxClient, tenantId: string, id: string) {
  const locked = await tx.$queryRaw<Array<{ id: string; status: string; lpoNumber: string }>>`
    SELECT id, status, "lpoNumber" FROM "PurchaseOrder"
    WHERE id = ${id} AND "tenantId" = ${tenantId}
    FOR UPDATE
  `;
  const header = locked[0];
  if (!header) throw notFound("Purchase order not found.");
  return header;
}

async function transitionLpo(
  tenantId: string,
  actorId: string,
  id: string,
  from: Array<"DRAFT" | "PENDING_APPROVAL" | "APPROVED" | "ISSUED" | "PARTIAL">,
  to: "PENDING_APPROVAL" | "APPROVED" | "ISSUED" | "CANCELLED",
  action: string,
  extra: Record<string, unknown> = {},
) {
  await prisma.$transaction(async (tx) => {
    const header = await lockPurchaseOrder(tx, tenantId, id);
    if (!from.includes(header.status as never)) {
      throw badRequest(`LPO ${header.lpoNumber} cannot move from ${header.status} to ${to}.`);
    }
    await tx.purchaseOrder.update({ where: { id }, data: { status: to, ...extra } });
    await writeAudit(
      {
        tenantId,
        userId: actorId,
        action,
        entity: "purchase_order",
        entityId: id,
        metadata: { from: header.status, to },
      },
      tx,
    );
  });
  return getPurchaseOrder(tenantId, id);
}

export async function submitPurchaseOrder(tenantId: string, actorId: string, id: string) {
  return transitionLpo(tenantId, actorId, id, ["DRAFT"], "PENDING_APPROVAL", "purchase_order.submitted", {
    submittedAt: new Date(),
  });
}

export async function approvePurchaseOrder(tenantId: string, actorId: string, role: string, id: string) {
  if (role !== "SUPER_ADMIN" && role !== "ADMIN") throw badRequest("Only a clinic administrator can approve an LPO.");
  return transitionLpo(tenantId, actorId, id, ["PENDING_APPROVAL"], "APPROVED", "purchase_order.approved", {
    approvedAt: new Date(),
    approvedById: actorId,
  });
}

export async function issuePurchaseOrder(tenantId: string, actorId: string, id: string) {
  return transitionLpo(tenantId, actorId, id, ["APPROVED"], "ISSUED", "purchase_order.issued", {
    issuedAt: new Date(),
  });
}

export async function duplicatePurchaseOrder(tenantId: string, actorId: string, id: string) {
  const po = await prisma.purchaseOrder.findFirst({
    where: { id, tenantId },
    include: { lines: true },
  });
  if (!po) throw notFound("Purchase order not found.");
  const copy = await prisma.$transaction(async (tx) => {
    const lpoNumber = await nextLpoNumber(tx, tenantId);
    const created = await tx.purchaseOrder.create({
      data: {
        tenantId,
        lpoNumber,
        supplierId: po.supplierId,
        status: "DRAFT",
        notes: po.notes,
        expectedDate: po.expectedDate,
        orderDate: new Date(),
        deliveryLocation: po.deliveryLocation,
        paymentTerms: po.paymentTerms,
        deliveryInstructions: po.deliveryInstructions,
        quotationNumber: po.quotationNumber,
        taxPercent: po.taxPercent,
        deliveryCharge: po.deliveryCharge,
        duplicatedFromId: po.id,
        createdById: actorId,
        lines: {
          create: po.lines.map((line) => ({
            tenantId,
            medicineId: line.medicineId,
            quantityOrdered: line.quantityOrdered,
            unitCost: line.unitCost,
          })),
        },
      },
      include: poInclude,
    });
    await writeAudit(
      {
        tenantId,
        userId: actorId,
        action: "purchase_order.duplicated",
        entity: "purchase_order",
        entityId: created.id,
        metadata: { from: po.lpoNumber, lpoNumber },
      },
      tx,
    );
    return created;
  });
  return serializePo(copy);
}

export async function recordLpoReprint(tenantId: string, actorId: string, id: string) {
  const po = await prisma.purchaseOrder.findFirst({ where: { id, tenantId } });
  if (!po) throw notFound("Purchase order not found.");
  await prisma.purchaseOrder.update({ where: { id }, data: { reprintCount: { increment: 1 } } });
  await writeAudit({
    tenantId,
    userId: actorId,
    action: "purchase_order.reprinted",
    entity: "purchase_order",
    entityId: id,
    metadata: { lpoNumber: po.lpoNumber },
  });
  return getPurchaseOrder(tenantId, id);
}

export async function cancelPurchaseOrder(tenantId: string, actorId: string, id: string) {
  await prisma.$transaction(async (tx) => {
    const header = await lockPurchaseOrder(tx, tenantId, id);
    if (header.status === "CANCELLED") throw badRequest("This LPO is already cancelled.");
    if (header.status === "PARTIAL" || header.status === "RECEIVED") {
      throw badRequest("An LPO that has received goods cannot be cancelled.");
    }
    const lines = await tx.purchaseOrderLine.findMany({ where: { purchaseOrderId: id } });
    if (lines.some((l) => l.quantityReceived > 0)) {
      throw badRequest("An LPO that has received goods cannot be cancelled.");
    }
    await tx.purchaseOrder.update({ where: { id }, data: { status: "CANCELLED" } });
    await writeAudit(
      {
        tenantId,
        userId: actorId,
        action: "purchase_order.cancelled",
        entity: "purchase_order",
        entityId: id,
      },
      tx,
    );
  });
  return getPurchaseOrder(tenantId, id);
}

export async function receivePurchaseOrder(
  tenantId: string,
  actorId: string,
  purchaseOrderId: string,
  input: z.infer<typeof receiveSchema>,
) {
  const incoming = input.lines.filter((l) => l.quantityReceived > 0 || (l.quantityRejected || 0) > 0);
  if (!incoming.length) throw badRequest("Enter at least one quantity received against this order.");

  async function existingReceiptPo() {
    if (!input.clientRequestId) return null;
    const existing = await prisma.goodsReceipt.findFirst({
      where: { tenantId, clientRequestId: input.clientRequestId },
    });
    if (!existing) return null;
    return getPurchaseOrder(tenantId, existing.purchaseOrderId);
  }

  const replayed = await existingReceiptPo();
  if (replayed) return replayed;

  try {
    const resultId = await prisma.$transaction(async (tx) => {
    const header = await lockPurchaseOrder(tx, tenantId, purchaseOrderId);
    if (input.clientRequestId) {
      const lockedExisting = await tx.goodsReceipt.findFirst({
        where: { tenantId, clientRequestId: input.clientRequestId },
      });
      if (lockedExisting) return lockedExisting.purchaseOrderId;
    }
    if (header.status === "CANCELLED") throw badRequest("This LPO was cancelled.");
    if (header.status === "DRAFT" || header.status === "PENDING_APPROVAL") {
      throw badRequest("Receive against an issued LPO. Creating or approving an LPO does not increase stock.");
    }
    if (header.status === "RECEIVED") throw badRequest("This LPO is already fully received.");
    const po = await tx.purchaseOrder.findFirst({
      where: { id: purchaseOrderId, tenantId },
      include: { lines: true },
    });
    if (!po) throw notFound("Purchase order not found.");

    const grnNumber = await nextGrnNumber(tx, tenantId);
    const receipt = await tx.goodsReceipt.create({
      data: {
        tenantId,
        grnNumber,
        purchaseOrderId,
        deliveryNote: input.deliveryNote?.trim() || null,
        invoiceNumber: input.invoiceNumber?.trim() || null,
        notes: input.notes?.trim() || null,
        clientRequestId: input.clientRequestId || null,
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

    return purchaseOrderId;
  });
    return getPurchaseOrder(tenantId, resultId);
  } catch (err) {
    if (isUniqueConstraintError(err)) {
      const replay = await existingReceiptPo();
      if (replay) return replay;
    }
    throw err;
  }
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
        data: {
          countedQty: line.countedQty,
          variance: line.countedQty - existing.systemQty,
          batchNumber: line.batchNumber ?? existing.batchNumber,
          expiryDate: line.expiryDate ? new Date(line.expiryDate) : existing.expiryDate,
          notes: line.notes ?? existing.notes,
        },
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
