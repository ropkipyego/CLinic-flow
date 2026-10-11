import { Router } from "express";
import { asyncHandler } from "../middleware/asyncHandler.js";
import { param } from "../lib/params.js";
import { authenticate, authorize } from "../middleware/auth.js";
import { created, ok } from "../lib/response.js";
import {
  approvePurchaseOrder,
  cancelPurchaseOrder,
  createPurchaseOrder,
  duplicatePurchaseOrder,
  getPurchaseOrder,
  getStockTake,
  issuePurchaseOrder,
  listPurchaseOrders,
  listStockTakes,
  listSuppliers,
  postStockTake,
  purchaseOrderSchema,
  receivePurchaseOrder,
  receiveSchema,
  recordLpoReprint,
  saveStockTakeCounts,
  startStockTake,
  stockTakeCountSchema,
  submitPurchaseOrder,
  supplierSchema,
  updatePurchaseOrder,
  upsertSupplier,
} from "../services/procurementService.js";

export const procurementRouter = Router();
procurementRouter.use(authenticate, authorize("ADMIN", "PHARMACY"));

procurementRouter.get(
  "/suppliers",
  asyncHandler(async (req, res) => ok(res, await listSuppliers(req.user!.tenantId))),
);

procurementRouter.post(
  "/suppliers",
  asyncHandler(async (req, res) =>
    created(res, await upsertSupplier(req.user!.tenantId, req.user!.id, supplierSchema.parse(req.body))),
  ),
);

procurementRouter.patch(
  "/suppliers/:id",
  asyncHandler(async (req, res) =>
    ok(res, await upsertSupplier(req.user!.tenantId, req.user!.id, supplierSchema.parse(req.body), param(req, "id"))),
  ),
);

procurementRouter.get(
  "/purchase-orders",
  asyncHandler(async (req, res) =>
    ok(
      res,
      await listPurchaseOrders(req.user!.tenantId, {
        q: typeof req.query.q === "string" ? req.query.q : undefined,
        status: typeof req.query.status === "string" ? req.query.status : undefined,
        supplierId: typeof req.query.supplierId === "string" ? req.query.supplierId : undefined,
        from: typeof req.query.from === "string" ? req.query.from : undefined,
        to: typeof req.query.to === "string" ? req.query.to : undefined,
      }),
    ),
  ),
);

procurementRouter.post(
  "/purchase-orders",
  asyncHandler(async (req, res) =>
    created(res, await createPurchaseOrder(req.user!.tenantId, req.user!.id, purchaseOrderSchema.parse(req.body))),
  ),
);

procurementRouter.get(
  "/purchase-orders/:id",
  asyncHandler(async (req, res) => ok(res, await getPurchaseOrder(req.user!.tenantId, param(req, "id")))),
);

procurementRouter.patch(
  "/purchase-orders/:id",
  asyncHandler(async (req, res) =>
    ok(res, await updatePurchaseOrder(req.user!.tenantId, req.user!.id, param(req, "id"), purchaseOrderSchema.parse(req.body))),
  ),
);

procurementRouter.post(
  "/purchase-orders/:id/submit",
  asyncHandler(async (req, res) => ok(res, await submitPurchaseOrder(req.user!.tenantId, req.user!.id, param(req, "id")))),
);

procurementRouter.post(
  "/purchase-orders/:id/approve",
  authorize("ADMIN"),
  asyncHandler(async (req, res) =>
    ok(res, await approvePurchaseOrder(req.user!.tenantId, req.user!.id, req.user!.role, param(req, "id"))),
  ),
);

procurementRouter.post(
  "/purchase-orders/:id/issue",
  asyncHandler(async (req, res) => ok(res, await issuePurchaseOrder(req.user!.tenantId, req.user!.id, param(req, "id")))),
);

procurementRouter.post(
  "/purchase-orders/:id/duplicate",
  asyncHandler(async (req, res) =>
    created(res, await duplicatePurchaseOrder(req.user!.tenantId, req.user!.id, param(req, "id"))),
  ),
);

procurementRouter.post(
  "/purchase-orders/:id/reprint",
  asyncHandler(async (req, res) => ok(res, await recordLpoReprint(req.user!.tenantId, req.user!.id, param(req, "id")))),
);

procurementRouter.post(
  "/purchase-orders/:id/cancel",
  asyncHandler(async (req, res) => ok(res, await cancelPurchaseOrder(req.user!.tenantId, req.user!.id, param(req, "id")))),
);

procurementRouter.post(
  "/purchase-orders/:id/receive",
  asyncHandler(async (req, res) =>
    created(
      res,
      await receivePurchaseOrder(req.user!.tenantId, req.user!.id, param(req, "id"), receiveSchema.parse(req.body)),
    ),
  ),
);

procurementRouter.get(
  "/stock-takes",
  asyncHandler(async (req, res) => ok(res, await listStockTakes(req.user!.tenantId))),
);

procurementRouter.post(
  "/stock-takes",
  asyncHandler(async (req, res) => created(res, await startStockTake(req.user!.tenantId, req.user!.id))),
);

procurementRouter.get(
  "/stock-takes/:id",
  asyncHandler(async (req, res) => ok(res, await getStockTake(req.user!.tenantId, param(req, "id")))),
);

procurementRouter.patch(
  "/stock-takes/:id",
  asyncHandler(async (req, res) =>
    ok(res, await saveStockTakeCounts(req.user!.tenantId, param(req, "id"), stockTakeCountSchema.parse(req.body))),
  ),
);

procurementRouter.post(
  "/stock-takes/:id/post",
  asyncHandler(async (req, res) => ok(res, await postStockTake(req.user!.tenantId, req.user!.id, param(req, "id")))),
);
