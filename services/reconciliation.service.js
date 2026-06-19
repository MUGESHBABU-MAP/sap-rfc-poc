class ReconciliationService {
  calculateVariance(inventoryTotal, glTotal) {
    const variance = inventoryTotal - glTotal;

    const variancePercent = glTotal === 0 ? 0 : (variance / glTotal) * 100;

    return {
      inventoryTotal,
      glTotal,
      variance,
      variancePercent: Math.round(variancePercent * 100) / 100,
    };
  }
}

module.exports = ReconciliationService;
