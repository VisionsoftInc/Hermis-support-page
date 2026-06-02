import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import axios from 'axios';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// Configuration - Using Microsoft Graph API
const DEFAULT_HERMIS_BACKEND_URL = 'https://visionsoft-crm-backend.onrender.com';
const rawHermisBackendUrl = String(process.env.HERMIS_BACKEND_URL || '').trim();
const hermisBackendLooksLocal = /localhost|127\.0\.0\.1/i.test(rawHermisBackendUrl);
const HERMIS_BACKEND_URL = rawHermisBackendUrl
  ? (process.env.RENDER && hermisBackendLooksLocal ? DEFAULT_HERMIS_BACKEND_URL : rawHermisBackendUrl)
  : DEFAULT_HERMIS_BACKEND_URL;
const EMAIL_RECEIVER = process.env.EMAIL_RECEIVER || 'events@visionsoft.com';
const SUPPORT_PHONE_NUMBER = process.env.SUPPORT_PHONE_NUMBER || process.env.WHATSAPP_SUPPORT_NUMBER || '+917731800138';
const WHATSAPP_SUPPORT_NUMBER = process.env.WHATSAPP_SUPPORT_NUMBER || '+917731800138';
const WHATSAPP_DEFAULT_TEXT = (process.env.WHATSAPP_DEFAULT_TEXT || '').trim();

// Microsoft Graph API Configuration
const MS_GRAPH_TENANT_ID = process.env.MS_GRAPH_TENANT_ID;
const MS_GRAPH_CLIENT_ID = process.env.MS_GRAPH_CLIENT_ID;
const MS_GRAPH_CLIENT_SECRET = process.env.MS_GRAPH_CLIENT_SECRET;
const MS_GRAPH_SENDER_EMAIL = process.env.MS_GRAPH_SENDER_EMAIL;

if (process.env.RENDER && hermisBackendLooksLocal) {
  console.warn('⚠ HERMIS_BACKEND_URL points to localhost on Render. Overriding to default public Hermis API URL.');
}

function safeSerializeError(error) {
  if (!error) return 'Unknown error';
  if (typeof error === 'string') return error;
  if (error.message) return error.message;

  try {
    return JSON.stringify(error);
  } catch {
    return String(error);
  }
}

let accessToken = null;
let tokenExpiry = null;

/**
 * Get Microsoft Graph API Access Token
 */
const getAccessToken = async () => {
  // Check if token is still valid
  if (accessToken && tokenExpiry && Date.now() < tokenExpiry) {
    return accessToken;
  }

  try {
    const response = await axios.post(
      `https://login.microsoftonline.com/${MS_GRAPH_TENANT_ID}/oauth2/v2.0/token`,
      {
        client_id: MS_GRAPH_CLIENT_ID,
        client_secret: MS_GRAPH_CLIENT_SECRET,
        scope: 'https://graph.microsoft.com/.default',
        grant_type: 'client_credentials',
      },
      {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
      }
    );

    accessToken = response.data.access_token;
    tokenExpiry = Date.now() + (response.data.expires_in * 1000) - 60000;
    
    console.log('✓ Microsoft Graph API token acquired');
    return accessToken;
  } catch (error) {
    console.error('✗ Failed to get access token:', error.response?.data || error.message);
    throw error;
  }
};

/**
 * Send email via Microsoft Graph API
 */
const sendEmailViaGraphAPI = async (to, subject, htmlContent, textContent) => {
  try {
    const token = await getAccessToken();
    
    const emailBody = {
      message: {
        subject: subject,
        body: {
          contentType: 'HTML',
          content: htmlContent,
        },
        toRecipients: [
          {
            emailAddress: {
              address: to,
            },
          },
        ],
        from: {
          emailAddress: {
            address: MS_GRAPH_SENDER_EMAIL,
          },
        },
      },
      saveToSentItems: true,
    };

    // Use /users/{email}/sendMail instead of /me/sendMail for app-only auth
    const graphUrl = `https://graph.microsoft.com/v1.0/users/${MS_GRAPH_SENDER_EMAIL}/sendMail`;
    
    const response = await axios.post(
      graphUrl,
      emailBody,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      }
    );

    console.log(`✓ Email sent to: ${to}`);
    return response.data;
  } catch (error) {
    console.error('✗ Error sending email:', error.response?.data || error.message);
    throw error;
  }
};

/**
 * Verify email transporter connection
 */
const verifyEmailTransporter = async () => {
  try {
    await getAccessToken();
    console.log('✓ Email transporter verified and ready (Microsoft Graph API)');
    return true;
  } catch (error) {
    console.error('✗ Email transporter error:', error.message);
    return false;
  }
};

// Verify email connection on startup
verifyEmailTransporter();

// Routes

// Serve home page
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Endpoint: Send support email
// This endpoint receives form data and:
// 1. Sends email to support mailbox via Microsoft Graph API
// 2. Creates ticket in Hermis backend
app.post('/api/support/send-email', async (req, res) => {
  try {
    const { 
      customerName, 
      customerEmail, 
      subject, 
      message,
      attachmentBase64 
    } = req.body;

    // Validate required fields
    if (!customerEmail || !subject || !message) {
      return res.status(400).json({ 
        success: false, 
        message: 'Missing required fields: customerEmail, subject, message' 
      });
    }

    // Step 1: Send email to support mailbox via Microsoft Graph API
    const emailContent = `
New Support Ticket Submitted:

From: ${customerName} (${customerEmail})
Subject: ${subject}

Message:
${message}

---
This email was submitted via support-page.
Ticket will be created automatically in Hermis.
    `;

    const htmlContent = `
      <h2>New Support Ticket</h2>
      <p><strong>From:</strong> ${customerName} (${customerEmail})</p>
      <p><strong>Subject:</strong> ${subject}</p>
      <hr/>
      <p><strong>Message:</strong></p>
      <p>${message.replace(/\n/g, '<br>')}</p>
      <hr/>
      <p><em>Submitted via Hermis Support Page</em></p>
    `;

    await sendEmailViaGraphAPI(EMAIL_RECEIVER, `[Support Request] ${subject}`, htmlContent, emailContent);

    console.log(`✓ Email sent to ${EMAIL_RECEIVER}`);

    // Step 2: Create ticket in Hermis backend
    try {
      const ticketResponse = await axios.post(
        `${HERMIS_BACKEND_URL}/api/tickets/email`,
        {
          customerName: customerName || 'No Name Provided',
          customerEmail: customerEmail,
          subject: subject,
          description: message,
        },
        {
          headers: {
            'Content-Type': 'application/json',
          },
          timeout: 10000,
        }
      );

      console.log(`✓ Ticket created in Hermis: ${ticketResponse.data?.ticketNumber}`);

      return res.status(201).json({
        success: true,
        message: 'Support request submitted successfully!',
        ticketNumber: ticketResponse.data?.ticketNumber,
        ticketId: ticketResponse.data?._id,
      });
    } catch (hermisError) {
      console.error('Error creating ticket in Hermis:', hermisError.message);
      // Email was sent successfully, but ticket creation failed
      // This is acceptable - email will be read later by email integration
      return res.status(201).json({
        success: true,
        message: 'Support email sent successfully! Ticket will be created shortly.',
        warning: 'Ticket could not be created immediately but will be processed when emails are synced.',
      });
    }
  } catch (error) {
    console.error('Error processing support request:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to process support request',
      error: error.message,
    });
  }
});

// Endpoint: Create ticket directly in Hermis (used by Generate Ticket web form)
app.post('/api/support/create-ticket', async (req, res) => {
  try {
    const {
      customerName,
      customerPhone,
      customerEmail,
      subject,
      description,
      source,
      priority,
      status,
    } = req.body;

    if (!customerName || !customerPhone || !subject || !description) {
      return res.status(400).json({
        success: false,
        message: 'Missing required fields: customerName, customerPhone, subject, description',
      });
    }

    const payload = {
      customerName,
      customerPhone,
      customerEmail: customerEmail || '',
      subject,
      description,
      source: 'WEB',
      priority: priority || 'MEDIUM',
      status: status || 'OPEN',
    };

    const ticketResponse = await axios.post(
      `${HERMIS_BACKEND_URL}/api/tickets/create`,
      payload,
      {
        headers: {
          'Content-Type': 'application/json',
        },
        timeout: 15000,
      }
    );

    return res.status(201).json({
      success: true,
      message: 'Ticket created in Hermis',
      data: ticketResponse.data?.data || ticketResponse.data,
    });
  } catch (error) {
    const statusCode = error.response?.status;
    const statusText = error.response?.statusText;
    const responseData = error.response?.data;
    const fallbackMessage = safeSerializeError(error);
    const errorCode = error.code;
    const requestUrl = error.config?.url;
    const requestMethod = error.config?.method;

    console.error('Error creating Hermis ticket from support page:', {
      statusCode,
      statusText,
      responseData,
      errorCode,
      requestUrl,
      requestMethod,
      message: fallbackMessage,
    });

    return res.status(502).json({
      success: false,
      message: 'Failed to create ticket in Hermis',
      error: error.response?.data?.message || fallbackMessage,
    });
  }
});

// Endpoint: Get mailto configuration (for frontend)
app.get('/api/support/mailto-info', (req, res) => {
  return res.json({
    recipient: EMAIL_RECEIVER,
    subject: 'Support Request',
    instructions: `Click the button to send an email to ${EMAIL_RECEIVER}. Your email will be automatically converted into a ticket.`,
  });
});

app.get('/api/support/config', (req, res) => {
  return res.json({
    supportPhoneNumber: SUPPORT_PHONE_NUMBER,
    whatsappSupportNumber: SUPPORT_PHONE_NUMBER,
    whatsappDefaultText: WHATSAPP_DEFAULT_TEXT,
  });
});

// Health check
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    service: 'hermis-support-page',
    emailReceiver: EMAIL_RECEIVER,
    hermisBackend: HERMIS_BACKEND_URL,
  });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({
    success: false,
    message: 'Internal server error',
    error: err.message,
  });
});

app.listen(PORT, () => {
  console.log(`
╔════════════════════════════════════════════════════════════╗
║         Hermis Support Page Server Running                ║
╠════════════════════════════════════════════════════════════╣
║ Server:         http://localhost:${PORT}                   ║
║ Email Receiver: ${EMAIL_RECEIVER}                             ║
║ Hermis Backend: ${HERMIS_BACKEND_URL}                 ║
╚════════════════════════════════════════════════════════════╝
  `);
});
