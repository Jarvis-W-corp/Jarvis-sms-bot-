const { google } = require('googleapis');
const path = require('path');
const fs = require('fs');

// Reuse the same OAuth2 setup as gmail.js
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

function getDrive() {
  return google.drive({ version: 'v3', auth: getAuth() });
}

// List files in a folder (or root if no folderId)
async function listFiles(folderId, options = {}) {
  const drive = getDrive();
  const query = folderId
    ? `'${folderId}' in parents and trashed = false`
    : 'trashed = false';

  const res = await drive.files.list({
    q: options.query || query,
    pageSize: options.limit || 100,
    fields: 'files(id, name, mimeType, size, modifiedTime, parents)',
    orderBy: 'modifiedTime desc',
  });

  return res.data.files || [];
}

// List all folders
async function listFolders(parentId) {
  const drive = getDrive();
  const query = parentId
    ? `'${parentId}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`
    : `mimeType = 'application/vnd.google-apps.folder' and trashed = false`;

  const res = await drive.files.list({
    q: query,
    pageSize: 100,
    fields: 'files(id, name, mimeType, modifiedTime, parents)',
    orderBy: 'name',
  });

  return res.data.files || [];
}

// Search files by name
async function searchFiles(name, mimeType) {
  const drive = getDrive();
  let query = `name contains '${name.replace(/'/g, "\\'")}' and trashed = false`;
  if (mimeType) query += ` and mimeType = '${mimeType}'`;

  const res = await drive.files.list({
    q: query,
    pageSize: 50,
    fields: 'files(id, name, mimeType, size, modifiedTime, parents)',
    orderBy: 'modifiedTime desc',
  });

  return res.data.files || [];
}

// Download a file to local path
async function downloadFile(fileId, destPath) {
  const drive = getDrive();

  // Get file metadata first
  const meta = await drive.files.get({ fileId, fields: 'name, mimeType, size' });
  const fileName = meta.data.name;
  const finalPath = destPath || path.join(process.cwd(), 'downloads', fileName);

  // Ensure directory exists
  const dir = path.dirname(finalPath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  // Handle Google Docs types (export) vs binary files (download)
  const googleTypes = {
    'application/vnd.google-apps.document': { mime: 'application/pdf', ext: '.pdf' },
    'application/vnd.google-apps.spreadsheet': { mime: 'text/csv', ext: '.csv' },
    'application/vnd.google-apps.presentation': { mime: 'application/pdf', ext: '.pdf' },
  };

  let stream;
  let outputPath = finalPath;

  if (googleTypes[meta.data.mimeType]) {
    const exportType = googleTypes[meta.data.mimeType];
    const res = await drive.files.export({ fileId, mimeType: exportType.mime }, { responseType: 'stream' });
    stream = res.data;
    if (!outputPath.endsWith(exportType.ext)) outputPath += exportType.ext;
  } else {
    const res = await drive.files.get({ fileId, alt: 'media' }, { responseType: 'stream' });
    stream = res.data;
  }

  return new Promise((resolve, reject) => {
    const dest = fs.createWriteStream(outputPath);
    stream.pipe(dest);
    dest.on('finish', () => resolve({ path: outputPath, name: fileName, size: meta.data.size }));
    dest.on('error', reject);
  });
}

// Download all files from a folder
async function downloadFolder(folderId, destDir) {
  const files = await listFiles(folderId);
  const results = [];

  for (const file of files) {
    if (file.mimeType === 'application/vnd.google-apps.folder') {
      // Recurse into subfolders
      const subDir = path.join(destDir, file.name);
      const subResults = await downloadFolder(file.id, subDir);
      results.push(...subResults);
    } else {
      try {
        const destPath = path.join(destDir, file.name);
        const result = await downloadFile(file.id, destPath);
        results.push(result);
      } catch (err) {
        results.push({ name: file.name, error: err.message });
      }
    }
  }

  return results;
}

// Read a PDF or text file content (returns buffer)
async function readFileContent(fileId) {
  const drive = getDrive();
  const meta = await drive.files.get({ fileId, fields: 'name, mimeType' });

  const googleTypes = {
    'application/vnd.google-apps.document': 'text/plain',
    'application/vnd.google-apps.spreadsheet': 'text/csv',
  };

  if (googleTypes[meta.data.mimeType]) {
    const res = await drive.files.export({ fileId, mimeType: googleTypes[meta.data.mimeType] });
    return { name: meta.data.name, content: res.data, mimeType: googleTypes[meta.data.mimeType] };
  }

  const res = await drive.files.get({ fileId, alt: 'media' }, { responseType: 'arraybuffer' });
  return { name: meta.data.name, content: Buffer.from(res.data), mimeType: meta.data.mimeType };
}

// Upload a file to Drive
async function uploadFile(localPath, folderId, name) {
  const drive = getDrive();
  const fileName = name || path.basename(localPath);

  const fileMetadata = { name: fileName };
  if (folderId) fileMetadata.parents = [folderId];

  const media = {
    body: fs.createReadStream(localPath),
  };

  const res = await drive.files.create({
    resource: fileMetadata,
    media,
    fields: 'id, name, webViewLink',
  });

  return res.data;
}

module.exports = {
  listFiles,
  listFolders,
  searchFiles,
  downloadFile,
  downloadFolder,
  readFileContent,
  uploadFile,
};
