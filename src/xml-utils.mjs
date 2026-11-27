import { SVGCAGE_ERROR_CODES, svgcageSeverityForCode } from './constants.mjs';
import { svgcageFail, SvgCageError } from './errors.mjs';

const ERROR = SVGCAGE_ERROR_CODES;

export function isHighSurrogate(unit) {
  return unit >= 0xd800 && unit <= 0xdbff;
}

export function isLowSurrogate(unit) {
  return unit >= 0xdc00 && unit <= 0xdfff;
}

export function utf8ByteLength(text) {
  let bytes = 0;
  for (let index = 0; index < text.length; index += 1) {
    const unit = text.charCodeAt(index);
    if (unit <= 0x7f) {
      bytes += 1;
    } else if (unit <= 0x7ff) {
      bytes += 2;
    } else if (isHighSurrogate(unit) && index + 1 < text.length && isLowSurrogate(text.charCodeAt(index + 1))) {
      bytes += 4;
      index += 1;
    } else {
      bytes += 3;
    }
  }
  return bytes;
}

export function isXmlWhitespaceUnit(unit) {
  return unit === 0x20 || unit === 0x9 || unit === 0xa || unit === 0xd;
}

export function isXmlWhitespace(character) {
  return character === ' ' || character === '\t' || character === '\n' || character === '\r';
}

export function isAsciiLetter(character) {
  return (character >= 'A' && character <= 'Z') || (character >= 'a' && character <= 'z');
}

export function isAsciiDigit(character) {
  return character >= '0' && character <= '9';
}

export function isLegalXmlCodePoint(codePoint) {
  return codePoint === 0x9 ||
    codePoint === 0xa ||
    codePoint === 0xd ||
    (codePoint >= 0x20 && codePoint <= 0xd7ff) ||
    (codePoint >= 0xe000 && codePoint <= 0xfffd) ||
    (codePoint >= 0x10000 && codePoint <= 0x10ffff);
}

export function validateXmlCharacters(text) {
  for (let index = 0; index < text.length; index += 1) {
    const first = text.charCodeAt(index);
    let codePoint = first;
    if (isHighSurrogate(first)) {
      if (index + 1 >= text.length || !isLowSurrogate(text.charCodeAt(index + 1))) {
        svgcageFail(ERROR.MALFORMED_XML, 'lone UTF-16 surrogate is not a legal XML 1.0 character', {
          position: index,
          actual: first
        });
      }
      codePoint = 0x10000 + ((first - 0xd800) << 10) + text.charCodeAt(index + 1) - 0xdc00;
      index += 1;
    } else if (isLowSurrogate(first)) {
      svgcageFail(ERROR.MALFORMED_XML, 'lone UTF-16 surrogate is not a legal XML 1.0 character', {
        position: index,
        actual: first
      });
    }
    if (!isLegalXmlCodePoint(codePoint)) {
      svgcageFail(ERROR.MALFORMED_XML, 'character is outside the legal XML 1.0 character range', {
        position: index,
        actual: codePoint
      });
    }
  }
}

export function codePointAt(text, index) {
  const first = text.charCodeAt(index);
  if (isHighSurrogate(first) && index + 1 < text.length && isLowSurrogate(text.charCodeAt(index + 1))) {
    return {
      codePoint: 0x10000 + ((first - 0xd800) << 10) + text.charCodeAt(index + 1) - 0xdc00,
      width: 2
    };
  }
  return { codePoint: first, width: 1 };
}

export function isXmlNameStartCodePoint(codePoint) {
  return codePoint === 0x3a ||
    codePoint === 0x5f ||
    (codePoint >= 0x41 && codePoint <= 0x5a) ||
    (codePoint >= 0x61 && codePoint <= 0x7a) ||
    (codePoint >= 0xc0 && codePoint <= 0xd6) ||
    (codePoint >= 0xd8 && codePoint <= 0xf6) ||
    (codePoint >= 0xf8 && codePoint <= 0x2ff) ||
    (codePoint >= 0x370 && codePoint <= 0x37d) ||
    (codePoint >= 0x37f && codePoint <= 0x1fff) ||
    (codePoint >= 0x200c && codePoint <= 0x200d) ||
    (codePoint >= 0x2070 && codePoint <= 0x218f) ||
    (codePoint >= 0x2c00 && codePoint <= 0x2fef) ||
    (codePoint >= 0x3001 && codePoint <= 0xd7ff) ||
    (codePoint >= 0xf900 && codePoint <= 0xfdcf) ||
    (codePoint >= 0xfdf0 && codePoint <= 0xfffd) ||
    (codePoint >= 0x10000 && codePoint <= 0xeffff);
}

export function isXmlNameCodePoint(codePoint) {
  return isXmlNameStartCodePoint(codePoint) ||
    codePoint === 0x2d ||
    codePoint === 0x2e ||
    (codePoint >= 0x30 && codePoint <= 0x39) ||
    codePoint === 0xb7 ||
    (codePoint >= 0x300 && codePoint <= 0x36f) ||
    codePoint === 0x203f ||
    codePoint === 0x2040;
}

export function splitQName(name) {
  const parts = name.split(':');
  if (parts.length > 2 || parts.some((part) => part.length === 0)) return null;
  if (parts.length === 1) return { prefix: null, localName: parts[0] };
  return { prefix: parts[0], localName: parts[1] };
}

const DANGEROUS_NAMES = new Set(['__proto__', 'constructor', 'prototype']);

export function isDangerousXmlName(name) {
  const parts = splitQName(name);
  return DANGEROUS_NAMES.has(name) || (parts !== null && DANGEROUS_NAMES.has(parts.localName));
}

export function validateXmlName(name, position, maxNameLength, kind) {
  if (typeof name !== 'string' || name.length === 0) {
    svgcageFail(ERROR.MALFORMED_XML, 'XML ' + kind + ' name is empty', { position });
  }
  if (name.length > maxNameLength) {
    svgcageFail(ERROR.MAX_NAME_LENGTH, 'maximum XML name length exceeded', {
      position,
      limit: maxNameLength,
      actual: name.length,
      name: name.slice(0, 80)
    });
  }
  let index = 0;
  const first = codePointAt(name, index);
  if (!isXmlNameStartCodePoint(first.codePoint)) {
    svgcageFail(ERROR.MALFORMED_XML, 'XML ' + kind + ' name has an invalid first character', {
      position,
      name
    });
  }
  index += first.width;
  while (index < name.length) {
    const next = codePointAt(name, index);
    if (!isXmlNameCodePoint(next.codePoint)) {
      svgcageFail(ERROR.MALFORMED_XML, 'XML ' + kind + ' name has an invalid character', {
        position,
        name
      });
    }
    index += next.width;
  }
  const parts = splitQName(name);
  if (parts === null) {
    svgcageFail(ERROR.MALFORMED_XML, 'qualified XML ' + kind + ' name is malformed', {
      position,
      name
    });
  }
  if (parts.prefix !== null) {
    const localFirst = codePointAt(parts.localName, 0);
    if (!isXmlNameStartCodePoint(localFirst.codePoint)) {
      svgcageFail(ERROR.MALFORMED_XML, 'qualified XML ' + kind + ' local part has an invalid first character', {
        position,
        name
      });
    }
  }
  if (isDangerousXmlName(name)) {
    svgcageFail(ERROR.PROTOTYPE_KEY, 'prototype pollution name rejected in XML ' + kind, {
      position,
      name,
      key: name
    });
  }
  return parts;
}

export function normalizeXmlText(input) {
  let text = input;
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  if (text.includes('\r')) text = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  return text;
}

export function normalizeBytesInput(input) {
  if (input instanceof Uint8Array) return input;
  if (ArrayBuffer.isView(input)) return new Uint8Array(input.buffer, input.byteOffset, input.byteLength);
  if (input instanceof ArrayBuffer) return new Uint8Array(input);
  if (typeof SharedArrayBuffer !== 'undefined' && input instanceof SharedArrayBuffer) return new Uint8Array(input);
  return null;
}

function looksLikeUtf16OrUtf32(view) {
  if (view.byteLength >= 4) {
    if (view[0] === 0xff && view[1] === 0xfe && view[2] === 0x00 && view[3] === 0x00) return true;
    if (view[0] === 0x00 && view[1] === 0x00 && view[2] === 0xfe && view[3] === 0xff) return true;
    if (view[0] === 0xff && view[1] === 0xfe) return true;
    if (view[0] === 0xfe && view[1] === 0xff) return true;
  }
  const sample = Math.min(view.byteLength, 64);
  if (sample < 8) return false;
  let evenZeros = 0;
  let oddZeros = 0;
  let pairs = 0;
  for (let index = 0; index + 1 < sample; index += 2) {
    pairs += 1;
    if (view[index] === 0) evenZeros += 1;
    if (view[index + 1] === 0) oddZeros += 1;
  }
  return evenZeros / pairs > 0.6 || oddZeros / pairs > 0.6;
}

function byteLengthError(actual, limit) {
  const error = new SvgCageError(ERROR.MAX_BYTES, 'maximum SVG byte length exceeded', {
    limit,
    actual
  });
  error.stats = emptySvgStats();
  error.stats.bytes = actual;
  return error;
}

export function prepareSvgInput(input, options) {
  if (typeof input === 'string') {
    const bytes = utf8ByteLength(input);
    if (bytes > options.maxBytes) throw byteLengthError(bytes, options.maxBytes);
    return { text: normalizeXmlText(input), bytes, inputKind: 'string' };
  }
  const view = normalizeBytesInput(input);
  if (view === null) {
    svgcageFail(ERROR.INVALID_INPUT, 'expected an SVG string, Uint8Array, ArrayBuffer, or ArrayBuffer view');
  }
  if (view.byteLength > options.maxBytes) throw byteLengthError(view.byteLength, options.maxBytes);
  if (looksLikeUtf16OrUtf32(view)) {
    const error = new SvgCageError(ERROR.INVALID_UTF8, 'input has a UTF-16 or UTF-32 byte pattern; UTF-8 bytes are required');
    error.stats = emptySvgStats();
    error.stats.bytes = view.byteLength;
    throw error;
  }
  try {
    const text = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(view);
    return { text: normalizeXmlText(text), bytes: view.byteLength, inputKind: 'bytes' };
  } catch {
    const error = new SvgCageError(ERROR.INVALID_UTF8, 'input is not well-formed UTF-8');
    error.stats = emptySvgStats();
    error.stats.bytes = view.byteLength;
    throw error;
  }
}

export function createLineIndexer(text) {
  let starts = null;
  return (position) => {
    if (starts === null) {
      starts = [0];
      for (let index = 0; index < text.length; index += 1) {
        if (text.charCodeAt(index) === 10) starts.push(index + 1);
      }
    }
    const end = Math.max(0, Math.min(position, text.length));
    let low = 0;
    let high = starts.length - 1;
    while (low < high) {
      const middle = Math.floor((low + high + 1) / 2);
      if (starts[middle] <= end) low = middle;
      else high = middle - 1;
    }
    return { line: low + 1, column: end - starts[low] + 1 };
  };
}

export function emptySvgStats() {
  return {
    bytes: 0,
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

export function copySvgStats(stats) {
  return { ...stats };
}

export function makeSvgFinding(code, message, details, lineIndexer) {
  const finding = {
    code,
    severity: svgcageSeverityForCode(code),
    message
  };
  if (details && typeof details === 'object') {
    for (const key of Object.keys(details)) {
      if (details[key] !== undefined) finding[key] = details[key];
    }
  }
  if (typeof finding.position === 'number' && lineIndexer) {
    const location = lineIndexer(finding.position);
    finding.line = location.line;
    finding.column = location.column;
  }
  return finding;
}

export function addSvgFinding(findings, options, code, message, details, lineIndexer) {
  if (findings.length >= options.maxFindings) return null;
  const finding = makeSvgFinding(code, message, details, lineIndexer);
  const duplicate = findings.some((existing) =>
    existing.code === finding.code &&
    existing.position === finding.position &&
    existing.element === finding.element &&
    existing.attribute === finding.attribute
  );
  if (!duplicate) findings.push(finding);
  return finding;
}

export function svgcageErrorToFinding(error, lineIndexer) {
  return makeSvgFinding(error.code, error.reason, {
    position: error.position,
    limit: error.limit,
    actual: error.actual,
    depth: error.depth,
    svgName: error.svgName,
    attribute: error.attribute,
    key: error.key,
    expected: error.expected
  }, lineIndexer);
}

export function escapeXmlText(value) {
  return value.replace(/[&<]/g, (character) => character === '&' ? '&amp;' : '&lt;')
    .replace(/\r/g, '&#13;')
    .replace(/\]\]>/g, ']]&gt;');
}

export function escapeXmlAttribute(value) {
  return value.replace(/[&<>"']/g, (character) => {
    if (character === '&') return '&amp;';
    if (character === '<') return '&lt;';
    if (character === '>') return '&gt;';
    if (character === '"') return '&quot;';
    return '&apos;';
  }).replace(/\t/g, '&#9;').replace(/\n/g, '&#10;').replace(/\r/g, '&#13;');
}

export function assertXmlOutputText(value) {
  validateXmlCharacters(value);
}

export function isStrictSvgId(value) {
  if (typeof value !== 'string' || value.length === 0 || value.length > 128) return false;
  const first = value.charCodeAt(0);
  const firstValid = (first >= 0x41 && first <= 0x5a) || (first >= 0x61 && first <= 0x7a) || first === 0x5f;
  if (!firstValid) return false;
  for (let index = 1; index < value.length; index += 1) {
    const unit = value.charCodeAt(index);
    const valid = (unit >= 0x41 && unit <= 0x5a) ||
      (unit >= 0x61 && unit <= 0x7a) ||
      (unit >= 0x30 && unit <= 0x39) ||
      unit === 0x5f || unit === 0x2d || unit === 0x2e;
    if (!valid) return false;
  }
  return true;
}

export function scanNumericLiterals(value, callback) {
  let index = 0;
  while (index < value.length) {
    const character = value[index];
    const sign = character === '+' || character === '-';
    const digitStart = sign ? value[index + 1] : character;
    if (!isAsciiDigit(digitStart) && digitStart !== '.') {
      index += 1;
      continue;
    }
    const start = index;
    if (sign) index += 1;
    let digits = 0;
    while (index < value.length && isAsciiDigit(value[index])) {
      index += 1;
      digits += 1;
    }
    if (value[index] === '.') {
      index += 1;
      while (index < value.length && isAsciiDigit(value[index])) {
        index += 1;
        digits += 1;
      }
    }
    if (digits === 0) {
      index = start + 1;
      continue;
    }
    if ((value[index] === 'e' || value[index] === 'E') && index + 1 < value.length) {
      let exponentIndex = index + 1;
      if (value[exponentIndex] === '+' || value[exponentIndex] === '-') exponentIndex += 1;
      let exponentDigits = 0;
      while (exponentIndex < value.length && isAsciiDigit(value[exponentIndex])) {
        exponentIndex += 1;
        exponentDigits += 1;
      }
      if (exponentDigits > 0) index = exponentIndex;
    }
    const token = value.slice(start, index);
    const number = Number(token);
    callback(number, token, start);
  }
}

export function hasExcessiveNumber(value, maximum) {
  let excessive = false;
  scanNumericLiterals(value, (number) => {
    if (Math.abs(number) > maximum) excessive = true;
  });
  return excessive;
}

export function stripAsciiControlAndSpace(value) {
  let output = '';
  for (let index = 0; index < value.length; index += 1) {
    const unit = value.charCodeAt(index);
    if (unit > 0x20 && unit !== 0x7f) output += value[index];
  }
  return output;
}

export function trimAsciiWhitespaceAndControls(value) {
  let start = 0;
  let end = value.length;
  while (start < end && value.charCodeAt(start) <= 0x20) start += 1;
  while (end > start && value.charCodeAt(end - 1) <= 0x20) end -= 1;
  return value.slice(start, end);
}
