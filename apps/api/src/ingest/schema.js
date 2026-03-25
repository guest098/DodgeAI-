export const tableSchemas = {
  sales_order_headers: [
    "salesOrder TEXT PRIMARY KEY",
    "salesOrderType TEXT",
    "salesOrganization TEXT",
    "distributionChannel TEXT",
    "organizationDivision TEXT",
    "soldToParty TEXT",
    "creationDate TEXT",
    "totalNetAmount REAL",
    "overallDeliveryStatus TEXT",
    "overallOrdReltdBillgStatus TEXT",
    "transactionCurrency TEXT",
    "requestedDeliveryDate TEXT",
    "customerPaymentTerms TEXT"
  ],
  sales_order_items: [
    "rowKey TEXT PRIMARY KEY",
    "salesOrder TEXT",
    "salesOrderItem TEXT",
    "material TEXT",
    "requestedQuantity REAL",
    "requestedQuantityUnit TEXT",
    "netAmount REAL",
    "transactionCurrency TEXT",
    "productionPlant TEXT",
    "storageLocation TEXT"
  ],
  outbound_delivery_headers: [
    "deliveryDocument TEXT PRIMARY KEY",
    "creationDate TEXT",
    "shippingPoint TEXT",
    "overallGoodsMovementStatus TEXT",
    "overallPickingStatus TEXT"
  ],
  outbound_delivery_items: [
    "rowKey TEXT PRIMARY KEY",
    "deliveryDocument TEXT",
    "deliveryDocumentItem TEXT",
    "plant TEXT",
    "storageLocation TEXT",
    "actualDeliveryQuantity REAL",
    "deliveryQuantityUnit TEXT",
    "referenceSdDocument TEXT",
    "referenceSdDocumentItem TEXT"
  ],
  billing_document_headers: [
    "billingDocument TEXT PRIMARY KEY",
    "billingDocumentType TEXT",
    "creationDate TEXT",
    "billingDocumentDate TEXT",
    "billingDocumentIsCancelled INTEGER",
    "cancelledBillingDocument TEXT",
    "totalNetAmount REAL",
    "transactionCurrency TEXT",
    "companyCode TEXT",
    "fiscalYear TEXT",
    "accountingDocument TEXT",
    "soldToParty TEXT"
  ],
  billing_document_cancellations: [
    "billingDocument TEXT PRIMARY KEY",
    "billingDocumentType TEXT",
    "creationDate TEXT",
    "billingDocumentDate TEXT",
    "billingDocumentIsCancelled INTEGER",
    "cancelledBillingDocument TEXT",
    "totalNetAmount REAL",
    "transactionCurrency TEXT",
    "companyCode TEXT",
    "fiscalYear TEXT",
    "accountingDocument TEXT",
    "soldToParty TEXT"
  ],
  billing_document_items: [
    "rowKey TEXT PRIMARY KEY",
    "billingDocument TEXT",
    "billingDocumentItem TEXT",
    "material TEXT",
    "billingQuantity REAL",
    "billingQuantityUnit TEXT",
    "netAmount REAL",
    "transactionCurrency TEXT",
    "referenceSdDocument TEXT",
    "referenceSdDocumentItem TEXT"
  ],
  journal_entry_items_accounts_receivable: [
    "rowKey TEXT PRIMARY KEY",
    "companyCode TEXT",
    "fiscalYear TEXT",
    "accountingDocument TEXT",
    "glAccount TEXT",
    "referenceDocument TEXT",
    "transactionCurrency TEXT",
    "amountInTransactionCurrency REAL",
    "postingDate TEXT",
    "documentDate TEXT",
    "accountingDocumentType TEXT",
    "accountingDocumentItem TEXT",
    "customer TEXT",
    "clearingDate TEXT",
    "clearingAccountingDocument TEXT",
    "clearingDocFiscalYear TEXT"
  ],
  payments_accounts_receivable: [
    "rowKey TEXT PRIMARY KEY",
    "companyCode TEXT",
    "fiscalYear TEXT",
    "accountingDocument TEXT",
    "accountingDocumentItem TEXT",
    "clearingDate TEXT",
    "clearingAccountingDocument TEXT",
    "clearingDocFiscalYear TEXT",
    "amountInTransactionCurrency REAL",
    "transactionCurrency TEXT",
    "customer TEXT"
  ],
  business_partners: [
    "businessPartner TEXT PRIMARY KEY",
    "customer TEXT",
    "businessPartnerFullName TEXT",
    "businessPartnerName TEXT",
    "businessPartnerIsBlocked INTEGER"
  ],
  business_partner_addresses: [
    "rowKey TEXT PRIMARY KEY",
    "businessPartner TEXT",
    "addressId TEXT",
    "cityName TEXT",
    "country TEXT",
    "postalCode TEXT",
    "region TEXT",
    "streetName TEXT"
  ],
  customer_company_assignments: [
    "rowKey TEXT PRIMARY KEY",
    "customer TEXT",
    "companyCode TEXT",
    "paymentTerms TEXT",
    "reconciliationAccount TEXT",
    "deletionIndicator INTEGER",
    "customerAccountGroup TEXT"
  ],
  customer_sales_area_assignments: [
    "rowKey TEXT PRIMARY KEY",
    "customer TEXT",
    "salesOrganization TEXT",
    "distributionChannel TEXT",
    "division TEXT",
    "currency TEXT",
    "customerPaymentTerms TEXT",
    "deliveryPriority TEXT",
    "incotermsClassification TEXT",
    "incotermsLocation1 TEXT",
    "shippingCondition TEXT"
  ],
  products: [
    "product TEXT PRIMARY KEY",
    "productType TEXT",
    "productOldId TEXT",
    "productGroup TEXT",
    "baseUnit TEXT"
  ],
  product_descriptions: [
    "rowKey TEXT PRIMARY KEY",
    "product TEXT",
    "language TEXT",
    "productDescription TEXT"
  ],
  plants: [
    "plant TEXT PRIMARY KEY",
    "plantName TEXT",
    "valuationArea TEXT",
    "customer TEXT",
    "supplier TEXT",
    "salesOrganization TEXT"
  ],
  product_plants: [
    "rowKey TEXT PRIMARY KEY",
    "product TEXT",
    "plant TEXT",
    "countryOfOrigin TEXT",
    "regionOfOrigin TEXT",
    "availabilityCheckType TEXT",
    "profitCenter TEXT",
    "mrpType TEXT"
  ],
  product_storage_locations: [
    "rowKey TEXT PRIMARY KEY",
    "product TEXT",
    "plant TEXT",
    "storageLocation TEXT",
    "physicalInventoryBlockInd TEXT",
    "dateOfLastPostedCntUnRstrcdStk TEXT"
  ],
  sales_order_schedule_lines: [
    "rowKey TEXT PRIMARY KEY",
    "salesOrder TEXT",
    "salesOrderItem TEXT",
    "scheduleLine TEXT",
    "confirmedDeliveryDate TEXT",
    "orderQuantityUnit TEXT",
    "confdOrderQtyByMatlAvailCheck REAL"
  ],
  graph_nodes: [
    "id TEXT PRIMARY KEY",
    "kind TEXT",
    "label TEXT",
    "groupName TEXT",
    "refId TEXT",
    "payload TEXT"
  ],
  graph_edges: [
    "id TEXT PRIMARY KEY",
    "source TEXT",
    "target TEXT",
    "relationship TEXT",
    "payload TEXT"
  ],
  search_documents: [
    "id TEXT PRIMARY KEY",
    "sourceType TEXT",
    "sourceId TEXT",
    "label TEXT",
    "content TEXT",
    "embedding TEXT",
    "payload TEXT"
  ]
};
