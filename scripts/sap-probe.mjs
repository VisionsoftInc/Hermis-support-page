// Read-only SAP probe. Run from a SAP-whitelisted machine:
//   node scripts/sap-probe.mjs <salesOrderId>
//
// Purpose: see the REAL JSON shape SAP returns so we can finalize the custom
// zposetra/processOrder and zposetra/status field mapping in sapClient.js.
import 'dotenv/config';
import { createSapClient } from '../sapClient.js';

const id = process.argv[2];
const sap = createSapClient(process.env);

console.log('--- getLatestSalesOrder ---');
console.dir(await sap.getLatestSalesOrder(), { depth: 6 });

if (id) {
  console.log(`\n--- getSalesOrder(${id}) ---`);
  console.dir(await sap.getSalesOrder(id), { depth: 6 });
  console.log(`\n--- getOrderSummary(${id}) ---`);
  console.dir(await sap.getOrderSummary(id), { depth: 6 });
} else {
  console.log('\n(Tip: pass a real sales order number to also probe getSalesOrder/getOrderSummary)');
}
