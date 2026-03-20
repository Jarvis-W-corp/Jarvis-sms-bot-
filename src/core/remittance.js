const { google } = require('googleapis');
const { PDFParse } = require('pdf-parse');

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

async function parsePdfBuffer(buf) {
  const uint8 = new Uint8Array(buf);
  const parser = new PDFParse(uint8);
  await parser.load();
  const result = await parser.getText();
  return typeof result === 'string' ? result : result.text || '';
}

// Fetch ION SOLAR PROS remittance emails with PDF attachments
async function fetchRemittanceEmails(maxResults = 50) {
  const auth = getAuth();
  const gmail = google.gmail({ version: 'v1', auth });

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
      const emailDate = headers.find(h => h.name === 'Date')?.value || '';

      const pdfParts = findPdfParts(detail.data.payload);

      for (const part of pdfParts) {
        const attachment = await gmail.users.messages.attachments.get({
          userId: 'me',
          messageId: msg.id,
          id: part.body.attachmentId,
        });

        const pdfBuffer = Buffer.from(attachment.data.data, 'base64');
        const text = await parsePdfBuffer(pdfBuffer);
        const extracted = extractRemittanceData(text, emailDate, subject);
        results.push(extracted);
        console.log('[REMITTANCE] Extracted ' + extracted.lineItems.length + ' line items from: ' + extracted.reference);
      }
    } catch (err) {
      console.error('[REMITTANCE] Error processing message ' + msg.id + ':', err.message);
    }
  }

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
      if (part.parts) {
        parts.push(...findPdfParts(part));
      }
    }
  }
  if (payload.mimeType === 'application/pdf' && payload.body?.attachmentId) {
    parts.push(payload);
  }
  return parts;
}

// Extract structured data from remittance PDF text
function extractRemittanceData(text, emailDate, subject) {
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);

  // Get remittance date
  let date = '';
  const dateMatch = text.match(/Date:\s*(\d{1,2}\/\d{1,2}\/\d{4})/);
  if (dateMatch) date = dateMatch[1];
  else if (emailDate) try { date = new Date(emailDate).toLocaleDateString('en-US'); } catch (e) { date = emailDate; }

  // Get reference
  let reference = '';
  const refMatch = text.match(/Reference\s*No:\s*(.+)/i);
  if (refMatch && refMatch[1].trim() && !/^Bill\s+Number/i.test(refMatch[1].trim())) {
    reference = refMatch[1].trim();
  }

  // Get payment recipient
  let payTo = '';
  const payToIdx = lines.findIndex(l => l === 'Payment To');
  if (payToIdx >= 0 && payToIdx + 1 < lines.length) payTo = lines[payToIdx + 1];

  // Get subtotal
  let subtotal = '';
  const subMatch = text.match(/SubTotal:\s*\$?([\d,]+\.\d{2})/);
  if (subMatch) subtotal = subMatch[1];

  // Parse bill line items (between header row and "Memo:" or "SubTotal")
  const lineItems = [];
  const billHeaderIdx = lines.findIndex(l => /^Bill\s+Number\s+Bill\s+Date/i.test(l));
  if (billHeaderIdx >= 0) {
    for (let i = billHeaderIdx + 1; i < lines.length; i++) {
      const line = lines[i];
      if (/^Memo:|^SubTotal:|^Credits\s+Summary/i.test(line)) break;
      // Line item pattern: Name  MM/DD/YYYY  MM/DD/YYYY  amount  amount  amount
      const m = line.match(/^(.+?)\s+(\d{2}\/\d{2}\/\d{4})\s+(\d{2}\/\d{2}\/\d{4})\s+([\d,]+\.\d{2})\s+([\d,]+\.\d{2})\s+([\d,]+\.\d{2})$/);
      if (m) {
        lineItems.push({
          type: 'bill',
          name: m[1].trim(),
          billDate: m[2],
          dueDate: m[3],
          originalAmount: m[4],
          balance: m[5],
          payment: m[6],
        });
      }
    }
  }

  // Parse credit line items
  const creditHeaderIdx = lines.findIndex(l => /^Credit\s+Number\s+Credit\s+Date/i.test(l));
  if (creditHeaderIdx >= 0) {
    for (let i = creditHeaderIdx + 1; i < lines.length; i++) {
      const line = lines[i];
      if (/^Total:|^Signature:/i.test(line)) break;
      // Credit pattern: Name  MM/DD/YYYY  amount  amount  amount
      const m = line.match(/^(.+?)\s+(\d{2}\/\d{2}\/\d{4})\s+([\d,]+\.\d{2})\s+([\d,]+\.\d{2})\s+([\d,]+\.\d{2})$/);
      if (m) {
        lineItems.push({
          type: 'credit',
          name: m[1].trim(),
          creditDate: m[2],
          originalAmount: m[3],
          balance: m[4],
          payment: m[5],
        });
      }
    }
  }

  return { date, reference, payTo, subtotal, subject, lineItems };
}

// Write extracted data to Google Sheet
async function writeToSheet(remittances, sheetId) {
  if (!sheetId) throw new Error('GOOGLE_SHEET_ID env var required');

  const auth = getAuth();
  const sheets = google.sheets({ version: 'v4', auth });

  // Check if headers exist
  let hasHeaders = false;
  try {
    const existing = await sheets.spreadsheets.values.get({
      spreadsheetId: sheetId,
      range: 'Sheet1!A1:I1',
    });
    hasHeaders = existing.data.values && existing.data.values.length > 0;
  } catch (e) {}

  const rows = [];
  if (!hasHeaders) {
    rows.push(['Remittance Date', 'Reference', 'Type', 'Name', 'Date', 'Original Amount', 'Balance', 'Payment', 'Pay To']);
  }

  for (const rem of remittances) {
    if (rem.lineItems.length === 0) {
      // No line items parsed — add summary row
      rows.push([rem.date, rem.reference, 'summary', '—', '—', rem.subtotal || '—', '—', rem.subtotal || '—', rem.payTo]);
    }
    for (const item of rem.lineItems) {
      rows.push([
        rem.date,
        rem.reference,
        item.type,
        item.name,
        item.billDate || item.creditDate || '',
        item.originalAmount,
        item.balance,
        item.payment,
        rem.payTo,
      ]);
    }
  }

  if (rows.length === 0) return { added: 0 };

  await sheets.spreadsheets.values.append({
    spreadsheetId: sheetId,
    range: 'Sheet1!A:I',
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
  if (!sheetId) throw new Error('Set GOOGLE_SHEET_ID env var first');

  const data = await fetchRemittanceEmails(50);
  if (data.length === 0) return { found: 0, added: 0, data: [] };

  const result = await writeToSheet(data, sheetId);
  return { found: data.length, added: result.added, data };
}

module.exports = { processRemittances, fetchRemittanceEmails, writeToSheet, extractRemittanceData };
