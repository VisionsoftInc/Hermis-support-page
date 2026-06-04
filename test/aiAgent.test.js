import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createAiAgent } from '../aiAgent.js';

// Scripted Anthropic stub: yields queued responses in order.
function fakeAnthropic(responses) {
  let i = 0;
  return { messages: { create: async () => responses[i++] } };
}
const text = (t) => ({ stop_reason: 'end_turn', content: [{ type: 'text', text: t }] });
const toolUse = (name, input) => ({ stop_reason: 'tool_use', content: [{ type: 'tool_use', id: 'tu_1', name, input }] });

test('chat calls lookup_sap_order and returns reply + orderData, no ticket when FOUND', async () => {
  const anthropic = fakeAnthropic([
    toolUse('lookup_sap_order', { salesOrderId: '12345' }),
    text('Order 12345 is In Process, total USD 1500.'),
  ]);
  const sapClient = {
    getOrderSummary: async () => ({ outcome: 'FOUND', data: { salesOrder: '12345', overallStatus: 'In Process' } }),
    getLatestSalesOrder: async () => ({ outcome: 'NOT_FOUND', data: null }),
  };
  const agent = createAiAgent({ anthropic, sapClient, model: 'claude-sonnet-4-6' });
  const res = await agent.chat({ message: 'status of order 12345', history: [] });
  assert.match(res.reply, /In Process/);
  assert.equal(res.orderData.salesOrder, '12345');
  assert.equal(res.needsTicket, false);
  assert.equal(res.ticketDraft, null);
});

test('chat sets needsTicket and a ticketDraft when SAP says NOT_FOUND', async () => {
  const anthropic = fakeAnthropic([
    toolUse('lookup_sap_order', { salesOrderId: '99999' }),
    text("I couldn't find order 99999. I can raise a ticket."),
  ]);
  const sapClient = {
    getOrderSummary: async () => ({ outcome: 'NOT_FOUND', data: null }),
    getLatestSalesOrder: async () => ({ outcome: 'NOT_FOUND', data: null }),
  };
  const agent = createAiAgent({ anthropic, sapClient });
  const res = await agent.chat({ message: 'status of order 99999', history: [] });
  assert.equal(res.needsTicket, true);
  assert.ok(res.ticketDraft.subject.includes('99999'));
  assert.ok(res.ticketDraft.description.length > 0);
});

test('chat handles get_latest_sales_order tool', async () => {
  const anthropic = fakeAnthropic([
    toolUse('get_latest_sales_order', {}),
    text('The latest order is 99999.'),
  ]);
  const sapClient = {
    getOrderSummary: async () => ({ outcome: 'NOT_FOUND', data: null }),
    getLatestSalesOrder: async () => ({ outcome: 'FOUND', data: { salesOrder: '99999', overallStatus: 'Not Started' } }),
  };
  const agent = createAiAgent({ anthropic, sapClient });
  const res = await agent.chat({ message: 'what is the last order?', history: [] });
  assert.equal(res.orderData.salesOrder, '99999');
  assert.equal(res.needsTicket, false);
});
