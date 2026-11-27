#!/usr/bin/env node

import fs from 'node:fs';
import {
  SVGCAGE_VERSION,
  auditSvg,
  sanitizeSvg,
  validateSvg
} from '../src/index.mjs';

const DEFAULT_MAX_BYTES = 1048576;

function usage() {
  return [
    'svgcage ' + SVGCAGE_VERSION,
    '',
    'Usage:',
    '  svgcage audit <file-or-dash> [--max-bytes N] [--strict] [--json]',
    '  svgcage sanitize <file-or-dash> [--max-bytes N] [--strict] [--json] [--out FILE]',
    '  svgcage validate <file-or-dash> [--max-bytes N] [--strict] [--json]',
    '  svgcage --version',
    '  svgcage --help',
    '',
    'Use - as the input path to read standard input.',
    'Exit codes: 0 safe, 1 unsafe findings, 2 usage or input error.'
  ].join('\n');
}

function neutralizeStderr(value) {
  let output = '';
  for (const character of String(value)) {
    const codePoint = character.codePointAt(0);
    const bidi = (codePoint >= 0x202a && codePoint <= 0x202e) || (codePoint >= 0x2066 && codePoint <= 0x2069) || codePoint === 0x200e || codePoint === 0x200f;
    if (codePoint === 0x1b || codePoint < 0x20 || (codePoint >= 0x7f && codePoint <= 0x9f) || bidi) {
      output += '?';
    } else {
      output += character;
    }
  }
  return output;
}

function stderrLine(message) {
  process.stderr.write('svgcage: ' + neutralizeStderr(message).replace(/\?+/g, '?') + '\n');
}

function failUsage(message) {
  stderrLine(message);
  process.stderr.write('\n' + usage() + '\n');
  process.exitCode = 2;
}

function parseLimit(value) {
  if (!/^\d+$/.test(value)) return null;
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 1 || parsed > 4294967295) return null;
  return parsed;
}

function parseCommandArgs(args, command) {
  const result = {
    input: null,
    json: false,
    strict: false,
    out: null,
    maxBytes: DEFAULT_MAX_BYTES
  };
  for (let index = 0; index < args.length; index += 1) {
    const token = args[index];
    if (token === '--json') {
      if (result.json) return null;
      result.json = true;
      continue;
    }
    if (token === '--strict') {
      if (result.strict) return null;
      result.strict = true;
      continue;
    }
    if (token === '--out') {
      if (command !== 'sanitize' || result.out !== null || index + 1 >= args.length) return null;
      result.out = args[index + 1];
      if (result.out.length === 0 || result.out === '-') return null;
      index += 1;
      continue;
    }
    if (token.startsWith('--out=')) {
      if (command !== 'sanitize' || result.out !== null) return null;
      result.out = token.slice(6);
      if (result.out.length === 0 || result.out === '-') return null;
      continue;
    }
    if (token === '--max-bytes') {
      if (index + 1 >= args.length) return null;
      const parsed = parseLimit(args[index + 1]);
      if (parsed === null) return null;
      result.maxBytes = parsed;
      index += 1;
      continue;
    }
    if (token.startsWith('--max-bytes=')) {
      const parsed = parseLimit(token.slice('--max-bytes='.length));
      if (parsed === null) return null;
      result.maxBytes = parsed;
      continue;
    }
    if (token.startsWith('-') && token !== '-') return null;
    if (result.input !== null) return null;
    result.input = token;
  }
  return result.input === null ? null : result;
}

function zeroStats(bytes) {
  return {
    bytes,
    outputBytes: 0,
    elements: 0,
    maxDepthObserved: 0,
    attributes: 0,
    textCharacters: 0,
    comments: 0,
    cdataSections: 0,
    processingInstructions: 0,
    entityReferences: 0,
    expandedTextBytes: 0,
    strippedElements: 0,
    strippedAttributes: 0,
    useReferences: 0,
    useExpansions: 0,
    pathCommands: 0,
    cssDeclarations: 0
  };
}

function oversizedReport(actual, limit) {
  return {
    safe: false,
    findings: [{
      code: 'SVGCAGE_MAX_BYTES',
      severity: 'high',
      message: 'maximum SVG byte length exceeded',
      limit,
      actual
    }],
    stats: zeroStats(actual)
  };
}

function readAllFromFd(fd, maxBytes) {
  const chunks = [];
  const scratch = Buffer.allocUnsafe(65536);
  let total = 0;
  for (;;) {
    const wanted = Math.min(scratch.length, maxBytes - total + 1);
    const count = fs.readSync(fd, scratch, 0, wanted, null);
    if (count === 0) break;
    total += count;
    if (total > maxBytes) {
      return { oversized: true, actual: total, bytes: null };
    }
    chunks.push(Buffer.from(scratch.subarray(0, count)));
  }
  return { oversized: false, actual: total, bytes: Buffer.concat(chunks, total) };
}

function readInput(input, maxBytes) {
  if (input === '-') return readAllFromFd(0, maxBytes);
  let fd = null;
  try {
    const pathStat = fs.lstatSync(input);
    if (!pathStat.isFile()) throw new Error('input is not a regular file');
    const openFlags = fs.constants.O_RDONLY |
      (fs.constants.O_NOFOLLOW || 0) |
      (fs.constants.O_NONBLOCK || 0);
    fd = fs.openSync(input, openFlags);
    const stat = fs.fstatSync(fd);
    if (!stat.isFile()) throw new Error('input is not a regular file');
    if (stat.size > maxBytes) return { oversized: true, actual: stat.size, bytes: null };
    return readAllFromFd(fd, maxBytes);
  } finally {
    if (fd !== null) {
      try {
        fs.closeSync(fd);
      } catch {
        // A close failure does not change the input result.
      }
    }
  }
}

function policyOptions(parsed) {
  return {
    maxBytes: parsed.maxBytes,
    requireSvgNamespace: parsed.strict,
    allowDataImages: false,
    allowStyleElements: false,
    allowProcessingInstructions: false
  };
}

function printAuditLike(report, json, label) {
  if (json) {
    process.stdout.write(JSON.stringify(report, null, 2) + '\n');
    return;
  }
  if (report.safe) {
    process.stdout.write('svgcage ' + label + ': safe\n');
    process.stdout.write('bytes: ' + report.stats.bytes + ', elements: ' + report.stats.elements + ', max depth: ' + report.stats.maxDepthObserved + '\n');
    return;
  }
  process.stdout.write('svgcage ' + label + ': unsafe\n');
  for (const finding of report.findings) {
    const location = typeof finding.line === 'number'
      ? 'line ' + finding.line + ', column ' + finding.column + ': '
      : '';
    process.stdout.write('- ' + finding.code + ' ' + location + finding.message + '\n');
  }
}

function writeOutputFile(filePath, content) {
  const openFlags = fs.constants.O_WRONLY |
    fs.constants.O_CREAT |
    fs.constants.O_TRUNC |
    (fs.constants.O_NOFOLLOW || 0);
  let fd = null;
  try {
    fd = fs.openSync(filePath, openFlags, 0o600);
    const stat = fs.fstatSync(fd);
    if (!stat.isFile()) throw new Error('output is not a regular file');
    fs.writeFileSync(fd, content, 'utf8');
  } finally {
    if (fd !== null) {
      try {
        fs.closeSync(fd);
      } catch {
        // The original write result is more important than a close failure.
      }
    }
  }
}

function loadInput(parsed) {
  let input;
  try {
    input = readInput(parsed.input, parsed.maxBytes);
  } catch {
    stderrLine('unable to read input as a regular file or standard input stream');
    process.exitCode = 2;
    return null;
  }
  return input;
}

function runAuditOrValidate(command, args) {
  const parsed = parseCommandArgs(args, command);
  if (parsed === null || parsed.out !== null) {
    failUsage(command + ' requires exactly one input and accepts only --max-bytes, --strict and --json');
    return;
  }
  const input = loadInput(parsed);
  if (input === null) return;
  const report = input.oversized
    ? oversizedReport(input.actual, parsed.maxBytes)
    : auditSvg(input.bytes, policyOptions(parsed));
  printAuditLike(report, parsed.json, command);
  process.exitCode = report.safe ? 0 : 1;
}

function runSanitize(args) {
  const parsed = parseCommandArgs(args, 'sanitize');
  if (parsed === null) {
    failUsage('sanitize requires exactly one input and accepts only --max-bytes, --strict, --json and --out');
    return;
  }
  const input = loadInput(parsed);
  if (input === null) return;
  const result = input.oversized
    ? {
      svg: '',
      changed: true,
      strippedElements: [],
      strippedAttributes: [],
      findings: oversizedReport(input.actual, parsed.maxBytes).findings,
      stats: zeroStats(input.actual)
    }
    : sanitizeSvg(input.bytes, policyOptions(parsed));

  if (parsed.out !== null) {
    try {
      writeOutputFile(parsed.out, result.svg);
    } catch {
      stderrLine('unable to write output as a regular file');
      process.exitCode = 2;
      return;
    }
  }
  if (parsed.json) {
    process.stdout.write(JSON.stringify(result, null, 2) + '\n');
  } else if (parsed.out === null) {
    process.stdout.write(result.svg + '\n');
  } else {
    process.stdout.write('svgcage sanitize: wrote ' + result.stats.outputBytes + ' bytes\n');
  }
  process.exitCode = result.findings.length === 0 ? 0 : 1;
}

function main(argv) {
  const command = argv[0];
  if (command === '--help' || command === '-h') {
    process.stdout.write(usage() + '\n');
    return;
  }
  if (command === undefined) {
    failUsage('missing command');
    return;
  }
  if (command === '--version' || command === '-v') {
    process.stdout.write('svgcage ' + SVGCAGE_VERSION + '\n');
    return;
  }
  if (command === 'audit' || command === 'validate') {
    runAuditOrValidate(command, argv.slice(1));
    return;
  }
  if (command === 'sanitize') {
    runSanitize(argv.slice(1));
    return;
  }
  failUsage('unknown command ' + JSON.stringify(command));
}

main(process.argv.slice(2));
