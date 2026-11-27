import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { auditSvg, isSafeSvg, sanitizeSvg, validateSvg } from '../src/index.mjs';

export { assert };
export const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const cliPath = path.join(repoRoot, 'bin', 'svgcage.mjs');

export function codes(value) {
  return value.findings.map((finding) => finding.code);
}

export function hasCode(value, code) {
  return codes(value).includes(code);
}

export function assertFinding(value, code) {
  assert.ok(hasCode(value, code), 'expected ' + code + ' in ' + codes(value).join(','));
}

export function assertNoFinding(value, code) {
  assert.ok(!hasCode(value, code), 'unexpected ' + code + ' in ' + codes(value).join(','));
}

export function expectUnsafe(input, code, options) {
  const report = auditSvg(input, options);
  assert.equal(report.safe, false);
  assertFinding(report, code);
  assert.equal(validateSvg(input, options), false);
  assert.equal(isSafeSvg(input, options), false);
  const result = sanitizeSvg(input, options);
  assertFinding(result, code);
  const second = sanitizeSvg(result.svg, options);
  assert.equal(second.svg, result.svg, 'sanitized output must be idempotent');
  return result;
}

export function expectNeutralized(input, code, forbiddenFragments, options) {
  const result = expectUnsafe(input, code, options);
  for (const fragment of forbiddenFragments) {
    assert.ok(!result.svg.includes(fragment), 'output still contains ' + fragment + ': ' + result.svg);
  }
  return result;
}

export function expectSafe(input, options) {
  const report = auditSvg(input, options);
  assert.deepEqual(report.findings, []);
  assert.equal(report.safe, true);
  assert.equal(validateSvg(input, options), true);
  assert.equal(isSafeSvg(input, options), true);
  const result = sanitizeSvg(input, options);
  assert.deepEqual(result.findings, []);
  const second = sanitizeSvg(result.svg, options);
  assert.equal(second.svg, result.svg, 'safe output must be idempotent');
  return result;
}

export function svgWrap(content, attrs) {
  return '<svg' + (attrs ? ' ' + attrs : '') + '>' + content + '</svg>';
}

export function runCli(args, input, extra) {
  return spawnSync(process.execPath, [cliPath, ...args], {
    input,
    encoding: 'utf8',
    windowsHide: true,
    ...(extra || {})
  });
}

export function makeTempDir(prefix) {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

export function cleanupTempDir(directory) {
  fs.rmSync(directory, { recursive: true, force: true });
}

export function repoText(relative) {
  return fs.readFileSync(path.join(repoRoot, relative), 'utf8');
}

export function repoJson(relative) {
  return JSON.parse(repoText(relative));
}

export function tinyPngDataUrl() {
  return 'data:image/png;base64,iVBORw0KGgo=';
}
export { auditSvg, isSafeSvg, sanitizeSvg, validateSvg };
