import axios from 'axios';

// Posetra e-commerce backend client. The support page can't reach SAP directly
// (firewalled), but the Posetra backend already syncs every order with SAP and
// exposes it over a public, authenticated REST API. We log in as a service user,
// cache the JWT, and read orders — each order carries the SAP sales order,
// delivery, shipment, billing numbers, status and cost.

function classifyError(err) {
  const status = err?.response?.status;
  if (status === 401 || status === 403 || status === 400) return 'AUTH_ERROR';
  if (status === undefined) return 'UNREACHABLE'; // no HTTP response = connection failed
  return 'ERROR';
}

function clean(v) {
  if (v == null) return null;
  const s = String(v).trim();
  return s === '' ? null : s;
}

// Posetra stores SAP numbers plain, but strip any accidental leading zeros to match
// what customers see in the portal.
function plainNumber(v) {
  const s = clean(v);
  if (s == null) return null;
  return /^\d+$/.test(s) ? s.replace(/^0+(?=\d)/, '') : s;
}

function normalizeOrder(o) {
  return {
    // identifiers — searchable by either the Posetra order id or the SAP sales order number
    orderId: clean(o._id),                       // Posetra order id (Mongo _id)
    purchaseOrderId: clean(o.purchaseOrderId),   // Posetra purchase order id
    salesOrder: plainNumber(o.sapSalesOrderNumber), // SAP sales order number
    // SAP document numbers
    deliveryNumber: clean(o.sapDeliveryNumber),
    shipmentNumber: clean(o.sapShipmentNumber),
    billingNumber: clean(o.sapBillingNumber),
    invoiceUrl: clean(o.sapInvoicePdfUrl),
    syncStatus: clean(o.sapSyncStatus),
    // Business Central document numbers
    bcOrderNumber: clean(o.bcOrderNumber),
    bcInvoiceNumber: clean(o.bcInvoiceNumber),
    bcShipmentNumber: clean(o.bcShipmentNumber),
    // status + money
    status: o.overallStatus || o.status || 'Unknown',
    cost: o.grandTotal ?? o.subtotal ?? null,
    currency: '$',
    paymentStatus: clean(o.paymentStatus),
    shipmentStatus: clean(o.shipmentStatus),
    invoiceStatus: clean(o.invoiceStatus),
    // logistics
    trackingNumber: clean(o.trackingNumber),
    courier: clean(o.courier),
    trackingUrl: clean(o.trackingUrl),
    supplierName: clean(o.supplierName),
    createdAt: o.createdAt,
    items: (o.items || []).map((it) => ({
      material: clean(it.materialId),
      name: clean(it.name),
      quantity: it.quantity,
      price: clean(it.price),
    })),
  };
}

export function createPosetraClient(env = process.env, deps = {}) {
  const baseUrl = String(env.POSETRA_BASE_URL || '').replace(/\/$/, '');
  const email = env.POSETRA_EMAIL;
  const password = env.POSETRA_PASSWORD;

  // Render free tier sleeps after inactivity and can take ~50s to wake, so allow a
  // generous timeout for the first (cold-start) request.
  const http = deps.http || axios.create({
    timeout: 60000,
    headers: { 'Content-Type': 'application/json' },
  });

  let token = deps.token || null;

  async function login() {
    const resp = await http.post(`${baseUrl}/api/v1/login`, { email, password });
    token = resp.data?.token || null;
    if (!token) {
      const e = new Error('Posetra login returned no token');
      e.response = { status: 401 };
      throw e;
    }
    return token;
  }

  async function fetchAllOrders() {
    if (!token) await login();
    const url = `${baseUrl}/api/v1/orders`;
    try {
      const resp = await http.get(url, { headers: { Authorization: `Bearer ${token}` } });
      return resp.data;
    } catch (err) {
      if (err?.response?.status === 401) {
        // token expired — log in again and retry once
        token = null;
        await login();
        const resp = await http.get(url, { headers: { Authorization: `Bearer ${token}` } });
        return resp.data;
      }
      if (err?.response?.status === undefined) {
        // network / cold-start error (no HTTP response) — retry once
        const resp = await http.get(url, { headers: { Authorization: `Bearer ${token}` } });
        return resp.data;
      }
      throw err;
    }
  }

  function flatten(data) {
    return [...(data?.consumerOrders || []), ...(data?.userSpecificOrders || [])];
  }

  function matches(order, id) {
    const q = String(id).trim();
    const qNum = /^\d+$/.test(q) ? q.replace(/^0+(?=\d)/, '') : q;
    return (
      plainNumber(order.sapSalesOrderNumber) === qNum ||
      String(order._id) === q ||
      clean(order.bcOrderNumber) === q ||
      String(order.purchaseOrderId) === q
    );
  }

  async function getOrderSummary(id) {
    try {
      const orders = flatten(await fetchAllOrders());
      const found = orders.find((o) => matches(o, id));
      if (!found) return { outcome: 'NOT_FOUND', data: null };
      return { outcome: 'FOUND', data: normalizeOrder(found) };
    } catch (err) {
      return { outcome: classifyError(err), data: null };
    }
  }

  async function getLatestSalesOrder() {
    try {
      const orders = flatten(await fetchAllOrders());
      if (orders.length === 0) return { outcome: 'NOT_FOUND', data: null };
      const latest = orders
        .slice()
        .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))[0];
      return { outcome: 'FOUND', data: normalizeOrder(latest) };
    } catch (err) {
      return { outcome: classifyError(err), data: null };
    }
  }

  return { getOrderSummary, getLatestSalesOrder, _normalizeOrder: normalizeOrder };
}
