import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createPosetraClient } from '../posetraClient.js';

const env = {
  POSETRA_BASE_URL: 'https://posetra.example',
  POSETRA_EMAIL: 'svc@example.com',
  POSETRA_PASSWORD: 'pw',
};

// Fake http with scripted login + orders.
function fakeHttp({ token = 'tok123', orders, loginStatus } = {}) {
  return {
    calls: { login: 0, orders: 0 },
    async post(url, body) {
      this.calls.login++;
      if (loginStatus && loginStatus !== 200) {
        const e = new Error('login failed'); e.response = { status: loginStatus, data: { error: 'bad' } }; throw e;
      }
      return { data: { message: 'Success', token, role: 'distributor' } };
    },
    async get(url, cfg) {
      this.calls.orders++;
      assert.match(cfg?.headers?.Authorization || '', /^Bearer /, 'must send bearer token');
      return { data: orders };
    },
  };
}

const SAMPLE = {
  consumerOrders: [
    { _id: 'a1', sapSalesOrderNumber: '991', sapDeliveryNumber: '80000205', sapShipmentNumber: '',
      sapBillingNumber: '95000178', overallStatus: 'DELIVERY_CREATED', grandTotal: 174.6,
      trackingNumber: 'BOL1', courier: 'USPS', createdAt: '2026-05-26T11:17:04.687Z',
      items: [{ materialId: 'MAT086', name: 'Brush', quantity: 1, price: '$10.9' }] },
  ],
  userSpecificOrders: [
    { _id: 'b2', sapSalesOrderNumber: '924  ', sapDeliveryNumber: '80000201  ', sapShipmentNumber: '   ',
      sapBillingNumber: '95000174', overallStatus: 'PENDING', grandTotal: 50,
      createdAt: '2026-05-29T08:15:57.318Z', items: [] },
  ],
};

test('getLatestSalesOrder returns the newest order by createdAt', async () => {
  const http = fakeHttp({ orders: SAMPLE });
  const p = createPosetraClient(env, { http });
  const res = await p.getLatestSalesOrder();
  assert.equal(res.outcome, 'FOUND');
  assert.equal(res.data.orderId, 'b2');             // b2 is newest (May 29 > May 26)
  assert.equal(res.data.salesOrder, '924');         // trimmed
  assert.equal(res.data.status, 'PENDING');
});

test('getOrderSummary matches by sapSalesOrderNumber (trims spaces)', async () => {
  const http = fakeHttp({ orders: SAMPLE });
  const p = createPosetraClient(env, { http });
  const res = await p.getOrderSummary('924');
  assert.equal(res.outcome, 'FOUND');
  assert.equal(res.data.orderId, 'b2');
  assert.equal(res.data.deliveryNumber, '80000201'); // trimmed
  assert.equal(res.data.shipmentNumber, null);       // all-spaces -> null
});

test('getOrderSummary matches by Mongo _id too', async () => {
  const http = fakeHttp({ orders: SAMPLE });
  const p = createPosetraClient(env, { http });
  const res = await p.getOrderSummary('a1');
  assert.equal(res.outcome, 'FOUND');
  assert.equal(res.data.salesOrder, '991');
  assert.equal(res.data.items.length, 1);
  assert.equal(res.data.items[0].material, 'MAT086');
});

test('getOrderSummary returns NOT_FOUND when no order matches', async () => {
  const http = fakeHttp({ orders: SAMPLE });
  const p = createPosetraClient(env, { http });
  const res = await p.getOrderSummary('999999');
  assert.equal(res.outcome, 'NOT_FOUND');
  assert.equal(res.data, null);
});

test('AUTH_ERROR when login is rejected', async () => {
  const http = fakeHttp({ orders: SAMPLE, loginStatus: 400 });
  const p = createPosetraClient(env, { http });
  const res = await p.getLatestSalesOrder();
  assert.equal(res.outcome, 'AUTH_ERROR');
});

test('UNREACHABLE when the network fails', async () => {
  const http = {
    async post() { const e = new Error('down'); e.code = 'ECONNABORTED'; throw e; },
    async get() { const e = new Error('down'); e.code = 'ECONNABORTED'; throw e; },
  };
  const p = createPosetraClient(env, { http });
  const res = await p.getLatestSalesOrder();
  assert.equal(res.outcome, 'UNREACHABLE');
});

test('token is reused across calls (login once)', async () => {
  const http = fakeHttp({ orders: SAMPLE });
  const p = createPosetraClient(env, { http });
  await p.getLatestSalesOrder();
  await p.getOrderSummary('991');
  assert.equal(http.calls.login, 1, 'should log in only once');
  assert.equal(http.calls.orders, 2);
});
