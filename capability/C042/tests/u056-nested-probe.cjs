'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const child = require('node:child_process');

const spawnSync = child.spawnSync;
child.spawnSync = function (...args) {
  const result = spawnSync.apply(this, args);
  if (args[1]?.some((arg) => /u039-body(?:-order)?\.test\.cjs$/.test(arg))) {
    const text = String(result.stdout ?? '');
    const digest = (bytes) => crypto.createHash('sha256').update(bytes ?? '').digest('hex');
    const summary = Object.fromEntries(['tests', 'pass', 'fail', 'cancelled', 'skipped', 'todo'].map((key) => [key, Number(new RegExp(`^# ${key} (\\d+)$`, 'm').exec(text)?.[1])]));
    if (process.env.U056_PRIVATE_NESTED) {
      fs.mkdirSync(process.env.U056_PRIVATE_NESTED, { recursive: true });
      for (const stream of ['stdout', 'stderr']) fs.writeFileSync(path.join(process.env.U056_PRIVATE_NESTED, `${stream}.raw`), result[stream] ?? '', { flag: 'wx' });
    }
    console.log(JSON.stringify({ kind: 'u056-nested-node-observation', exitCode: result.status, signal: result.signal, spawnError: result.error?.code ?? null, summary,
      assertions: (text.match(/code: 'ERR_ASSERTION'/g) ?? []).length, command: args[1], stdoutRawSha256: digest(result.stdout), stderrRawSha256: digest(result.stderr) }));
  }
  return result;
};
