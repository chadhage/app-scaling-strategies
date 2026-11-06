'use strict';

// Real I/O for qualifyEdge(): candidate lookup, stat, SHA-256, qualified.json and the PowerShell queries.
// Every function can be replaced through options.adapters, so every branch of the checker runs hermetically.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const childProcess = require('node:child_process');

const QUALIFIED_FILE = path.join(__dirname, 'qualified.json');
const EDGE_RELATIVE = ['Microsoft', 'Edge', 'Application', 'msedge.exe'];
const SHELL_TIMEOUT_MS = 60000;
const MAX_SHELL_OUTPUT = 65536;
const TARGET_VARIABLE = 'QUALIFY_TARGET';

// The path arrives in $env:QUALIFY_TARGET and is used with -LiteralPath, so no part of it is ever code.
// The answer is base64 of UTF-8 JSON, which keeps console code pages from rewriting a publisher name.
const INSPECT_SCRIPT = [
  "$ErrorActionPreference = 'Stop'",
  `$target = $env:${TARGET_VARIABLE}`,
  '$signature = Get-AuthenticodeSignature -LiteralPath $target',
  '$certificate = $signature.SignerCertificate',
  '$info = [System.Diagnostics.FileVersionInfo]::GetVersionInfo($target)',
  '$answer = [ordered]@{',
  '  status = [string]$signature.Status',
  '  statusMessage = [string]$signature.StatusMessage',
  '  subject = if ($certificate) { [string]$certificate.Subject } else { $null }',
  '  issuer = if ($certificate) { [string]$certificate.Issuer } else { $null }',
  '  thumbprint = if ($certificate) { [string]$certificate.Thumbprint } else { $null }',
  '  fileVersion = $info.FileVersion',
  '}',
  '[Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes(($answer | ConvertTo-Json -Compress)))',
].join('\n');

function envValue(env, name) {
  const key = Object.keys(env).find((candidate) => candidate.toLowerCase() === name.toLowerCase());
  return key === undefined ? undefined : env[key];
}

function withoutKeys(env, pattern) {
  return Object.fromEntries(Object.entries(env).filter(([key]) => !pattern.test(key)));
}

// Same order as Playwright's msedge channel on Windows (the way isolated.cjs finds Edge); the first existing one runs.
function edgeCandidates(env = process.env) {
  const drive = envValue(env, 'HOMEDRIVE');
  const roots = [
    envValue(env, 'LOCALAPPDATA'),
    envValue(env, 'PROGRAMFILES'),
    envValue(env, 'PROGRAMFILES(X86)'),
    drive && `${drive}\\Program Files`,
    drive && `${drive}\\Program Files (x86)`,
  ];
  const seen = new Set();
  const found = [];
  for (const root of roots) {
    if (typeof root !== 'string' || !path.win32.isAbsolute(root)) continue;
    const candidate = path.win32.join(root, ...EDGE_RELATIVE);
    if (!seen.has(candidate.toLowerCase())) {
      seen.add(candidate.toLowerCase());
      found.push(candidate);
    }
  }
  return found;
}

function statFile(file, fsApi = fs) {
  try {
    const stat = fsApi.statSync(file);
    return { exists: true, isFile: stat.isFile(), size: stat.size, mtimeMs: stat.mtimeMs };
  } catch {
    return { exists: false };
  }
}

function sha256File(file, fsApi = fs) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256');
    const stream = fsApi.createReadStream(file);
    stream.on('error', reject);
    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('end', () => resolve(hash.digest('hex')));
  });
}

function readQualified(file = QUALIFIED_FILE, fsApi = fs) {
  return JSON.parse(fsApi.readFileSync(file, 'utf8'));
}

function shellError(code, message) {
  return Object.assign(new Error(message), { code });
}

function windowsPowerShellPath(env = process.env) {
  return path.win32.join(envValue(env, 'SystemRoot') || 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
}

function defaultShellArgs(encoded) {
  return ['-NoLogo', '-NoProfile', '-NonInteractive', '-EncodedCommand', encoded];
}

function runShell({ shell, args, env, timeoutMs }) {
  return new Promise((resolve, reject) => {
    let child;
    let timer;
    let settled = false;
    let stdout = '';
    let stderr = '';
    const finish = (settle, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      settle(value);
    };
    try {
      child = childProcess.spawn(shell, args, { env, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
    } catch (error) {
      finish(reject, shellError('SHELL_SPAWN', error.message));
      return;
    }
    timer = setTimeout(() => {
      child.kill('SIGKILL');
      finish(reject, shellError('SHELL_TIMEOUT', `the shell did not answer within ${timeoutMs} ms and was ended`));
    }, timeoutMs);
    child.stdout.setEncoding('utf8');
    child.stdout.on('data', (chunk) => {
      stdout += chunk;
      if (stdout.length > MAX_SHELL_OUTPUT) {
        child.kill('SIGKILL');
        finish(reject, shellError('SHELL_OUTPUT_TOO_LARGE', 'the shell wrote more than 64 KiB'));
      }
    });
    child.stderr.on('data', (chunk) => { stderr = `${stderr}${chunk}`.slice(-400); });
    child.on('error', (error) => finish(reject, shellError('SHELL_SPAWN', error.message)));
    child.on('close', (code) => {
      if (code === 0) finish(resolve, stdout);
      else finish(reject, shellError('SHELL_FAILED', `the shell exited with ${code}: ${stderr.trim()}`));
    });
  });
}

function decodeInspection(stdout) {
  const text = stdout.trim();
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(text)) throw shellError('INSPECT_OUTPUT_INVALID', 'the shell answer is not base64');
  let answer;
  try {
    answer = JSON.parse(Buffer.from(text, 'base64').toString('utf8'));
  } catch {
    throw shellError('INSPECT_OUTPUT_INVALID', 'the shell answer is not JSON');
  }
  if (answer === null || typeof answer !== 'object' || typeof answer.status !== 'string') {
    throw shellError('INSPECT_OUTPUT_INVALID', 'the shell answer has no signature status');
  }
  return answer;
}

// One PowerShell start answers both questions; the answer is cached per path for the life of this adapter set.
function powerShellAdapters(config = {}) {
  const env = config.env || process.env;
  const shell = config.shell || windowsPowerShellPath(env);
  const buildArgs = config.buildArgs || defaultShellArgs;
  const encoded = Buffer.from(config.script || INSPECT_SCRIPT, 'utf16le').toString('base64');
  const timeoutMs = config.timeoutMs || SHELL_TIMEOUT_MS;
  const answers = new Map();
  const inspect = (target) => {
    if (!answers.has(target)) {
      // A PowerShell 7 parent leaves its module path in PSModulePath, which stops Windows PowerShell from loading
      // Microsoft.PowerShell.Security (CouldNotAutoloadMatchingModule); the child must compute its own.
      const childEnv = { ...withoutKeys(env, /^PSModulePath$/i), [TARGET_VARIABLE]: target };
      answers.set(target, runShell({ shell, args: buildArgs(encoded), env: childEnv, timeoutMs }).then(decodeInspection));
    }
    return answers.get(target);
  };
  return {
    async signature(target) {
      const { status, statusMessage, subject, issuer, thumbprint } = await inspect(target);
      return { status, statusMessage, subject, issuer, thumbprint };
    },
    async fileVersion(target) {
      return (await inspect(target)).fileVersion;
    },
  };
}

function defaultAdapters(options = {}) {
  return {
    candidates: edgeCandidates,
    statFile,
    sha256: sha256File,
    readQualified,
    now: () => new Date(),
    ...powerShellAdapters({ env: options.env, ...options.shell }),
  };
}

module.exports = {
  QUALIFIED_FILE, TARGET_VARIABLE, INSPECT_SCRIPT,
  edgeCandidates, statFile, sha256File, readQualified, runShell, decodeInspection, powerShellAdapters, defaultAdapters,
  withoutKeys, windowsPowerShellPath, defaultShellArgs,
};
