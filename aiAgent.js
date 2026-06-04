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
