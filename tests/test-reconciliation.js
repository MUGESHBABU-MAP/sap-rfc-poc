/**
 * Phase 3 - Test Reconciliation Engine against live SAP
 *
 * Run: node tests/test-reconciliation.js
 *
 * Tests:
 *   1. Load inventory dataset
 *   2. Load GL dataset
 *   3. Run reconcileByPlant()
 *   4. Print first 10 records
 *   5. Print summary
 *   6. Print top 10 variances
 *
 * Performance notes:
 *   - No JSON.stringify on full arrays
 *   - No Math.max/min spread
 *   - Iterative output only
 */
require("dotenv").config({
  path: require("path").resolve(__dirname, "../.env"),
});

const SAPService = require("../services/sap.service");
const InventoryDatasetService = require("../services/inventory-dataset.service");
const GLDatasetService = require("../services/gl-dataset.service");
const ReconciliationService = require("../services/reconciliation.service");

async function testReconciliation() {
  const sap = new SAPService({
    user: process.env.SAP_USER,
    passwd: process.env.SAP_PASSWORD,
    ashost: process.env.SAP_ASHOST,
    sysnr: process.env.SAP_SYSNR,
    client: process.env.SAP_CLIENT,
    lang: process.env.SAP_LANG,
  });

  try {
    await sap.connect();
    console.log("Connected to SAP\n");

    const inventoryService = new InventoryDatasetService(sap);
    const glService = new GLDatasetService(sap);
    const reconService = new ReconciliationService();

    // Step 1: Load inventory dataset
    console.log("Loading inventory dataset...");
    const inventoryRecords = await inventoryService.getInventoryDataset();
    console.log(`  Inventory records: ${inventoryRecords.length}`);

    // Step 2: Load GL dataset
    console.log("Loading GL dataset...");
    const glRecords = await glService.getGLBalances();
    console.log(`  GL records: ${glRecords.length}`);

    // Step 3: Reconcile by plant
    console.log("\n=== Plant Reconciliation ===\n");
    const plantResults = reconService.reconcileByPlant(
      inventoryRecords,
      glRecords,
    );

    // Print header
    console.log(
      "Plant".padEnd(8) +
        "Inventory Value".padEnd(20) +
        "GL Balance".padEnd(18) +
        "Variance".padEnd(16) +
        "Var %".padEnd(10) +
        "Status",
    );
    console.log("-".repeat(80));

    // Print first 10 records
    const plantCount = Math.min(10, plantResults.length);
    for (let i = 0; i < plantCount; i++) {
      const r = plantResults[i];
      console.log(
        String(r.plant).padEnd(8) +
          String(r.inventoryValue).padEnd(20) +
          String(r.glBalance).padEnd(18) +
          String(r.variance).padEnd(16) +
          String(r.variancePercent + "%").padEnd(10) +
          r.status,
      );
    }
    if (plantResults.length > 10) {
      console.log(`  ... and ${plantResults.length - 10} more plants`);
    }

    // Step 4: Summary
    console.log("\n=== Reconciliation Summary ===\n");
    const summary = reconService.getSummary(inventoryRecords, glRecords);
    console.log(`  Total Inventory Value: ${summary.totalInventoryValue}`);
    console.log(`  Total GL Balance:      ${summary.totalGLBalance}`);
    console.log(`  Total Variance:        ${summary.totalVariance}`);
    console.log(`  Variance %:            ${summary.variancePercent}%`);
    console.log(`  Matched Plants:        ${summary.matchedPlants}`);
    console.log(`  Variance Plants:       ${summary.variancePlants}`);
    console.log(`  Total Plants:          ${summary.totalPlants}`);

    // Step 5: Top 10 variances
    console.log("\n=== Top 10 Variances (by Storage Location) ===\n");
    const topVariances = reconService.getTopVariances(
      inventoryRecords,
      glRecords,
      10,
    );

    console.log(
      "Plant".padEnd(8) +
        "Location".padEnd(10) +
        "Inv Value".padEnd(16) +
        "GL Balance".padEnd(16) +
        "Variance".padEnd(16) +
        "Status",
    );
    console.log("-".repeat(76));

    for (let i = 0; i < topVariances.length; i++) {
      const r = topVariances[i];
      console.log(
        String(r.plant).padEnd(8) +
          String(r.storageLocation).padEnd(10) +
          String(r.inventoryValue).padEnd(16) +
          String(r.glBalance).padEnd(16) +
          String(r.variance).padEnd(16) +
          r.status,
      );
    }

    await sap.disconnect();
    console.log("\nDisconnected. Phase 3 reconciliation test complete.");
  } catch (err) {
    console.error("ERROR:", err.message || err);
  }
}

testReconciliation();
