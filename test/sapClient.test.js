import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSapClient } from '../sapClient.js';

const env = {
  SAP_ODATA_BASE_URL: 'https://sap.example/sap/opu/odata/sap',
  SAP_SALES_ORDER_SERVICE: 'API_SALES_ORDER_SRV',
  SAP_SALES_ORDER_ENTITY: 'A_SalesOrder',
  SAP_USERNAME: 'u', SAP_PASSWORD: 'p', SAP_CLIENT: '100',
  SAP_TLS_INSECURE: 'true',
};

// Fake axios-like instance: returns scripted responses or throws scripted errors.
function fakeHttp(handler) {
  return { get: async (url) => handler(url) };
}

test('getSalesOrder normalizes a found OData entity', async () => {
  const http = fakeHttp(async () => ({
    data: { d: {
      SalesOrder: '0000012345', SalesOrderType: 'OR',
      OverallSDProcessStatus: 'B', TotalNetAmount: '1500.00', TransactionCurrency: 'USD',
      to_Item: { results: [{ Material: 'MAT01', RequestedQuantity: '2', NetAmount: '750.00' }] },
    } },
  }));
  const sap = createSapClient(env, { http });
  const res = await sap.getSalesOrder('0000012345');
  assert.equal(res.outcome, 'FOUND');
  assert.equal(res.data.salesOrder, '0000012345');
  assert.equal(res.data.currency, 'USD');
  assert.equal(res.data.items.length, 1);
  assert.equal(res.data.items[0].material, 'MAT01');
});

test('getSalesOrder returns NOT_FOUND on 404', async () => {
  const http = fakeHttp(async () => { const e = new Error('nf'); e.response = { status: 404 }; throw e; });
  const sap = createSapClient(env, { http });
  const res = await sap.getSalesOrder('999');
  assert.equal(res.outcome, 'NOT_FOUND');
});

test('getSalesOrder returns AUTH_ERROR on 401', async () => {
  const http = fakeHttp(async () => { const e = new Error('auth'); e.response = { status: 401 }; throw e; });
  const sap = createSapClient(env, { http });
  const res = await sap.getSalesOrder('1');
  assert.equal(res.outcome, 'AUTH_ERROR');
});

test('getSalesOrder returns UNREACHABLE on connection timeout', async () => {
  const http = fakeHttp(async () => { const e = new Error('timeout'); e.code = 'ECONNABORTED'; throw e; });
  const sap = createSapClient(env, { http });
  const res = await sap.getSalesOrder('1');
  assert.equal(res.outcome, 'UNREACHABLE');
});

test('getLatestSalesOrder returns the newest order from a list', async () => {
  const http = fakeHttp(async (url) => {
    assert.ok(url.includes('$orderby='), 'should order the list');
    assert.ok(url.includes('$top=1'), 'should take only the newest');
    return { data: { d: { results: [{
      SalesOrder: '0000099999', SalesOrderType: 'OR', OverallSDProcessStatus: 'A',
      TotalNetAmount: '10.00', TransactionCurrency: 'USD', to_Item: { results: [] },
    }] } } };
  });
  const sap = createSapClient(env, { http });
  const res = await sap.getLatestSalesOrder();
  assert.equal(res.outcome, 'FOUND');
  assert.equal(res.data.salesOrder, '0000099999');
});

test('getLatestSalesOrder returns NOT_FOUND on empty list', async () => {
  const http = fakeHttp(async () => ({ data: { d: { results: [] } } }));
  const sap = createSapClient(env, { http });
  const res = await sap.getLatestSalesOrder();
  assert.equal(res.outcome, 'NOT_FOUND');
});

test('getOrderSummary merges sales order with process order and status', async () => {
  const http = {
    get: async (url) => {
      if (url.includes("A_SalesOrder('")) {
        return { data: { d: {
          SalesOrder: '0000012345', SalesOrderType: 'OR', OverallSDProcessStatus: 'B',
          TotalNetAmount: '1500.00', TransactionCurrency: 'USD', to_Item: { results: [] },
        } } };
      }
      if (url.includes('processOrder')) return { data: { ProcessOrder: 'PO-777' } };
      if (url.includes('status')) return { data: { ShipmentNumber: 'SHIP-555' } };
      throw new Error('unexpected url ' + url);
    },
  };
  const sap = createSapClient({ ...env,
    SAP_BASE_URL: 'https://sap.example/sap/bc/http/zposetra/connection',
    SAP_PROCESS_ORDER_API: '/sap/bc/http/zposetra/processOrder',
    SAP_STATUS_API: '/sap/bc/http/zposetra/status',
  }, { http });
  const res = await sap.getOrderSummary('0000012345');
  assert.equal(res.outcome, 'FOUND');
  assert.equal(res.data.processOrder, 'PO-777');
  assert.equal(res.data.shipmentNumber, 'SHIP-555');
  assert.deepEqual(res.data.missingFields, []);
});

test('getOrderSummary NOT_FOUND when sales order missing (skips custom calls)', async () => {
  const http = { get: async () => { const e = new Error('nf'); e.response = { status: 404 }; throw e; } };
  const sap = createSapClient(env, { http });
  const res = await sap.getOrderSummary('999');
  assert.equal(res.outcome, 'NOT_FOUND');
  assert.equal(res.data, null);
});

test('getOrderSummary keeps order even if custom endpoints fail (fields stay missing)', async () => {
  const http = {
    get: async (url) => {
      if (url.includes("A_SalesOrder('")) {
        return { data: { d: {
          SalesOrder: '1', SalesOrderType: 'OR', OverallSDProcessStatus: 'B',
          TotalNetAmount: '1.00', TransactionCurrency: 'USD', to_Item: { results: [] },
        } } };
      }
      const e = new Error('down'); e.code = 'ECONNABORTED'; throw e;
    },
  };
  const sap = createSapClient({ ...env, SAP_BASE_URL: 'https://sap.example/z', SAP_PROCESS_ORDER_API: '/p', SAP_STATUS_API: '/s' }, { http });
  const res = await sap.getOrderSummary('1');
  assert.equal(res.outcome, 'FOUND');
  assert.equal(res.data.processOrder, null);
  assert.equal(res.data.shipmentNumber, null);
  assert.deepEqual(res.data.missingFields, ['processOrder', 'shipmentNumber']);
});
