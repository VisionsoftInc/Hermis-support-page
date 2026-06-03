// ─── Configuration ────────────────────────────────────────────────────────────
const SUPPORT_EMAIL = 'events@visionsoftaspaclimited.onmicrosoft.com';
let SUPPORT_PHONE = '+917731800138';
let WHATSAPP_SUPPORT_NUMBER = SUPPORT_PHONE;
let WHATSAPP_DEFAULT_TEXT = '';

// ⚠️  Paste your Gemini API key here.
// Get one free at: https://aistudio.google.com/app/apikey
const GEMINI_API_KEY = 'YOUR_GEMINI_API_KEY_HERE';
const GEMINI_MODEL   = 'gemini-2.5-flash';

// Base URL of your deployed Hermis backend.
// Examples:
//   'https://api.hermis.yourdomain.com'   ← production
//   'http://localhost:4000'               ← local dev
// Leave as '' only if this HTML file is served directly by the same Express server.
const HERMIS_API = window.location.hostname === 'localhost'
  ? 'http://localhost:4000'
  : 'https://visionsoft-crm-backend.onrender.com';

// ─── Visionsoft AI System Prompt (from viraPrompt.js) ────────────────────────
const VIRA_SYSTEM_PROMPT = `
You are Visionsoft AI Agent, a smart customer assistant — think of Amazon's Rufus combined with a workspace and website support agent.

Your style: concise, warm, action-oriented. You think one step ahead of the customer — if they ask about a product, proactively mention what else they usually want to know. If they have a problem, move toward resolution immediately.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
CORE THINKING RULES (Rufus style)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

1. INTENT INFERENCE
   - Understand what the customer *actually* wants, not just what they typed.
   - "My order hasn't arrived" → they want to know where it is and when it will arrive.
   - "How do I return this?" → they want to know the steps, and likely the refund timeline too.
   - "Payment failed" → they want to know if money was deducted and what to do next.
   - Always address the underlying intent, not just the surface words.

2. PROACTIVE CONTEXT
   - After answering, briefly anticipate what they might ask next.
   - Keep this short — one follow-up line maximum.

3. MULTI-TURN MEMORY
   - Use the full conversation history to build on prior turns.
   - Never repeat a reply you gave earlier in the conversation.

4. SPECIFIC OVER GENERIC
   - Every reply must be specific to what the customer just said.
   - Do not give a generic reply when you know the issue.

5. ONE QUESTION RULE
   - Ask at most one follow-up question per reply.


You are Visionsoft AI, an intelligent business support assistant.

Your role is to understand customer and employee requests, provide accurate assistance, troubleshoot issues, and gather enough information before creating support tickets.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
CORE BEHAVIOR
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

1. Understand the user's actual goal, not just the exact words they typed.

2. Use conversation history to understand context.

3. Respond specifically to the user's issue.

4. Avoid generic replies whenever possible.

5. Ask only one follow-up question at a time.

6. Before suggesting a support ticket:

   * Understand the problem.
   * Ask relevant questions.
   * Attempt basic troubleshooting.
   * Only raise a ticket if the issue requires human intervention.

7. Be professional, friendly, concise, and helpful.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SUPPORTED DOMAINS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Hi
Hello
Hey
Good morning
Good afternoon
Good evening
How are you?
Can you help me?
I need assistance

A. HERMIS CRM SUPPORT

* Login issues
* OTP issues
* Password reset problems
* User access issues
* Dashboard issues
* Reporting issues
* Power BI issues
* Ticket management
* File upload issues
* Performance issues
* CRM navigation assistance

I cannot login to Hermis
My password is not working
I am not receiving OTP
The dashboard is blank
Power BI reports are not loading
I cannot create a lead
I cannot update an account
File upload is failing
The CRM is loading slowly
My user account is locked
I cannot access the reports page
The incidents page is not opening
I cannot assign leads
I lost access to my account

B. E-COMMERCE SUPPORT

* Orders
* Payments
* Refunds
* Returns
* Replacements
* Delivery tracking
* Cancellation requests
* Product questions
* Account issues

My order has not arrived
Where is my order?
Track my shipment
I want to cancel my order
I want a refund
My refund is delayed
I received the wrong item
I received a damaged item
My payment failed
Money was deducted twice
The product is defective
I need a replacement
I want to exchange the product

C. WEBSITE SUPPORT

* Website errors
* Broken pages
* Login failures
* Registration problems
* Form submission failures
* Slow loading pages
* Browser compatibility issues
* API failures

The website is not loading
The login page is broken
The contact form is not working
I am getting a 500 error
The page keeps refreshing
The website is very slow
I cannot register
The forgot password link is broken
The checkout page is blank
Images are not loading
The API is failing

D. WORK ASSISTANT SUPPORT

* Meeting assistance
* Task guidance
* Productivity advice
* Documentation help
* Process explanations
* Employee onboarding questions
* Internal workflow questions
* General workplace assistance

Help me write meeting notes
Create a task list
Summarize today's work
Write a follow-up email
Prepare MOM
Help me prioritize my tasks
How should I handle this customer?
Explain this process
Create a project plan
Generate a status report

E. GENERAL TECHNICAL SUPPORT

* Software issues
* Application errors
* Access problems
* Performance problems
* Configuration questions
* Troubleshooting assistance

I forgot my password
My account is locked
I cannot sign in
I am not receiving OTP
My email is not verified
I cannot update my profile
I cannot change my password
Someone accessed my account

Payment failed
Money was deducted
Double payment happened
UPI payment failed
Credit card payment failed
My subscription is inactive
I paid but service is not activated
Transaction is pending

How do I apply for leave?
What is the leave policy?
How do I update my profile?
How do I submit expenses?
Where can I view my attendance?
How do I access payroll?

How do I create a lead?
How do I convert a lead?
How do I create a ticket?
How do I assign tickets?
How do I upload files?
How do I create a report?
How do I update customer information?

I am unhappy with the service
Nobody responded to my ticket
The issue is not resolved
Support is taking too long
I want to escalate this issue
I want to speak with a manager

Raise a ticket
Create a support ticket
I want to report an issue
Open a complaint
Escalate this problem
Create a request

I paid yesterday and still cannot access my account.

The dashboard was working this morning but now it is blank.

My manager cannot see the reports I created.

The system becomes very slow whenever I upload a file.

I raised a ticket last week and nobody contacted me.

The application crashes every time I click Save.

I forgot my password and I am not receiving the OTP.

My refund has been pending for 10 days.

I need urgent help because the system is down for my entire team.

I am unable to complete checkout after payment.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
TICKET CREATION RULES
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

needsTicket=true only when:

* The issue cannot be resolved immediately.
* User requests escalation.
* Technical investigation is required.
* Access issues require administrator action.
* Payment, refund, delivery, or account issues require staff review.
* Application bugs require engineering support.

needsTicket=false when:

* Greeting messages.
* General questions.
* Product information.
* Navigation help.
* How-to questions.
* Basic troubleshooting can still continue.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
RESPONSE STYLE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Good Example:

User:
"My dashboard is loading slowly."

Reply:
"I understand your dashboard is loading slowly. Is the issue affecting all dashboard pages or only a specific report?"

Bad Example:

"Please raise a ticket."

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
OUTPUT FORMAT
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Return ONLY valid JSON:

{
"reply": "Helpful response",
"needsTicket": false,
"issueCategory": "CRM | Ecommerce | Website | WorkAssistant | Technical | Account | Other",
"ticketSubject": "Short issue title",
"ticketSummary": "Summary of the user's issue",
"unsupportedQuery": false
}

`;

// ─── Conversation history (in-memory for this session) ────────────────────────
// Format matches viraController.js: { from: 'user'|'vira', text: '...' }
let conversationHistory = [];
let webTicketSubmitInProgress = false;

// ─── Email ─────────────────────────────────────────────────────────────────────
function openEmailClient() {
  hideCallOptions();
  const link = document.createElement('a');
  link.href = `mailto:${SUPPORT_EMAIL}`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  showSuccess();
}

function showSuccess() {
  const successMsg = document.getElementById('successMessage');
  const errorMsg   = document.getElementById('errorMessage');
  if (errorMsg)   errorMsg.classList.add('hidden');
  if (successMsg) {
    successMsg.classList.remove('hidden');
    setTimeout(() => successMsg.classList.add('hidden'), 3000);
  }
}

// ─── Call Options ──────────────────────────────────────────────────────────────
function toggleCallOptions() {
  hideError();
  const el = document.getElementById('callOptions');
  if (el) el.classList.toggle('hidden');
}

function hideCallOptions() {
  const el = document.getElementById('callOptions');
  if (el) el.classList.add('hidden');
}

function callSupportViaDialer() {
  hideError();
  const link = document.createElement('a');
  link.href = `tel:${SUPPORT_PHONE}`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  hideCallOptions();
}

function callSupportViaWhatsApp() {
  hideError();
  openWhatsAppChat();
  hideCallOptions();
}

function openWhatsAppChat() {
  hideError();
  const sourceNumber = SUPPORT_PHONE || WHATSAPP_SUPPORT_NUMBER;
  const normalizedNumber = String(sourceNumber || '').replace(/[^\d]/g, '');

  if (!normalizedNumber) {
    showError('WhatsApp support number is not configured yet.');
    return;
  }

  const trimmedText = String(WHATSAPP_DEFAULT_TEXT || '').trim();
  const whatsappUrl = trimmedText
    ? `https://wa.me/${normalizedNumber}?text=${encodeURIComponent(trimmedText)}`
    : `https://wa.me/${normalizedNumber}`;

  window.open(whatsappUrl, '_blank', 'noopener,noreferrer');
}

// ─── Error helpers ─────────────────────────────────────────────────────────────
function showError(message) {
  const errorMsg  = document.getElementById('errorMessage');
  const errorText = document.getElementById('errorText');
  if (errorText) errorText.textContent = message;
  if (errorMsg)  errorMsg.classList.remove('hidden');
}

function hideError() {
  const el = document.getElementById('errorMessage');
  if (el) el.classList.add('hidden');
}

function showWebTicketResult(type, message) {
  const result = document.getElementById('webTicketResult');
  if (!result) return;

  result.classList.remove('hidden', 'success', 'error');
  result.classList.add(type === 'success' ? 'success' : 'error');
  result.textContent = message;
}

function clearWebTicketResult() {
  const result = document.getElementById('webTicketResult');
  if (!result) return;
  result.classList.add('hidden');
  result.classList.remove('success', 'error');
  result.textContent = '';
}

async function submitWebTicketForm(e) {
  e.preventDefault();
  if (webTicketSubmitInProgress) {
    return;
  }

  clearWebTicketResult();

  const name = (document.getElementById('wt_name')?.value || '').trim();
  const phone = (document.getElementById('wt_phone')?.value || '').trim();
  const email = (document.getElementById('wt_email')?.value || '').trim();
  const subject = (document.getElementById('wt_subject')?.value || '').trim();
  const message = (document.getElementById('wt_message')?.value || '').trim();

  if (!name || !phone || !subject || !message) {
    showWebTicketResult('error', 'Please fill all required fields.');
    return;
  }

  const submitBtn = document.getElementById('webTicketSubmitBtn');
  webTicketSubmitInProgress = true;
  if (submitBtn) {
    submitBtn.disabled = true;
    submitBtn.textContent = 'Generating...';
  }

  const description = [
    'Raised via Hermis Support Page (Web Form)',
    '',
    `Customer Name: ${name}`,
    `Customer Email: ${email || 'Not provided'}`,
    `Customer Phone: ${phone}`,
    '',
    'Issue Description:',
    message,
  ].join('\n');

  try {
    const res = await fetch('/api/support/create-ticket', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        customerName: name,
        customerPhone: phone,
        customerEmail: email || '',
        subject,
        description,
        source: 'WEB',
        priority: 'MEDIUM',
        status: 'OPEN',
      }),
    });

    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      throw new Error(errData.message || `HTTP ${res.status}`);
    }

    const data = await res.json();
    const ticketNumber = data?.data?.ticketNumber || '';

    if (ticketNumber) {
      showWebTicketResult('success', `Ticket generated successfully. Ticket number: ${ticketNumber}`);
    } else {
      showWebTicketResult('success', 'Ticket generated successfully. Our support team will contact you shortly.');
    }

    const form = document.getElementById('webTicketForm');
    if (form) {
      form.reset();
    }
  } catch (error) {
    console.error('Web ticket form submit error:', error);
    showWebTicketResult('error', `Unable to generate ticket right now (${error.message}). Please try again.`);
  } finally {
    webTicketSubmitInProgress = false;
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.textContent = 'Generate Ticket';
    }
  }
}

// ─── AI Panel open / close ─────────────────────────────────────────────────────
function openAIPanel() {
  const panel    = document.getElementById('aiPanel');
  const backdrop = document.getElementById('aiBackdrop');
  if (panel)    panel.classList.add('open');
  if (backdrop) backdrop.classList.add('visible');
  setTimeout(() => {
    const input = document.getElementById('chatInput');
    if (input) input.focus();
  }, 320);
}

function closeAIPanel() {
  const panel    = document.getElementById('aiPanel');
  const backdrop = document.getElementById('aiBackdrop');
  if (panel)    panel.classList.remove('open');
  if (backdrop) backdrop.classList.remove('visible');
}

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') closeAIPanel();
});

// ─── Chat helpers ──────────────────────────────────────────────────────────────
function appendMessage(role, text) {
  const container = document.getElementById('chatMessages');
  if (!container) return;

  const wrap   = document.createElement('div');
  wrap.classList.add('message-wrap', role === 'user' ? 'user' : 'bot');

  const bubble = document.createElement('div');
  bubble.classList.add(role === 'user' ? 'user-message' : 'bot-message');
  bubble.innerHTML = text.replace(/\n/g, '<br>');

  const time = document.createElement('span');
  time.classList.add('msg-time');
  time.textContent = new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });

  wrap.appendChild(bubble);
  wrap.appendChild(time);
  container.appendChild(wrap);
  container.scrollTop = container.scrollHeight;
}

function showTypingIndicator() {
  const container = document.getElementById('chatMessages');
  if (!container) return;
  const div = document.createElement('div');
  div.id = 'typingIndicator';
  div.classList.add('bot-message', 'typing-indicator');
  div.innerHTML = '<span></span><span></span><span></span>';
  container.appendChild(div);
  container.scrollTop = container.scrollHeight;
}

function removeTypingIndicator() {
  const el = document.getElementById('typingIndicator');
  if (el) el.remove();
}

function setSendDisabled(disabled) {
  const btn   = document.querySelector('.chat-input-area button');
  const input = document.getElementById('chatInput');
  if (btn)   btn.disabled   = disabled;
  if (input) input.disabled = disabled;
}

function formatSupportPhone(value = '') {
  const digits = String(value || '').replace(/[^\d]/g, '');
  if (!digits) return '-';
  if (digits.length === 12 && digits.startsWith('91')) {
    return `+${digits.slice(0, 2)} ${digits.slice(2)}`;
  }
  if (digits.length === 10) {
    return `+91 ${digits}`;
  }
  if (String(value).startsWith('+')) {
    return String(value);
  }
  return `+${digits}`;
}

function updateSupportContactLabels() {
  const callToggle = document.getElementById('callSupportToggleBtn');
  if (callToggle) {
    callToggle.textContent = `📞 Call: ${formatSupportPhone(SUPPORT_PHONE)}`;
  }

  const callFooter = document.getElementById('footerCallSupportNumber');
  if (callFooter) {
    callFooter.textContent = formatSupportPhone(SUPPORT_PHONE);
  }

  const whatsappFooter = document.getElementById('footerWhatsappSupportNumber');
  if (whatsappFooter) {
    whatsappFooter.textContent = formatSupportPhone(SUPPORT_PHONE || WHATSAPP_SUPPORT_NUMBER);
  }
}

async function loadSupportConfig() {
  try {
    const response = await fetch('/api/support/config');
    if (!response.ok) {
      return;
    }

    const config = await response.json();
    if (config?.supportPhoneNumber) {
      SUPPORT_PHONE = String(config.supportPhoneNumber).trim();
    }
    if (config?.whatsappSupportNumber) {
      WHATSAPP_SUPPORT_NUMBER = String(config.whatsappSupportNumber).trim();
    }
    // Keep WhatsApp contact aligned to support phone so button never opens an outdated test chat.
    if (SUPPORT_PHONE) {
      WHATSAPP_SUPPORT_NUMBER = SUPPORT_PHONE;
    }
    if (config?.whatsappDefaultText) {
      WHATSAPP_DEFAULT_TEXT = String(config.whatsappDefaultText).trim();
    }
  } catch (error) {
    console.warn('Support config could not be loaded:', error);
  } finally {
    updateSupportContactLabels();
  }
}

// Enter key to send
document.addEventListener('DOMContentLoaded', async () => {
  await loadSupportConfig();

  const webTicketForm = document.getElementById('webTicketForm');
  if (webTicketForm) {
    webTicketForm.addEventListener('submit', submitWebTicketForm);
  }

  const input = document.getElementById('chatInput');
  if (input) {
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
    });
  }
});

// ─── Ticket form ───────────────────────────────────────────────────────────────
function showTicketForm(prefill) {
  document.getElementById('tf_subject').value  = prefill.ticketSubject  || '';
  document.getElementById('tf_summary').value  = prefill.ticketSummary  || '';
  document.getElementById('tf_category').value = prefill.issueCategory  || 'Other';
  document.getElementById('tf_original').value = prefill.originalMessage|| '';

  const form = document.getElementById('ticketFormArea');
  if (form) form.classList.remove('hidden');

  const container = document.getElementById('chatMessages');
  if (container) container.scrollTop = container.scrollHeight + 400;
}

function hideTicketForm() {
  const form = document.getElementById('ticketFormArea');
  if (form) form.classList.add('hidden');
  ['tf_name','tf_phone','tf_email','tf_subject','tf_summary','tf_category','tf_original']
    .forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
}

// ─── Ticket submission — posts to /api/tickets/create (ticketController) ──────
// This is the SAME endpoint the Hermis tickets page reads from, so tickets
// raised here appear immediately in the Hermis CRM ticket list.
let ticketSubmitInProgress = false;

async function submitTicket() {
  if (ticketSubmitInProgress) {
    return;
  }

  const name     = (document.getElementById('tf_name')?.value  || '').trim();
  const phone    = (document.getElementById('tf_phone')?.value || '').trim();
  const email    = (document.getElementById('tf_email')?.value || '').trim();
  const subject  =  document.getElementById('tf_subject')?.value || '';
  const summary  =  document.getElementById('tf_summary')?.value || '';
  const category =  document.getElementById('tf_category')?.value || 'Other';
  const original =  document.getElementById('tf_original')?.value || '';

  // Validate required fields (customerName + customerPhone are required in ticketModel.js)
  if (!name) {
    showFormError('Please enter your name.');
    return;
  }
  if (!phone) {
    showFormError('Please enter your phone number.');
    return;
  }

  const submitBtn = document.getElementById('ticketSubmitBtn');
  ticketSubmitInProgress = true;
  if (submitBtn) { submitBtn.disabled = true; submitBtn.textContent = 'Submitting…'; }

  // Build description in the same format as viraController.js so it looks
  // consistent in the Hermis ticket detail view.
  const description = [
    'Ticket raised from Visionsoft AI chat',
    '',
    `Customer Name:  ${name}`,
    `Customer Email: ${email  || 'Not provided'}`,
    `Customer Phone: ${phone}`,
    `Issue Category: ${category}`,
    '',
    'Customer Message:',
    original,
    '',
    'AI Summary:',
    summary,
  ].join('\n').trim();

  try {
    const res = await fetch(`${HERMIS_API}/api/tickets/create`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        // Required by ticketModel.js
        customerName:  name,
        customerPhone: phone,
        customerEmail: email || '',
        subject:       subject || `${category} — support request`,
        // Optional enrichment
        description,
        source:        'Live Chat',   // visible in Hermis as the source tag
        priority:      'MEDIUM',
        status:        'OPEN',
        assignedTeam:  'Support Team',
        callSummary:   summary,
        lastCallDate:  new Date().toISOString(),
        timeline: [{
          action:    'CREATED',
          by:        'Visionsoft AI (Support Page)',
          note:      'Ticket raised from Hermis Support Page via Visionsoft AI chat',
          toStatus:  'OPEN',
          createdAt: new Date().toISOString(),
        }],
      }),
    });

    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      throw new Error(errData.message || `HTTP ${res.status}`);
    }

    const data = await res.json();
    // ticketController returns { success: true, data: populatedTicket }
    const ticketNumber = data?.data?.ticketNumber || '';

    hideTicketForm();
    appendMessage('bot',
      ticketNumber
        ? `✅ Ticket raised! Your ticket number is **${ticketNumber}**. Our support team will contact you soon.`
        : '✅ Your ticket has been submitted. Our team will reach out shortly.'
    );

  } catch (err) {
    console.error('Ticket submit error:', err);
    if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = 'Submit Ticket'; }
    appendMessage('bot',
      `⚠️ Couldn't create the ticket right now (${err.message}). Please email us at ${SUPPORT_EMAIL} with your issue and we'll handle it manually.`
    );
    hideTicketForm();
  } finally {
    ticketSubmitInProgress = false;
  }
}

function showFormError(msg) {
  // Show inline error inside the form instead of alert()
  let errEl = document.getElementById('formError');
  if (!errEl) {
    errEl = document.createElement('p');
    errEl.id = 'formError';
    errEl.style.cssText = 'color:#dc2626;font-size:12px;margin:0;';
    const form = document.getElementById('ticketFormArea');
    if (form) form.insertBefore(errEl, form.querySelector('.ticket-form-actions'));
  }
  errEl.textContent = msg;
  setTimeout(() => { if (errEl) errEl.textContent = ''; }, 3000);
}

// ─── Gemini API call (direct — no backend needed for chat) ───────────────────
async function callGemini(userMessage) {
  if (!GEMINI_API_KEY || GEMINI_API_KEY === 'YOUR_GEMINI_API_KEY_HERE') {
    throw new Error('no_api_key');
  }

  const contents = [];
  for (const turn of conversationHistory) {
    if (turn.from === 'user' && turn.text?.trim())
      contents.push({ role: 'user',  parts: [{ text: turn.text }] });
    else if (turn.from === 'vira' && turn.text?.trim())
      contents.push({ role: 'model', parts: [{ text: turn.text }] });
  }
  contents.push({ role: 'user', parts: [{ text: userMessage }] });

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`,
    {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: VIRA_SYSTEM_PROMPT }] },
        contents,
        generationConfig: { responseMimeType: 'application/json' },
      }),
    }
  );

  if (!res.ok) throw new Error(`gemini_http_${res.status}`);

  const json    = await res.json();
  const rawText = json?.candidates?.[0]?.content?.parts?.[0]?.text || '';
  const cleaned = rawText.replace(/```json|```/gi, '').trim();

  try { return JSON.parse(cleaned); }
  catch {
    const s = cleaned.indexOf('{'), e = cleaned.lastIndexOf('}');
    if (s !== -1 && e > s) return JSON.parse(cleaned.slice(s, e + 1));
    throw new Error('invalid_json');
  }
}

// ─── Client-side fallback (mirrors buildFallbackResponse in viraController.js)─
function buildFallback(message) {
  const t = message.toLowerCase();
  if (/^(hi|hello|hey|hii|helo|good morning|good afternoon|good evening)[!., ]*$/i.test(message.trim()))
    return { reply: 'What can I help you with today?', needsTicket: false, issueCategory: 'Other', ticketSubject: 'Customer support request', ticketSummary: message };
  if (/\b(payment|paid|deducted|transaction|charged|money)\b/.test(t))
    return { reply: 'I understand there is a payment concern. Please share your order number or transaction ID so support can check the payment status.', needsTicket: true, issueCategory: 'Payment', ticketSubject: 'Payment issue', ticketSummary: message };
  if (/\b(refund)\b/.test(t))
    return { reply: 'To process your refund request, please share your order number and the reason so support can review it.', needsTicket: true, issueCategory: 'Refund', ticketSubject: 'Refund request', ticketSummary: message };
  if (/\b(delivery|delivered|shipping|tracking)\b/.test(t))
    return { reply: 'I am sorry your delivery has not arrived. Please share your order number or tracking ID so support can look into it.', needsTicket: true, issueCategory: 'Delivery', ticketSubject: 'Delivery issue', ticketSummary: message };
  if (/\b(return|replacement|damaged|wrong item)\b/.test(t))
    return { reply: 'To help with your return or replacement, please share your order number and a brief reason so support can process your request.', needsTicket: true, issueCategory: 'Return', ticketSubject: 'Return or replacement request', ticketSummary: message };
  if (/\b(cancel|cancellation)\b/.test(t))
    return { reply: 'To cancel your order, please share the order number so support can check if it is still within the cancellation window.', needsTicket: true, issueCategory: 'Order', ticketSubject: 'Cancellation request', ticketSummary: message };
  if (/\b(login|sign in|signin|password|otp|account)\b/.test(t))
    return { reply: 'Please try the Forgot Password option or check spam for the OTP. If the issue continues, share your registered email so support can assist.', needsTicket: true, issueCategory: 'Account', ticketSubject: 'Account access issue', ticketSummary: message };
  if (/\b(raise|create|open|submit|make)\b.{0,15}\b(ticket|request|complaint)\b/i.test(t))
    return { reply: 'Sure, I can raise a ticket for you. Could you briefly describe the issue you are facing so the support team has the right context?', needsTicket: false, issueCategory: 'Other', ticketSubject: 'Customer requested a support ticket', ticketSummary: message };
  if (/\b(error|issue|problem|bug|failed|not working|broken|stuck|blank|crash|slow)\b/.test(t))
    return { reply: 'I understand you are facing an issue. Could you share a bit more detail — such as the page name, error message, or order number — so I can help more accurately?', needsTicket: true, issueCategory: 'Other', ticketSubject: 'Customer reported an issue', ticketSummary: message };
  return { reply: 'I am here to help. Could you describe what you need so I can assist you accurately?', needsTicket: false, issueCategory: 'Other', ticketSubject: 'Customer support request', ticketSummary: message };
}

// ─── Main send function ────────────────────────────────────────────────────────
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

  let ai;
  try {
    ai = await callGemini(userText);
  } catch (err) {
    console.warn('Gemini unavailable, using fallback:', err.message);
    ai = buildFallback(userText);
  }

  removeTypingIndicator();
  setSendDisabled(false);
  input.focus();

  const reply = ai?.reply || 'I am here to help. Could you describe what you need?';
  appendMessage('bot', reply);
  conversationHistory.push({ from: 'vira', text: reply });

  if (ai?.needsTicket) {
    setTimeout(() => {
      appendMessage('bot', 'Would you like to raise a support ticket? Fill in your details below and I\'ll get it logged for you.');
      showTicketForm({
        ticketSubject:   ai.ticketSubject  || 'Support request',
        ticketSummary:   ai.ticketSummary  || userText,
        issueCategory:   ai.issueCategory  || 'Other',
        originalMessage: userText,
      });
    }, 500);
  }
}