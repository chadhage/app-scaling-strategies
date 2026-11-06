'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { UsageError } = require('./errors.cjs');
const { globToRegExp, hasMagic, normalizePattern } = require('./glob.cjs');

const MANIFEST_NAME = 'coverage.manifest.json';
const MANIFEST_SCHEMA = 'U009-coverage-manifest/1';
const MEASURABLE = Object.freeze(['.js', '.cjs', '.mjs']);
// Script types that Node coverage cannot measure: they are never skipped silently, a manifest entry must classify them.
const UNMEASURABLE = Object.freeze(['.ts', '.tsx', '.mts', '.cts', '.jsx', '.ps1', '.psm1', '.py', '.sh', '.bat', '.cmd']);
const TEST_DIRECTORIES = Object.freeze(['tests', 'test', '__tests__']);
// The base names that Node's test runner itself treats as test files, plus *.spec.*: Node leaves them out of coverage reports.
const TEST_NAME = /^(?:test(?:-.*)?|.*[-_.]test|.*\.spec)\.[^./]+$/i;
const DECLARATION_NAME = /\.d\.[cm]?ts$/i;
const GENERATED_NAME = /\.(?:pins?|snapshot|generated)\.[^./]+$/i;
// Root-level verification tooling (kanban Coverage bar): not production code, but only a manifest entry may say so.
const TOOLING_NAME = /^(?:(?:verify|capture|seal|evidence-tool)(?:[-_.][^/]*)?|[^/]*\.check)\.(?:js|cjs|mjs)$/i;
const TEST_FILE_NAME = /\.test\.(?:cjs|js|mjs)$/;

const byOrdinal = (left, right) => (left < right ? -1 : left > right ? 1 : 0);
const extensionOf = (name) => path.extname(name).toLowerCase();

function emptyManifest() {
  return { schema: MANIFEST_SCHEMA, production: [], exclude: [] };
}

function compilePattern(value, label) {
  if (typeof value !== 'string' || value.trim() === '') throw new UsageError(`${MANIFEST_NAME}: ${label} must be a non-empty string.`);
  const pattern = normalizePattern(value);
  if (pattern.startsWith('/') || /^[A-Za-z]:/.test(pattern) || pattern.split('/').includes('..')) {
    throw new UsageError(`${MANIFEST_NAME}: ${label} must be a relative path below the root without "..": ${value}`);
  }
  return { pattern, matcher: globToRegExp(pattern) };
}

function parseManifest(text) {
  let data;
  try {
    data = JSON.parse(String(text).replace(/^\uFEFF/, ''));
  } catch (error) {
    throw new UsageError(`${MANIFEST_NAME} is not valid JSON: ${error.message}`);
  }
  if (data === null || typeof data !== 'object' || Array.isArray(data)) throw new UsageError(`${MANIFEST_NAME} must be a JSON object.`);
  for (const key of Object.keys(data)) {
    if (!['schema', 'production', 'exclude'].includes(key)) throw new UsageError(`${MANIFEST_NAME}: unknown key "${key}".`);
  }
  if (data.schema !== undefined && data.schema !== MANIFEST_SCHEMA) throw new UsageError(`${MANIFEST_NAME}: schema must be ${MANIFEST_SCHEMA}.`);
  const listOf = (key) => {
    if (data[key] === undefined) return [];
    if (!Array.isArray(data[key])) throw new UsageError(`${MANIFEST_NAME}: "${key}" must be an array.`);
    return data[key];
  };
  const production = listOf('production').map((entry, index) => compilePattern(entry, `production[${index}]`));
  const exclude = listOf('exclude').map((entry, index) => {
    const label = `exclude[${index}]`;
    if (entry === null || typeof entry !== 'object' || Array.isArray(entry)) throw new UsageError(`${MANIFEST_NAME}: ${label} must be an object with file and reason.`);
    for (const key of Object.keys(entry)) {
      if (!['file', 'reason'].includes(key)) throw new UsageError(`${MANIFEST_NAME}: ${label} has the unknown key "${key}".`);
    }
    if (typeof entry.reason !== 'string' || entry.reason.trim() === '') {
      throw new UsageError(`${MANIFEST_NAME}: ${label} needs a reason: an exclusion without a reason is not allowed.`);
    }
    return { ...compilePattern(entry.file, `${label}.file`), reason: entry.reason.trim() };
  });
  return { schema: MANIFEST_SCHEMA, production, exclude };
}

function loadManifest(root, fsApi = fs, file = path.join(root, MANIFEST_NAME)) {
  if (!fsApi.existsSync(file)) return emptyManifest();
  let text;
  try {
    text = fsApi.readFileSync(file, 'utf8');
  } catch (error) {
    throw new UsageError(`Cannot read ${MANIFEST_NAME}: ${error.message}`);
  }
  return parseManifest(text);
}

// Lists every regular file below root as root-relative paths with / separators. Links are reported and never followed;
// node_modules and hidden directories are reported as skipped and never entered.
function walkTree(root, fsApi = fs) {
  const files = [];
  const links = [];
  const skipped = [];
  const visit = (directory, prefix) => {
    const entries = fsApi.readdirSync(directory, { withFileTypes: true }).sort((left, right) => byOrdinal(left.name, right.name));
    for (const entry of entries) {
      const relative = prefix === '' ? entry.name : `${prefix}/${entry.name}`;
      if (entry.isSymbolicLink()) {
        links.push(relative);
      } else if (entry.isDirectory()) {
        if (entry.name === 'node_modules') skipped.push({ directory: relative, rule: 'dependencies' });
        else if (entry.name.startsWith('.')) skipped.push({ directory: relative, rule: 'hidden' });
        else visit(path.join(directory, entry.name), relative);
      } else if (entry.isFile()) {
        files.push(relative);
      }
    }
  };
  visit(root, '');
  return { files, links, skipped };
}

function ruleFor(relativePath) {
  const segments = relativePath.split('/');
  const base = segments.pop();
  for (const segment of segments) {
    const lower = segment.toLowerCase();
    if (TEST_DIRECTORIES.includes(lower)) return { rule: 'tests', reason: `inside a ${lower} directory: test code is not production code` };
    if (lower === 'evidence') return { rule: 'evidence', reason: 'archived evidence' };
    if (lower === 'fixtures') return { rule: 'fixtures', reason: 'fixtures are test data, not production code' };
    if (lower === 'node_modules') return { rule: 'dependencies', reason: 'vendored dependency' };
    if (segment.startsWith('.')) return { rule: 'hidden', reason: 'inside a hidden directory' };
  }
  if (TEST_NAME.test(base)) return { rule: 'tests', reason: 'a test-named file (*.test.*, *.spec.*, *-test.*, test-*, test.*) is test code' };
  if (DECLARATION_NAME.test(base)) return { rule: 'declarations', reason: 'a type declaration file (*.d.ts) holds no executable code' };
  if (GENERATED_NAME.test(base)) return { rule: 'generated', reason: 'a generated pin or snapshot (*.pin.*, *.pins.*, *.snapshot.*, *.generated.*)' };
  return null;
}

const isCandidate = (relativePath) => [...MEASURABLE, ...UNMEASURABLE].includes(extensionOf(relativePath));

// One verdict per candidate: production, excluded (with the rule or the manifest reason) or unclassified.
// The manifest is explicit and wins over the built-in rules; two manifest entries that disagree about one file are a usage error.
function classifyFile(relativePath, manifest) {
  const base = relativePath.slice(relativePath.lastIndexOf('/') + 1);
  const extension = extensionOf(base);
  const excludeEntry = manifest.exclude.find((entry) => entry.matcher.test(relativePath));
  const productionEntry = manifest.production.find((entry) => entry.matcher.test(relativePath));
  if (excludeEntry && productionEntry) {
    throw new UsageError(`${MANIFEST_NAME} lists ${relativePath} as production (${productionEntry.pattern}) and as excluded (${excludeEntry.pattern}).`);
  }
  if (excludeEntry) return { status: 'excluded', by: 'manifest', reason: excludeEntry.reason };
  const unmeasurable = {
    status: 'unclassified',
    reason: `${extension} files cannot be measured by Node coverage: exclude it in ${MANIFEST_NAME} with a reason (this gate does not measure PowerShell, TypeScript or shell scripts)`
  };
  if (productionEntry) return MEASURABLE.includes(extension) ? { status: 'production', by: 'manifest' } : unmeasurable;
  const rule = ruleFor(relativePath);
  if (rule) return { status: 'excluded', by: 'rule', rule: rule.rule, reason: rule.reason };
  if (!MEASURABLE.includes(extension)) return unmeasurable;
  if (TOOLING_NAME.test(base)) {
    return {
      status: 'unclassified',
      reason: `looks like verification tooling (verify, capture, seal, evidence-tool or *.check): list it in ${MANIFEST_NAME} as an exclude with a reason, or as production`
    };
  }
  return { status: 'production', by: 'rule' };
}

function unmatchedEntries(manifest, candidates) {
  const warnings = [];
  for (const entry of manifest.production) {
    if (!candidates.some((file) => entry.matcher.test(file))) warnings.push(`${MANIFEST_NAME}: production entry ${entry.pattern} matches no script file`);
  }
  for (const entry of manifest.exclude) {
    if (!candidates.some((file) => entry.matcher.test(file))) warnings.push(`${MANIFEST_NAME}: exclude entry ${entry.pattern} matches no script file`);
  }
  return warnings;
}

// Pure: classifies a listing of root-relative paths. filters.exclude and filters.include are explicit command-line decisions and are recorded as such.
function enumerate(listing, manifest = emptyManifest(), filters = {}) {
  const exclude = (filters.exclude || []).map((pattern) => ({ pattern, matcher: globToRegExp(pattern) }));
  const include = (filters.include || []).map((pattern) => ({ pattern, matcher: globToRegExp(pattern) }));
  const production = [];
  const excluded = [];
  const unclassified = [];
  const candidates = listing.files.filter(isCandidate);
  for (const file of candidates) {
    const verdict = classifyFile(file, manifest);
    const cli = exclude.find((entry) => entry.matcher.test(file));
    if (verdict.status === 'excluded') {
      excluded.push({ file, by: verdict.by, reason: verdict.reason });
    } else if (cli) {
      excluded.push({ file, by: 'cli', reason: `--exclude ${cli.pattern}` });
    } else if (verdict.status === 'unclassified') {
      unclassified.push({ file, reason: verdict.reason });
    } else if (include.length > 0 && !include.some((entry) => entry.matcher.test(file))) {
      excluded.push({ file, by: 'cli', reason: `not matched by --include ${include.map((entry) => entry.pattern).join(' ')}` });
    } else {
      production.push({ file, by: verdict.by });
    }
  }
  for (const link of listing.links) {
    if (exclude.some((entry) => entry.matcher.test(link))) excluded.push({ file: link, by: 'cli', reason: '--exclude' });
    else unclassified.push({ file: link, reason: 'a link (symbolic link or junction) is never followed: classify the real file instead' });
  }
  const order = (left, right) => byOrdinal(left.file, right.file);
  return {
    production: production.sort(order),
    excluded: excluded.sort(order),
    unclassified: unclassified.sort(order),
    skippedDirectories: [...listing.skipped].sort((left, right) => byOrdinal(left.directory, right.directory)),
    warnings: unmatchedEntries(manifest, candidates)
  };
}

function enumerateRoot(root, filters = {}, fsApi = fs) {
  return enumerate(walkTree(root, fsApi), loadManifest(root, fsApi), filters);
}

// Default focused tests of a namespace: its non-browser *.test.{cjs,js,mjs} files directly inside tests/, test/ or the root.
function defaultTests(root, fsApi = fs) {
  const found = [];
  for (const directory of ['.', 'tests', 'test']) {
    const folder = path.join(root, directory);
    if (!fsApi.existsSync(folder)) continue;
    for (const entry of fsApi.readdirSync(folder, { withFileTypes: true })) {
      if (entry.isFile() && TEST_FILE_NAME.test(entry.name) && !/browser/i.test(entry.name)) found.push(path.join(folder, entry.name));
    }
  }
  return found.sort(byOrdinal);
}

function expandGlob(pattern, cwd, fsApi = fs) {
  const segments = normalizePattern(pattern).split('/');
  const firstMagic = segments.findIndex((segment) => hasMagic(segment));
  const base = path.resolve(cwd, ...segments.slice(0, firstMagic));
  const matcher = globToRegExp(segments.slice(firstMagic).join('/'));
  if (!fsApi.existsSync(base)) return [];
  const { files } = walkTree(base, fsApi);
  return files.filter((file) => matcher.test(file)).map((file) => path.join(base, ...file.split('/'))).sort(byOrdinal);
}

// Resolves --tests (files or globs, relative to the invoker's cwd) or the default tests; any problem fails every enumerated file.
function resolveTests({ patterns = [], cwd, root, fsApi = fs }) {
  const problems = [];
  if (patterns.length === 0) {
    const found = defaultTests(root, fsApi);
    if (found.length === 0) problems.push('no tests found: the root holds no non-browser *.test.cjs file in tests/, test/ or the root; pass --tests explicitly');
    return { tests: found, problems };
  }
  const tests = [];
  for (const pattern of patterns) {
    if (hasMagic(pattern)) {
      const matches = expandGlob(pattern, cwd, fsApi);
      if (matches.length === 0) problems.push(`no tests found: no file matches ${pattern}`);
      tests.push(...matches);
    } else {
      const absolute = path.resolve(cwd, pattern);
      if (fsApi.existsSync(absolute) && fsApi.statSync(absolute).isFile()) tests.push(absolute);
      else problems.push(`test file not found: ${pattern}`);
    }
  }
  return { tests: [...new Set(tests)], problems };
}

module.exports = Object.freeze({
  MANIFEST_NAME, MANIFEST_SCHEMA, MEASURABLE, UNMEASURABLE, parseManifest, loadManifest, walkTree, ruleFor, classifyFile,
  enumerate, enumerateRoot, defaultTests, expandGlob, resolveTests
});
