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
