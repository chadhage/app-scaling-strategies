'use strict';

const path = require('node:path');
const fs = require('node:fs');
const { randomUUID } = require('node:crypto');
const { pathToFileURL } = require('node:url');

const repoRoot = path.resolve(__dirname, '..', '..');
const privateRoot = path.join(repoRoot, '.git', 'kanban-orchestrator');
process.env.PLAYWRIGHT_BROWSERS_PATH = path.join(privateRoot, 'browser-binaries');
const runtime = path.join(privateRoot, 'browser-runtime');
fs.mkdirSync(runtime, { recursive: true });
process.env.TEMP = runtime;
process.env.TMP = runtime;
process.env.TMPDIR = runtime;

const { chromium } = require('playwright');
const roots = [
  path.join(repoRoot, 'learning'),
  path.join(repoRoot, 'capability'),
  path.join(__dirname, 'fixtures'),
];

function invalidPath(message) {
  const error = new Error(`Invalid local lesson path: ${message}`);
  error.code = 'ERR_LESSON_PATH';
  return error;
}

function withinApprovedRoots(target) {
  return roots.some((root) => {
    const relative = path.relative(root, target);
    return relative !== '..'
      && !relative.startsWith(`..${path.sep}`)
      && !path.isAbsolute(relative);
  });
}

async function resolveLesson(relativeRepoPath) {
  if (typeof relativeRepoPath !== 'string' || !relativeRepoPath.trim()) {
    throw invalidPath('expected a non-empty repository-relative path');
  }
  if (path.isAbsolute(relativeRepoPath) || /[:\0]/.test(relativeRepoPath)) {
    throw invalidPath('URLs, absolute paths, and alternate data streams are unsupported');
  }
  const target = path.resolve(repoRoot, relativeRepoPath);
  if (!withinApprovedRoots(target)) {
    throw invalidPath('outside approved roots (learning, capability, testing\\browser\\fixtures)');
  }
  let realTarget;
  try {
    realTarget = await fs.promises.realpath(target);
    if (!withinApprovedRoots(realTarget)) {
      throw invalidPath('resolved file is outside approved roots');
    }
    if (!(await fs.promises.stat(realTarget)).isFile()) {
      throw invalidPath('expected a file, not a directory');
    }
  } catch (error) {
    if (error.code === 'ERR_LESSON_PATH') throw error;
    throw invalidPath(`cannot resolve a readable file (${error.code})`);
  }
  return realTarget;
}

async function openIsolatedLesson(relativeRepoPath) {
  const target = await resolveLesson(relativeRepoPath);
  const scratch = path.join(runtime, `session-${randomUUID()}`);
  await fs.promises.mkdir(scratch);
  let browser;
  let context;
  let closing;
  const close = () => {
    if (!closing) {
      closing = (async () => {
        try {
          try {
            if (context) await context.close();
          } finally {
            if (browser) await browser.close();
          }
        } finally {
          await fs.promises.rm(scratch, {
            recursive: true, force: true, maxRetries: 3, retryDelay: 100,
          });
        }
      })();
    }
    return closing;
  };
  try {
    browser = await chromium.launch({
      channel: 'msedge',
      headless: true,
      chromiumSandbox: true,
      timeout: 15000,
      env: { ...process.env, TEMP: scratch, TMP: scratch, TMPDIR: scratch },
    });
    context = await browser.newContext();
    const page = await context.newPage();
    page.setDefaultTimeout(10000);
    await page.goto(pathToFileURL(target).href, { waitUntil: 'load', timeout: 15000 });
    return { page, browserVersion: browser.version(), close };
  } catch (error) {
    try {
      await close();
    } catch (cleanupError) {
      throw new AggregateError([error, cleanupError], 'Lesson load and browser cleanup failed');
    }
    throw error;
  }
}

module.exports = { openIsolatedLesson };
