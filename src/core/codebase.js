// codebase.js — Jarvis self-editing via GitHub API
// Reads/writes/commits to his own repo so changes survive Render redeploys

const REPO_OWNER = 'Jarvis-W-corp';
const REPO_NAME = 'Jarvis-sms-bot-';
const BRANCH = 'main';

function getHeaders() {
  const token = process.env.GITHUB_TOKEN;
  if (!token) throw new Error('GITHUB_TOKEN not set — cannot edit codebase');
  return {
    Authorization: 'token ' + token,
    Accept: 'application/vnd.github.v3+json',
    'Content-Type': 'application/json',
  };
}

function apiUrl(path) {
  return 'https://api.github.com/repos/' + REPO_OWNER + '/' + REPO_NAME + path;
}

// Read a file from the repo
async function readFile(filePath) {
  const res = await fetch(apiUrl('/contents/' + filePath + '?ref=' + BRANCH), { headers: getHeaders() });
  if (!res.ok) {
    const err = await res.text();
    throw new Error('GitHub read failed (' + res.status + '): ' + err);
  }
  const data = await res.json();
  const content = Buffer.from(data.content, 'base64').toString('utf-8');
  return { content, sha: data.sha, path: data.path };
}

// List files in a directory
async function listFiles(dirPath) {
  const p = dirPath || '';
  const res = await fetch(apiUrl('/contents/' + p + '?ref=' + BRANCH), { headers: getHeaders() });
  if (!res.ok) throw new Error('GitHub list failed: ' + res.status);
  const data = await res.json();
  if (!Array.isArray(data)) return [{ name: data.name, type: data.type, path: data.path }];
  return data.map(f => ({ name: f.name, type: f.type, path: f.path }));
}

// Create or update a file (single-file commit)
async function writeFile(filePath, content, commitMessage) {
  // Get current SHA if file exists
  let sha = null;
  try {
    const existing = await readFile(filePath);
    sha = existing.sha;
  } catch (e) {
    // File doesn't exist yet — that's fine, we're creating it
  }

  const body = {
    message: commitMessage || 'Jarvis self-update: ' + filePath,
    content: Buffer.from(content).toString('base64'),
    branch: BRANCH,
  };
  if (sha) body.sha = sha;

  const res = await fetch(apiUrl('/contents/' + filePath), {
    method: 'PUT',
    headers: getHeaders(),
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error('GitHub write failed (' + res.status + '): ' + err);
  }

  const data = await res.json();
  return {
    committed: true,
    sha: data.content.sha,
    commitSha: data.commit.sha,
    message: commitMessage || 'Jarvis self-update: ' + filePath,
  };
}

// Multi-file commit via Git tree API
async function commitMultipleFiles(files, commitMessage) {
  const headers = getHeaders();

  // 1. Get the latest commit SHA on the branch
  const refRes = await fetch(apiUrl('/git/ref/heads/' + BRANCH), { headers });
  if (!refRes.ok) throw new Error('Failed to get branch ref');
  const refData = await refRes.json();
  const latestCommitSha = refData.object.sha;

  // 2. Get the tree SHA of that commit
  const commitRes = await fetch(apiUrl('/git/commits/' + latestCommitSha), { headers });
  const commitData = await commitRes.json();
  const baseTreeSha = commitData.tree.sha;

  // 3. Create blobs for each file
  const tree = [];
  for (const file of files) {
    const blobRes = await fetch(apiUrl('/git/blobs'), {
      method: 'POST',
      headers,
      body: JSON.stringify({ content: file.content, encoding: 'utf-8' }),
    });
    const blobData = await blobRes.json();
    tree.push({
      path: file.path,
      mode: '100644',
      type: 'blob',
      sha: blobData.sha,
    });
  }

  // 4. Create new tree
  const treeRes = await fetch(apiUrl('/git/trees'), {
    method: 'POST',
    headers,
    body: JSON.stringify({ base_tree: baseTreeSha, tree }),
  });
  const treeData = await treeRes.json();

  // 5. Create new commit
  const newCommitRes = await fetch(apiUrl('/git/commits'), {
    method: 'POST',
    headers,
    body: JSON.stringify({
      message: commitMessage,
      tree: treeData.sha,
      parents: [latestCommitSha],
    }),
  });
  const newCommitData = await newCommitRes.json();

  // 6. Update branch ref
  await fetch(apiUrl('/git/refs/heads/' + BRANCH), {
    method: 'PATCH',
    headers,
    body: JSON.stringify({ sha: newCommitData.sha }),
  });

  return {
    committed: true,
    commitSha: newCommitData.sha,
    filesChanged: files.length,
    message: commitMessage,
  };
}

// Tool definitions for Claude API tool_use
const TOOLS = [
  {
    name: 'read_code',
    description: 'Read a file from the Jarvis codebase. Use this to understand current code before making changes. Common paths: src/core/*.js, src/channels/*.js, src/db/*.js, src/jobs/*.js, index.js',
    input_schema: {
      type: 'object',
      properties: {
        file_path: { type: 'string', description: 'Path to the file, e.g. "src/core/brain.js"' },
      },
      required: ['file_path'],
    },
  },
  {
    name: 'list_files',
    description: 'List files in a directory of the Jarvis codebase. Use to explore the project structure.',
    input_schema: {
      type: 'object',
      properties: {
        directory: { type: 'string', description: 'Directory path, e.g. "src/core" or "" for root' },
      },
      required: ['directory'],
    },
  },
  {
    name: 'edit_code',
    description: 'Edit a file in the Jarvis codebase. Replaces old_text with new_text and commits to GitHub. Render auto-deploys on push to main. Only use when the conversation clearly requires a code change.',
    input_schema: {
      type: 'object',
      properties: {
        file_path: { type: 'string', description: 'Path to the file to edit' },
        old_text: { type: 'string', description: 'Exact text to find and replace' },
        new_text: { type: 'string', description: 'New text to replace it with' },
        reason: { type: 'string', description: 'Short commit message explaining why' },
      },
      required: ['file_path', 'old_text', 'new_text', 'reason'],
    },
  },
  {
    name: 'create_file',
    description: 'Create a new file in the Jarvis codebase and commit it to GitHub.',
    input_schema: {
      type: 'object',
      properties: {
        file_path: { type: 'string', description: 'Path for the new file' },
        content: { type: 'string', description: 'File content' },
        reason: { type: 'string', description: 'Short commit message explaining why' },
      },
      required: ['file_path', 'content', 'reason'],
    },
  },
];

// Execute a tool call
async function executeTool(toolName, input) {
  switch (toolName) {
    case 'read_code': {
      const file = await readFile(input.file_path);
      return file.content;
    }
    case 'list_files': {
      const files = await listFiles(input.directory);
      return files.map(f => (f.type === 'dir' ? '[dir] ' : '') + f.path).join('\n');
    }
    case 'edit_code': {
      const file = await readFile(input.file_path);
      if (!file.content.includes(input.old_text)) {
        throw new Error('Could not find the text to replace in ' + input.file_path);
      }
      const updated = file.content.replace(input.old_text, input.new_text);
      const result = await writeFile(input.file_path, updated, 'Jarvis: ' + input.reason);
      return 'Committed to GitHub: ' + input.reason + ' (sha: ' + result.commitSha.substring(0, 7) + '). Render will auto-deploy.';
    }
    case 'create_file': {
      const result = await writeFile(input.file_path, input.content, 'Jarvis: ' + input.reason);
      return 'File created and committed: ' + input.file_path + ' (sha: ' + result.commitSha.substring(0, 7) + '). Render will auto-deploy.';
    }
    default:
      throw new Error('Unknown tool: ' + toolName);
  }
}

module.exports = { readFile, writeFile, listFiles, commitMultipleFiles, TOOLS, executeTool };
