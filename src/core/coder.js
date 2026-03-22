const { execSync, exec } = require('child_process');
const fs = require('fs');
const path = require('path');

const PROJECT_ROOT = path.resolve(__dirname, '../..');

// ── Safety: paths Jarvis can touch ──
const ALLOWED_DIRS = [
  PROJECT_ROOT,                              // his own code
  path.join(PROJECT_ROOT, 'projects'),       // projects he builds
];

const BLOCKED_PATTERNS = [
  /rm\s+-rf\s+\//,          // no deleting root
  /rm\s+-rf\s+~/,           // no deleting home
  />\s*\/dev\/sd/,          // no writing to disks
  /mkfs/,                   // no formatting
  /dd\s+if=/,              // no disk operations
  /:(){ :|:& };:/,         // no fork bombs
  /curl.*\|\s*sh/,         // no pipe to shell from internet
  /wget.*\|\s*sh/,
];

function isPathAllowed(filePath) {
  const resolved = path.resolve(filePath);
  return ALLOWED_DIRS.some(dir => resolved.startsWith(dir));
}

function isCommandSafe(command) {
  for (const pattern of BLOCKED_PATTERNS) {
    if (pattern.test(command)) return false;
  }
  return true;
}

// ── File Operations ──

function readFile(filePath) {
  const fullPath = path.resolve(PROJECT_ROOT, filePath);
  if (!isPathAllowed(fullPath)) throw new Error('Path not allowed: ' + filePath);
  if (!fs.existsSync(fullPath)) throw new Error('File not found: ' + filePath);
  return fs.readFileSync(fullPath, 'utf-8');
}

function writeFile(filePath, content) {
  const fullPath = path.resolve(PROJECT_ROOT, filePath);
  if (!isPathAllowed(fullPath)) throw new Error('Path not allowed: ' + filePath);
  // Create directories if needed
  const dir = path.dirname(fullPath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(fullPath, content, 'utf-8');
  return 'Written: ' + filePath + ' (' + content.length + ' chars)';
}

function editFile(filePath, oldText, newText) {
  const fullPath = path.resolve(PROJECT_ROOT, filePath);
  if (!isPathAllowed(fullPath)) throw new Error('Path not allowed: ' + filePath);
  if (!fs.existsSync(fullPath)) throw new Error('File not found: ' + filePath);
  const content = fs.readFileSync(fullPath, 'utf-8');
  if (!content.includes(oldText)) throw new Error('Could not find the text to replace in ' + filePath);
  const updated = content.replace(oldText, newText);
  fs.writeFileSync(fullPath, updated, 'utf-8');
  return 'Edited: ' + filePath;
}

function listFiles(dirPath) {
  const fullPath = path.resolve(PROJECT_ROOT, dirPath || '.');
  if (!isPathAllowed(fullPath)) throw new Error('Path not allowed: ' + dirPath);
  if (!fs.existsSync(fullPath)) throw new Error('Directory not found: ' + dirPath);

  const entries = fs.readdirSync(fullPath, { withFileTypes: true });
  return entries
    .filter(e => !e.name.startsWith('.') && e.name !== 'node_modules')
    .map(e => (e.isDirectory() ? '[dir] ' : '') + e.name)
    .join('\n');
}

// ── Shell Execution ──

function runCommand(command, timeoutMs) {
  if (!isCommandSafe(command)) throw new Error('Command blocked by safety filter');
  try {
    const output = execSync(command, {
      cwd: PROJECT_ROOT,
      timeout: timeoutMs || 30000,
      encoding: 'utf-8',
      maxBuffer: 1024 * 1024,
      env: { ...process.env, NODE_ENV: 'development' },
    });
    return output.substring(0, 5000);
  } catch (err) {
    return 'Error (exit ' + (err.status || '?') + '): ' + (err.stderr || err.message).substring(0, 2000);
  }
}

// ── Project Scaffolding ──

function createProject(name, type) {
  const projectDir = path.join(PROJECT_ROOT, 'projects', name);
  if (fs.existsSync(projectDir)) throw new Error('Project already exists: ' + name);
  fs.mkdirSync(projectDir, { recursive: true });

  if (type === 'node' || type === 'express') {
    fs.writeFileSync(path.join(projectDir, 'package.json'), JSON.stringify({
      name,
      version: '1.0.0',
      main: 'index.js',
      scripts: { start: 'node index.js', test: 'node test.js' },
    }, null, 2));
    fs.writeFileSync(path.join(projectDir, 'index.js'), '// ' + name + ' - built by Jarvis\n\n');
  } else if (type === 'html' || type === 'web') {
    fs.writeFileSync(path.join(projectDir, 'index.html'), '<!DOCTYPE html>\n<html><head><title>' + name + '</title></head>\n<body>\n<h1>' + name + '</h1>\n</body>\n</html>');
  }

  return 'Project created: projects/' + name + ' (type: ' + (type || 'empty') + ')';
}

// ── Self-Modification ──
// Jarvis can read and edit his own source code to improve himself

function getSelfCode(moduleName) {
  const safeName = moduleName.replace(/[^a-zA-Z0-9_-]/g, '');
  const candidates = [
    path.join(PROJECT_ROOT, 'src/core/' + safeName + '.js'),
    path.join(PROJECT_ROOT, 'src/channels/' + safeName + '.js'),
    path.join(PROJECT_ROOT, 'src/db/' + safeName + '.js'),
    path.join(PROJECT_ROOT, 'src/jobs/' + safeName + '.js'),
    path.join(PROJECT_ROOT, safeName + '.js'),
  ];
  for (const p of candidates) {
    if (fs.existsSync(p)) return { path: p.replace(PROJECT_ROOT + '/', ''), content: fs.readFileSync(p, 'utf-8') };
  }
  throw new Error('Module not found: ' + moduleName);
}

function modifySelfCode(moduleName, oldText, newText, reason) {
  const mod = getSelfCode(moduleName);
  const fullPath = path.resolve(PROJECT_ROOT, mod.path);

  // Create backup before modifying
  const backupDir = path.join(PROJECT_ROOT, '.jarvis-backups');
  if (!fs.existsSync(backupDir)) fs.mkdirSync(backupDir, { recursive: true });
  const backupPath = path.join(backupDir, moduleName + '_' + Date.now() + '.js');
  fs.writeFileSync(backupPath, mod.content);

  // Apply the edit
  if (!mod.content.includes(oldText)) throw new Error('Could not find the text to replace in ' + mod.path);
  const updated = mod.content.replace(oldText, newText);
  fs.writeFileSync(fullPath, updated, 'utf-8');

  return 'Modified ' + mod.path + ' (backup: ' + path.basename(backupPath) + '). Reason: ' + (reason || 'self-improvement');
}

module.exports = {
  readFile,
  writeFile,
  editFile,
  listFiles,
  runCommand,
  createProject,
  getSelfCode,
  modifySelfCode,
  PROJECT_ROOT,
};
