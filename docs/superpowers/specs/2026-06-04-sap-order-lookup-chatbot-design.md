# Design — SAP Order Lookup in the Support Chatbot

**Date:** 2026-06-04
**Status:** Approved (pending spec review)
**Author:** Visionsoft / Hermis support team

## 1. Goal

Extend the existing "Visionsoft AI" support chatbot so that when a customer enters a
**SAP Sales Order number**, the bot returns live order data fetched directly from SAP
(order number, sales order, process order, shipment number, cost, status, line items).
Any valid Sales Order number the customer enters returns that order's **status and full
details**. The bot also answers **"what is the last/latest order in SAP sales?"** by
returning the most recently created sales order (and its details). If SAP has no answer (order not found,
SAP unreachable, auth error), the bot raises a ticket in the Hermis backend instead.

Scope of this first version: **order lookup + ticket fallback.** Existing chat behaviour
(general support Q&A, email/WhatsApp/call buttons, web ticket form) is preserved.

### Explicit non-goals
- No model fine-tuning/training. The bot calls SAP live via tool-calling — it does not
  learn order data into weights.
- No ecommerce/MongoDB order lookup. Customers enter the SAP Sales Order number directly.
- No writes to SAP (read-only lookups only).

## 2. Chosen approach — Hybrid (Approach C)

Claude runs server-side and conducts the conversation, but:
- **Order figures shown to the customer come verbatim from backend code**, never invented
  by the AI. The raw SAP result is also rendered in a structured "order card" so the
  authoritative values are visible independent of the AI's prose.
- **The ticket decision is made by code**, based on the SAP result status, not by the AI's
  judgement.

This gives a natural-language UX while guaranteeing ERP/financial data is accurate.

### Rejected alternatives
- **Approach A (pure tool-calling, AI composes everything):** rejected because the AI could
  phrase a wrong figure; unacceptable for financial data.
- **Approach B (fully deterministic, no LLM):** rejected because varied phrasings
  ("how much did it cost?", "where's my shipment?") feel robotic and miss intent.

## 3. Architecture

```
public/script.js  ──POST /api/support/chat──▶  server.js
                                                  │
                                  ┌───────────────┼────────────────┐
                                  ▼               ▼                ▼
                            aiAgent.js       sapClient.js      Hermis ticket
                            (Claude SDK,     (Basic auth,      (/api/tickets/create)
                            tool:            server-side       ← created by code when
                            lookup_sap_order) only)              SAP returns no answer
```

The browser holds **no** secrets. SAP credentials and the Anthropic API key live only in
`.env`, read by `server.js`.

## 4. Components

### 4.1 `sapClient.js` (new, server-side)
Encapsulates all SAP HTTP access. Configuration read from `.env`:
`SAP_ODATA_BASE_URL`, `SAP_BASE_URL`, `SAP_SALES_ORDER_SERVICE`, `SAP_SALES_ORDER_ENTITY`,
`SAP_PROCESS_ORDER_API`, `SAP_STATUS_API`, `SAP_USERNAME`, `SAP_PASSWORD`, `SAP_CLIENT`,
`SAP_TLS_INSECURE`.

HTTP behaviour:
- axios with Basic auth (`SAP_USERNAME`/`SAP_PASSWORD`).
- `sap-client` query param (value from `SAP_CLIENT`).
- `Accept: application/json` and `$format=json` for OData.
- HTTPS agent honouring `SAP_TLS_INSECURE=true` (`rejectUnauthorized:false`) because SAP
  presents a self-signed certificate on an IP host.
- Per-request timeout ~15s.

Functions:
- `getSalesOrder(id)` → `GET {ODATA}/API_SALES_ORDER_SRV/A_SalesOrder('<id>')?$expand=to_Item`
  → normalized `{ salesOrder, salesOrderType, overallStatus, netAmount, currency, items[] }`.
  Standard S/4HANA fields: `SalesOrder`, `SalesOrderType`, `OverallSDProcessStatus`,
  `TotalNetAmount`, `TransactionCurrency`, `to_Item` (`Material`, `RequestedQuantity`,
  `NetAmount`).
- `getLatestSalesOrder()` → `GET {ODATA}/API_SALES_ORDER_SRV/A_SalesOrder?$orderby=CreationDate desc,CreationTime desc&$top=1`
  (fallback ordering `SalesOrder desc` if the system rejects `$orderby` on creation fields)
  → returns the newest order's id, then reuses `getOrderSummary` for its full details.
  Optionally scoped to the configured sales org (`SAP_SALES_ORGANIZATION`).
- `getProcessOrder(id)` → custom `zposetra/processOrder` (response shape finalized after
  live probe; behind an adapter).
- `getOrderStatus(id)` → custom `zposetra/status` — expected to carry the shipment number
  (finalized after live probe).
- `getOrderSummary(id)` → runs the above in parallel, merges into one object, and tags the
  overall outcome.

Outcome tagging (returned to callers): `FOUND`, `NOT_FOUND` (404 / empty result),
`UNREACHABLE` (timeout/connection refused), `AUTH_ERROR` (401/403), `ERROR` (other).

### 4.2 `aiAgent.js` (new, server-side)
Thin wrapper over `@anthropic-ai/sdk`.
- Model from `ANTHROPIC_MODEL` (default `claude-sonnet-4-6`).
- System prompt: reuse the existing VIRA persona/tone, plus rules:
  - For any order-related question, call the `lookup_sap_order` tool; never invent order
    data.
  - If the tool reports not-found/unreachable/auth-error, tell the customer a ticket will
    be raised.
  - If a found order has an empty field, explain it may not be available yet and offer
    (do not force) a ticket.
  - One follow-up question at a time.
- Tools:
  - `lookup_sap_order({ salesOrderId })` → handler calls `sapClient.getOrderSummary`.
  - `get_latest_sales_order({})` → handler calls `sapClient.getLatestSalesOrder` (used for
    "what is the last/latest order?" questions).
- Runs the tool loop (model → tool_use → tool_result → final text) and returns
  `{ reply, orderData, needsTicket, ticketDraft }` where:
  - `orderData` = the raw normalized SAP summary (or null).
  - `needsTicket` = true when outcome ∈ {NOT_FOUND, UNREACHABLE, AUTH_ERROR, ERROR}.
  - `ticketDraft` = `{ subject, description, issueCategory }` prefilled with the order id,
    the customer's question, and the failure reason.

### 4.3 `server.js` (edit)
Two new routes; existing email/ticket/config routes untouched.
- `POST /api/support/chat` — body `{ message, history }`. Calls `aiAgent`. Returns
  `{ reply, orderData, needsTicket, ticketDraft }`.
- `POST /api/support/order-lookup` — body `{ salesOrderId }`. Calls
  `sapClient.getOrderSummary` directly. Returns `{ outcome, data }`. Kept separate so the
  SAP path is testable without the AI.

### 4.4 `public/script.js` (edit)
- Remove `GEMINI_API_KEY` and the direct browser Gemini call (`callGemini`). The browser no
  longer talks to any AI provider directly.
- `sendMessage()` posts to `/api/support/chat` instead.
- New `renderOrderCard(orderData)` shows: Sales Order, Status, Net cost + currency,
  Shipment number, Process order, and line items — rendered from the raw SAP values.
- On `needsTicket`, reuse the existing prefilled ticket form (`showTicketForm`) seeded from
  `ticketDraft`; customer adds name/phone and submits to Hermis `/api/tickets/create`
  (existing flow, unchanged).
- Keep a lightweight client-side fallback message if the backend is unreachable.

## 5. Data flow

**Happy path (order found):**
1. Customer: "What's the status and cost of sales order 12345?"
2. Frontend → `POST /api/support/chat`.
3. `aiAgent`: Claude calls `lookup_sap_order({salesOrderId:"12345"})`.
4. `sapClient.getOrderSummary("12345")` → parallel OData + custom calls → normalized
   summary, outcome `FOUND`.
5. Claude composes reply; server returns reply + `orderData`.
6. Frontend shows reply **and** an order card with the exact SAP values.

**Latest order:**
1. Customer: "What is the last order in SAP sales?"
2. Claude calls `get_latest_sales_order({})`.
3. `sapClient.getLatestSalesOrder()` → newest `SalesOrder` id → `getOrderSummary(id)`.
4. Bot replies with the latest order number and its details + renders the order card.

**Fallback (not found / SAP down):**
1. Customer: "status of order 99999".
2. `getOrderSummary` → outcome `NOT_FOUND` (or `UNREACHABLE`).
3. `aiAgent` sets `needsTicket=true` + `ticketDraft`.
4. Frontend shows prefilled ticket form → submit → Hermis `/api/tickets/create`.

## 6. Behaviour decisions (confirmed with user)

- **Order found but a field is empty** (e.g. shipment not yet assigned): bot **explains it
  is expected and offers** a ticket — it does **not** auto-raise. (Avoids ticket spam for
  in-progress orders.)
- **Ticket fallback creation:** **prefilled form, one-click** — the customer adds name and
  phone (required by Hermis `ticketModel`) so support can follow up. No silent auto-create.

## 7. Error handling

| Condition | Behaviour |
|---|---|
| SAP timeout / connection refused (`UNREACHABLE`) | Apologise, raise ticket, log details |
| SAP 401/403 (`AUTH_ERROR`) | Generic message, raise ticket, log (do not leak creds) |
| Order not found (`NOT_FOUND`) | Tell customer, raise ticket |
| Found order, empty field | Explain (may be in progress), offer ticket |
| Claude API error | Fall back to deterministic regex order-detection + templated reply via `/api/support/order-lookup`; chat still works |
| No order number in message | Bot asks the customer for the sales order number |

## 8. Testing

- Test runner: Node built-in `node --test` (no new dependency).
- `sapClient` normalization: unit tests against JSON fixtures for OData and custom
  endpoints (FOUND / NOT_FOUND / UNREACHABLE / AUTH_ERROR).
- `/api/support/order-lookup`: tests with `sapClient` mocked.
- `aiAgent` / `/api/support/chat`: tool-loop and ticket-trigger tests with the Anthropic SDK
  and `sapClient` mocked.
- **Live SAP validation is a manual integration step** run from a SAP-whitelisted IP (see
  §9). Real fixtures are captured from the probe output and the custom-endpoint adapters
  finalized against them.

## 9. Infrastructure dependency (blocker to flag)

SAP at `https://34.211.139.33:44300` is **firewalled to whitelisted IPs**. Verified on
2026-06-04: general internet egress works (GitHub/Anthropic reachable in ~30ms) but the SAP
host times out on both port 44300 and 443 from a non-whitelisted machine.

Consequences:
1. **The deployed support backend's outbound IP must be whitelisted by the SAP/Basis team.**
   Render free tier has dynamic egress IPs — likely insufficient. Options: Render static
   outbound IP (paid), a static-IP proxy, or hosting the backend inside SAP's allowed
   network.
2. **The field-discovery probe must run from a whitelisted machine** (office/VPN). A probe
   script will be provided; its output is used to finalize the custom `zposetra` endpoint
   adapters and to build test fixtures.

## 10. New env keys and dependencies

New `.env` keys:
- `ANTHROPIC_API_KEY` (server-side only — never sent to the browser)
- `ANTHROPIC_MODEL` (default `claude-sonnet-4-6`)
- `SAP_TLS_INSECURE=true`

New dependency: `@anthropic-ai/sdk`. `axios` already present.

## 11. Security notes

- SAP credentials and the Anthropic key stay in `.env` (already gitignored); never shipped
  to the browser.
- The Anthropic key and SAP/Stripe/Azure credentials shared during design should be
  **rotated** — anything pasted into a chat is considered exposed.
- `SAP_TLS_INSECURE=true` disables TLS verification for SAP's self-signed cert; acceptable
  for an IP host on a trusted network, documented here as a known trade-off.
