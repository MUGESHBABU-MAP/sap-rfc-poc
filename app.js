require("dotenv").config();
const express = require("express");

const SAPService = require("./services/sap.service");
const InventoryDatasetService = require("./services/inventory-dataset.service");
const InventorySummaryService = require("./services/inventory-summary.service");

// Route factories
const inventoryRoutes = require("./routes/inventory.routes");

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
      version: "2.0.0",
      phase: "Phase 1 - Inventory",
    },
  });
});

// --- Route registration ---
app.use("/api/inventory", inventoryRoutes(inventoryDataset, inventorySummary));

// Phase 2: GL routes will be added here
// app.use("/api/gl", glRoutes(glDataset, glSummary));

// Phase 3: Reconciliation routes will be added here
// app.use("/api/reconciliation", reconRoutes(...));

// --- Start server ---
app.listen(PORT, () => {
  console.log(`\n=== Inventory & GL Reconciliation API ===`);
  console.log(`Server running on port ${PORT}`);
  console.log(`\nPhase 1 Endpoints:`);
  console.log(`  GET /api/health`);
  console.log(`  GET /api/inventory/full?plant=&storageLocation=&material=`);
  console.log(`  GET /api/inventory/summary?plant=&storageLocation=&material=`);
  console.log(`\nPhase 2 (pending): /api/gl/full, /api/gl/summary`);
  console.log(
    `Phase 3 (pending): /api/reconciliation, /api/reconciliation/variance-analysis`,
  );
  console.log(`Phase 4 (pending): /api/export/*\n`);
});

module.exports = app;
