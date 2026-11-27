import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const cli = path.join(root, 'bin', 'svgcage.mjs');
const safe = '<svg xmlns="http://www.w3.org/2000/svg"><rect width="4" height="4"/></svg>';
const unsafe = '<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"><rect width="4" height="4"/></svg>';

const good = spawnSync(process.execPath, [cli, 'audit', '-'], { input: safe, encoding: 'utf8' });
assert.equal(good.status, 0, good.stderr);
const bad = spawnSync(process.execPath, [cli, 'audit', '-', '--json'], { input: unsafe, encoding: 'utf8' });
assert.equal(bad.status, 1, bad.stderr);
const report = JSON.parse(bad.stdout);
assert.equal(report.safe, false);
assert.equal(report.findings[0].code, 'SVGCAGE_EVENT_HANDLER_ATTRIBUTE');
const sanitized = spawnSync(process.execPath, [cli, 'sanitize', '-'], { input: unsafe, encoding: 'utf8' });
assert.equal(sanitized.status, 1, sanitized.stderr);
assert.ok(!sanitized.stdout.includes('onload'));
console.log('svgcage CLI smoke test passed');
