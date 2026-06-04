# SAP Order Lookup in Support Chatbot — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the support chatbot answer SAP sales-order questions (by order number, or "the latest order") with live status + details fetched directly from SAP, and raise a Hermis ticket when SAP has no answer.

**Architecture:** Server-side only for secrets. A `sapClient` module talks to SAP (OData + custom zposetra endpoints) over Basic auth and normalizes results with an outcome tag. An `aiAgent` module wraps Claude (Sonnet 4.6) with two tools that call `sapClient`. Two new Express routes expose chat + a direct lookup. The browser chat is re-pointed at our own server (the Gemini browser key is removed). Order data shown to customers comes verbatim from `sapClient`; the ticket decision is made by code based on the SAP outcome.

**Tech Stack:** Node ESM, Express 5, axios (already present), `@anthropic-ai/sdk` (new), Node built-in `node --test` for tests.

**Reference spec:** `docs/superpowers/specs/2026-06-04-sap-order-lookup-chatbot-design.md`

---

## File Structure

- Create `sapClient.js` — all SAP HTTP access + normalization + outcome tagging. Factory `createSapClient(env, deps)` for dependency injection in tests.
- Create `aiAgent.js` — Claude wrapper + tools. Factory `createAiAgent({ anthropic, sapClient, model })`.
- Create `routes.js` — `createSupportRoutes({ sapClient, aiAgent })` returns an Express Router with `/chat` and `/order-lookup`.
- Modify `server.js` — build `sapClient`, `aiAgent`, Anthropic client; mount the router under `/api/support`.
- Modify `public/script.js` — repoint chat to `/api/support/chat`, remove Gemini, add `renderOrderCard`, feed `ticketDraft` into the existing ticket form.
- Create `.env.example` — document new env keys (no secrets).
- Create `scripts/sap-probe.mjs` — read-only field-discovery probe to run from a SAP-whitelisted IP.
- Create `test/sapClient.test.js`, `test/aiAgent.test.js`, `test/routes.test.js`.
- Modify `package.json` — add dependency + `test` script.

**Outcome vocabulary used everywhere:** `'FOUND' | 'NOT_FOUND' | 'UNREACHABLE' | 'AUTH_ERROR' | 'ERROR'`.

**Normalized order shape (single source of truth):**
```js
// returned inside { outcome, data }
{
  salesOrder: '0000012345',
  salesOrderType: 'OR',
  overallStatus: 'In Process',      // human text mapped from OverallSDProcessStatus
  netAmount: '1500.00',
  currency: 'USD',
  items: [{ material: 'MAT01', quantity: '2', netAmount: '750.00' }],
  processOrder: null,               // filled from zposetra/processOrder (finalized post-probe)
  shipmentNumber: null,             // filled from zposetra/status (finalized post-probe)
  missingFields: ['processOrder', 'shipmentNumber']
}
```

---

## Task 1: Project setup (dependency, test script, env example)

**Files:**
- Modify: `package.json`
- Create: `.env.example`

- [ ] **Step 1: Add the Anthropic SDK and a test script**

Edit `package.json` `scripts` and `dependencies`:
```json
  "scripts": {
    "start": "node server.js",
    "dev": "nodemon server.js",
    "test": "node --test"
  },
  "dependencies": {
    "express": "^5.1.0",
    "cors": "^2.8.5",
    "dotenv": "^16.5.0",
    "nodemailer": "^7.0.3",
    "axios": "^1.10.0",
    "@anthropic-ai/sdk": "^0.32.1"
  },
```

- [ ] **Step 2: Install**

Run: `npm install`
Expected: `@anthropic-ai/sdk` appears in `node_modules`, no errors.

- [ ] **Step 3: Create `.env.example` (documentation only, no secret values)**

```dotenv
# ── Chatbot AI (server-side only — never exposed to the browser) ──
ANTHROPIC_API_KEY=your_anthropic_key_here
ANTHROPIC_MODEL=claude-sonnet-4-6

# ── SAP connection (already present in your real .env) ──
SAP_ODATA_BASE_URL=https://HOST:PORT/sap/opu/odata/sap
SAP_BASE_URL=https://HOST:PORT/sap/bc/http/zposetra/connection
SAP_SALES_ORDER_SERVICE=API_SALES_ORDER_SRV
SAP_SALES_ORDER_ENTITY=A_SalesOrder
SAP_PROCESS_ORDER_API=/sap/bc/http/zposetra/processOrder
SAP_STATUS_API=/sap/bc/http/zposetra/status
SAP_USERNAME=your_sap_user
SAP_PASSWORD=your_sap_password
SAP_CLIENT=100
SAP_SALES_ORGANIZATION=EC01
# SAP presents a self-signed cert on an IP host; set true to skip TLS verification.
SAP_TLS_INSECURE=true
```

- [ ] **Step 4: Commit**

```bash
git add package.json package-lock.json .env.example
git commit -m "chore: add anthropic sdk, test script, env example"
```

---

## Task 2: `sapClient` — sales order lookup by id

**Files:**
- Create: `sapClient.js`
- Test: `test/sapClient.test.js`

- [ ] **Step 1: Write the failing test**

Create `test/sapClient.test.js`:
```js
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test`
Expected: FAIL — `Cannot find module '../sapClient.js'`.

- [ ] **Step 3: Write minimal implementation**

Create `sapClient.js`:
```js
import axios from 'axios';
import https from 'https';

const STATUS_TEXT = { A: 'Not Started', B: 'In Process', C: 'Completed', '': 'Unknown' };

function classifyError(err) {
  const status = err?.response?.status;
  if (status === 404) return 'NOT_FOUND';
  if (status === 401 || status === 403) return 'AUTH_ERROR';
  const code = err?.code;
  if (['ECONNABORTED', 'ECONNREFUSED', 'ETIMEDOUT', 'ENOTFOUND'].includes(code)) return 'UNREACHABLE';
  return 'ERROR';
}

function normalizeSalesOrder(d) {
  return {
    salesOrder: d.SalesOrder,
    salesOrderType: d.SalesOrderType,
    overallStatus: STATUS_TEXT[d.OverallSDProcessStatus] ?? d.OverallSDProcessStatus ?? 'Unknown',
    netAmount: d.TotalNetAmount,
    currency: d.TransactionCurrency,
    items: (d.to_Item?.results ?? []).map((it) => ({
      material: it.Material,
      quantity: it.RequestedQuantity,
      netAmount: it.NetAmount,
    })),
    processOrder: null,
    shipmentNumber: null,
    missingFields: ['processOrder', 'shipmentNumber'],
  };
}

export function createSapClient(env = process.env, deps = {}) {
  const odataBase = String(env.SAP_ODATA_BASE_URL || '').replace(/\/$/, '');
  const service = env.SAP_SALES_ORDER_SERVICE || 'API_SALES_ORDER_SRV';
  const entity = env.SAP_SALES_ORDER_ENTITY || 'A_SalesOrder';
  const client = env.SAP_CLIENT || '100';
  const insecure = String(env.SAP_TLS_INSECURE).toLowerCase() === 'true';

  const http = deps.http || axios.create({
    auth: { username: env.SAP_USERNAME, password: env.SAP_PASSWORD },
    timeout: 15000,
    headers: { Accept: 'application/json' },
    httpsAgent: new https.Agent({ rejectUnauthorized: !insecure }),
  });

  async function getSalesOrder(id) {
    const url = `${odataBase}/${service}/${entity}('${encodeURIComponent(id)}')`
      + `?$expand=to_Item&$format=json&sap-client=${client}`;
    try {
      const resp = await http.get(url);
      const d = resp.data?.d;
      if (!d) return { outcome: 'NOT_FOUND', data: null };
      return { outcome: 'FOUND', data: normalizeSalesOrder(d) };
    } catch (err) {
      return { outcome: classifyError(err), data: null };
    }
  }

  return { getSalesOrder, _normalizeSalesOrder: normalizeSalesOrder };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add sapClient.js test/sapClient.test.js
git commit -m "feat: sapClient.getSalesOrder with normalization and outcome tagging"
```

---

## Task 3: `sapClient` — latest sales order

**Files:**
- Modify: `sapClient.js`
- Test: `test/sapClient.test.js`

- [ ] **Step 1: Write the failing test (append to `test/sapClient.test.js`)**

```js
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test`
Expected: FAIL — `sap.getLatestSalesOrder is not a function`.

- [ ] **Step 3: Implement (add to `sapClient.js` inside `createSapClient`, before `return`)**

```js
  async function getLatestSalesOrder() {
    const url = `${odataBase}/${service}/${entity}`
      + `?$orderby=CreationDate desc,CreationTime desc&$top=1&$expand=to_Item`
      + `&$format=json&sap-client=${client}`;
    try {
      const resp = await http.get(url);
      const rows = resp.data?.d?.results ?? [];
      if (rows.length === 0) return { outcome: 'NOT_FOUND', data: null };
      return { outcome: 'FOUND', data: normalizeSalesOrder(rows[0]) };
    } catch (err) {
      return { outcome: classifyError(err), data: null };
    }
  }
```

Add `getLatestSalesOrder` to the returned object:
```js
  return { getSalesOrder, getLatestSalesOrder, _normalizeSalesOrder: normalizeSalesOrder };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add sapClient.js test/sapClient.test.js
git commit -m "feat: sapClient.getLatestSalesOrder"
```

---

## Task 4: `sapClient` — custom endpoints + getOrderSummary merge

**Files:**
- Modify: `sapClient.js`
- Test: `test/sapClient.test.js`

> The custom `zposetra/processOrder` and `zposetra/status` JSON shapes are unknown until the live probe (Task 9). The adapters below read best-guess field names defensively and record anything absent in `missingFields`. Task 9 finalizes the field names against real output.

- [ ] **Step 1: Write the failing test (append)**

```js
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test`
Expected: FAIL — `sap.getOrderSummary is not a function`.

- [ ] **Step 3: Implement (add to `sapClient.js`)**

Add near the top (after `STATUS_TEXT`):
```js
// Adapters for the custom zposetra endpoints. Field names are best-guess and
// finalized against real output during the Task 9 probe.
function adaptProcessOrder(raw) {
  return raw?.ProcessOrder ?? raw?.processOrder ?? raw?.d?.ProcessOrder ?? null;
}
function adaptShipmentNumber(raw) {
  return raw?.ShipmentNumber ?? raw?.shipmentNumber ?? raw?.Shipment ?? raw?.d?.ShipmentNumber ?? null;
}
```

Inside `createSapClient`, read the custom-endpoint config:
```js
  const zBase = String(env.SAP_BASE_URL || '').replace(/\/sap\/bc\/http\/zposetra\/connection$/, '');
  const processPath = env.SAP_PROCESS_ORDER_API || '/sap/bc/http/zposetra/processOrder';
  const statusPath = env.SAP_STATUS_API || '/sap/bc/http/zposetra/status';
```

Add the helpers and `getOrderSummary` before `return`:
```js
  async function fetchCustom(path, id, adapt) {
    try {
      const url = `${zBase}${path}?salesOrder=${encodeURIComponent(id)}&sap-client=${client}`;
      const resp = await http.get(url);
      return adapt(resp.data);
    } catch {
      return null; // custom endpoint failures degrade gracefully; field stays "missing"
    }
  }

  async function getOrderSummary(id) {
    const base = await getSalesOrder(id);
    if (base.outcome !== 'FOUND') return base;

    const [processOrder, shipmentNumber] = await Promise.all([
      fetchCustom(processPath, id, adaptProcessOrder),
      fetchCustom(statusPath, id, adaptShipmentNumber),
    ]);

    const data = { ...base.data, processOrder, shipmentNumber };
    data.missingFields = [];
    if (processOrder == null) data.missingFields.push('processOrder');
    if (shipmentNumber == null) data.missingFields.push('shipmentNumber');
    return { outcome: 'FOUND', data };
  }
```

Update the return to expose it:
```js
  return { getSalesOrder, getLatestSalesOrder, getOrderSummary, _normalizeSalesOrder: normalizeSalesOrder };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test`
Expected: PASS (9 tests).

- [ ] **Step 5: Commit**

```bash
git add sapClient.js test/sapClient.test.js
git commit -m "feat: sapClient.getOrderSummary merging custom process/shipment data"
```

---

## Task 5: `aiAgent` — Claude wrapper with two SAP tools

**Files:**
- Create: `aiAgent.js`
- Test: `test/aiAgent.test.js`

- [ ] **Step 1: Write the failing test**

Create `test/aiAgent.test.js`:
```js
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test`
Expected: FAIL — `Cannot find module '../aiAgent.js'`.

- [ ] **Step 3: Write minimal implementation**

Create `aiAgent.js`:
```js
const SYSTEM_PROMPT = `You are Visionsoft AI, a concise, friendly support assistant for the Posetra/SAP ecommerce and ERP system.

Rules:
- For ANY question about a sales order, order status, cost, shipment, or process order, call the lookup_sap_order tool with the sales order number the user gave.
- If the user asks for the "last" or "latest" order, call get_latest_sales_order.
- NEVER invent or guess order numbers, status, cost, or shipment values. Only state what the tool returns.
- If a tool reports the order was not found, SAP was unreachable, or an auth/other error occurred, tell the user you will raise a support ticket for the team.
- If the order is found but a specific field (e.g. shipment number) is empty, explain it may not be available yet (e.g. not shipped) and offer — do not force — a ticket.
- Ask at most one follow-up question. If no order number is given for a lookup, ask for it.
- Keep replies short and specific.`;

const TOOLS = [
  {
    name: 'lookup_sap_order',
    description: 'Look up a SAP sales order by its number and return status, cost, line items, process order and shipment number.',
    input_schema: {
      type: 'object',
      properties: { salesOrderId: { type: 'string', description: 'The SAP sales order number' } },
      required: ['salesOrderId'],
    },
  },
  {
    name: 'get_latest_sales_order',
    description: 'Return the most recently created SAP sales order with its details.',
    input_schema: { type: 'object', properties: {} },
  },
];

const TICKET_OUTCOMES = new Set(['NOT_FOUND', 'UNREACHABLE', 'AUTH_ERROR', 'ERROR']);

function outcomeReason(outcome) {
  switch (outcome) {
    case 'NOT_FOUND': return 'The order could not be found in SAP.';
    case 'UNREACHABLE': return 'SAP could not be reached.';
    case 'AUTH_ERROR': return 'SAP rejected the credentials.';
    default: return 'An error occurred while querying SAP.';
  }
}

function toAnthropicHistory(history) {
  // history items: { from: 'user'|'vira', text }
  return history
    .filter((h) => h?.text?.trim())
    .map((h) => ({ role: h.from === 'user' ? 'user' : 'assistant', content: h.text }));
}

export function createAiAgent({ anthropic, sapClient, model = 'claude-sonnet-4-6' }) {
  async function runTool(name, input) {
    if (name === 'get_latest_sales_order') return sapClient.getLatestSalesOrder();
    return sapClient.getOrderSummary(String(input?.salesOrderId ?? '').trim());
  }

  async function chat({ message, history = [] }) {
    const messages = [...toAnthropicHistory(history), { role: 'user', content: message }];
    let needsTicket = false;
    let orderData = null;
    let lastOutcome = null;
    let lastQueriedId = null;

    for (let turn = 0; turn < 4; turn++) {
      const resp = await anthropic.messages.create({
        model, max_tokens: 1024, system: SYSTEM_PROMPT, tools: TOOLS, messages,
      });

      if (resp.stop_reason === 'tool_use') {
        const toolResults = [];
        for (const block of resp.content) {
          if (block.type !== 'tool_use') continue;
          if (block.name === 'lookup_sap_order') lastQueriedId = block.input?.salesOrderId ?? lastQueriedId;
          const result = await runTool(block.name, block.input);
          lastOutcome = result.outcome;
          if (result.data) orderData = result.data;
          if (TICKET_OUTCOMES.has(result.outcome)) needsTicket = true;
          toolResults.push({ type: 'tool_result', tool_use_id: block.id, content: JSON.stringify(result) });
        }
        messages.push({ role: 'assistant', content: resp.content });
        messages.push({ role: 'user', content: toolResults });
        continue;
      }

      const reply = resp.content.filter((b) => b.type === 'text').map((b) => b.text).join('\n').trim()
        || 'I am here to help. Could you share your sales order number?';
      const ticketDraft = needsTicket
        ? {
            subject: `SAP order lookup failed${lastQueriedId ? `: ${lastQueriedId}` : ''}`,
            description: [
              'Raised automatically by Visionsoft AI because SAP returned no answer.',
              lastQueriedId ? `Sales order asked about: ${lastQueriedId}` : 'No specific order number was provided.',
              `Reason: ${outcomeReason(lastOutcome)}`,
              '',
              `Customer message: ${message}`,
            ].join('\n'),
            issueCategory: 'Ecommerce',
          }
        : null;
      return { reply, orderData, needsTicket, ticketDraft };
    }

    // Safety valve if the model loops on tools.
    return {
      reply: 'I am having trouble completing that right now. I can raise a support ticket so our team can help.',
      orderData, needsTicket: true,
      ticketDraft: {
        subject: `SAP order lookup failed${lastQueriedId ? `: ${lastQueriedId}` : ''}`,
        description: `Tool loop did not converge. Customer message: ${message}`,
        issueCategory: 'Ecommerce',
      },
    };
  }

  return { chat };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test`
Expected: PASS (all sapClient + 3 aiAgent tests).

- [ ] **Step 5: Commit**

```bash
git add aiAgent.js test/aiAgent.test.js
git commit -m "feat: aiAgent Claude wrapper with SAP lookup tools and ticket draft"
```

---

## Task 6: Support routes (`/chat`, `/order-lookup`)

**Files:**
- Create: `routes.js`
- Test: `test/routes.test.js`

- [ ] **Step 1: Write the failing test**

Create `test/routes.test.js`:
```js
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test`
Expected: FAIL — `Cannot find module '../routes.js'`.

- [ ] **Step 3: Write minimal implementation**

Create `routes.js`:
```js
import express from 'express';

export function createSupportRoutes({ sapClient, aiAgent }) {
  const router = express.Router();

  router.post('/order-lookup', async (req, res) => {
    const salesOrderId = String(req.body?.salesOrderId ?? '').trim();
    if (!salesOrderId) {
      return res.status(400).json({ success: false, message: 'salesOrderId is required' });
    }
    try {
      const result = await sapClient.getOrderSummary(salesOrderId);
      return res.json(result);
    } catch (err) {
      return res.status(500).json({ outcome: 'ERROR', data: null, message: err.message });
    }
  });

  router.post('/chat', async (req, res) => {
    const message = String(req.body?.message ?? '').trim();
    const history = Array.isArray(req.body?.history) ? req.body.history : [];
    if (!message) {
      return res.status(400).json({ success: false, message: 'message is required' });
    }
    try {
      const result = await aiAgent.chat({ message, history });
      return res.json(result);
    } catch (err) {
      return res.status(500).json({
        reply: 'Sorry, the assistant is unavailable right now. Please use the ticket form or email us.',
        orderData: null, needsTicket: false, ticketDraft: null, error: err.message,
      });
    }
  });

  return router;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test`
Expected: PASS (4 route tests + earlier ones).

- [ ] **Step 5: Commit**

```bash
git add routes.js test/routes.test.js
git commit -m "feat: support routes for chat and order-lookup"
```

---

## Task 7: Wire modules into `server.js`

**Files:**
- Modify: `server.js`

- [ ] **Step 1: Add imports and construct the clients**

At the top of `server.js`, after the existing imports, add:
```js
import Anthropic from '@anthropic-ai/sdk';
import { createSapClient } from './sapClient.js';
import { createAiAgent } from './aiAgent.js';
import { createSupportRoutes } from './routes.js';
```

After `dotenv.config();`, add:
```js
const sapClient = createSapClient(process.env);
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const aiAgent = createAiAgent({
  anthropic,
  sapClient,
  model: process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-6',
});
```

- [ ] **Step 2: Mount the router**

After the line `app.use(express.static(path.join(__dirname, 'public')));`, add:
```js
app.use('/api/support', createSupportRoutes({ sapClient, aiAgent }));
```

> Note: the existing `app.post('/api/support/send-email', ...)` and `/api/support/create-ticket` routes remain defined directly on `app` below; Express matches them alongside the router. No conflict because paths differ (`/chat`, `/order-lookup`).

- [ ] **Step 3: Add a startup warning if the AI key is missing**

After the `aiAgent` construction, add:
```js
if (!process.env.ANTHROPIC_API_KEY) {
  console.warn('⚠ ANTHROPIC_API_KEY is not set — the chatbot /api/support/chat route will return the unavailable message.');
}
```

- [ ] **Step 4: Start the server and smoke-check it boots**

Run: `node server.js`
Expected: the existing startup banner prints with no crash. Stop with Ctrl+C.
(If `ANTHROPIC_API_KEY` is unset you'll see the warning — that's fine for this step.)

- [ ] **Step 5: Commit**

```bash
git add server.js
git commit -m "feat: wire sapClient, aiAgent and support routes into server"
```

---

## Task 8: Frontend — repoint chat, remove Gemini, render order card

**Files:**
- Modify: `public/script.js`

- [ ] **Step 1: Remove the browser Gemini config and direct call**

Delete the `GEMINI_API_KEY` / `GEMINI_MODEL` constants (lines ~7-10) and the entire `callGemini` function (the `async function callGemini(userMessage) { ... }` block). The `VIRA_SYSTEM_PROMPT` constant and `buildFallback` can stay (fallback only).

- [ ] **Step 2: Add `renderOrderCard` (place near `appendMessage`)**

```js
function renderOrderCard(order) {
  if (!order) return;
  const container = document.getElementById('chatMessages');
  if (!container) return;

  const rows = [
    ['Sales Order', order.salesOrder],
    ['Status', order.overallStatus],
    ['Net Cost', order.netAmount ? `${order.currency || ''} ${order.netAmount}`.trim() : null],
    ['Process Order', order.processOrder],
    ['Shipment No.', order.shipmentNumber],
  ].filter(([, v]) => v != null && v !== '');

  const itemsHtml = (order.items || []).length
    ? `<div class="oc-items"><b>Items:</b><br>${order.items
        .map((it) => `• ${it.material} × ${it.quantity} — ${order.currency || ''} ${it.netAmount}`)
        .join('<br>')}</div>`
    : '';

  const wrap = document.createElement('div');
  wrap.classList.add('message-wrap', 'bot');
  wrap.innerHTML = `
    <div class="bot-message order-card">
      <div class="oc-title">📦 Order ${order.salesOrder || ''}</div>
      ${rows.map(([k, v]) => `<div class="oc-row"><span>${k}</span><b>${v}</b></div>`).join('')}
      ${itemsHtml}
    </div>`;
  container.appendChild(wrap);
  container.scrollTop = container.scrollHeight;
}
```

- [ ] **Step 3: Replace `sendMessage` body to call the backend**

Replace the existing `async function sendMessage() { ... }` with:
```js
async function sendMessage() {
  const input = document.getElementById('chatInput');
  if (!input) return;

  const userText = input.value.trim();
  if (!userText) return;

  input.value = '';
  appendMessage('user', userText);
  setSendDisabled(true);
  showTypingIndicator();
  conversationHistory.push({ from: 'user', text: userText });

  let data;
  try {
    const res = await fetch('/api/support/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: userText, history: conversationHistory }),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    data = await res.json();
  } catch (err) {
    console.warn('Chat backend unavailable, using fallback:', err.message);
    const fb = buildFallback(userText);
    data = { reply: fb.reply, orderData: null, needsTicket: fb.needsTicket,
      ticketDraft: fb.needsTicket ? { subject: fb.ticketSubject, description: fb.ticketSummary, issueCategory: fb.issueCategory } : null };
  }

  removeTypingIndicator();
  setSendDisabled(false);
  input.focus();

  const reply = data?.reply || 'I am here to help. Could you share your sales order number?';
  appendMessage('bot', reply);
  conversationHistory.push({ from: 'vira', text: reply });

  if (data?.orderData) renderOrderCard(data.orderData);

  if (data?.needsTicket) {
    const draft = data.ticketDraft || {};
    setTimeout(() => {
      appendMessage('bot', "I can raise a support ticket for this. Add your name and phone below and I'll log it.");
      showTicketForm({
        ticketSubject: draft.subject || 'Support request',
        ticketSummary: draft.description || userText,
        issueCategory: draft.issueCategory || 'Other',
        originalMessage: userText,
      });
    }, 400);
  }
}
```

- [ ] **Step 4: Manual check in a browser**

Run: `node server.js`, open `http://localhost:3002`, open the AI chat, send "hello".
Expected: a bot reply appears (real Claude reply if `ANTHROPIC_API_KEY` set; otherwise the fallback message). No console errors referencing `GEMINI_API_KEY`.

- [ ] **Step 5: Commit**

```bash
git add public/script.js
git commit -m "feat: chat calls backend SAP agent, renders order card, removes browser Gemini key"
```

---

## Task 9: Live SAP probe + finalize custom adapters (manual, whitelisted IP)

**Files:**
- Create: `scripts/sap-probe.mjs`
- Modify (only if probe shows different field names): `sapClient.js` (`adaptProcessOrder`, `adaptShipmentNumber`, `normalizeSalesOrder`)

> This task MUST run on a machine whose outbound IP is whitelisted by the SAP/Basis team (office/VPN). From anywhere else the SAP host times out (verified 2026-06-04).

- [ ] **Step 1: Create the probe script**

Create `scripts/sap-probe.mjs`:
```js
// Read-only SAP probe. Run from a SAP-whitelisted machine:
//   node scripts/sap-probe.mjs <salesOrderId>
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
}
```

- [ ] **Step 2: Run the probe from a whitelisted machine**

Run: `node scripts/sap-probe.mjs <a-real-sales-order-number>`
Expected: prints the latest order and the requested order. If `processOrder`/`shipmentNumber` come back `null` but you know they exist, the custom endpoint field names differ.

- [ ] **Step 3: If field names differ, update the adapters**

In `sapClient.js`, adjust `adaptProcessOrder` / `adaptShipmentNumber` (and `normalizeSalesOrder` if OData fields differ) to match the real JSON keys seen in Step 2. Re-run `npm test` to confirm existing tests still pass; add a fixture test for the real shape if useful.

- [ ] **Step 4: Commit (only if adapters changed)**

```bash
git add scripts/sap-probe.mjs sapClient.js test/sapClient.test.js
git commit -m "chore: SAP probe script and finalized custom endpoint field mapping"
```

---

## Task 10: End-to-end verification checklist (manual, whitelisted IP + AI key)

**Files:** none (verification only)

- [ ] **Step 1: Set required env**

Ensure `.env` has real `ANTHROPIC_API_KEY`, `ANTHROPIC_MODEL=claude-sonnet-4-6`, all `SAP_*`, and `SAP_TLS_INSECURE=true`. Run from a SAP-whitelisted machine.

- [ ] **Step 2: Run the automated tests**

Run: `npm test`
Expected: all tests PASS.

- [ ] **Step 3: Start and exercise the chat**

Run: `node server.js`, open `http://localhost:3002`, open AI chat. Verify:
- "What is the status of order &lt;real id&gt;?" → reply + order card with real SAP values.
- "What is the last order in SAP sales?" → latest order's number + card.
- "Status of order 00000000" (nonexistent) → bot says it will raise a ticket + prefilled ticket form appears; submit with name/phone → Hermis ticket number returned.

- [ ] **Step 4: Confirm no secret leaks to the browser**

In the browser devtools Network tab, confirm `/api/support/chat` is called (not Anthropic/SAP directly) and no SAP/Anthropic keys appear in any client response or in `script.js`.

- [ ] **Step 5: Final commit / branch wrap-up**

```bash
git add -A
git commit -m "test: e2e verification notes for SAP chatbot" --allow-empty
```
Then use the `superpowers:finishing-a-development-branch` skill to merge/PR.

---

## Post-implementation reminders

- **Rotate** the Anthropic key and any SAP/Stripe/Azure credentials shared during design.
- **Whitelist** the production host's outbound IP with the SAP/Basis team, or lookups will time out in production (Render free tier has dynamic egress IPs — use a static outbound IP or host inside SAP's network).
