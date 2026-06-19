require("dotenv").config();
const express = require("express");

const SAPService = require("./services/sap.service");
const InventoryDatasetService = require("./services/inventory-dataset.service");
const InventorySummaryService = require("./services/inventory-summary.service");
const GLDatasetService = require("./services/gl-dataset.service");
const GLSummaryService = require("./services/gl-summary.service");
const ReconciliationService = require("./services/reconciliation.service");

// Route factories
const inventoryRoutes = require("./routes/inventory.routes");
const glRoutes = require("./routes/gl.routes");
const reconciliationRoutes = require("./routes/reconciliation.routes");

const app = express();
const PORT = process.env.PORT || 3000;

// --- SAP configuration ---
const sapConfig = {
  user: process.env.SAP_USER,
  passwd: process.env.SAP_PASSWORD,
  ashost: process.env.SAP_ASHOST,
  sysnr: process.env.SAP_SYSNR,
  client: process.env.SAP_CLIENT,
  lang: process.env.SAP_LANG,
};

// --- Service initialization ---
const sap = new SAPService(sapConfig);
const inventoryDataset = new InventoryDatasetService(sap);
const inventorySummary = new InventorySummaryService();
const glDataset = new GLDatasetService(sap);
const glSummary = new GLSummaryService();
const reconciliation = new ReconciliationService();

let sapConnected = false;

// --- Middleware ---
app.use(express.json());

// SAP connection middleware - lazy connect on first request
app.use("/api", async (req, res, next) => {
  try {
    if (!sapConnected) {
      await sap.connect();
      sapConnected = true;
      console.log("SAP connection established.");
    }
    next();
  } catch (err) {
    console.error("SAP connection failed:", err.message);
    res.status(503).json({
      success: false,
      error: "SAP connection unavailable",
      details: err.message,
    });
  }
});

// --- Health endpoint ---
app.get("/api/health", (req, res) => {
  res.json({
    success: true,
    data: {
      status: "ok",
      sapConnected,
      version: "3.0.0",
      phase: "Phase 3 - Reconciliation",
    },
  });
});

// --- Route registration ---
app.use("/api/inventory", inventoryRoutes(inventoryDataset, inventorySummary));
app.use("/api/gl", glRoutes(glDataset, glSummary));
app.use(
  "/api/reconciliation",
  reconciliationRoutes(inventoryDataset, glDataset, reconciliation),
);

// --- Start server ---
app.listen(PORT, () => {
  console.log(`\n=== Inventory & GL Reconciliation API ===`);
  console.log(`Server running on port ${PORT}`);
  console.log(`\nPhase 1 - Inventory Endpoints:`);
  console.log(`  GET /api/health`);
  console.log(`  GET /api/inventory/full?plant=&storageLocation=&material=`);
  console.log(`  GET /api/inventory/summary?plant=&storageLocation=&material=`);
  console.log(`\nPhase 2 - GL Endpoints:`);
  console.log(`  GET /api/gl/full?companyCode=&fiscalYear=&glAccount=`);
  console.log(`  GET /api/gl/summary?companyCode=&fiscalYear=&glAccount=`);
  console.log(`\nPhase 3 - Reconciliation Endpoints:`);
  console.log(`  GET /api/reconciliation/plant`);
  console.log(`  GET /api/reconciliation/storage-location`);
  console.log(`  GET /api/reconciliation/top-variances?limit=100`);
  console.log(`  GET /api/reconciliation/summary`);
  console.log(`\nPhase 4 (pending): /api/export/*\n`);
});

module.exports = app;
