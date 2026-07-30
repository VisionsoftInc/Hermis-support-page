# Integration Reference — How the Support Page Connects to Posetra & Hermis

This document describes **every API, endpoint, auth method, request and response** the
support chatbot uses to talk to:

1. **Posetra** (the e‑commerce/ERP backend) — to look up **orders** (SAP sales order,
   delivery, shipment, billing numbers, status, cost, items).
2. **Hermis** (the CRM backend) — to **create support tickets**.

Use it to reproduce the same connections in the original Hermis / Posetra projects.

> ⚠️ **Secrets:** real credentials live in the project `.env` (git‑ignored). This doc uses
> **environment‑variable placeholders** — do **not** paste live passwords/keys into a
> committed markdown file. Rotate any credential that has been shared around.

---

## 0. High‑level architecture

```
Browser chat  ──▶  Support server (Node/Express, server.js)
                        │
                        ├─▶  Anthropic Claude   (understands the message, calls tools)
                        │
                        ├─▶  Posetra backend    (order lookup)      ← this doc §1
                        │        └─▶ Posetra is itself synced with SAP
                        │
                        └─▶  Hermis backend      (create ticket)    ← this doc §2
```

The browser never calls Posetra/Hermis/Anthropic directly — all secrets stay server‑side.

---

# 1. POSETRA CONNECTION (order lookup)

The support page **cannot reach SAP directly** (SAP is firewalled to whitelisted IPs).
Instead it reads orders from the **Posetra backend**, which is already synced with SAP.
Every Posetra order carries the SAP document numbers.

### 1.1 Base URL & environment variables

```dotenv
POSETRA_BASE_URL=https://posetra-e-commerce-portal.onrender.com
POSETRA_EMAIL=<service-account email>       # a real Posetra user (distributor role is enough)
POSETRA_PASSWORD=<service-account password>
```

Implementation file in this project: **`posetraClient.js`**.

### 1.2 Authentication — login to get a JWT

Posetra uses **email/password → JWT bearer token**.

**Request**
```
POST {POSETRA_BASE_URL}/api/v1/login
Content-Type: application/json

{ "email": "<POSETRA_EMAIL>", "password": "<POSETRA_PASSWORD>" }
```

**Response (200)**
```json
{
  "message": "Success",
  "token": "<JWT>",          // use this as the Bearer token; expires in ~24h
  "role": "distributor",
  "name": "Visionsoft"
}
```

**Errors:** `400` = missing fields or `{"error":"User doesn't exist..."}` for a bad email;
wrong password is also rejected. Treat any non‑200 as an auth failure.

> Cache the token in memory and reuse it. Re‑login when you get a `401` (token expired).

### 1.3 Fetch orders

There is **no single‑order endpoint** on Posetra today. The orders endpoint returns the
orders visible to the logged‑in account.

**Request**
```
GET {POSETRA_BASE_URL}/api/v1/orders
Authorization: Bearer <JWT>
```

**Response (200)** — two arrays:
```json
{
  "consumerOrders":     [ { ...order... }, ... ],
  "userSpecificOrders": [ { ...order... }, ... ]
}
```
Merge both arrays and treat them as the order list.

> There is also `GET /api/v1/allorders` (Bearer) which returns a flat array for the same
> account. Both are **scoped to the logged‑in account** — a distributor only sees its own
> orders. To look up *any* customer's order you need an admin/support account or a
> dedicated lookup endpoint (see §1.7 Scaling).

### 1.4 Order object — the fields that matter

Each order includes (SAP + Business Central document numbers highlighted):

| Field | Meaning |
|---|---|
| `_id` | **Posetra order id** (Mongo id) — also a valid lookup key |
| `purchaseOrderId` | Posetra purchase order id |
| `sapSalesOrderNumber` | **SAP sales order number** (may have leading/trailing spaces) |
| `sapDeliveryNumber` | SAP delivery number |
| `sapShipmentNumber` | SAP shipment number (often empty until shipped) |
| `sapBillingNumber` | SAP billing/invoice number |
| `sapInvoicePdfUrl` | Invoice PDF link |
| `sapSyncStatus` | e.g. `Success` / `Failed` (SAP sync state) |
| `bcOrderNumber`, `bcInvoiceNumber`, `bcShipmentNumber` | Business Central document numbers |
| `overallStatus` | e.g. `PENDING`, `DELIVERY_CREATED` |
| `pickingStatus`, `pgiStatus`, `paymentStatus`, `shipmentStatus`, `invoiceStatus` | sub‑statuses |
| `grandTotal`, `subtotal`, `totalTaxes` | cost (currency shown as `$`) |
| `trackingNumber`, `courier`, `trackingUrl` | logistics |
| `supplierName` | supplier |
| `createdAt` | ISO timestamp (use for "latest order") |
| `items[]` | line items: `{ materialId, itemNo, name, quantity, price, ... }` |
| `address{}` | customer name/email/address (**PII** — handle carefully) |

**Note:** several SAP fields contain padding/whitespace, e.g. `"80000201  "` or all‑spaces
`"          "`. Always **trim** them; treat an all‑spaces value as empty. SAP sales order
numbers are usually plain (e.g. `991`) but strip any leading zeros to match the portal.

### 1.5 Look up one order (by SAP sales order number OR Posetra id)

Fetch the merged list once, then match an order where **any** of these equals the query
(after trimming / stripping leading zeros):

- `sapSalesOrderNumber`  (e.g. user types `991`)
- `_id`                  (Posetra order id, e.g. `6a15813025700146c3ce89ed`)
- `bcOrderNumber`
- `purchaseOrderId`

Return `FOUND` with the normalized order, or `NOT_FOUND` if nothing matches.

### 1.6 "Latest / last order"

Merge the arrays, sort by `createdAt` **descending**, take the first. (The newest order may
not be SAP‑synced yet, so its `sapSalesOrderNumber` can be empty — that's expected.)

### 1.7 Scaling caveat (important for the real Hermis/Posetra integration)

Fetching **all** orders and filtering in memory is fine for a few hundred orders but will
**not scale** to a large catalog. For production, Posetra should expose a **single‑order
lookup endpoint**, e.g.:
```
GET /api/v1/orders/by-sales-order/:sapSalesOrderNumber   (Bearer)
```
backed by an indexed DB query, so the support page fetches one order instead of all.

### 1.8 Minimal working example (Node)

```js
import axios from 'axios';
const BASE = process.env.POSETRA_BASE_URL;

async function login() {
  const { data } = await axios.post(`${BASE}/api/v1/login`, {
    email: process.env.POSETRA_EMAIL,
    password: process.env.POSETRA_PASSWORD,
  });
  return data.token;                       // JWT
}

async function getOrders(token) {
  const { data } = await axios.get(`${BASE}/api/v1/orders`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  return [...(data.consumerOrders || []), ...(data.userSpecificOrders || [])];
}

// lookup by SAP sales order number or Posetra _id
function findOrder(orders, q) {
  const norm = (v) => String(v ?? '').trim().replace(/^0+(?=\d)/, '');
  return orders.find((o) =>
    norm(o.sapSalesOrderNumber) === norm(q) || String(o._id) === String(q));
}
```

> Render free tier sleeps when idle → the first request can take ~50s (cold start). Use a
> generous timeout (~60s) and retry once on a network error.

---

# 2. HERMIS CONNECTION (create support ticket)

Tickets raised in the support page are created in the **Hermis CRM backend**.

### 2.1 Base URL & environment variable

```dotenv
HERMIS_BACKEND_URL=https://visionsoft-crm-backend.onrender.com
```

The support server forwards ticket requests here. The browser posts to the support server
(same‑origin) — **not** directly to Hermis — to avoid CORS and keep the URL server‑side.

### 2.2 Create a ticket

**Request**
```
POST {HERMIS_BACKEND_URL}/api/tickets/create
Content-Type: application/json

{
  "customerName":  "John Doe",
  "customerPhone": "+9715xxxxxxx",
  "customerEmail": "john@example.com",   // optional
  "subject":       "Order 991 delivery delayed",
  "description":   "Full issue details / AI summary ...",
  "source":        "Live Chat",           // shown as the source tag in Hermis
  "priority":      "MEDIUM",               // LOW | MEDIUM | HIGH
  "status":        "OPEN"
}
```

**Response (200/201)**
```json
{
  "success": true,
  "data": {
    "_id": "6a22...e7e",
    "ticketNumber": "TKT-771238",   // human-readable ticket id
    "customerName": "John Doe",
    "status": "OPEN",
    "priority": "MEDIUM",
    "source": "Live Chat",
    ...
  }
}
```

Read the new ticket id from `data.ticketNumber`.

> **Auth note:** this Hermis endpoint currently accepts requests **without authentication**
> (it created a ticket even for an empty body during testing). For production you should
> secure it (API key / token) so only trusted callers can create tickets.

### 2.3 (Optional) Email‑to‑ticket endpoint

The support page also has an email flow that both sends an email (via Microsoft Graph) and
creates a ticket through a second Hermis endpoint:

```
POST {HERMIS_BACKEND_URL}/api/tickets/email
Content-Type: application/json

{ "customerName": "...", "customerEmail": "...", "subject": "...", "description": "..." }
```
Returns a ticket object similar to §2.2. Use `/api/tickets/create` for the chatbot flow;
`/api/tickets/email` is used by the "send us an email" button.

### 2.4 The support server's proxy endpoint

The browser calls the support server, which forwards to Hermis. In `server.js`:

```
POST /api/support/create-ticket          (same-origin, called by the browser)
   → forwards to  {HERMIS_BACKEND_URL}/api/tickets/create
```

Required fields validated by the proxy: `customerName`, `customerPhone`, `subject`,
`description`. It passes through `source`, `priority`, `status`. Response is
`{ success, data }` where `data` is the Hermis ticket (contains `ticketNumber`).

### 2.5 Minimal working example (Node)

```js
import axios from 'axios';

async function createHermisTicket(ticket) {
  const { data } = await axios.post(
    `${process.env.HERMIS_BACKEND_URL}/api/tickets/create`,
    {
      customerName:  ticket.name,
      customerPhone: ticket.phone,
      customerEmail: ticket.email || '',
      subject:       ticket.subject,
      description:   ticket.description,
      source:        'Live Chat',
      priority:      'MEDIUM',
      status:        'OPEN',
    },
    { headers: { 'Content-Type': 'application/json' }, timeout: 15000 },
  );
  return data?.data?.ticketNumber;   // e.g. "TKT-771238"
}
```

---

# 3. Environment variables summary

```dotenv
# Posetra (order lookup)
POSETRA_BASE_URL=https://posetra-e-commerce-portal.onrender.com
POSETRA_EMAIL=<service-account email>
POSETRA_PASSWORD=<service-account password>

# Hermis (tickets)
HERMIS_BACKEND_URL=https://visionsoft-crm-backend.onrender.com

# (Chatbot AI — separate concern, not needed just for the connections above)
ANTHROPIC_API_KEY=<key>
ANTHROPIC_MODEL=claude-sonnet-4-6
```

---

# 4. Endpoint quick reference

| System | Method & Path | Auth | Purpose |
|---|---|---|---|
| Posetra | `POST /api/v1/login` | none (email+password) | Get JWT |
| Posetra | `GET /api/v1/orders` | Bearer JWT | Orders for the account (`consumerOrders`+`userSpecificOrders`) |
| Posetra | `GET /api/v1/allorders` | Bearer JWT | Flat order array (same account scope) |
| Hermis | `POST /api/tickets/create` | none (should be secured) | Create a ticket → `ticketNumber` |
| Hermis | `POST /api/tickets/email` | none | Email‑to‑ticket flow |
| Support server | `POST /api/support/create-ticket` | none | Proxy → Hermis create |
| Support server | `POST /api/support/chat` | none | Chatbot (calls Claude + Posetra) |
| Support server | `POST /api/support/order-lookup` | none | Direct Posetra order lookup (testable) |

---

# 5. Security checklist (before production)

- 🔑 Move all credentials to a secrets manager; **rotate** any shared keys/passwords.
- 🔒 Secure the Hermis `POST /api/tickets/create` endpoint (currently open) with an API key/token.
- 👤 Use a **least‑privilege** Posetra service account; if all orders must be visible, use an admin/support account or a dedicated lookup endpoint.
- 🚦 Add rate limiting + restrict CORS on the support server (prevents spam tickets / order enumeration / API‑credit burn).
- 🕵️ Verify ownership before revealing order details to a customer (order number **+ matching email/phone**).
- 🌐 Serve everything over HTTPS.
