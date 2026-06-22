# Customer Report Architecture

## Overview

Maps customer Excel workbook structure to application services, APIs, and implementation status.

## Report Structure

```
Customer Excel Workbook
├── Sheet 1: Inventory Report (Raw dump - all materials/locations)
├── Sheet 2: Formatted Report (Same data + formulas/formatting)
├── Sheet 3: Location Tabs (WH10, ECOM, SHYD, OSL1, BMY1, ...)
├── Sheet 4: Summary (Group by Storage Location)
├── Sheet 5: GL Accounts (FAGLB03 Inventory Accounts)
└── Sheet 6: Variance (Inventory vs GL Reconciliation)
```

## Implementation Mapping

| Customer Report  | Service                                 | API Endpoint                             | Export                           | Status                           |
| ---------------- | --------------------------------------- | ---------------------------------------- | -------------------------------- | -------------------------------- |
| Inventory Report | InventoryDatasetService                 | GET /api/inventory/full                  | GET /api/export/inventory?plant= | ✓ IMPLEMENTED                    |
| Formatted Report | InventoryDatasetService + ExportService | —                                        | GET /api/export/inventory?plant= | ✓ IMPLEMENTED (Excel formatting) |
| Location Tabs    | InventoryDatasetService (filtered)      | GET /api/inventory/full?storageLocation= | GET /api/export/location/:sloc   | ✓ IMPLEMENTED                    |
| Summary          | InventorySummaryService                 | GET /api/inventory/summary               | GET /api/export/summary          | ✓ IMPLEMENTED                    |
| GL Accounts      | GLDatasetService                        | GET /api/gl/full                         | —                                | ✓ IMPLEMENTED                    |
| Variance         | ReconciliationService                   | GET /api/reconciliation/plant            | GET /api/export/reconciliation   | ✓ IMPLEMENTED                    |

## Service → SAP Table Mapping

| Service                 | SAP Tables                     | Purpose                           |
| ----------------------- | ------------------------------ | --------------------------------- |
| InventoryDatasetService | MARD, MARA, MAKT, MARC, MBEW   | Full inventory dataset with costs |
| InventorySummaryService | (uses InventoryDataset output) | Group by storage location         |
| GLDatasetService        | FAGLFLEXT                      | GL balances (HSLVT + HSL01-12)    |
| GLSummaryService        | (uses GLDataset output)        | Group by company code             |
| ReconciliationService   | (uses both datasets)           | Inventory vs GL variance          |

## Data Flow

```
SAP System
  │
  ├─ RFC_READ_TABLE ─→ MARD (stock quantities)
  ├─ RFC_READ_TABLE ─→ MARA (material master)
  ├─ RFC_READ_TABLE ─→ MAKT (descriptions)
  ├─ RFC_READ_TABLE ─→ MARC (plant data)
  ├─ RFC_READ_TABLE ─→ MBEW (valuation/cost)
  └─ RFC_READ_TABLE ─→ FAGLFLEXT (GL balances)
        │
        ▼
  Node.js Application
  ├─ InventoryDatasetService (join on MATNR)
  ├─ InventorySummaryService (group by LGORT)
  ├─ GLDatasetService (calculate cumulative balance)
  ├─ ReconciliationService (compare inv vs GL)
  └─ ExportService (generate Excel)
        │
        ▼
  REST APIs + Excel Exports
```

## Customer Report Tabs → Application Equivalent

| Customer Tab | Application Equivalent         | Params                      |
| ------------ | ------------------------------ | --------------------------- |
| WH10         | GET /api/export/location/WH10  | plant=1000                  |
| ECOM         | GET /api/export/location/ECOM  | plant=1000                  |
| SHYD         | GET /api/export/location/SHYD  | plant=1000                  |
| OSL1         | GET /api/export/location/OSL1  | plant=1000                  |
| BMY1         | GET /api/export/location/BMY1  | plant=1000                  |
| Summary      | GET /api/export/summary        | plant=1000                  |
| GL           | GET /api/gl/full               | companyCode=1000            |
| Variance     | GET /api/export/reconciliation | companyCode=1000&plant=1000 |

## Phase Status

| Phase | Description                                     | Status     |
| ----- | ----------------------------------------------- | ---------- |
| 1     | Inventory Extraction (MARD+MARA+MAKT+MARC+MBEW) | ✓ Complete |
| 2     | GL Extraction (FAGLFLEXT)                       | ✓ Complete |
| 3     | Reconciliation Engine                           | ✓ Complete |
| 3.5   | Inventory Account Discovery                     | ✓ Complete |
| 3.6   | Excel Export Engine                             | ✓ Complete |
| 3.7   | Parameterized Export                            | ✓ Complete |
| 3.8   | Performance & Filter Fix                        | ✓ Complete |
| 3.9   | Field Mapping & Gap Analysis                    | ✓ Complete |
| 4     | React UI                                        | Pending    |
| 5     | AI Integration                                  | Pending    |

## Validated Locations

| Location | Plant | Export Test | Values Match SAP |
| -------- | ----- | ----------- | ---------------- |
| BMY1     | 1000  | ✓           | ✓ Confirmed      |

## Field Coverage

- Total customer columns: 24
- Currently covered: ~17 (71%)
- Investigation required: 7 columns
- See: `config/customer-field-mapping.js`
- See: `output/Customer_Field_Mapping.xlsx`
