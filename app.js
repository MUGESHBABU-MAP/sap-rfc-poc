require("dotenv").config();
const express = require("express");

const SAPService = require("./services/sap.service");
const InventoryDatasetService = require("./services/inventory-dataset.service");
const InventorySummaryService = require("./services/inventory-summary.service");
const GLDatasetService = require("./services/gl-dataset.service");
const ReconciliationService = require("./services/reconciliation.service");

const app = express();
const PORT = process.env.PORT || 3000;

// --- SAP connection setup ---
const sapConfig = {
  user: process.env.SAP_USER,
  passwd: process.env.SAP_PASSWORD,
  ashost: process.env.SAP_ASHOST,
  sysnr: process.env.SAP_SYSNR,
  client: process.env.SAP_CLIENT,
  lang: process.env.SAP_LANG,
};

const sap = new SAPService(sapConfig);
const inventoryDataset = new InventoryDatasetService(sap);
const inventorySummary = new InventorySummaryService();
const glDataset = new GLDatasetService(sap);
const reconciliation = new ReconciliationService();

let sapConnected = false;

async function ensureSAPConnection() {
  if (!sapConnected) {
    await sap.connect();
    sapConnected = true;
  }
}

// --- Middleware ---
app.use(express.json());

// --- Health check ---
app.get("/api/health", (req, res) => {
  res.json({ success: true, data: { status: "ok", sapConnected } });
});

// --- GET /api/inventory ---
// Query params: plant, storageLocation, material
app.get("/api/inventory", async (req, res) => {
  try {
    await ensureSAPConnection();

    const filters = {
      plant: req.query.plant || undefined,
      storageLocation: req.query.storageLocation || undefined,
      material: req.query.material || undefined,
    };

    const data = await inventoryDataset.getInventoryDataset(filters);
    res.json({ success: true, data });
  } catch (err) {
    console.error("GET /api/inventory error:", err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// --- GET /api/inventory/summary ---
// Query params: plant, storageLocation, material
app.get("/api/inventory/summary", async (req, res) => {
  try {
    await ensureSAPConnection();

    const filters = {
      plant: req.query.plant || undefined,
      storageLocation: req.query.storageLocation || undefined,
      material: req.query.material || undefined,
    };

    const records = await inventoryDataset.getInventoryDataset(filters);
    const data = inventorySummary.summarizeByLocation(records);
    res.json({ success: true, data });
  } catch (err) {
    console.error("GET /api/inventory/summary error:", err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// --- GET /api/gl ---
// Query params: companyCode, fiscalYear, account
app.get("/api/gl", async (req, res) => {
  try {
    await ensureSAPConnection();

    const filters = {
      companyCode: req.query.companyCode || undefined,
      fiscalYear: req.query.fiscalYear || undefined,
      account: req.query.account || undefined,
    };

    const data = await glDataset.getGLBalances(filters);
    res.json({ success: true, data });
  } catch (err) {
    console.error("GET /api/gl error:", err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// --- GET /api/gl/summary ---
// Query params: companyCode, fiscalYear, account
app.get("/api/gl/summary", async (req, res) => {
  try {
    await ensureSAPConnection();

    const filters = {
      companyCode: req.query.companyCode || undefined,
      fiscalYear: req.query.fiscalYear || undefined,
      account: req.query.account || undefined,
    };

    const data = await glDataset.getGLSummary(filters);
    res.json({ success: true, data });
  } catch (err) {
    console.error("GET /api/gl/summary error:", err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// --- GET /api/reconciliation ---
// Query params: plant, storageLocation, material, companyCode, fiscalYear, account
app.get("/api/reconciliation", async (req, res) => {
  try {
    await ensureSAPConnection();

    const invFilters = {
      plant: req.query.plant || undefined,
      storageLocation: req.query.storageLocation || undefined,
      material: req.query.material || undefined,
    };

    const glFilters = {
      companyCode: req.query.companyCode || undefined,
      fiscalYear: req.query.fiscalYear || undefined,
      account: req.query.account || undefined,
    };

    // Get inventory summary
    const inventoryRecords =
      await inventoryDataset.getInventoryDataset(invFilters);
    const invSummary = inventorySummary.summarizeByLocation(inventoryRecords);

    // Get GL summary
    const glSummary = await glDataset.getGLSummary(glFilters);

    // Calculate variance (total mode - no location mapping in MVP)
    const data = reconciliation.calculateVariance(invSummary, glSummary);

    res.json({ success: true, data });
  } catch (err) {
    console.error("GET /api/reconciliation error:", err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// --- Start server ---
app.listen(PORT, () => {
  console.log(`Inventory & GL Reconciliation API running on port ${PORT}`);
  console.log(`Endpoints:`);
  console.log(`  GET /api/health`);
  console.log(`  GET /api/inventory`);
  console.log(`  GET /api/inventory/summary`);
  console.log(`  GET /api/gl`);
  console.log(`  GET /api/gl/summary`);
  console.log(`  GET /api/reconciliation`);
});

module.exports = app;
