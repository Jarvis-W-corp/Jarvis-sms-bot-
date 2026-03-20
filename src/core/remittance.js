const { google } = require('googleapis');
const pdf = require('pdf-parse');

const GMAIL_SCOPES = [
  'https://www.googleapis.com/auth/gmail.modify',
  'https://www.googleapis.com/auth/spreadsheets',
];

function getAuth() {
  const clientId = process.env.GMAIL_CLIENT_ID;
  const clientSecret = process.env.GMAIL_CLIENT_SECRET;
  if (!clientId || !clientSecret) throw new Error('GMAIL_CLIENT_ID and GMAIL_CLIENT_SECRET env vars required');
  const oAuth2Client = new google.auth.OAuth2(clientId, clientSecret, 'http://localhost:8091');
  if (process.env.GMAIL_REFRESH_TOKEN) {
    oAuth2Client.setCredentials({ refresh_token: process.env.GMAIL_REFRESH_TOKEN });
  }
  return oAuth2Client;
}

// Fetch ION SOLAR PROS remittance emails with PDF attachments
async function fetchRemittanceEmails(maxResults = 50) {
  const auth = getAuth();
  const gmail = google.gmail({ version: 'v1', auth });

  // Search for ION SOLAR PROS remittance emails (including forwarded ones)
  const query = 'subject:"Remittance Advice from ION SOLAR PROS" has:attachment';
  const res = await gmail.users.messages.list({ userId: 'me', maxResults, q: query });
  const messages = res.data.messages || [];

  console.log('[REMITTANCE] Found ' + messages.length + ' matching emails');
  const results = [];

  for (const msg of messages) {
    try {
      const detail = await gmail.users.messages.get({ userId: 'me', id: msg.id });
      const headers = detail.data.payload.headers;
      const subject = headers.find(h => h.name === 'Subject')?.value || 'No subject';
      const from = headers.find(h => h.name === 'From')?.value || 'Unknown';
      const date = headers.find(h => h.name === 'Date')?.value || '';

      // Find PDF attachments in the message parts
      const pdfParts = findPdfParts(detail.data.payload);

      for (const part of pdfParts) {
        const attachment = await gmail.users.messages.attachments.get({
          userId: 'me',
          messageId: msg.id,
          id: part.body.attachmentId,
        });

        const pdfBuffer = Buffer.from(attachment.data.data, 'base64');
        const parsed = await pdf(pdfBuffer);
        const extracted = extractRemittanceData(parsed.text, date, subject);

        if (extracted) {
          results.push(extracted);
          console.log('[REMITTANCE] Extracted: ' + extracted.date + ' | $' + extracted.amount + ' | Ref: ' + extracted.reference);
        } else {
          console.log('[REMITTANCE] Could not parse PDF from: ' + subject);
          // Still add with raw text for manual review
          results.push({
            date: new Date(date).toLocaleDateString('en-US') || date,
            reference: 'NEEDS REVIEW',
            amount: 'NEEDS REVIEW',
            subject,
            rawText: parsed.text.substring(0, 500),
          });
        }
      }
    } catch (err) {
      console.error('[REMITTANCE] Error processing message ' + msg.id + ':', err.message);
    }
  }

  // Sort by date
  results.sort((a, b) => new Date(a.date) - new Date(b.date));
  return results;
}

// Recursively find PDF attachment parts in email payload
function findPdfParts(payload) {
  const parts = [];
  if (payload.parts) {
    for (const part of payload.parts) {
      if (part.mimeType === 'application/pdf' && part.body?.attachmentId) {
        parts.push(part);
      }
      // Check nested parts (multipart emails)
      if (part.parts) {
        parts.push(...findPdfParts(part));
      }
    }
  }
  // Single-part PDF
  if (payload.mimeType === 'application/pdf' && payload.body?.attachmentId) {
    parts.push(payload);
  }
  return parts;
}

// Extract date, reference number, and amount from remittance PDF text
function extractRemittanceData(text, emailDate, subject) {
  // Try multiple patterns since remittance PDFs vary in format
  let date = null;
  let reference = null;
  let amount = null;

  // Date patterns
  const datePatterns = [
    /(?:Pay(?:ment)?\s*Date|Date|Check\s*Date|Remit(?:tance)?\s*Date)[:\s]*(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})/i,
    /(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})/,
  ];
  for (const pattern of datePatterns) {
    const match = text.match(pattern);
    if (match) {
      date = match[1];
      break;
    }
  }
  if (!date && emailDate) {
    try { date = new Date(emailDate).toLocaleDateString('en-US'); } catch (e) { date = emailDate; }
  }

  // Reference / check number patterns
  const refPatterns = [
    /(?:Reference|Ref|Check|Chk|Payment|Confirmation|Transaction)\s*(?:#|No\.?|Number)?[:\s]*([A-Z0-9\-]{3,20})/i,
    /(?:ACH|EFT|Wire)\s*(?:#|No\.?)?[:\s]*([A-Z0-9\-]{3,20})/i,
    /#\s*([A-Z0-9\-]{3,20})/i,
  ];
  for (const pattern of refPatterns) {
    const match = text.match(pattern);
    if (match) {
      reference = match[1];
      break;
    }
  }

  // Amount patterns - look for total/net amount
  const amountPatterns = [
    /(?:Total|Net|Amount|Pay(?:ment)?|Grand\s*Total|Net\s*Pay)[:\s]*\$?([\d,]+\.?\d{0,2})/i,
    /\$\s*([\d,]+\.\d{2})/g,  // Any dollar amount - we'll take the last one (usually the total)
  ];

  for (const pattern of amountPatterns) {
    if (pattern.global) {
      const matches = [...text.matchAll(pattern)];
      if (matches.length > 0) {
        // Take the last dollar amount (typically the total)
        amount = matches[matches.length - 1][1];
        break;
      }
    } else {
      const match = text.match(pattern);
      if (match) {
        amount = match[1];
        break;
      }
    }
  }

  if (!date && !reference && !amount) return null;

  return {
    date: date || 'Unknown',
    reference: reference || 'N/A',
    amount: amount ? amount.replace(/,/g, '') : 'Unknown',
    subject,
  };
}

// Write extracted data to Google Sheet
async function writeToSheet(data, sheetId) {
  if (!sheetId) throw new Error('GOOGLE_SHEET_ID env var required. Create a Google Sheet and set the ID.');

  const auth = getAuth();
  const sheets = google.sheets({ version: 'v4', auth });

  // Check if headers exist
  let hasHeaders = false;
  try {
    const existing = await sheets.spreadsheets.values.get({
      spreadsheetId: sheetId,
      range: 'Sheet1!A1:D1',
    });
    hasHeaders = existing.data.values && existing.data.values.length > 0;
  } catch (e) {
    // Sheet might be empty
  }

  const rows = [];
  if (!hasHeaders) {
    rows.push(['Date', 'Reference #', 'Amount', 'Email Subject']);
  }

  for (const entry of data) {
    rows.push([entry.date, entry.reference, entry.amount, entry.subject]);
  }

  if (rows.length === 0) return { added: 0 };

  await sheets.spreadsheets.values.append({
    spreadsheetId: sheetId,
    range: 'Sheet1!A:D',
    valueInputOption: 'USER_ENTERED',
    requestBody: { values: rows },
  });

  const added = hasHeaders ? rows.length : rows.length - 1;
  console.log('[REMITTANCE] Wrote ' + added + ' rows to Google Sheet');
  return { added };
}

// Main function: fetch, parse, write
async function processRemittances() {
  const sheetId = process.env.GOOGLE_SHEET_ID;
  if (!sheetId) throw new Error('Set GOOGLE_SHEET_ID env var first. Create a Google Sheet and copy the ID from the URL.');

  const data = await fetchRemittanceEmails(50);
  if (data.length === 0) return { found: 0, added: 0, data: [] };

  const result = await writeToSheet(data, sheetId);
  return { found: data.length, added: result.added, data };
}

module.exports = { processRemittances, fetchRemittanceEmails, writeToSheet, extractRemittanceData };
