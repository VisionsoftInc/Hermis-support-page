const SYSTEM_PROMPT = `You are Visionsoft AI, a concise, friendly support assistant for the Posetra ecommerce + SAP ERP system.

The tools return live order data from Posetra (which is synced with SAP). Each order may include:
sales order number, status, cost, delivery number, shipment number, billing/invoice number,
tracking number, courier, payment status, and the line items.

Rules:
- For ANY question about an order, its status, cost, shipment, delivery, invoice, or tracking,
  call the lookup_sap_order tool with the sales order number (or order id) the user gave.
- If the user asks for the "last" or "latest" order, call get_latest_sales_order.
- NEVER invent or guess any order number, status, cost, or shipment value. Only state what the tool returns.
- If a tool reports the order was not found, the system was unreachable, or an error occurred,
  tell the user clearly AND ASK whether they would like you to raise a support ticket.
  Do NOT raise a ticket automatically — wait for the user to agree or ask.
- If the order is found but a specific field (e.g. shipment number) is empty, explain it may not be
  available yet (e.g. not yet shipped / not yet synced to SAP) and offer — do not force — a ticket.
- ONLY when the user explicitly asks to raise / create / open a ticket, OR clearly agrees to your
  offer to raise one, call the raise_ticket tool with a short subject and a summary of the issue.
- Ask at most one follow-up question. If no order number is given for a lookup, ask for it.
- Keep replies short and specific. Use the exact numbers from the tool result.`;

const TOOLS = [
  {
    name: 'lookup_sap_order',
    description: 'Look up an order by its sales order number (or order id) and return status, cost, delivery/shipment/billing numbers, tracking and line items.',
    input_schema: {
      type: 'object',
      properties: { salesOrderId: { type: 'string', description: 'The sales order number or order id' } },
      required: ['salesOrderId'],
    },
  },
  {
    name: 'get_latest_sales_order',
    description: 'Return the most recently created order with its details.',
    input_schema: { type: 'object', properties: {} },
  },
  {
    name: 'raise_ticket',
    description: 'Open the support ticket form for the user to complete. Call this ONLY when the user explicitly asks to raise/create/open a support ticket, or clearly agrees to your offer to raise one. Never call it automatically just because a lookup failed.',
    input_schema: {
      type: 'object',
      properties: {
        subject: { type: 'string', description: 'Short ticket title' },
        summary: { type: 'string', description: 'Summary of the issue for the support team' },
      },
      required: ['subject'],
    },
  },
];

function toAnthropicHistory(history) {
  // history items: { from: 'user'|'vira', text }
  return history
    .filter((h) => h?.text?.trim())
    .map((h) => ({ role: h.from === 'user' ? 'user' : 'assistant', content: h.text }));
}

export function createAiAgent({ anthropic, sapClient, model = 'claude-sonnet-4-6' }) {
  async function runOrderTool(name, input) {
    if (name === 'get_latest_sales_order') return sapClient.getLatestSalesOrder();
    return sapClient.getOrderSummary(String(input?.salesOrderId ?? '').trim());
  }

  async function chat({ message, history = [] }) {
    const messages = [...toAnthropicHistory(history), { role: 'user', content: message }];
    let orderData = null;
    let lastQueriedId = null;
    let ticketRequested = false;
    let ticketSubject = null;
    let ticketSummary = null;

    for (let turn = 0; turn < 4; turn++) {
      const resp = await anthropic.messages.create({
        model, max_tokens: 1024, system: SYSTEM_PROMPT, tools: TOOLS, messages,
      });

      if (resp.stop_reason === 'tool_use') {
        const toolResults = [];
        for (const block of resp.content) {
          if (block.type !== 'tool_use') continue;

          if (block.name === 'raise_ticket') {
            // User asked for a ticket — signal the frontend to open the prefilled form.
            ticketRequested = true;
            ticketSubject = block.input?.subject || ticketSubject;
            ticketSummary = block.input?.summary || ticketSummary;
            toolResults.push({
              type: 'tool_result', tool_use_id: block.id,
              content: JSON.stringify({ ok: true, message: 'Ticket form opened for the user to fill in their name and phone.' }),
            });
            continue;
          }

          if (block.name === 'lookup_sap_order') lastQueriedId = block.input?.salesOrderId ?? lastQueriedId;
          const result = await runOrderTool(block.name, block.input);
          if (result.data) orderData = result.data;
          toolResults.push({ type: 'tool_result', tool_use_id: block.id, content: JSON.stringify(result) });
        }
        messages.push({ role: 'assistant', content: resp.content });
        messages.push({ role: 'user', content: toolResults });
        continue;
      }

      const reply = resp.content.filter((b) => b.type === 'text').map((b) => b.text).join('\n').trim()
        || 'I am here to help. Could you share your sales order number?';

      const ticketDraft = ticketRequested
        ? {
            subject: ticketSubject || `Support request${lastQueriedId ? `: order ${lastQueriedId}` : ''}`,
            description: [
              ticketSummary || 'Customer requested a support ticket via Visionsoft AI.',
              lastQueriedId ? `\nOrder referenced: ${lastQueriedId}` : '',
              `\nCustomer message: ${message}`,
            ].join(''),
            issueCategory: 'Ecommerce',
          }
        : null;

      return { reply, orderData, needsTicket: ticketRequested, ticketDraft };
    }

    // Safety valve if the model loops on tools.
    return {
      reply: 'I am having trouble completing that right now. If you would like, just ask me to raise a support ticket.',
      orderData, needsTicket: false, ticketDraft: null,
    };
  }

  return { chat };
}
