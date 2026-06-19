/**
 * Mock test for ReconciliationService.
 * No SAP connection needed - validates variance logic.
 */
const ReconciliationService = require("../services/reconciliation.service");

function testReconMock() {
  const recon = new ReconciliationService();

  // Mock totals (Step 4)
  const inventoryTotal = 100000;
  const glTotal = 95000;

  const result = recon.calculateVariance(inventoryTotal, glTotal);

  console.log("=== Mock Reconciliation Test ===");
  console.log(JSON.stringify(result, null, 2));

  // Assertions
  const expected = {
    inventoryTotal: 100000,
    glTotal: 95000,
    variance: 5000,
    variancePercent: 5.26,
  };

  const pass =
    result.inventoryTotal === expected.inventoryTotal &&
    result.glTotal === expected.glTotal &&
    result.variance === expected.variance &&
    result.variancePercent === expected.variancePercent;

  console.log(`\nTest ${pass ? "PASSED ✓" : "FAILED ✗"}`);

  if (!pass) {
    console.log("Expected:", expected);
    console.log("Got:", result);
    process.exit(1);
  }
}

testReconMock();
