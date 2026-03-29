require('dotenv').config();
const { google } = require('googleapis');

function getAuth() {
  const oAuth2Client = new google.auth.OAuth2(
    process.env.GMAIL_CLIENT_ID,
    process.env.GMAIL_CLIENT_SECRET,
    'http://localhost:8091'
  );
  oAuth2Client.setCredentials({ refresh_token: process.env.GMAIL_REFRESH_TOKEN });
  return oAuth2Client;
}

async function run() {
  const auth = getAuth();
  const sheets = google.sheets({ version: 'v4', auth });
  const sheetId = process.env.GOOGLE_SHEET_ID;

  const headers = [
    'Status', 'Name', 'Date', 'Original Amount', 'Payment', 'Rep/Category', 'Remittance Date', 'Notes'
  ];

  const rows = [headers];

  // MISSING FROM YOUR TRACKING (in remittance, not in your list)
  const missing = [
    ['MISSING FROM TRACKING', 'Bill', '07/17/2025', 9089.17, 9089.17, '', '07/18/2025', 'Large Bill entry not on tracking list'],
    ['MISSING FROM TRACKING', 'Catch Up from email', '08/06/2025', 3163.81, 3163.81, '', '08/08/2025', 'Lump catch-up payment'],
    ['MISSING FROM TRACKING', 'Blitz', '09/05/2025', 3074.15, 3074.15, '', '09/08/2025', '3rd Blitz payment not tracked'],
    ['MISSING FROM TRACKING', 'Campbell', '08/13/2025', 2387.00, 2387.00, '', '10/17/2025', 'Not in tracking list at all'],
    ['MISSING FROM TRACKING', 'Moore', '08/14/2025', 2233.00, 2233.00, '', '10/17/2025', 'Not in tracking list at all'],
    ['MISSING FROM TRACKING', 'wadhwa', '10/08/2025', 7865.00, 1000.00, '', '10/17/2025', 'Paid $1,000 of $7,865'],
    ['MISSING FROM TRACKING', 'wadhwa', '01/01/2026', 6655.00, 1000.00, '', '10/17/2025', 'Paid $1,000 of $6,655'],
    ['MISSING FROM TRACKING', 'Carvajal', '12/16/2025', 4928.00, 4928.00, '', '12/19/2025', 'Not in tracking list at all'],
    ['MISSING FROM TRACKING', 'Roqueli', '06/04/2025', 1419.00, 1419.00, '', '12/05/2025', 'Not in tracking list at all'],
    ['MISSING FROM TRACKING', 'Ferreira', '09/11/2025', 1650.00, 1650.00, '', '12/05/2025', 'Not in tracking list at all'],
    ['MISSING FROM TRACKING', 'camanocha', '10/08/2025', 1452.00, 1452.00, '', '12/05/2025', 'Not in tracking list at all'],
    ['MISSING FROM TRACKING', 'Pohl', '08/13/2025', 660.00, 660.00, '', '12/05/2025', 'Not in tracking list at all'],
    ['MISSING FROM TRACKING', 'parvin', '01/01/2026', 4147.00, 200.00, '', '12/15/2025', 'Paid $200 of $4,147'],
    ['MISSING FROM TRACKING', 'Perugini', '11/17/2025', 924.00, 924.00, '', '12/19/2025', 'Not in tracking list at all'],
    ['MISSING FROM TRACKING', 'matuska', '10/02/2025', 814.00, 814.00, '', '12/19/2025', 'Not in tracking list at all'],
    ['MISSING FROM TRACKING', 'gilbert', '10/08/2025', 429.00, 429.00, '', '12/19/2025', 'Not in tracking list at all'],
    ['MISSING FROM TRACKING', 'fusco', '10/08/2025', 638.00, 638.00, '', '10/17/2025', 'Not in tracking list at all'],
    ['MISSING FROM TRACKING', 'Bill (11/07)', '11/07/2025', 440.00, 440.00, '', '12/19/2025', 'Bill entry not in tracking'],
    ['MISSING FROM TRACKING', 'W/e 09-20-25 MP', '09/25/2025', 6762.37, 6762.37, 'mp', '09/26/2025', 'Weekly batch not tracked'],
    ['MISSING FROM TRACKING', 'W/e 09-20-25 BV', '09/25/2025', 10373.20, 10373.20, 'bv', '09/26/2025', 'Weekly batch not tracked'],
    ['MISSING FROM TRACKING', 'Mary w/e 08-09-25', '08/13/2025', 900.00, 900.00, 'Marializ', '08/15/2025', 'Weekly Mary not tracked'],
    ['MISSING FROM TRACKING', 'Mary w/e 08-16-25', '08/20/2025', 900.00, 900.00, 'Marializ', '08/22/2025', 'Weekly Mary not tracked'],
    ['MISSING FROM TRACKING', 'Mary w/e 08-23-25', '08/27/2025', 900.00, 900.00, 'Marializ', '08/29/2025', 'Weekly Mary not tracked'],
    ['MISSING FROM TRACKING', 'Mary w/e 08-29-25', '09/03/2025', 900.00, 900.00, 'Marializ', '09/05/2025', 'Weekly Mary not tracked'],
    ['MISSING FROM TRACKING', 'Mary w/e 09-06-25', '09/10/2025', 900.00, 900.00, 'Marializ', '09/12/2025', 'Weekly Mary not tracked'],
    ['MISSING FROM TRACKING', 'Mary w/e 09-20-25', '09/24/2025', 900.00, 900.00, 'Marializ', '09/26/2025', 'Weekly Mary not tracked'],
    ['MISSING FROM TRACKING', 'Bill (9/17)', '09/17/2025', 900.00, 900.00, '', '09/19/2025', 'Weekly Bill not tracked'],
    ['MISSING FROM TRACKING', 'Bill (10/15)', '10/15/2025', 900.00, 900.00, '', '10/17/2025', 'Weekly Bill not tracked'],
    ['MISSING FROM TRACKING', 'Bill (10/29)', '10/29/2025', 900.00, 900.00, '', '10/31/2025', 'Weekly Bill not tracked'],
    ['MISSING FROM TRACKING', 'Bill (11/01 - $2500)', '11/01/2025', 2500.00, 2500.00, '', '10/31/2025', 'Bill not tracked'],
    ['MISSING FROM TRACKING', 'Bill (11/05)', '11/05/2025', 900.00, 900.00, '', '11/07/2025', 'Weekly Bill not tracked'],
    ['MISSING FROM TRACKING', 'Bill (11/12)', '11/12/2025', 900.00, 900.00, '', '11/14/2025', 'Weekly Bill not tracked'],
    ['MISSING FROM TRACKING', 'Bill (11/19)', '11/19/2025', 900.00, 900.00, '', '11/21/2025', 'Weekly Bill not tracked'],
    ['MISSING FROM TRACKING', 'Bill (11/26)', '11/26/2025', 900.00, 900.00, '', '11/28/2025', 'Weekly Bill not tracked'],
    ['MISSING FROM TRACKING', 'Bill (12/24)', '12/24/2025', 900.00, 900.00, '', '12/24/2025', 'Weekly Bill not tracked'],
    ['MISSING FROM TRACKING', 'W/e 09-27-25', '10/01/2025', 900.00, 900.00, '', '10/03/2025', 'Weekly not tracked'],
    ['MISSING FROM TRACKING', 'w/e MP (10/1)', '10/01/2025', 2500.00, 2500.00, 'mp', '10/03/2025', 'Oct MP not tracked'],
    ['MISSING FROM TRACKING', 'Oct BV', '10/01/2025', 2500.00, 2500.00, 'bv', '10/03/2025', 'Oct BV not tracked'],
  ];

  // CLAWBACK CREDITS (in remittance, not in tracking)
  const clawbacks = [
    ['CLAWBACK (CREDIT)', 'Romeo', '02/16/2024', 1000.00, -1000.00, '', '10/02/2025', 'Credit back'],
    ['CLAWBACK (CREDIT)', "O'Donnell", '12/23/2024', 500.00, -500.00, '', '10/02/2025', 'Credit back'],
    ['CLAWBACK (CREDIT)', 'Ostrofsky', '12/27/2024', 1000.00, -1000.00, '', '10/02/2025', 'Credit back'],
    ['CLAWBACK (CREDIT)', 'Castro', '01/01/2025', 750.00, -750.00, '', '10/16/2025', 'Clawback'],
    ['CLAWBACK (CREDIT)', 'Lindo', '01/01/2025', 375.00, -375.00, '', '10/16/2025', 'Clawback'],
    ['CLAWBACK (CREDIT)', 'Lopez', '01/01/2025', 375.00, -375.00, '', '10/16/2025', 'Clawback'],
    ['CLAWBACK (CREDIT)', 'Ridson', '01/16/2025', 375.00, -375.00, '', '10/16/2025', 'Clawback'],
    ['CLAWBACK (CREDIT)', 'Ridson (2)', '01/16/2025', 375.00, -375.00, '', '10/16/2025', 'Clawback'],
    ['CLAWBACK (CREDIT)', 'Kearney', '01/16/2025', 375.00, -375.00, '', '10/16/2025', 'Clawback'],
    ['CLAWBACK (CREDIT)', 'Miller', '04/15/2025', 1000.00, -1000.00, '', '10/16/2025', 'Clawback'],
    ['CLAWBACK (CREDIT)', 'Diedra', '04/15/2025', 1000.00, -1000.00, '', '10/16/2025', 'Clawback'],
    ['CLAWBACK (CREDIT)', 'Bonza', '08/05/2025', 375.00, -375.00, '', '10/16/2025', 'Clawback'],
  ];

  // MISSING FROM REMITTANCE (in tracking, not in Jarvis list)
  const missingFromRemittance = [
    ['MISSING FROM REMITTANCE', 'Jaffett (MP)', '05/23/2025', 259.38, 259.38, 'mp', '', 'Only BV side in remittance, MP side missing'],
  ];

  // SUMMARY
  const spacer = ['', '', '', '', '', '', '', ''];
  const summaryRows = [
    spacer,
    ['=== SUMMARY ===', '', '', '', '', '', '', ''],
    ['Your Tracking Total', '', '', '', 254256.59, '', '', '174 line items'],
    ['Remittance Bills Total', '', '', '', 322653.81, '', '', ''],
    ['Clawback Credits', '', '', '', -7500.00, '', '', '12 credits'],
    ['Remittance Net Total', '', '', '', 315153.81, '', '', ''],
    ['GAP (Remittance - Tracking)', '', '', '', 60897.22, '', '', 'Remittance has ~$60.9K more than your tracking list'],
  ];

  rows.push(...missing, ...clawbacks, ...missingFromRemittance, ...summaryRows);

  // Write to columns K:R (starting at K1) - leaves A:I untouched
  await sheets.spreadsheets.values.update({
    spreadsheetId: sheetId,
    range: 'Sheet1!K1',
    valueInputOption: 'USER_ENTERED',
    requestBody: { values: rows },
  });

  console.log('Done! Wrote ' + rows.length + ' rows to columns K-R. Existing data in A-I untouched.');
}

run().catch(err => { console.error('ERROR:', err.message); process.exit(1); });
