import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSupportRoutes } from '../routes.js';

// Minimal req/res doubles to test handlers without starting a server.
function mockRes() {
  return {
    statusCode: 200, body: null,
    status(c) { this.statusCode = c; return this; },
    json(b) { this.body = b; return this; },
  };
}
// Pull a handler off the express router layer stack by method+path.
function handlerFor(router, method, path) {
  const layer = router.stack.find(
    (l) => l.route?.path === path && l.route?.methods?.[method]);
  assert.ok(layer, `route ${method} ${path} not found`);
  return layer.route.stack[0].handle;
}

test('POST /order-lookup returns the sapClient summary', async () => {
  const sapClient = { getOrderSummary: async (id) => ({ outcome: 'FOUND', data: { salesOrder: id } }) };
  const router = createSupportRoutes({ sapClient, aiAgent: { chat: async () => ({}) } });
  const handle = handlerFor(router, 'post', '/order-lookup');
  const res = mockRes();
  await handle({ body: { salesOrderId: '12345' } }, res);
  assert.equal(res.body.outcome, 'FOUND');
  assert.equal(res.body.data.salesOrder, '12345');
});

test('POST /order-lookup 400 when salesOrderId missing', async () => {
  const router = createSupportRoutes({ sapClient: {}, aiAgent: { chat: async () => ({}) } });
  const handle = handlerFor(router, 'post', '/order-lookup');
  const res = mockRes();
  await handle({ body: {} }, res);
  assert.equal(res.statusCode, 400);
});

test('POST /chat returns the aiAgent result', async () => {
  const aiAgent = { chat: async ({ message }) => ({ reply: 'hi ' + message, orderData: null, needsTicket: false, ticketDraft: null }) };
  const router = createSupportRoutes({ sapClient: {}, aiAgent });
  const handle = handlerFor(router, 'post', '/chat');
  const res = mockRes();
  await handle({ body: { message: 'x', history: [] } }, res);
  assert.match(res.body.reply, /hi x/);
});

test('POST /chat 400 when message missing', async () => {
  const router = createSupportRoutes({ sapClient: {}, aiAgent: { chat: async () => ({}) } });
  const handle = handlerFor(router, 'post', '/chat');
  const res = mockRes();
  await handle({ body: {} }, res);
  assert.equal(res.statusCode, 400);
});
