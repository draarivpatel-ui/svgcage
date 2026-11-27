import { SVGCAGE_ERROR_CODES } from './constants.mjs';
import { hasExcessiveNumber, isAsciiDigit, isAsciiLetter, isStrictSvgId, trimAsciiWhitespaceAndControls } from './xml-utils.mjs';
import { uriProbeLooksActive, uriProbeLooksExternal } from './uri.mjs';

const ERROR = SVGCAGE_ERROR_CODES;

export const CSS_ALLOWED_PROPERTIES = new Set([
  'baseline-shift',
  'clip-path',
  'clip-rule',
  'color',
  'color-interpolation',
  'color-interpolation-filters',
  'color-rendering',
  'direction',
  'display',
  'dominant-baseline',
  'fill',
  'fill-opacity',
  'fill-rule',
  'filter',
  'flood-color',
  'flood-opacity',
  'font-family',
  'font-size',
  'font-size-adjust',
  'font-stretch',
  'font-style',
  'font-variant',
  'font-weight',
  'image-rendering',
  'letter-spacing',
  'lighting-color',
  'marker-end',
  'marker-mid',
  'marker-start',
  'mask',
  'opacity',
  'overflow',
  'paint-order',
  'pointer-events',
  'shape-rendering',
  'stop-color',
  'stop-opacity',
  'stroke',
  'stroke-dasharray',
  'stroke-dashoffset',
  'stroke-linecap',
  'stroke-linejoin',
  'stroke-miterlimit',
  'stroke-opacity',
  'stroke-width',
  'text-anchor',
  'text-decoration',
  'text-rendering',
  'transform',
  'transform-origin',
  'unicode-bidi',
  'vector-effect',
  'visibility',
  'white-space',
  'word-spacing',
  'writing-mode'
]);

const CSS_URL_PROPERTIES = new Set([
  'clip-path',
  'fill',
  'filter',
  'marker-end',
  'marker-mid',
  'marker-start',
  'mask',
  'stroke'
]);

const SAFE_CSS_FUNCTIONS = new Set([
  'abs',
  'acos',
  'asin',
  'atan',
  'atan2',
  'calc',
  'clamp',
  'color',
  'color-mix',
  'cos',
  'exp',
  'hsl',
  'hsla',
  'hwb',
  'hypot',
  'lab',
  'lch',
  'log',
  'max',
  'min',
  'mod',
  'oklab',
  'oklch',
  'pow',
  'rgb',
  'rgba',
  'round',
  'sign',
  'sin',
  'sqrt',
  'tan',
  'matrix',
  'matrix3d',
  'perspective',
  'rotate',
  'rotate3d',
  'rotatex',
  'rotatey',
  'rotatez',
  'scale',
  'scale3d',
  'scalex',
  'scaley',
  'scalez',
  'skew',
  'skewx',
  'skewy',
  'translate',
  'translate3d',
  'translatex',
  'translatey',
  'translatez'
]);

function issue(code, message, detail) {
  return { code, message, ...(detail || {}) };
}

function cssStripComments(input) {
  let output = '';
  let quote = null;
  let index = 0;
  while (index < input.length) {
    const character = input[index];
    if (quote !== null) {
      output += character;
      if (character === quote) quote = null;
      index += 1;
      continue;
    }
    if (character === '"' || character === "'") {
      quote = character;
      output += character;
      index += 1;
      continue;
    }
    if (character === '/' && input[index + 1] === '*') {
      const end = input.indexOf('*/', index + 2);
      if (end === -1) return null;
      index = end + 2;
      continue;
    }
    output += character;
    index += 1;
  }
  if (quote !== null) return null;
  return output;
}

function cssStringMask(input) {
  const output = input.split('');
  let quote = null;
  for (let index = 0; index < input.length; index += 1) {
    const character = input[index];
    const unit = input.charCodeAt(index);
    if (unit < 0x20 && character !== '\t' && character !== '\n' && character !== '\r') {
      return { mask: null, invalidControl: true };
    }
    if (quote !== null) {
      output[index] = ' ';
      if (character === quote) quote = null;
      continue;
    }
    if (character === '"' || character === "'") {
      quote = character;
      output[index] = ' ';
    }
  }
  if (quote !== null) return { mask: null, invalidControl: false };
  return { mask: output.join(''), invalidControl: false };
}

function scanCssFunctions(input, mask) {
  const functions = [];
  const pattern = /([A-Za-z_-][A-Za-z0-9_-]*)\s*\(/g;
  let match;
  while ((match = pattern.exec(mask)) !== null) {
    const name = match[1].toLowerCase();
    const open = match.index + match[0].length - 1;
    let depth = 1;
    let close = -1;
    for (let index = open + 1; index < mask.length; index += 1) {
      if (mask[index] === '(') depth += 1;
      else if (mask[index] === ')') {
        depth -= 1;
        if (depth === 0) {
          close = index;
          break;
        }
      }
    }
    if (close === -1) {
      return { functions, invalid: true };
    }
    functions.push({
      name,
      open,
      close,
      body: input.slice(open + 1, close)
    });
  }
  return { functions, invalid: false };
}

function cssHasForbiddenOutsideStrings(mask) {
  return mask.includes('@') || mask.includes('<') || mask.includes('>');
}

function cssCanonicalWhitespace(input) {
  let output = '';
  let quote = null;
  let pendingSpace = false;
  for (let index = 0; index < input.length; index += 1) {
    const character = input[index];
    if (quote !== null) {
      output += character;
      if (character === quote) quote = null;
      continue;
    }
    if (character === '"' || character === "'") {
      if (pendingSpace && output.length > 0) output += ' ';
      pendingSpace = false;
      quote = character;
      output += character;
      continue;
    }
    if (character === ' ' || character === '\t' || character === '\n' || character === '\r') {
      pendingSpace = true;
      continue;
    }
    if (pendingSpace && output.length > 0) output += ' ';
    pendingSpace = false;
    output += character;
  }
  return output.trim();
}

function unquoteCssUrlBody(body) {
  const trimmed = trimAsciiWhitespaceAndControls(body);
  if (trimmed.length >= 2) {
    const first = trimmed[0];
    const last = trimmed[trimmed.length - 1];
    if ((first === '"' || first === "'") && last === first) {
      return trimAsciiWhitespaceAndControls(trimmed.slice(1, -1));
    }
  }
  return trimmed;
}

function analyzeCssUrl(body) {
  const target = unquoteCssUrlBody(body);
  if (target.length === 0) {
    return issue(ERROR.CSS_INVALID, 'CSS url() reference is empty');
  }
  if (target.startsWith('#')) {
    if (!isStrictSvgId(target.slice(1))) {
      return issue(ERROR.CSS_INVALID, 'CSS url() fragment is not a strict safe identifier');
    }
    return null;
  }
  if (uriProbeLooksActive(target)) {
    return issue(ERROR.CSS_DANGEROUS_CONSTRUCT, 'CSS url() uses an active script URL scheme');
  }
  if (uriProbeLooksExternal(target)) {
    return issue(ERROR.CSS_EXTERNAL_REFERENCE, 'CSS url() external references are forbidden; only url(#id) is allowed');
  }
  return issue(ERROR.CSS_INVALID, 'CSS url() reference is malformed');
}

export function cssPropertyAllowsUrl(property) {
  return CSS_URL_PROPERTIES.has(property);
}

export function analyzeCssValue(property, input, maxCoordinateValue) {
  if (typeof input !== 'string' || input.length === 0) {
    return { ok: false, canonical: '', issues: [issue(ERROR.CSS_INVALID, 'CSS value is empty')] };
  }
  if (input.includes('\\')) {
    return {
      ok: false,
      canonical: '',
      issues: [issue(ERROR.CSS_DANGEROUS_CONSTRUCT, 'CSS escape sequences are stripped to prevent hex-escape bypasses')]
    };
  }
  const commentless = cssStripComments(input);
  if (commentless === null) {
    return { ok: false, canonical: '', issues: [issue(ERROR.CSS_INVALID, 'CSS comment or string is unterminated')] };
  }
  const maskedResult = cssStringMask(commentless);
  if (maskedResult.mask === null) {
    return {
      ok: false,
      canonical: '',
      issues: [issue(maskedResult.invalidControl ? ERROR.CSS_INVALID : ERROR.CSS_INVALID, maskedResult.invalidControl
        ? 'CSS value contains a forbidden control character'
        : 'CSS string is unterminated')]
    };
  }
  if (cssHasForbiddenOutsideStrings(maskedResult.mask)) {
    return {
      ok: false,
      canonical: '',
      issues: [issue(ERROR.CSS_DANGEROUS_CONSTRUCT, 'CSS at-rules, imports and markup characters are forbidden in values')]
    };
  }
  const scanned = scanCssFunctions(commentless, maskedResult.mask);
  if (scanned.invalid) {
    return { ok: false, canonical: '', issues: [issue(ERROR.CSS_INVALID, 'CSS function parentheses are unbalanced')] };
  }
  const issues = [];
  const urlAllowed = cssPropertyAllowsUrl(property);
  for (const fn of scanned.functions) {
    if (fn.name === 'url') {
      if (!urlAllowed) {
        issues.push(issue(ERROR.CSS_EXTERNAL_REFERENCE, 'CSS url() is not allowed in the ' + property + ' property'));
        continue;
      }
      const urlIssue = analyzeCssUrl(fn.body);
      if (urlIssue !== null) issues.push(urlIssue);
      continue;
    }
    if (fn.name === 'expression' || fn.name === 'var' || fn.name === 'env' || fn.name === 'attr' || fn.name === 'image' || fn.name === 'image-set' || fn.name === '-webkit-image-set' || fn.name === 'element' || fn.name === 'paint') {
      issues.push(issue(ERROR.CSS_DANGEROUS_CONSTRUCT, 'CSS function ' + fn.name + '() is forbidden'));
      continue;
    }
    if (!SAFE_CSS_FUNCTIONS.has(fn.name)) {
      issues.push(issue(ERROR.CSS_DANGEROUS_CONSTRUCT, 'CSS function ' + fn.name + '() is not in the strict safe-function allowlist'));
    }
  }
  if (issues.length > 0) return { ok: false, canonical: '', issues };
  const canonical = cssCanonicalWhitespace(commentless);
  if (typeof maxCoordinateValue === 'number' && hasExcessiveNumber(canonical, maxCoordinateValue)) {
    return { ok: false, canonical: '', issues: [issue(ERROR.MAX_COORDINATE_VALUE, 'CSS numeric coordinate or geometry value exceeds the configured SVG resource cap')] };
  }
  return { ok: true, canonical, issues: [] };
}

function splitCssDeclarations(input) {
  const parts = [];
  let quote = null;
  let parentheses = 0;
  let start = 0;
  let invalid = false;
  for (let index = 0; index < input.length; index += 1) {
    const character = input[index];
    if (quote !== null) {
      if (character === quote) quote = null;
      continue;
    }
    if (character === '"' || character === "'") {
      quote = character;
      continue;
    }
    if (character === '(') parentheses += 1;
    else if (character === ')') {
      parentheses -= 1;
      if (parentheses < 0) invalid = true;
    } else if (character === ';' && parentheses === 0) {
      parts.push(input.slice(start, index));
      start = index + 1;
    }
  }
  if (quote !== null || parentheses !== 0) invalid = true;
  parts.push(input.slice(start));
  return { parts, invalid };
}

function splitDeclaration(input) {
  let quote = null;
  let parentheses = 0;
  for (let index = 0; index < input.length; index += 1) {
    const character = input[index];
    if (quote !== null) {
      if (character === quote) quote = null;
      continue;
    }
    if (character === '"' || character === "'") {
      quote = character;
      continue;
    }
    if (character === '(') parentheses += 1;
    else if (character === ')') parentheses -= 1;
    else if (character === ':' && parentheses === 0) {
      return {
        property: input.slice(0, index),
        value: input.slice(index + 1)
      };
    }
  }
  return null;
}

function validPropertyName(property) {
  if (property.length < 2 || property.startsWith('--')) return false;
  if (!isAsciiLetter(property[0])) return false;
  for (let index = 1; index < property.length; index += 1) {
    const character = property[index];
    if (!isAsciiLetter(character) && !isAsciiDigit(character) && character !== '-') return false;
  }
  return true;
}

export function sanitizeCssDeclarations(input, maxCoordinateValue) {
  const issues = [];
  const output = [];
  if (typeof input !== 'string') {
    return { css: '', issues: [issue(ERROR.CSS_INVALID, 'CSS declarations must be text')], dropped: 1 };
  }
  if (input.includes('\\')) {
    return {
      css: '',
      issues: [issue(ERROR.CSS_DANGEROUS_CONSTRUCT, 'CSS escape sequences are stripped to prevent hex-escape bypasses')],
      dropped: 1
    };
  }
  const commentless = cssStripComments(input);
  if (commentless === null) {
    return { css: '', issues: [issue(ERROR.CSS_INVALID, 'CSS comment or string is unterminated')], dropped: 1 };
  }
  if (commentless.includes('{') || commentless.includes('}')) {
    return { css: '', issues: [issue(ERROR.CSS_INVALID, 'CSS declaration blocks are not valid in a style attribute')], dropped: 1 };
  }
  const split = splitCssDeclarations(commentless);
  if (split.invalid) {
    return { css: '', issues: [issue(ERROR.CSS_INVALID, 'CSS declarations have unbalanced strings or parentheses')], dropped: 1 };
  }
  let dropped = 0;
  for (const rawPart of split.parts) {
    if (rawPart.trim().length === 0) continue;
    const declaration = splitDeclaration(rawPart);
    if (declaration === null) {
      dropped += 1;
      issues.push(issue(ERROR.CSS_INVALID, 'CSS declaration is missing its colon'));
      continue;
    }
    const property = declaration.property.trim().toLowerCase();
    if (!validPropertyName(property)) {
      dropped += 1;
      issues.push(issue(ERROR.CSS_INVALID, 'CSS property name is malformed'));
      continue;
    }
    if (property === 'behavior' || property === '-moz-binding' || property === '-o-link' || property === '-o-link-source') {
      dropped += 1;
      issues.push(issue(ERROR.CSS_DANGEROUS_CONSTRUCT, 'legacy active CSS property ' + property + ' is forbidden'));
      continue;
    }
    if (!CSS_ALLOWED_PROPERTIES.has(property)) {
      dropped += 1;
      issues.push(issue(ERROR.CSS_UNKNOWN_PROPERTY, 'CSS property ' + property + ' is not in the SVG presentation allowlist', { property }));
      continue;
    }
    const analysis = analyzeCssValue(property, declaration.value, maxCoordinateValue);
    if (!analysis.ok) {
      dropped += 1;
      for (const item of analysis.issues) issues.push(item);
      continue;
    }
    output.push(property + ': ' + analysis.canonical);
  }
  return { css: output.join('; '), issues, dropped };
}

function readCssIdentifier(text, position) {
  if (position >= text.length) return null;
  const first = text[position];
  if (!isAsciiLetter(first) && first !== '_') return null;
  let index = position + 1;
  while (index < text.length) {
    const character = text[index];
    if (!isAsciiLetter(character) && !isAsciiDigit(character) && character !== '_' && character !== '-') break;
    index += 1;
  }
  return { value: text.slice(position, index), end: index };
}

function parseSimpleCompoundSelector(text, position) {
  let index = position;
  let output = '';
  let consumed = false;
  if (text[index] === '*') {
    output += '*';
    index += 1;
    consumed = true;
  } else {
    const type = readCssIdentifier(text, index);
    if (type !== null) {
      output += type.value.toLowerCase();
      index = type.end;
      consumed = true;
    }
  }
  for (;;) {
    const marker = text[index];
    if (marker !== '.' && marker !== '#') break;
    const ident = readCssIdentifier(text, index + 1);
    if (ident === null) return null;
    output += marker + ident.value;
    index = ident.end;
    consumed = true;
  }
  if (!consumed) return null;
  return { value: output, end: index };
}

function sanitizeOneSelector(input) {
  const text = input.trim();
  if (text.length === 0) return null;
  let index = 0;
  const parts = [];
  for (;;) {
    while (index < text.length && /\s/.test(text[index])) index += 1;
    const compound = parseSimpleCompoundSelector(text, index);
    if (compound === null) return null;
    parts.push(compound.value);
    index = compound.end;
    let spaces = 0;
    while (index < text.length && /\s/.test(text[index])) {
      index += 1;
      spaces += 1;
    }
    if (index >= text.length) break;
    const combinator = text[index];
    if (combinator === '>' || combinator === '+' || combinator === '~') {
      parts.push(' ' + combinator + ' ');
      index += 1;
    } else if (spaces > 0 && /[A-Za-z_*]/.test(text[index])) {
      parts.push(' ');
    } else {
      return null;
    }
  }
  return parts.join('');
}

export function sanitizeCssSelector(selector) {
  const pieces = selector.split(',');
  if (pieces.length === 0 || pieces.length > 32) return null;
  const output = [];
  for (const piece of pieces) {
    const sanitized = sanitizeOneSelector(piece);
    if (sanitized === null) return null;
    output.push(sanitized);
  }
  return output.join(', ');
}

export function sanitizeCssStylesheet(input, maxCoordinateValue) {
  const issues = [];
  const rules = [];
  if (typeof input !== 'string') {
    return { css: '', issues: [issue(ERROR.CSS_INVALID, 'stylesheet content must be text')], dropped: 1 };
  }
  if (input.includes('\\')) {
    return {
      css: '',
      issues: [issue(ERROR.CSS_DANGEROUS_CONSTRUCT, 'CSS escape sequences are stripped to prevent hex-escape bypasses')],
      dropped: 1
    };
  }
  const commentless = cssStripComments(input);
  if (commentless === null) {
    return { css: '', issues: [issue(ERROR.CSS_INVALID, 'CSS comment or string is unterminated')], dropped: 1 };
  }
  if (commentless.includes('@')) {
    return {
      css: '',
      issues: [issue(ERROR.CSS_DANGEROUS_CONSTRUCT, 'CSS at-rules including @import are forbidden')],
      dropped: 1
    };
  }
  let cursor = 0;
  let dropped = 0;
  while (cursor < commentless.length) {
    while (cursor < commentless.length && /\s/.test(commentless[cursor])) cursor += 1;
    if (cursor >= commentless.length) break;
    const open = commentless.indexOf('{', cursor);
    if (open === -1) {
      dropped += 1;
      issues.push(issue(ERROR.CSS_INVALID, 'CSS rule is missing its declaration block'));
      break;
    }
    const selectorText = commentless.slice(cursor, open);
    if (selectorText.includes('}') || selectorText.includes(';')) {
      dropped += 1;
      issues.push(issue(ERROR.CSS_INVALID, 'CSS rule prelude is malformed'));
      break;
    }
    let depth = 1;
    let close = -1;
    for (let index = open + 1; index < commentless.length; index += 1) {
      if (commentless[index] === '{') depth += 1;
      else if (commentless[index] === '}') {
        depth -= 1;
        if (depth === 0) {
          close = index;
          break;
        }
      }
    }
    if (close === -1) {
      dropped += 1;
      issues.push(issue(ERROR.CSS_INVALID, 'CSS rule declaration block is unterminated'));
      break;
    }
    const selector = sanitizeCssSelector(selectorText);
    if (selector === null) {
      dropped += 1;
      issues.push(issue(ERROR.SELECTOR_NOT_ALLOWED, 'CSS selector is outside the strict SVG selector subset'));
    } else {
      const declarations = sanitizeCssDeclarations(commentless.slice(open + 1, close), maxCoordinateValue);
      for (const item of declarations.issues) issues.push(item);
      if (declarations.css.length > 0) {
        rules.push(selector + ' { ' + declarations.css + ' }');
      } else {
        dropped += 1;
      }
    }
    cursor = close + 1;
  }
  return { css: rules.join('\n'), issues, dropped };
}
