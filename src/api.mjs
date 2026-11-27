import { SvgCageError, svgcageIsError } from './errors.mjs';
import { normalizeSvgPolicyOptions } from './policy.mjs';
import { parseSvgXmlDocument } from './xml-parser.mjs';
import {
  makeEmptySafeSvg,
  sanitizeParsedSvgDocument,
  serializeSanitizedSvg
} from './sanitizer.mjs';
import {
  copySvgStats,
  createLineIndexer,
  emptySvgStats,
  prepareSvgInput,
  svgcageErrorToFinding,
  utf8ByteLength
} from './xml-utils.mjs';

function findingSame(left, right) {
  return left.code === right.code &&
    left.position === right.position &&
    left.element === right.element &&
    left.attribute === right.attribute;
}

function pushMergedFinding(findings, policy, finding) {
  if (!finding || findings.length >= policy.maxFindings) return;
  if (!findings.some((existing) => findingSame(existing, finding))) findings.push(finding);
}

function mergeFindings(findings, policy, additions) {
  for (const finding of additions) pushMergedFinding(findings, policy, finding);
}

function fallbackSvg(policy) {
  const empty = makeEmptySafeSvg();
  return utf8ByteLength(empty) <= policy.maxOutputBytes ? empty : '';
}

function freezeArrayOfObjects(items) {
  for (const item of items) Object.freeze(item);
  return Object.freeze(items.slice());
}

function freezeSanitizeResult(result) {
  result.findings = freezeArrayOfObjects(result.findings);
  result.strippedElements = freezeArrayOfObjects(result.strippedElements);
  result.strippedAttributes = freezeArrayOfObjects(result.strippedAttributes);
  result.stats = Object.freeze({ ...result.stats });
  return Object.freeze(result);
}

function freezeAuditReport(report) {
  report.findings = freezeArrayOfObjects(report.findings);
  report.stats = Object.freeze({ ...report.stats });
  return Object.freeze(report);
}

function evaluateSvg(input, options) {
  const policy = normalizeSvgPolicyOptions(options);
  const findings = [];
  let stats = emptySvgStats();
  let prepared = null;
  let inputText = null;
  let lineIndexer = null;

  try {
    prepared = prepareSvgInput(input, policy);
    inputText = prepared.text;
    stats.bytes = prepared.bytes;
  } catch (error) {
    if (!svgcageIsError(error)) throw error;
    pushMergedFinding(findings, policy, svgcageErrorToFinding(error, null));
    if (error.stats) stats = { ...stats, ...error.stats };
  }

  let documentNode = null;
  let sanitizerResult = null;
  if (prepared !== null) {
    lineIndexer = createLineIndexer(prepared.text);
    try {
      const parsed = parseSvgXmlDocument(prepared.text, policy, stats);
      documentNode = parsed.document;
      stats = parsed.stats;
    } catch (error) {
      if (!svgcageIsError(error)) throw error;
      pushMergedFinding(findings, policy, svgcageErrorToFinding(error, lineIndexer));
    }
  }

  let svg = fallbackSvg(policy);
  if (documentNode !== null) {
    sanitizerResult = sanitizeParsedSvgDocument(documentNode, policy, stats, lineIndexer);
    mergeFindings(findings, policy, sanitizerResult.findings);
    if (sanitizerResult.root !== null) {
      try {
        svg = serializeSanitizedSvg(sanitizerResult.root, policy, stats);
      } catch (error) {
        if (!svgcageIsError(error)) throw error;
        pushMergedFinding(findings, policy, svgcageErrorToFinding(error, lineIndexer));
        svg = fallbackSvg(policy);
      }
    }
  }
  stats.outputBytes = utf8ByteLength(svg);

  return {
    policy,
    svg,
    changed: inputText === null ? true : svg !== inputText,
    findings,
    stats: copySvgStats(stats),
    strippedElements: sanitizerResult ? sanitizerResult.strippedElements : [],
    strippedAttributes: sanitizerResult ? sanitizerResult.strippedAttributes : []
  };
}

export function sanitizeSvg(input, options) {
  const evaluated = evaluateSvg(input, options);
  return freezeSanitizeResult({
    svg: evaluated.svg,
    changed: evaluated.changed,
    strippedElements: evaluated.strippedElements,
    strippedAttributes: evaluated.strippedAttributes,
    findings: evaluated.findings,
    stats: evaluated.stats
  });
}

export function auditSvg(input, options) {
  const evaluated = evaluateSvg(input, options);
  return freezeAuditReport({
    safe: evaluated.findings.length === 0,
    findings: evaluated.findings,
    stats: evaluated.stats
  });
}

export function validateSvg(input, options) {
  return auditSvg(input, options).safe;
}

export function isSafeSvg(input, options) {
  return validateSvg(input, options);
}

export function assertSafeSvg(input, options) {
  const report = auditSvg(input, options);
  if (report.safe) return report;
  const first = report.findings[0];
  const details = {};
  for (const key of Object.keys(first)) {
    if (key !== 'code' && key !== 'message' && key !== 'severity') details[key] = first[key];
  }
  const error = new SvgCageError(first.code, first.message, details);
  error.findings = report.findings;
  error.stats = report.stats;
  throw error;
}
