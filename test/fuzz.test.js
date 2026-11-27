import test from 'node:test';
import assert from 'node:assert/strict';
import fc from 'fast-check';

import {
  auditSvg,
  sanitizeSvg,
} from '../src/index.mjs';

const propertyOptions = { seed: 20261127, numRuns: 100 };
const dimension = fc.integer({ min: 1, max: 999 });
const offset = fc.integer({ min: 0, max: 500 });
const payloadText = fc.stringMatching(/^evil[a-z0-9]{4,20}$/);

function hasFinding(report, code) {
  return report.findings.some((finding) => finding.code === code);
}

test('benign generated rectangles sanitize to safe idempotent SVG', () => {
  fc.assert(
    fc.property(dimension, dimension, offset, offset, (width, height, x, y) => {
      const input = `<svg xmlns="http://www.w3.org/2000/svg"><rect width="${width}" height="${height}" x="${x}" y="${y}"/></svg>`;
      const first = sanitizeSvg(input);
      assert.deepEqual(first.findings, []);
      assert.equal(auditSvg(first.svg).safe, true);
      const second = sanitizeSvg(first.svg);
      assert.equal(second.svg, first.svg);
      assert.equal(first.svg.includes(`width="${width}"`), true);
      assert.equal(first.svg.includes(`height="${height}"`), true);
    }),
    propertyOptions,
  );
});

test('generated event handler payloads are stripped and output becomes safe', () => {
  const eventName = fc.constantFrom('onload', 'onclick', 'onerror', 'ONLOAD', 'oNcLiCk');
  fc.assert(
    fc.property(eventName, payloadText, (name, payload) => {
      const input = `<svg xmlns="http://www.w3.org/2000/svg"><rect width="4" ${name}="${payload}"/></svg>`;
      const report = auditSvg(input);
      assert.equal(report.safe, false);
      assert.ok(hasFinding(report, 'SVGCAGE_EVENT_HANDLER_ATTRIBUTE'));
      const result = sanitizeSvg(input);
      assert.equal(/<rect[^>]*\son[a-z0-9]*=/i.test(result.svg), false);
      assert.equal(result.svg.includes(payload), false);
      assert.equal(auditSvg(result.svg).safe, true);
    }),
    propertyOptions,
  );
});

test('generated script element payloads are removed with their script text', () => {
  fc.assert(
    fc.property(payloadText, (payload) => {
      const input = `<svg xmlns="http://www.w3.org/2000/svg"><script>${payload}</script><rect width="4"/></svg>`;
      const report = auditSvg(input);
      assert.equal(report.safe, false);
      assert.ok(hasFinding(report, 'SVGCAGE_SCRIPT_ELEMENT'));
      const result = sanitizeSvg(input);
      assert.equal(/<script/i.test(result.svg), false);
      assert.equal(result.svg.includes(payload), false);
      assert.equal(auditSvg(result.svg).safe, true);
    }),
    propertyOptions,
  );
});

test('generated active URI payloads lose the dangerous reference', () => {
  const scheme = fc.constantFrom('javascript:', 'JavaScript:', 'vbscript:', 'java%20script:');
  fc.assert(
    fc.property(scheme, payloadText, (schemeText, payload) => {
      const input = `<svg xmlns="http://www.w3.org/2000/svg"><use href="${schemeText}${payload}"/></svg>`;
      const report = auditSvg(input);
      assert.equal(report.safe, false);
      assert.ok(hasFinding(report, 'SVGCAGE_DANGEROUS_URI_SCHEME'));
      const result = sanitizeSvg(input);
      assert.equal(result.svg.includes(payload), false);
      assert.equal(auditSvg(result.svg).safe, true);
    }),
    propertyOptions,
  );
});
