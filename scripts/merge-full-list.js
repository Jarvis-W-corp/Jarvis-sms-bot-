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

  // FULL MERGED LIST - Every remittance entry through end of Dec 2025
  // Using remittance as master, with rep info from tracking list where available
  // Columns: Remittance Date, Reference, Type, Name, Date, Original Amount, Balance, Payment, Pay To, Rep/Category

  const headers = [
    'Remittance Date', 'Reference', 'Type', 'Name', 'Date', 'Original Amount', 'Balance', 'Payment', 'Pay To', '', 'Rep/Category'
  ];

  const rows = [headers];

  // Full combined data sorted by remittance date
  const data = [
    // 07/10/2025 - DD1311
    ['07/10/2025', 'DD1311', 'bill', 'Cabrerra', '03/12/2025', 3239.00, 3239.00, 3239.00, 'Hustlers LLP', '', 'brandon'],
    ['07/10/2025', 'DD1311', 'bill', 'Ramirez', '04/01/2025', 2735.00, 2735.00, 2735.00, 'Hustlers LLP', '', 'brandon'],
    ['07/10/2025', 'DD1311', 'bill', 'Curren', '04/08/2025', 435.36, 435.36, 435.36, 'Hustlers LLP', '', 'brandon'],
    ['07/10/2025', 'DD1311', 'bill', 'Gosselin', '05/13/2025', 518.76, 518.76, 518.76, 'Hustlers LLP', '', 'split'],
    ['07/10/2025', 'DD1311', 'bill', 'Mcdermott', '07/01/2025', 2686.13, 750.00, 750.00, 'Hustlers LLP', '', 'bv'],
    ['07/10/2025', 'DD1323', 'bill', 'Bill', '07/09/2025', 550.00, 550.00, 550.00, 'Hustlers LLP', '', 'brandon'],

    // 07/17/2025 - DD1326
    ['07/17/2025', 'DD1326', 'bill', 'aquiahuatl', '03/01/2025', 311.26, 311.26, 311.26, 'Hustlers LLP', '', 'split'],
    ['07/17/2025', 'DD1326', 'bill', 'Carrasco', '04/09/2025', 1304.40, 1304.40, 1304.40, 'Hustlers LLP', '', 'split'],
    ['07/17/2025', 'DD1326', 'bill', 'Harbanuk', '05/09/2025', 415.00, 415.00, 415.00, 'Hustlers LLP', '', 'split'],
    ['07/17/2025', 'DD1326', 'bill', 'Ihieme', '05/15/2025', 498.00, 498.00, 498.00, 'Hustlers LLP', '', 'split'],
    ['07/17/2025', 'DD', 'bill', 'w/e 07-12-25', '07/16/2025', 550.00, 550.00, 550.00, 'Hustlers LLP', '', 'Marializ'],

    // 07/18/2025 - WAS MISSING FROM TRACKING
    ['07/18/2025', 'DD', 'bill', 'Bill', '07/17/2025', 9089.17, 9089.17, 9089.17, 'Hustlers LLP', '', 'ADDED - was not on tracking'],

    // 07/24/2025 - DD1360
    ['07/24/2025', 'DD1360', 'bill', 'Rausher', '03/01/2025', 496.50, 496.50, 496.50, 'Hustlers LLP', '', 'bv'],
    ['07/24/2025', 'DD1360', 'bill', 'Dalke', '06/12/2025', 2544.13, 2544.13, 2544.13, 'Hustlers LLP', '', 'mp'],
    ['07/24/2025', 'DD1360', 'bill', 'Deespinosa', '04/07/2025', 609.00, 609.00, 609.00, 'Hustlers LLP', '', 'split'],
    ['07/24/2025', 'DD1360', 'bill', 'Silva', '04/08/2025', 4220.63, 4220.63, 4220.63, 'Hustlers LLP', '', 'mp'],
    ['07/24/2025', 'DD1360', 'bill', 'Hendricks', '04/23/2025', 560.26, 560.26, 560.26, 'Hustlers LLP', '', 'split'],
    ['07/24/2025', 'DD1360', 'bill', 'Hickcox', '04/23/2025', 207.50, 207.50, 207.50, 'Hustlers LLP', '', 'split'],
    ['07/24/2025', 'DD1360', 'bill', 'templeton', '04/29/2025', 290.50, 290.50, 290.50, 'Hustlers LLP', '', 'split'],
    ['07/24/2025', 'DD1360', 'bill', 'Ferdinand', '04/29/2025', 11598.13, 11598.13, 11598.13, 'Hustlers LLP', '', 'mp'],
    ['07/24/2025', 'DD1360', 'bill', 'Foley', '05/06/2025', 394.26, 394.26, 394.26, 'Hustlers LLP', '', 'split'],
    ['07/24/2025', 'DD1360', 'bill', 'Ruiz', '05/13/2025', 1077.50, 1077.50, 1077.50, 'Hustlers LLP', '', 'bv'],
    ['07/24/2025', 'DD1360', 'bill', 'Etten', '05/22/2025', 207.50, 207.50, 207.50, 'Hustlers LLP', '', 'split'],
    ['07/24/2025', 'DD', 'bill', 'Bill', '07/23/2025', 550.00, 550.00, 550.00, 'Hustlers LLP', '', 'Marializ'],

    // 08/01/2025 - DD1409
    ['08/01/2025', 'DD1409', 'bill', 'Mary', '07/30/2025', 900.00, 900.00, 900.00, 'Hustlers LLP', '', 'Marializ'],
    ['08/01/2025', 'DD1409', 'bill', 'Blitz', '07/31/2025', 16200.90, 16200.90, 16200.90, 'Hustlers LLP', '', 'bv'],
    ['08/01/2025', 'DD1409', 'bill', 'Blitz MP', '07/31/2025', 6558.00, 6558.00, 6558.00, 'Hustlers LLP', '', 'mp'],
    ['08/01/2025', 'DD1409', 'bill', 'Aug MP', '08/01/2025', 2500.00, 2500.00, 2500.00, 'Hustlers LLP', '', 'mp'],
    ['08/01/2025', 'DD1409', 'bill', 'August BV', '08/01/2025', 2500.00, 2500.00, 2500.00, 'Hustlers LLP', '', 'bv'],
    // DD1390
    ['08/01/2025', 'DD1390', 'bill', 'Robles', '04/23/2025', 9008.00, 9008.00, 9008.00, 'Hustlers LLP', '', 'bv'],
    ['08/01/2025', 'DD1390', 'bill', 'melville', '04/28/2025', 249.00, 249.00, 249.00, 'Hustlers LLP', '', 'split'],
    ['08/01/2025', 'DD1390', 'bill', 'Ramos', '05/16/2025', 622.50, 622.50, 622.50, 'Hustlers LLP', '', 'BV'],
    ['08/01/2025', 'DD1390', 'bill', 'Buckely', '05/22/2025', 601.76, 601.76, 601.76, 'Hustlers LLP', '', 'split'],

    // 08/08/2025
    ['08/08/2025', 'DD', 'bill', 'Lorenzo', '03/27/2025', 932.25, 932.25, 932.25, 'Hustlers LLP', '', 'bv'],
    ['08/08/2025', 'DD', 'bill', 'Obrien', '04/23/2025', 1085.88, 1085.88, 1085.88, 'Hustlers LLP', '', 'bv'],
    ['08/08/2025', 'DD', 'bill', 'Albrycht', '05/15/2025', 1213.88, 1213.88, 1213.88, 'Hustlers LLP', '', 'split'],
    ['08/08/2025', 'DD', 'bill', 'Serna', '05/28/2025', 4811.63, 4811.63, 4811.63, 'Hustlers LLP', '', 'bv'],
    ['08/08/2025', 'DD', 'bill', 'Sember', '06/02/2025', 653.62, 653.62, 653.62, 'Hustlers LLP', '', 'split'],
    ['08/08/2025', 'DD', 'bill', 'Divirgillio', '06/02/2025', 560.24, 560.24, 560.24, 'Hustlers LLP', '', 'split'],
    ['08/08/2025', 'DD', 'bill', 'Salzano', '06/06/2025', 498.00, 498.00, 498.00, 'Hustlers LLP', '', 'split'],
    ['08/08/2025', 'DD', 'bill', 'Simpson', '06/11/2025', 747.00, 747.00, 747.00, 'Hustlers LLP', '', 'split'],
    ['08/08/2025', 'DD', 'bill', 'Pederson', '08/05/2025', 3696.00, 1000.00, 1000.00, 'Hustlers LLP', '', 'mp self'],
    ['08/08/2025', 'DD', 'bill', 'Demiris', '08/05/2025', 2024.00, 1000.00, 1000.00, 'Hustlers LLP', '', 'bv self'],
    ['08/08/2025', 'DD', 'bill', 'Mary', '08/06/2025', 900.00, 900.00, 900.00, 'Hustlers LLP', '', 'Marializ'],
    ['08/08/2025', 'DD', 'bill', 'Catch Up from email', '08/06/2025', 3163.81, 3163.81, 3163.81, 'Hustlers LLP', '', 'ADDED - was not on tracking'],

    // 08/15/2025
    ['08/15/2025', 'DD', 'bill', 'Rector- BV', '03/24/2025', 2146.88, 2146.88, 2146.88, 'Hustlers LLP', '', 'bv team'],
    ['08/15/2025', 'DD', 'bill', 'Rector', '03/24/2025', 684.75, 684.75, 684.75, 'Hustlers LLP', '', 'MP OV'],
    ['08/15/2025', 'DD', 'bill', 'Bond', '06/10/2025', 424.13, 424.13, 424.13, 'Hustlers LLP', '', 'Split'],
    ['08/15/2025', 'DD', 'bill', 'Vassell', '06/17/2025', 653.63, 653.63, 653.63, 'Hustlers LLP', '', 'split'],
    ['08/15/2025', 'DD', 'bill', 'Volz', '05/16/2025', 840.38, 840.38, 840.38, 'Hustlers LLP', '', 'split'],
    ['08/15/2025', 'DD', 'bill', 'King', '06/20/2025', 391.50, 391.50, 391.50, 'Hustlers LLP', '', 'split'],
    ['08/15/2025', 'DD', 'bill', 'Mary w/e 08-09-25', '08/13/2025', 900.00, 900.00, 900.00, 'Hustlers LLP', '', 'ADDED - Marializ'],

    // 08/22/2025
    ['08/22/2025', 'DD', 'bill', 'Caporuscio', '04/29/2025', 1909.00, 1909.00, 1909.00, 'Hustlers LLP', '', 'bv TEAM'],
    ['08/22/2025', 'DD', 'bill', 'Caporuscio', '04/29/2025', 954.50, 954.50, 954.50, 'Hustlers LLP', '', 'MP OV'],
    ['08/22/2025', 'DD', 'bill', 'Decrescenzo', '05/13/2025', 2860.00, 2860.00, 2860.00, 'Hustlers LLP', '', 'BV TEAM'],
    ['08/22/2025', 'DD', 'bill', 'Decrescenzo', '05/13/2025', 664.00, 664.00, 664.00, 'Hustlers LLP', '', 'MP OV'],
    ['08/22/2025', 'DD', 'bill', 'Sarkodee', '05/30/2025', 653.63, 653.63, 653.63, 'Hustlers LLP', '', 'Split'],
    ['08/22/2025', 'DD', 'bill', 'Krancicki', '06/05/2025', 1462.88, 1462.88, 1462.88, 'Hustlers LLP', '', 'SPLIT'],
    ['08/22/2025', 'DD', 'bill', 'Kabangala', '08/19/2025', 750.00, 750.00, 750.00, 'Hustlers LLP', '', 'BV SELF'],
    ['08/22/2025', 'DD', 'bill', 'Mary w/e 08-16-25', '08/20/2025', 900.00, 900.00, 900.00, 'Hustlers LLP', '', 'ADDED - Marializ'],

    // 08/29/2025
    ['08/29/2025', 'DD', 'bill', 'Vazquez', '04/29/2025', 933.75, 933.75, 933.75, 'Hustlers LLP', '', 'TEAM BV'],
    ['08/29/2025', 'DD', 'bill', 'Vazquez', '04/29/2025', 373.50, 373.50, 373.50, 'Hustlers LLP', '', 'MP OV'],
    ['08/29/2025', 'DD', 'bill', 'Grippo', '05/06/2025', 1120.50, 1120.50, 1120.50, 'Hustlers LLP', '', 'BV TEAM'],
    ['08/29/2025', 'DD', 'bill', 'Grippo', '05/06/2025', 560.25, 560.25, 560.25, 'Hustlers LLP', '', 'MP OV'],
    ['08/29/2025', 'DD', 'bill', 'Borgognone', '05/23/2025', 1827.00, 1827.00, 1827.00, 'Hustlers LLP', '', 'MP TEAM'],
    ['08/29/2025', 'DD', 'bill', 'Timm', '07/02/2025', 424.13, 424.13, 424.13, 'Hustlers LLP', '', 'SPLIT'],
    ['08/29/2025', 'DD', 'bill', 'Jones', '07/03/2025', 1207.13, 1207.13, 1207.13, 'Hustlers LLP', '', 'SPLIT'],
    ['08/29/2025', 'DD', 'bill', 'Mary w/e 08-23-25', '08/27/2025', 900.00, 900.00, 900.00, 'Hustlers LLP', '', 'ADDED - Marializ'],

    // 09/05/2025
    ['09/05/2025', 'DD', 'bill', 'w/e 08-29-25', '09/04/2025', 10698.20, 10698.20, 10698.20, 'Hustlers LLP', '', 'BV'],
    ['09/05/2025', 'DD', 'bill', 'w/e 08-29-25-2', '09/04/2025', 5000.00, 5000.00, 5000.00, 'Hustlers LLP', '', 'BV'],
    ['09/05/2025', 'DD', 'bill', 'w/e 08-29-25-3', '09/04/2025', 500.00, 500.00, 500.00, 'Hustlers LLP', '', 'BV'],
    ['09/05/2025', 'DD', 'bill', 'Sept MP', '09/01/2025', 2500.00, 2500.00, 2500.00, 'Hustlers LLP', '', 'MP'],
    ['09/05/2025', 'DD', 'bill', 'Sept 2025', '09/01/2025', 2500.00, 2500.00, 2500.00, 'Hustlers LLP', '', 'BV'],
    ['09/05/2025', 'DD', 'bill', 'Mary w/e 08-29-25', '09/03/2025', 900.00, 900.00, 900.00, 'Hustlers LLP', '', 'ADDED - Marializ'],
    ['09/05/2025', 'DD', 'bill', 'E Lopez', '04/15/2025', 3894.25, 3894.25, 3894.25, 'Hustlers LLP', '', 'BV SELFIE'],
    ['09/05/2025', 'DD', 'bill', 'Marcinczyk', '05/13/2025', 870.00, 870.00, 870.00, 'Hustlers LLP', '', 'MP'],
    ['09/05/2025', 'DD', 'bill', 'Marcinczyk', '05/13/2025', 498.00, 498.00, 498.00, 'Hustlers LLP', '', 'bv OV'],
    ['09/05/2025', 'DD', 'bill', 'Victorio', '05/21/2025', 2353.13, 2353.13, 2353.13, 'Hustlers LLP', '', 'Bv SELF'],
    ['09/05/2025', 'DD', 'bill', 'Ringrose', '06/04/2025', 561.00, 561.00, 561.00, 'Hustlers LLP', '', 'SPLIT'],
    ['09/05/2025', 'DD', 'bill', 'Mcdermott', '07/01/2025', 2686.13, 1936.13, 1936.13, 'Hustlers LLP', '', 'BV SELF'],
    ['09/05/2025', 'DD', 'bill', 'Depass', '07/02/2025', 1320.00, 1320.00, 1320.00, 'Hustlers LLP', '', 'SPLIT'],
    ['09/05/2025', 'DD', 'bill', 'McFarland', '08/26/2025', 8845.00, 8845.00, 1000.00, 'Hustlers LLP', '', 'bv SELF'],
    ['09/05/2025', 'DD', 'bill', 'Batres', '08/26/2025', 2564.25, 2564.25, 750.00, 'Hustlers LLP', '', 'BV SELF'],
    ['09/05/2025', 'DD', 'bill', 'McFarland', '08/26/2025', 8365.00, 8365.00, 1000.00, 'Hustlers LLP', '', 'BV Self'],
    ['09/05/2025', 'DD', 'bill', 'zacks', '08/29/2025', 3146.00, 3146.00, 750.00, 'Hustlers LLP', '', 'BV SELF'],

    // 09/08/2025 - MISSING FROM TRACKING
    ['09/08/2025', 'DD', 'bill', 'Blitz', '09/05/2025', 3074.15, 3074.15, 3074.15, 'Hustlers LLP', '', 'ADDED - was not on tracking'],

    // 09/12/2025
    ['09/12/2025', 'DD', 'bill', 'Stankowski', '05/29/2025', 326.25, 326.25, 326.25, 'Hustlers LLP', '', 'SPLIT'],
    ['09/12/2025', 'DD', 'bill', 'Evans', '06/30/2025', 391.50, 391.50, 391.50, 'Hustlers LLP', '', 'SPLIT'],
    ['09/12/2025', 'DD', 'bill', 'Rivera', '07/11/2025', 587.25, 587.25, 587.25, 'Hustlers LLP', '', 'SPLIT'],
    ['09/12/2025', 'DD', 'bill', 'Conway', '08/05/2025', 1650.00, 1650.00, 1650.00, 'Hustlers LLP', '', 'SPLIT'],
    ['09/12/2025', 'DD', 'bill', 'Mary w/e 09-06-25', '09/10/2025', 900.00, 900.00, 900.00, 'Hustlers LLP', '', 'ADDED - Marializ'],

    // 09/19/2025
    ['09/19/2025', 'DD', 'bill', 'Hedge', '05/27/2025', 996.00, 996.00, 996.00, 'Hustlers LLP', '', 'SPLIT'],
    ['09/19/2025', 'DD', 'bill', 'Ludemann', '06/20/2025', 933.75, 933.75, 933.75, 'Hustlers LLP', '', 'SPLIT'],
    ['09/19/2025', 'DD', 'bill', 'Maclure', '07/14/2025', 429.00, 429.00, 429.00, 'Hustlers LLP', '', 'SPLIT'],
    ['09/19/2025', 'DD', 'bill', 'Demiris', '08/05/2025', 2024.00, 1024.00, 1024.00, 'Hustlers LLP', '', 'BV SELF'],
    ['09/19/2025', 'DD', 'bill', 'wiggins', '08/19/2025', 1257.75, 1257.75, 1257.75, 'Hustlers LLP', '', 'SPLIT'],
    ['09/19/2025', 'DD', 'bill', 'miglas', '08/19/2025', 715.00, 715.00, 715.00, 'Hustlers LLP', '', 'BV TEAM'],
    ['09/19/2025', 'DD', 'bill', 'miglas', '08/19/2025', 286.00, 286.00, 286.00, 'Hustlers LLP', '', 'MP OV'],
    ['09/19/2025', 'DD', 'bill', 'Bill', '09/17/2025', 900.00, 900.00, 900.00, 'Hustlers LLP', '', 'ADDED'],

    // 09/26/2025
    ['09/26/2025', 'DD', 'bill', 'Mary w/e 09-20-25', '09/24/2025', 900.00, 900.00, 900.00, 'Hustlers LLP', '', 'ADDED - Marializ'],
    ['09/26/2025', 'DD', 'bill', 'W/e 09-20-25 MP', '09/25/2025', 6762.37, 6762.37, 6762.37, 'Hustlers LLP', '', 'ADDED - MP'],
    ['09/26/2025', 'DD', 'bill', 'W/e 09-20-25 BV', '09/25/2025', 10373.20, 10373.20, 10373.20, 'Hustlers LLP', '', 'ADDED - BV'],
    ['09/26/2025', 'DD', 'bill', 'Shrestha', '06/30/2025', 619.88, 619.88, 619.88, 'Hustlers LLP', '', 'split'],
    ['09/26/2025', 'DD', 'bill', 'Digiovanni', '08/05/2025', 396.00, 396.00, 396.00, 'Hustlers LLP', '', 'split'],

    // 10/02/2025 - CLAWBACKS
    ['10/02/2025', 'CB', 'credit', 'Romeo', '02/16/2024', 1000.00, 1000.00, -1000.00, 'Hustlers LLP', '', 'CLAWBACK'],
    ['10/02/2025', 'CB', 'credit', "O'Donnell", '12/23/2024', 500.00, 500.00, -500.00, 'Hustlers LLP', '', 'CLAWBACK'],
    ['10/02/2025', 'CB', 'bill', 'Sweeney', '08/13/2025', 2772.00, 1000.00, 1000.00, 'Hustlers LLP', '', 'BV Self'],
    ['10/02/2025', 'CB', 'credit', 'Ostrofsky', '12/27/2024', 1000.00, 1000.00, -1000.00, 'Hustlers LLP', '', 'CLAWBACK'],

    // 10/03/2025
    ['10/03/2025', 'DD', 'bill', 'Hendricks', '06/12/2025', 1221.00, 1221.00, 1221.00, 'Hustlers LLP', '', 'Split'],
    ['10/03/2025', 'DD', 'bill', 'Thibodeau', '06/16/2025', 748.00, 748.00, 748.00, 'Hustlers LLP', '', 'split'],
    ['10/03/2025', 'DD', 'bill', 'Leduc', '06/27/2025', 456.50, 456.50, 456.50, 'Hustlers LLP', '', 'split'],
    ['10/03/2025', 'DD', 'bill', 'Reyes', '08/05/2025', 2244.00, 744.00, 744.00, 'Hustlers LLP', '', 'BV'],
    ['10/03/2025', 'DD', 'bill', 'Reyes', '08/05/2025', 748.00, 748.00, 748.00, 'Hustlers LLP', '', 'MP OV'],
    ['10/03/2025', 'DD', 'bill', 'Sweeney', '08/13/2025', 2772.00, 1772.00, 1772.00, 'Hustlers LLP', '', 'BV Self'],
    ['10/03/2025', 'DD', 'bill', 'figueroa', '09/23/2025', 4719.00, 1000.00, 1000.00, 'Hustlers LLP', '', 'MP Self'],
    ['10/03/2025', 'DD', 'bill', 'Flanders', '01/01/2026', 1000.00, 1000.00, 1000.00, 'Hustlers LLP', '', 'BV Self'],
    ['10/03/2025', 'DD', 'bill', 'w/e MP', '10/01/2025', 2500.00, 2500.00, 2500.00, 'Hustlers LLP', '', 'ADDED - MP'],
    ['10/03/2025', 'DD', 'bill', 'Oct BV', '10/01/2025', 2500.00, 2500.00, 2500.00, 'Hustlers LLP', '', 'ADDED - BV'],
    ['10/03/2025', 'DD', 'bill', 'W/e 09-27-25', '10/01/2025', 900.00, 900.00, 900.00, 'Hustlers LLP', '', 'ADDED'],
    ['10/03/2025', 'DD', 'bill', 'figueroa', '09/23/2025', 4356.00, 4356.00, 1000.00, 'Hustlers LLP', '', 'MP Self'],
    ['10/03/2025', 'DD', 'bill', 'Flanders', '09/26/2025', 1000.00, 1000.00, 1000.00, 'Hustlers LLP', '', 'BV Self'],

    // 10/10/2025
    ['10/10/2025', 'DD', 'bill', 'Aguirre', '06/13/2025', 816.00, 816.00, 816.00, 'Hustlers LLP', '', 'MP SELF'],
    ['10/10/2025', 'DD', 'bill', 'Raghunadan', '08/13/2025', 1010.50, 1010.50, 1010.50, 'Hustlers LLP', '', 'Split'],
    ['10/10/2025', 'DD', 'bill', 'Bova', '10/01/2025', 5148.00, 1000.00, 1000.00, 'Hustlers LLP', '', 'BV SELF'],
    ['10/10/2025', 'DD', 'bill', 'w/e 10-04-25', '10/08/2025', 900.00, 900.00, 900.00, 'Hustlers LLP', '', 'BV'],
    ['10/10/2025', 'DD', 'bill', 'Bova', '10/01/2025', 4356.00, 4356.00, 1000.00, 'Hustlers LLP', '', 'BV SELF'],

    // 10/16/2025 - CLAWBACKS
    ['10/16/2025', 'Clawback', 'bill', 'McFarland', '08/26/2025', 8365.00, 5000.00, 5000.00, 'Hustlers LLP', '', 'BV Self'],
    ['10/16/2025', 'Clawback', 'credit', 'Castro', '01/01/2025', 750.00, 750.00, -750.00, 'Hustlers LLP', '', 'CLAWBACK'],
    ['10/16/2025', 'Clawback', 'credit', 'Lindo', '01/01/2025', 375.00, 375.00, -375.00, 'Hustlers LLP', '', 'CLAWBACK'],
    ['10/16/2025', 'Clawback', 'credit', 'Lopez', '01/01/2025', 375.00, 375.00, -375.00, 'Hustlers LLP', '', 'CLAWBACK'],
    ['10/16/2025', 'Clawback', 'credit', 'Ridson', '01/16/2025', 375.00, 375.00, -375.00, 'Hustlers LLP', '', 'CLAWBACK'],
    ['10/16/2025', 'Clawback', 'credit', 'Ridson', '01/16/2025', 375.00, 375.00, -375.00, 'Hustlers LLP', '', 'CLAWBACK'],
    ['10/16/2025', 'Clawback', 'credit', 'Kearney', '01/16/2025', 375.00, 375.00, -375.00, 'Hustlers LLP', '', 'CLAWBACK'],
    ['10/16/2025', 'Clawback', 'credit', 'Miller', '04/15/2025', 1000.00, 1000.00, -1000.00, 'Hustlers LLP', '', 'CLAWBACK'],
    ['10/16/2025', 'Clawback', 'credit', 'Diedra', '04/15/2025', 1000.00, 1000.00, -1000.00, 'Hustlers LLP', '', 'CLAWBACK'],
    ['10/16/2025', 'Clawback', 'credit', 'Bonza', '08/05/2025', 375.00, 375.00, -375.00, 'Hustlers LLP', '', 'CLAWBACK'],

    // 10/17/2025
    ['10/17/2025', 'DD', 'bill', 'Campbell', '08/13/2025', 2387.00, 2387.00, 2387.00, 'Hustlers LLP', '', 'ADDED'],
    ['10/17/2025', 'DD', 'bill', 'Moore', '08/14/2025', 2233.00, 2233.00, 2233.00, 'Hustlers LLP', '', 'ADDED'],
    ['10/17/2025', 'DD', 'bill', 'McFarland', '08/26/2025', 8365.00, 2365.00, 2365.00, 'Hustlers LLP', '', 'BV Self'],
    ['10/17/2025', 'DD', 'bill', 'fusco', '10/08/2025', 638.00, 638.00, 638.00, 'Hustlers LLP', '', 'ADDED'],
    ['10/17/2025', 'DD', 'bill', 'wadhwa', '01/01/2026', 6655.00, 1000.00, 1000.00, 'Hustlers LLP', '', 'ADDED'],
    ['10/17/2025', 'DD', 'bill', 'Bill', '10/15/2025', 900.00, 900.00, 900.00, 'Hustlers LLP', '', 'ADDED'],
    ['10/17/2025', 'DD', 'bill', 'wadhwa', '10/08/2025', 7865.00, 7865.00, 1000.00, 'Hustlers LLP', '', 'ADDED'],

    // 10/24/2025
    ['10/24/2025', 'DD', 'bill', 'Doyle', '08/19/2025', 3372.00, 3372.00, 3372.00, 'Hustlers LLP', '', 'MP'],
    ['10/24/2025', 'DD', 'bill', 'Doyle', '08/19/2025', 286.00, 286.00, 286.00, 'Hustlers LLP', '', 'BV OV'],
    ['10/24/2025', 'DD', 'bill', 'labella', '10/14/2025', 1056.00, 1056.00, 1056.00, 'Hustlers LLP', '', 'BV'],
    ['10/24/2025', 'DD', 'bill', 'labella', '10/14/2025', 352.00, 352.00, 352.00, 'Hustlers LLP', '', 'MP OV'],
    ['10/24/2025', 'DD', 'bill', 'Bill', '10/22/2025', 900.00, 900.00, 900.00, 'Hustlers LLP', '', 'BV'],

    // 10/31/2025
    ['10/31/2025', 'DD', 'bill', 'weaver', '08/19/2025', 264.00, 264.00, 264.00, 'Hustlers LLP', '', 'split'],
    ['10/31/2025', 'DD', 'bill', 'Flores', '08/26/2025', 215.00, 215.00, 215.00, 'Hustlers LLP', '', 'BV'],
    ['10/31/2025', 'DD', 'bill', 'Flores', '08/26/2025', 86.00, 86.00, 86.00, 'Hustlers LLP', '', 'MP OV'],
    ['10/31/2025', 'DD', 'bill', 'Batres', '08/26/2025', 2564.25, 1814.25, 1814.25, 'Hustlers LLP', '', 'BV Self'],
    ['10/31/2025', 'DD', 'bill', 'Mclaughin', '09/10/2025', 726.00, 726.00, 726.00, 'Hustlers LLP', '', 'Split'],
    ['10/31/2025', 'DD', 'bill', 'denis', '10/30/2025', 750.00, 750.00, 750.00, 'Hustlers LLP', '', 'mp TEAM'],
    ['10/31/2025', 'DD', 'bill', 'lackran', '10/30/2025', 2574.00, 2574.00, 750.00, 'Hustlers LLP', '', 'bv self'],
    ['10/31/2025', 'DD', 'bill', 'wilcock', '10/30/2025', 4460.00, 4460.00, 750.00, 'Hustlers LLP', '', 'Mp Self'],
    ['10/31/2025', 'DD', 'bill', 'ferris', '10/30/2025', 3861.00, 3861.00, 1000.00, 'Hustlers LLP', '', 'MP SELF'],
    ['10/31/2025', 'DD', 'bill', 'roebuck', '10/30/2025', 1000.00, 1000.00, 1000.00, 'Hustlers LLP', '', 'split'],
    ['10/31/2025', 'DD', 'bill', 'tiongson', '10/30/2025', 1000.00, 1000.00, 1000.00, 'Hustlers LLP', '', 'BV self'],
    ['10/31/2025', 'DD', 'bill', 'Bill', '10/29/2025', 900.00, 900.00, 900.00, 'Hustlers LLP', '', 'ADDED'],
    ['10/31/2025', 'DD', 'bill', 'Bill', '11/01/2025', 2500.00, 2500.00, 2500.00, 'Hustlers LLP', '', 'ADDED'],
    ['10/31/2025', 'DD', 'bill', 'lackran', '01/01/2026', 1672.00, 750.00, 750.00, 'Hustlers LLP', '', 'bv self'],
    ['10/31/2025', 'DD', 'bill', 'wilcock', '01/01/2026', 4460.00, 750.00, 750.00, 'Hustlers LLP', '', 'Mp Self'],
    ['10/31/2025', 'DD', 'bill', 'ferris', '01/01/2026', 3861.00, 3861.00, 1000.00, 'Hustlers LLP', '', 'MP SELF'],
    ['10/31/2025', 'DD', 'bill', 'roebuck', '01/01/2026', 528.00, 528.00, 528.00, 'Hustlers LLP', '', 'split'],
    ['10/31/2025', 'DD', 'bill', 'tiongson', '01/01/2026', 1000.00, 1000.00, 1000.00, 'Hustlers LLP', '', 'BV self'],

    // 11/07/2025
    ['11/07/2025', 'DD', 'bill', 'Jaffett', '05/23/2025', 259.38, 259.38, 259.38, 'Hustlers LLP', '', 'bv'],
    ['11/07/2025', 'DD', 'bill', 'Telha', '08/13/2025', 440.00, 440.00, 440.00, 'Hustlers LLP', '', 'split'],
    ['11/07/2025', 'DD', 'bill', 'nunez', '08/26/2025', 1297.50, 1297.50, 1297.50, 'Hustlers LLP', '', 'BV'],
    ['11/07/2025', 'DD', 'bill', 'nunez', '08/26/2025', 519.00, 519.00, 519.00, 'Hustlers LLP', '', 'MP OV'],
    ['11/07/2025', 'DD', 'bill', 'bates', '09/19/2025', 638.00, 638.00, 638.00, 'Hustlers LLP', '', 'split'],
    ['11/07/2025', 'DD', 'bill', 'Bill', '11/05/2025', 900.00, 900.00, 900.00, 'Hustlers LLP', '', 'ADDED'],

    // 11/14/2025
    ['11/14/2025', 'DD', 'bill', 'schioppo', '08/29/2025', 1760.00, 1760.00, 1760.00, 'Hustlers LLP', '', 'BV'],
    ['11/14/2025', 'DD', 'bill', 'schioppo', '08/29/2025', 704.00, 704.00, 704.00, 'Hustlers LLP', '', 'MP OV'],
    ['11/14/2025', 'DD', 'bill', 'Bill', '11/12/2025', 900.00, 900.00, 900.00, 'Hustlers LLP', '', 'ADDED'],

    // 11/21/2025
    ['11/21/2025', 'DD', 'bill', 'Scriarppa', '08/05/2025', 253.00, 253.00, 253.00, 'Hustlers LLP', '', 'Split'],
    ['11/21/2025', 'DD', 'bill', 'Pederson', '08/05/2025', 3696.00, 2696.00, 2696.00, 'Hustlers LLP', '', 'MP'],
    ['11/21/2025', 'DD', 'bill', 'zatar', '11/11/2025', 1650.00, 1650.00, 1650.00, 'Hustlers LLP', '', 'BV'],
    ['11/21/2025', 'DD', 'bill', 'wong-miller', '11/19/2025', 2158.00, 2158.00, 2158.00, 'Hustlers LLP', '', 'MP'],
    ['11/21/2025', 'DD', 'bill', 'Bill', '11/19/2025', 900.00, 900.00, 900.00, 'Hustlers LLP', '', 'ADDED'],

    // 11/28/2025
    ['11/28/2025', 'DD', 'bill', 'Deoja', '07/11/2025', 660.00, 660.00, 660.00, 'Hustlers LLP', '', 'SPLIT'],
    ['11/28/2025', 'DD', 'bill', 'vlosky', '09/19/2025', 880.00, 880.00, 880.00, 'Hustlers LLP', '', 'Mp'],
    ['11/28/2025', 'DD', 'bill', 'ponte', '09/23/2025', 374.00, 374.00, 374.00, 'Hustlers LLP', '', 'split'],
    ['11/28/2025', 'DD', 'bill', 'juliano', '10/14/2025', 1100.00, 1100.00, 1100.00, 'Hustlers LLP', '', 'bv'],
    ['11/28/2025', 'DD', 'bill', 'juliano', '10/14/2025', 660.00, 660.00, 660.00, 'Hustlers LLP', '', 'mp ov'],
    ['11/28/2025', 'DD', 'bill', 'carraro', '11/26/2025', 1000.00, 1000.00, 1000.00, 'Hustlers LLP', '', 'bv'],
    ['11/28/2025', 'DD', 'bill', 'Bill', '11/26/2025', 900.00, 900.00, 900.00, 'Hustlers LLP', '', 'ADDED'],

    // 12/05/2025
    ['12/05/2025', 'DD', 'bill', 'MP Dec', '12/01/2025', 2500.00, 2500.00, 2500.00, 'Hustlers LLP', '', 'mp'],
    ['12/05/2025', 'DD', 'bill', 'BV Dec', '12/01/2025', 2500.00, 2500.00, 2500.00, 'Hustlers LLP', '', 'bv'],
    ['12/05/2025', 'DD', 'bill', 'Bill', '12/03/2025', 900.00, 900.00, 900.00, 'Hustlers LLP', '', 'MR'],
    ['12/05/2025', 'DD', 'bill', 'Roqueli', '06/04/2025', 1419.00, 1419.00, 1419.00, 'Hustlers LLP', '', 'ADDED'],
    ['12/05/2025', 'DD', 'bill', 'Pohl', '08/13/2025', 660.00, 660.00, 660.00, 'Hustlers LLP', '', 'ADDED'],
    ['12/05/2025', 'DD', 'bill', 'Ferreira', '09/11/2025', 1650.00, 1650.00, 1650.00, 'Hustlers LLP', '', 'ADDED'],
    ['12/05/2025', 'DD', 'bill', 'camanocha', '10/08/2025', 1452.00, 1452.00, 1452.00, 'Hustlers LLP', '', 'ADDED'],

    // 12/12/2025
    ['12/12/2025', 'DD', 'bill', 'Bell', '09/11/2025', 1980.00, 1980.00, 1980.00, 'Hustlers LLP', '', 'BV'],
    ['12/12/2025', 'DD', 'bill', 'Bell', '09/11/2025', 792.00, 792.00, 792.00, 'Hustlers LLP', '', 'MP'],
    ['12/12/2025', 'DD', 'bill', 'tiesler', '09/23/2025', 1221.00, 1221.00, 1221.00, 'Hustlers LLP', '', 'SPLIT'],
    ['12/12/2025', 'DD', 'bill', 'figueroa', '09/23/2025', 4719.00, 3719.00, 3719.00, 'Hustlers LLP', '', 'MP'],
    ['12/12/2025', 'DD', 'bill', 'Sitteh', '10/01/2025', 1617.00, 1000.00, 1000.00, 'Hustlers LLP', '', 'BV'],
    ['12/12/2025', 'DD', 'bill', 'gallion', '10/02/2025', 495.00, 495.00, 495.00, 'Hustlers LLP', '', 'MP'],
    ['12/12/2025', 'DD', 'bill', 'gallion', '10/02/2025', 297.00, 297.00, 297.00, 'Hustlers LLP', '', 'BV OV'],
    ['12/12/2025', 'DD', 'bill', 'benitez', '10/14/2025', 3933.00, 3933.00, 3933.00, 'Hustlers LLP', '', 'MP'],
    ['12/12/2025', 'DD', 'bill', 'Crist', '12/10/2025', 528.00, 528.00, 528.00, 'Hustlers LLP', '', 'SPLIT'],
    ['12/12/2025', 'DD', 'bill', 'Bill', '12/10/2025', 900.00, 900.00, 900.00, 'Hustlers LLP', '', ''],

    // 12/15/2025
    ['12/15/2025', '', 'bill', 'parvin', '01/01/2026', 4147.00, 4147.00, 200.00, 'Hustlers LLP', '', 'ADDED'],

    // 12/19/2025
    ['12/19/2025', 'DD', 'bill', 'matuska', '10/02/2025', 814.00, 814.00, 814.00, 'Hustlers LLP', '', 'ADDED'],
    ['12/19/2025', 'DD', 'bill', 'gilbert', '10/08/2025', 429.00, 429.00, 429.00, 'Hustlers LLP', '', 'ADDED'],
    ['12/19/2025', 'DD', 'bill', 'Bill', '11/07/2025', 440.00, 440.00, 440.00, 'Hustlers LLP', '', 'ADDED'],
    ['12/19/2025', 'DD', 'bill', 'Perugini', '11/17/2025', 924.00, 924.00, 924.00, 'Hustlers LLP', '', 'ADDED'],
    ['12/19/2025', 'DD', 'bill', 'Carvajal', '12/16/2025', 4928.00, 4928.00, 4928.00, 'Hustlers LLP', '', 'ADDED'],
    ['12/19/2025', 'DD', 'bill', 'Bill', '12/17/2025', 900.00, 900.00, 900.00, 'Hustlers LLP', '', 'ADDED'],
    ['12/19/2025', 'DD', 'bill', 'Bill', '12/18/2025', 7535.00, 7535.00, 7535.00, 'Hustlers LLP', '', ''],

    // 12/24/2025
    ['12/24/2025', 'DD', 'bill', 'Bova', '10/01/2025', 5148.00, 4148.00, 4148.00, 'Hustlers LLP', '', 'BV'],
    ['12/24/2025', 'DD', 'bill', 'Sitteh', '10/01/2025', 1617.00, 617.00, 617.00, 'Hustlers LLP', '', 'BV'],
    ['12/24/2025', 'DD', 'bill', 'Mills', '12/21/2025', 3433.00, 3433.00, 3433.00, 'Hustlers LLP', '', 'BV'],
    ['12/24/2025', 'DD', 'bill', 'Bill', '12/24/2025', 900.00, 900.00, 900.00, 'Hustlers LLP', '', 'ADDED'],
  ];

  rows.push(...data);

  // Add summary at bottom
  const payments = data.map(r => typeof r[7] === 'number' ? r[7] : 0);
  const total = payments.reduce((a, b) => a + b, 0);

  rows.push(['', '', '', '', '', '', '', '', '', '', '']);
  rows.push(['TOTAL', '', '', '', '', '', '', total, '', '', data.length + ' line items']);

  // Clear columns A-K first to avoid leftover data, then write fresh
  await sheets.spreadsheets.values.clear({
    spreadsheetId: sheetId,
    range: 'Sheet1!A:R',
  });

  await sheets.spreadsheets.values.update({
    spreadsheetId: sheetId,
    range: 'Sheet1!A1',
    valueInputOption: 'USER_ENTERED',
    requestBody: { values: rows },
  });

  console.log('Done! Wrote ' + rows.length + ' rows. Payment total: $' + total.toFixed(2));
}

run().catch(err => { console.error('ERROR:', err.message); process.exit(1); });
