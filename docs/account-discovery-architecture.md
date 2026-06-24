# Account Discovery Architecture (Phase 3.18A)

## Overview

The Account Service provides dynamic GL account discovery from SAP,
removing the dependency on hardcoded accounts in `inventory-account-master.json`.

Users can view all available accounts and select which ones to use
for GL extraction and reconciliation.

## SAP Source Tables

| Table    | Purpose                                     | Key Fields                                                                                          |
| -------- | ------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| **SKB1** | GL Account Master (Company Code level)      | BUKRS (Company Code), SAKNR (Account Number)                                                        |
| **SKA1** | GL Account Master (Chart of Accounts level) | KTOPL (Chart of Accounts), SAKNR (Account Number)                                                   |
| **SKAT** | GL Account Descriptions                     | SPRAS (Language), KTOPL (Chart of Accounts), SAKNR (Account), TXT20 (Short Text), TXT50 (Long Text) |
| **T001** | Company Code Master                         | BUKRS (Company Code), KTOPL (Chart of Accounts), WAERS (Currency)                                   |

## Data Flow

```
1. Read SKB1 (BUKRS = companyCode) → All accounts assigned to company code
2. Read T001 (BUKRS = companyCode) → Get Chart of Accounts (KTOPL)
3. Read SKAT (SPRAS = 'EN', KTOPL = chartOfAccounts) → Account descriptions
4. Join SKB1 + SKAT on SAKNR → { account, description }
5. Deduplicate by account number
6. Sort ascending
```

## Fallback Strategy

If SKB1 is not accessible (authorization), the service falls back to SKA1:

- SKA1 contains accounts at chart-of-accounts level (not company-specific)
- Less precise but provides a superset of accounts

## API

### GET /api/accounts?companyCode=1000

**Parameters:**

- `companyCode` (required) - SAP company code
- `language` (optional) - Language key for descriptions (default: EN)

**Response:**

```json
{
  "success": true,
  "data": {
    "accounts": [
      {
        "account": "0013000000",
        "description": "Inventory Raw Material",
        "shortDescription": "Inv Raw Mat",
        "companyCode": "1000"
      }
    ]
  },
  "meta": {
    "companyCode": "1000",
    "language": "EN",
    "totalAccounts": 1234,
    "source": "SKB1 + SKAT"
  }
}
```

### GET /api/finance-workbook (enhanced)

New optional parameter: `selectedAccounts`

```
GET /api/finance-workbook?companyCode=1000&plant=1000&fiscalYear=2026&selectedAccounts=0013000000,0013200000
```

**Behavior:**

- If `selectedAccounts` is provided: uses those accounts for GL filtering
- If `selectedAccounts` is NOT provided: falls back to `inventory-account-master.json`
- Backward compatible — existing calls work unchanged

## Files

| File                                     | Purpose                                     |
| ---------------------------------------- | ------------------------------------------- |
| `services/account.service.js`            | AccountService class - reads SAP tables     |
| `routes/account.routes.js`               | Express route handler                       |
| `tests/test-account-service.js`          | Diagnostic test + Excel export              |
| `output/Account_Discovery.xlsx`          | Generated workbook with discovered accounts |
| `docs/account-discovery-architecture.md` | This documentation                          |

## Integration with Finance Workbook

The `selectedAccounts` parameter passes directly to the existing
`inventoryAccounts` filter in `GLDatasetService.getGLBalances()`.
No changes were required to the GL service or reconciliation logic.

```
selectedAccounts (query param)
    ↓
app.js splits comma-separated string → string[]
    ↓
glFilters.inventoryAccounts = selectedAccounts
    ↓
GLDatasetService._filterByInventoryAccounts() (existing Node.js filter)
    ↓
Only selected accounts appear in reconciliation
```
