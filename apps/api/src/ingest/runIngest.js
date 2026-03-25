import fs from "node:fs";
import path from "node:path";
import { config } from "../config.js";
import { loadJsonlDirectory } from "../lib/jsonl.js";
import { getDb } from "../lib/db.js";
import { tableSchemas } from "./schema.js";
import { normalizers } from "./normalizers.js";
import { rebuildSearchIndex } from "../services/semanticSearchService.js";

const INGEST_TABLES = [
  "sales_order_headers",
  "sales_order_items",
  "sales_order_schedule_lines",
  "outbound_delivery_headers",
  "outbound_delivery_items",
  "billing_document_headers",
  "billing_document_cancellations",
  "billing_document_items",
  "journal_entry_items_accounts_receivable",
  "payments_accounts_receivable",
  "business_partners",
  "business_partner_addresses",
  "customer_company_assignments",
  "customer_sales_area_assignments",
  "products",
  "product_descriptions",
  "plants",
  "product_plants",
  "product_storage_locations",
];

function createTables(db) {
  for (const [tableName, columns] of Object.entries(tableSchemas)) {
    db.exec(`DROP TABLE IF EXISTS ${tableName}`);
    db.exec(`CREATE TABLE ${tableName} (${columns.join(", ")})`);
  }
}

function insertRows(db, tableName, rows) {
  if (!rows.length) {
    return;
  }
  const keys = Object.keys(rows[0]);
  const placeholders = keys.map((key) => `@${key}`).join(", ");
  const statement = db.prepare(
    `INSERT INTO ${tableName} (${keys.join(", ")}) VALUES (${placeholders})`,
  );
  const transaction = db.transaction((batch) => {
    for (const row of batch) {
      statement.run(row);
    }
  });
  transaction(rows);
}

function addNode(statement, id, kind, label, groupName, refId, payload) {
  statement.run(id, kind, label, groupName, refId, JSON.stringify(payload));
}

function addEdge(statement, id, source, target, relationship, payload = {}) {
  statement.run(id, source, target, relationship, JSON.stringify(payload));
}

function buildGraph(db) {
  const insertNode = db.prepare(
    "INSERT OR IGNORE INTO graph_nodes (id, kind, label, groupName, refId, payload) VALUES (?, ?, ?, ?, ?, ?)",
  );
  const insertEdge = db.prepare(
    "INSERT OR IGNORE INTO graph_edges (id, source, target, relationship, payload) VALUES (?, ?, ?, ?, ?)",
  );

  const salesOrders = db.prepare("SELECT * FROM sales_order_headers").all();
  const salesOrderItems = db.prepare("SELECT * FROM sales_order_items").all();
  const deliveries = db.prepare("SELECT * FROM outbound_delivery_headers").all();
  const deliveryItems = db.prepare("SELECT * FROM outbound_delivery_items").all();
  const billings = db.prepare("SELECT * FROM billing_document_headers").all();
  const billingCancellations = db.prepare("SELECT * FROM billing_document_cancellations").all();
  const billingItems = db.prepare("SELECT * FROM billing_document_items").all();
  const journals = db.prepare("SELECT * FROM journal_entry_items_accounts_receivable").all();
  const payments = db.prepare("SELECT * FROM payments_accounts_receivable").all();
  const customers = db.prepare("SELECT * FROM business_partners").all();
  const addresses = db.prepare("SELECT * FROM business_partner_addresses").all();
  const customerCompanyAssignments = db.prepare("SELECT * FROM customer_company_assignments").all();
  const customerSalesAreaAssignments = db.prepare("SELECT * FROM customer_sales_area_assignments").all();
  const products = db.prepare("SELECT * FROM products").all();
  const descriptions = db.prepare("SELECT * FROM product_descriptions").all();
  const plants = db.prepare("SELECT * FROM plants").all();
  const productPlants = db.prepare("SELECT * FROM product_plants").all();
  const productStorageLocations = db.prepare("SELECT * FROM product_storage_locations").all();
  const scheduleLines = db.prepare("SELECT * FROM sales_order_schedule_lines").all();

  const descriptionsByProduct = new Map(
    descriptions.map((row) => [row.product, row.productDescription]),
  );

  for (const row of salesOrders) {
    addNode(insertNode, `sales-order:${row.salesOrder}`, "SalesOrder", row.salesOrder, "sales-order", row.salesOrder, row);
    if (row.soldToParty) {
      addEdge(insertEdge, `customer-order:${row.soldToParty}:${row.salesOrder}`, `customer:${row.soldToParty}`, `sales-order:${row.salesOrder}`, "PLACED_ORDER");
    }
  }

  for (const row of salesOrderItems) {
    const itemId = `sales-order-item:${row.salesOrder}:${row.salesOrderItem}`;
    addNode(insertNode, itemId, "SalesOrderItem", `${row.salesOrder}/${row.salesOrderItem}`, "sales-order-item", row.rowKey, row);
    addEdge(insertEdge, `has-order-item:${row.rowKey}`, `sales-order:${row.salesOrder}`, itemId, "HAS_ITEM");
    if (row.material) {
      addEdge(insertEdge, `order-item-product:${row.rowKey}`, itemId, `product:${row.material}`, "REQUESTS_PRODUCT");
    }
    if (row.productionPlant) {
      addEdge(insertEdge, `order-item-plant:${row.rowKey}`, itemId, `plant:${row.productionPlant}`, "FULFILLED_BY", { storageLocation: row.storageLocation });
    }
  }

  for (const row of scheduleLines) {
    const lineId = `schedule-line:${row.salesOrder}:${row.salesOrderItem}:${row.scheduleLine}`;
    addNode(
      insertNode,
      lineId,
      "ScheduleLine",
      `${row.salesOrder}/${row.salesOrderItem}/${row.scheduleLine}`,
      "schedule-line",
      row.rowKey,
      row,
    );
    addEdge(
      insertEdge,
      `order-item-schedule:${row.rowKey}`,
      `sales-order-item:${row.salesOrder}:${row.salesOrderItem}`,
      lineId,
      "HAS_SCHEDULE_LINE",
    );
  }

  for (const row of deliveries) {
    addNode(insertNode, `delivery:${row.deliveryDocument}`, "Delivery", row.deliveryDocument, "delivery", row.deliveryDocument, row);
  }

  for (const row of deliveryItems) {
    const itemId = `delivery-item:${row.deliveryDocument}:${row.deliveryDocumentItem}`;
    addNode(insertNode, itemId, "DeliveryItem", `${row.deliveryDocument}/${row.deliveryDocumentItem}`, "delivery-item", row.rowKey, row);
    addEdge(insertEdge, `has-delivery-item:${row.rowKey}`, `delivery:${row.deliveryDocument}`, itemId, "HAS_ITEM");
    addEdge(
      insertEdge,
      `delivery-from-order:${row.rowKey}`,
      `sales-order-item:${row.referenceSdDocument}:${String(row.referenceSdDocumentItem).replace(/^0+/, "") || row.referenceSdDocumentItem}`,
      itemId,
      "FULFILLED_BY_DELIVERY",
    );
    if (row.plant) {
      addEdge(insertEdge, `delivery-plant:${row.rowKey}`, itemId, `plant:${row.plant}`, "SHIPPED_FROM", { storageLocation: row.storageLocation });
    }
  }

  for (const row of billings) {
    addNode(insertNode, `billing:${row.billingDocument}`, "BillingDocument", row.billingDocument, "billing", row.billingDocument, row);
    if (row.soldToParty) {
      addEdge(insertEdge, `customer-billing:${row.soldToParty}:${row.billingDocument}`, `customer:${row.soldToParty}`, `billing:${row.billingDocument}`, "RECEIVED_BILL");
    }
  }

  for (const row of billingCancellations) {
    const cancellationId = `billing-cancellation:${row.billingDocument}`;
    addNode(
      insertNode,
      cancellationId,
      "BillingCancellation",
      `${row.billingDocument} cancelled`,
      "billing-cancellation",
      row.billingDocument,
      row,
    );
    addEdge(
      insertEdge,
      `billing-cancelled:${row.billingDocument}`,
      `billing:${row.billingDocument}`,
      cancellationId,
      "HAS_CANCELLATION",
    );
    if (row.cancelledBillingDocument) {
      addEdge(
        insertEdge,
        `billing-cancels-doc:${row.billingDocument}:${row.cancelledBillingDocument}`,
        cancellationId,
        `billing:${row.cancelledBillingDocument}`,
        "CANCELS_DOCUMENT",
      );
    }
  }

  for (const row of billingItems) {
    const itemId = `billing-item:${row.billingDocument}:${row.billingDocumentItem}`;
    addNode(insertNode, itemId, "BillingItem", `${row.billingDocument}/${row.billingDocumentItem}`, "billing-item", row.rowKey, row);
    addEdge(insertEdge, `has-billing-item:${row.rowKey}`, `billing:${row.billingDocument}`, itemId, "HAS_ITEM");
    addEdge(insertEdge, `billing-from-delivery:${row.rowKey}`, `delivery-item:${row.referenceSdDocument}:${row.referenceSdDocumentItem}`, itemId, "BILLED_FROM_DELIVERY");
    if (row.material) {
      addEdge(insertEdge, `billing-item-product:${row.rowKey}`, itemId, `product:${row.material}`, "BILLS_PRODUCT");
    }
  }

  for (const row of journals) {
    addNode(insertNode, `journal:${row.accountingDocument}`, "JournalEntry", row.accountingDocument, "journal", row.accountingDocument, row);
    if (row.referenceDocument) {
      addEdge(insertEdge, `journal-from-billing:${row.rowKey}`, `billing:${row.referenceDocument}`, `journal:${row.accountingDocument}`, "POSTED_TO");
    }
  }

  for (const row of payments) {
    addNode(insertNode, `payment:${row.clearingAccountingDocument}`, "Payment", row.clearingAccountingDocument, "payment", row.rowKey, row);
    addEdge(insertEdge, `payment-clears-journal:${row.rowKey}`, `journal:${row.accountingDocument}`, `payment:${row.clearingAccountingDocument}`, "CLEARED_BY", { clearingDate: row.clearingDate });
  }

  for (const row of customers) {
    addNode(insertNode, `customer:${row.businessPartner}`, "Customer", row.businessPartnerName || row.businessPartnerFullName || row.businessPartner, "customer", row.businessPartner, row);
  }

  for (const row of addresses) {
    addNode(insertNode, `address:${row.addressId}`, "Address", row.cityName || row.addressId, "address", row.rowKey, row);
    addEdge(insertEdge, `customer-address:${row.rowKey}`, `customer:${row.businessPartner}`, `address:${row.addressId}`, "HAS_ADDRESS");
  }

  for (const row of customerCompanyAssignments) {
    const assignmentId = `customer-company:${row.customer}:${row.companyCode}`;
    addNode(
      insertNode,
      assignmentId,
      "CustomerCompanyAssignment",
      `${row.customer}/${row.companyCode}`,
      "customer-company",
      row.rowKey,
      row,
    );
    addEdge(
      insertEdge,
      `customer-company-edge:${row.rowKey}`,
      `customer:${row.customer}`,
      assignmentId,
      "HAS_COMPANY_ASSIGNMENT",
    );
  }

  for (const row of customerSalesAreaAssignments) {
    const assignmentId = `customer-sales-area:${row.customer}:${row.salesOrganization}:${row.distributionChannel}:${row.division}`;
    addNode(
      insertNode,
      assignmentId,
      "CustomerSalesArea",
      `${row.salesOrganization}/${row.distributionChannel}/${row.division}`,
      "customer-sales-area",
      row.rowKey,
      row,
    );
    addEdge(
      insertEdge,
      `customer-sales-area-edge:${row.rowKey}`,
      `customer:${row.customer}`,
      assignmentId,
      "HAS_SALES_AREA",
    );
  }

  for (const row of products) {
    addNode(
      insertNode,
      `product:${row.product}`,
      "Product",
      descriptionsByProduct.get(row.product) || row.productOldId || row.product,
      "product",
      row.product,
      { ...row, productDescription: descriptionsByProduct.get(row.product) || "" },
    );
  }

  for (const row of plants) {
    addNode(insertNode, `plant:${row.plant}`, "Plant", row.plantName || row.plant, "plant", row.plant, row);
  }

  for (const row of productPlants) {
    const productPlantId = `product-plant:${row.product}:${row.plant}`;
    addNode(
      insertNode,
      productPlantId,
      "ProductPlant",
      `${row.product}/${row.plant}`,
      "product-plant",
      row.rowKey,
      row,
    );
    addEdge(
      insertEdge,
      `product-plant-edge:${row.rowKey}`,
      `product:${row.product}`,
      productPlantId,
      "AVAILABLE_AT_PLANT",
    );
    addEdge(
      insertEdge,
      `product-plant-plant:${row.rowKey}`,
      productPlantId,
      `plant:${row.plant}`,
      "MAPS_TO_PLANT",
    );
  }

  for (const row of productStorageLocations) {
    const storageId = `storage-location:${row.product}:${row.plant}:${row.storageLocation}`;
    addNode(
      insertNode,
      storageId,
      "StorageLocation",
      `${row.plant}/${row.storageLocation}`,
      "storage-location",
      row.rowKey,
      row,
    );
    addEdge(
      insertEdge,
      `product-storage:${row.rowKey}`,
      `product:${row.product}`,
      storageId,
      "STORED_AT",
    );
    addEdge(
      insertEdge,
      `storage-plant:${row.rowKey}`,
      storageId,
      `plant:${row.plant}`,
      "BELONGS_TO_PLANT",
    );
  }
}

async function main() {
  if (!fs.existsSync(config.datasetRoot)) {
    throw new Error(`Dataset root not found: ${config.datasetRoot}`);
  }

  const db = getDb();
  createTables(db);

  for (const tableName of INGEST_TABLES) {
    const records = await loadJsonlDirectory(path.join(config.datasetRoot, tableName));
    insertRows(db, tableName, records.map(normalizers[tableName]));
    console.log(`Loaded ${records.length} rows into ${tableName}`);
  }

  buildGraph(db);
  rebuildSearchIndex();
  console.log(`SQLite database created at ${config.sqlitePath}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
