import axios from 'axios';
import https from 'https';

const STATUS_TEXT = { A: 'Not Started', B: 'In Process', C: 'Completed', '': 'Unknown' };

// Adapters for the custom zposetra endpoints. Field names are best-guess and
// finalized against real output during the Task 9 probe.
function adaptProcessOrder(raw) {
  return raw?.ProcessOrder ?? raw?.processOrder ?? raw?.d?.ProcessOrder ?? null;
}
function adaptShipmentNumber(raw) {
  return raw?.ShipmentNumber ?? raw?.shipmentNumber ?? raw?.Shipment ?? raw?.d?.ShipmentNumber ?? null;
}

function classifyError(err) {
  const status = err?.response?.status;
  if (status === 404) return 'NOT_FOUND';
  if (status === 401 || status === 403) return 'AUTH_ERROR';
  // No HTTP response at all means the connection itself failed (timeout, refused,
  // DNS, blocked by firewall) — treat every such case as UNREACHABLE.
  if (status === undefined) return 'UNREACHABLE';
  return 'ERROR';
}

// Posetra shows order numbers without SAP's leading-zero padding
// (e.g. SAP "0000012345" → Posetra "12345").
function toPosetraNumber(v) {
  if (v == null) return v;
  const s = String(v).trim();
  return /^\d+$/.test(s) ? s.replace(/^0+(?=\d)/, '') : s;
}

function normalizeSalesOrder(d) {
  return {
    salesOrder: toPosetraNumber(d.SalesOrder),
    salesOrderRaw: d.SalesOrder,
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

  const zBase = String(env.SAP_BASE_URL || '').replace(/\/sap\/bc\/http\/zposetra\/connection$/, '');
  const processPath = env.SAP_PROCESS_ORDER_API || '/sap/bc/http/zposetra/processOrder';
  const statusPath = env.SAP_STATUS_API || '/sap/bc/http/zposetra/status';

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

  return { getSalesOrder, getLatestSalesOrder, getOrderSummary, _normalizeSalesOrder: normalizeSalesOrder };
}
