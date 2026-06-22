/**
 * Customer Field Mapping Matrix
 *
 * Master reference for customer Excel columns → SAP fields → application fields.
 * This document is the implementation contract with CS team and customer.
 *
 * Status values:
 *   AVAILABLE                - Fully implemented and available in exports
 *   PARTIAL                  - Partially available (e.g., value derived but not exact)
 *   MISSING                  - Not yet implemented
 *   INVESTIGATION_REQUIRED   - Need SAP SME to identify source
 *
 * Customer report: MB52 Inventory Export (Excel)
 */

const FIELD_MAPPINGS = [
  {
    customerColumn: "Material",
    customerSheet: "Inventory Report",
    applicationField: "material",
    sapTable: "MARA",
    sapField: "MATNR",
    status: "AVAILABLE",
    remarks: "Material number, primary key",
  },
  {
    customerColumn: "MTyp",
    customerSheet: "Inventory Report",
    applicationField: "materialType",
    sapTable: "MARA",
    sapField: "MTART",
    status: "AVAILABLE",
    remarks: "Material Type (ROH, HALB, FERT, etc.)",
  },
  {
    customerColumn: "Material Description",
    customerSheet: "Inventory Report",
    applicationField: "materialDescription",
    sapTable: "MAKT",
    sapField: "MAKTX",
    status: "AVAILABLE",
    remarks: "English description (SPRAS = E)",
  },
  {
    customerColumn: "Matl Group",
    customerSheet: "Inventory Report",
    applicationField: "materialGroup",
    sapTable: "MARA",
    sapField: "MATKL",
    status: "AVAILABLE",
    remarks: "Material Group",
  },
  {
    customerColumn: "Plnt",
    customerSheet: "Inventory Report",
    applicationField: "plant",
    sapTable: "MARD",
    sapField: "WERKS",
    status: "AVAILABLE",
    remarks: "Plant code",
  },
  {
    customerColumn: "SLoc",
    customerSheet: "Inventory Report",
    applicationField: "storageLocation",
    sapTable: "MARD",
    sapField: "LGORT",
    status: "AVAILABLE",
    remarks: "Storage Location",
  },
  {
    customerColumn: "S",
    customerSheet: "Inventory Report",
    applicationField: null,
    sapTable: null,
    sapField: null,
    status: "INVESTIGATION_REQUIRED",
    remarks:
      "Special Stock Indicator. Possible source: MARD-SOBKZ or MCHB-SOBKZ. Needs SAP SME confirmation.",
  },
  {
    customerColumn: "Valuation",
    customerSheet: "Inventory Report",
    applicationField: null,
    sapTable: "MBEW",
    sapField: "BWTAR",
    status: "INVESTIGATION_REQUIRED",
    remarks:
      "Valuation Type (split valuation). Available in MBEW-BWTAR but not yet extracted. Needs confirmation if customer uses split valuation.",
  },
  {
    customerColumn: "Special stock number",
    customerSheet: "Inventory Report",
    applicationField: null,
    sapTable: null,
    sapField: null,
    status: "INVESTIGATION_REQUIRED",
    remarks:
      "Could be vendor/customer number for consignment/subcontracting. Source tables: MKOL, MSLB, MSKU. Needs SAP SME.",
  },
  {
    customerColumn: "SL",
    customerSheet: "Inventory Report",
    applicationField: null,
    sapTable: null,
    sapField: null,
    status: "INVESTIGATION_REQUIRED",
    remarks:
      "Possibly Storage Location level indicator or Stock Level. Needs customer clarification.",
  },
  {
    customerColumn: "BUn",
    customerSheet: "Inventory Report",
    applicationField: "baseUnit",
    sapTable: "MARA",
    sapField: "MEINS",
    status: "AVAILABLE",
    remarks: "Base Unit of Measure",
  },
  {
    customerColumn: "Unrestricted",
    customerSheet: "Inventory Report",
    applicationField: "unrestrictedQty",
    sapTable: "MARD",
    sapField: "LABST",
    status: "AVAILABLE",
    remarks: "Unrestricted stock quantity",
  },
  {
    customerColumn: "Crcy",
    customerSheet: "Inventory Report",
    applicationField: null,
    sapTable: "T001",
    sapField: "WAERS",
    status: "MISSING",
    remarks:
      "Company currency. Easy to add from T001 table using company code. Low effort.",
  },
  {
    customerColumn: "Unrestricted Standard Cost",
    customerSheet: "Inventory Report",
    applicationField: "standardCost",
    sapTable: "MBEW",
    sapField: "STPRS",
    status: "AVAILABLE",
    remarks: "Standard Price per unit from material valuation",
  },
  {
    customerColumn: "Value Unrestricted",
    customerSheet: "Inventory Report",
    applicationField: "unrestrictedValue",
    sapTable: "Derived",
    sapField: "LABST × STPRS",
    status: "AVAILABLE",
    remarks:
      "Calculated: Unrestricted Qty × Standard Cost (or Moving Avg Price based on VPRSV)",
  },
  {
    customerColumn: "Transit/Transf.",
    customerSheet: "Inventory Report",
    applicationField: "transitQty",
    sapTable: "MARD",
    sapField: "UMLME",
    status: "AVAILABLE",
    remarks: "Stock in transfer/transit quantity",
  },
  {
    customerColumn: "Val. in Trans./Tfr",
    customerSheet: "Inventory Report",
    applicationField: "transitValue",
    sapTable: "Derived",
    sapField: "UMLME × STPRS",
    status: "AVAILABLE",
    remarks: "Calculated: Transit Qty × Cost",
  },
  {
    customerColumn: "In Quality Insp.",
    customerSheet: "Inventory Report",
    applicationField: "qualityQty",
    sapTable: "MARD",
    sapField: "INSME",
    status: "AVAILABLE",
    remarks: "Quality inspection stock quantity",
  },
  {
    customerColumn: "Value in QualInsp.",
    customerSheet: "Inventory Report",
    applicationField: "qualityValue",
    sapTable: "Derived",
    sapField: "INSME × STPRS",
    status: "AVAILABLE",
    remarks: "Calculated: Quality Qty × Cost",
  },
  {
    customerColumn: "Restricted-Use",
    customerSheet: "Inventory Report",
    applicationField: "restrictedQty",
    sapTable: null,
    sapField: null,
    status: "INVESTIGATION_REQUIRED",
    remarks:
      "Restricted-use stock. Not a standard MARD field. May require MCHB (batch-level) or custom table. Currently set to 0.",
  },
  {
    customerColumn: "Value Restricted",
    customerSheet: "Inventory Report",
    applicationField: "restrictedValue",
    sapTable: null,
    sapField: null,
    status: "INVESTIGATION_REQUIRED",
    remarks: "Depends on Restricted-Use source. Currently derived as 0.",
  },
  {
    customerColumn: "Blocked",
    customerSheet: "Inventory Report",
    applicationField: "blockedQty",
    sapTable: "MARD",
    sapField: "SPEME",
    status: "AVAILABLE",
    remarks: "Blocked stock quantity",
  },
  {
    customerColumn: "Value BlockedStock",
    customerSheet: "Inventory Report",
    applicationField: "blockedValue",
    sapTable: "Derived",
    sapField: "SPEME × STPRS",
    status: "AVAILABLE",
    remarks: "Calculated: Blocked Qty × Cost",
  },
  {
    customerColumn: "Returns",
    customerSheet: "Inventory Report",
    applicationField: "returnsQty",
    sapTable: null,
    sapField: null,
    status: "INVESTIGATION_REQUIRED",
    remarks:
      "Returns stock. Not standard MARD field (RETME not available in all systems). May need MSEG or custom extraction. Currently 0.",
  },
  {
    customerColumn: "Value Rets Blocked",
    customerSheet: "Inventory Report",
    applicationField: "returnsValue",
    sapTable: null,
    sapField: null,
    status: "INVESTIGATION_REQUIRED",
    remarks: "Depends on Returns source. Currently derived as 0.",
  },
];

module.exports = FIELD_MAPPINGS;
