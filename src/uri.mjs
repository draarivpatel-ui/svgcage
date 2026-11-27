import { SVGCAGE_ERROR_CODES } from './constants.mjs';
import {
  isAsciiDigit,
  isAsciiLetter,
  isStrictSvgId,
  stripAsciiControlAndSpace,
  trimAsciiWhitespaceAndControls
} from './xml-utils.mjs';

const ERROR = SVGCAGE_ERROR_CODES;

function percentDecodeOnce(value) {
  let output = '';
  for (let index = 0; index < value.length; index += 1) {
    if (value[index] !== '%' || index + 2 >= value.length) {
      output += value[index];
      continue;
    }
    const first = Number.parseInt(value[index + 1], 16);
    const second = Number.parseInt(value[index + 2], 16);
    const hexText = value.slice(index + 1, index + 3);
    if (!/^[0-9A-Fa-f]{2}$/.test(hexText) || Number.isNaN(first) || Number.isNaN(second)) {
      output += value[index];
      continue;
    }
    output += String.fromCharCode(Number.parseInt(hexText, 16));
    index += 2;
  }
  return output;
}

function percentDecodeRepeated(value) {
  let current = value;
  for (let round = 0; round < 4; round += 1) {
    const decoded = percentDecodeOnce(current);
    if (decoded === current) break;
    current = decoded;
  }
  return current;
}

function readSchemePrefix(value) {
  const sample = value.slice(0, 512);
  const decoded = percentDecodeRepeated(sample);
  const compact = stripAsciiControlAndSpace(decoded).toLowerCase();
  if (compact.length === 0 || !isAsciiLetter(compact[0])) return null;
  let index = 1;
  while (index < compact.length) {
    const character = compact[index];
    if (character === ':') {
      if (index === 1) return null;
      return compact.slice(0, index);
    }
    const valid = isAsciiLetter(character) || isAsciiDigit(character) || character === '+' || character === '-' || character === '.';
    if (!valid) return null;
    index += 1;
    if (index > 64) return null;
  }
  return null;
}

function blocked(code, message, extra) {
  return {
    ok: false,
    code,
    message,
    ...(extra || {})
  };
}

function validFragment(value) {
  if (!value.startsWith('#')) return null;
  const id = value.slice(1);
  if (!isStrictSvgId(id)) {
    return blocked(ERROR.INVALID_FRAGMENT, 'local SVG fragment reference is not a strict safe identifier', {
      fragment: id.slice(0, 80)
    });
  }
  return { ok: true, kind: 'fragment', normalized: '#' + id, id };
}

function base64PayloadIsCanonical(payload) {
  if (payload.length === 0 || payload.length % 4 !== 0) return false;
  let padding = 0;
  for (let index = 0; index < payload.length; index += 1) {
    const unit = payload.charCodeAt(index);
    const alpha = (unit >= 0x41 && unit <= 0x5a) || (unit >= 0x61 && unit <= 0x7a);
    const digit = unit >= 0x30 && unit <= 0x39;
    const symbol = unit === 0x2b || unit === 0x2f;
    if (alpha || digit || symbol) {
      if (padding > 0) return false;
      continue;
    }
    if (unit === 0x3d) {
      padding += 1;
      if (padding > 2) return false;
      continue;
    }
    return false;
  }
  if (padding > 0 && !payload.endsWith('='.repeat(padding))) return false;
  return true;
}

function rasterSignatureMatches(mime, bytes) {
  if (mime === 'image/png') {
    return bytes.length >= 8 &&
      bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47 &&
      bytes[4] === 0x0d && bytes[5] === 0x0a && bytes[6] === 0x1a && bytes[7] === 0x0a;
  }
  if (mime === 'image/jpeg') {
    return bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  }
  return bytes.length >= 12 &&
    bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 &&
    bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50;
}

function analyzeDataUrl(value, context, policy) {
  const comma = value.indexOf(',');
  if (comma === -1) {
    return blocked(ERROR.DATA_URI_FORBIDDEN, 'data URL is malformed and is forbidden', {});
  }
  const metadata = value.slice(5, comma).toLowerCase();
  const payload = value.slice(comma + 1);
  if (metadata.includes('image/svg+xml') || metadata.includes('svg')) {
    return blocked(ERROR.DATA_SVG_FORBIDDEN, 'data:image/svg+xml is forbidden because it can contain active SVG content', {});
  }
  if (metadata.includes('text/html') || metadata.includes('application/xhtml+xml')) {
    return blocked(ERROR.DANGEROUS_URI_SCHEME, 'data HTML document URLs are forbidden', {});
  }
  if (!context.image || !policy.allowDataImages) {
    return blocked(ERROR.DATA_URI_FORBIDDEN, 'data URLs are forbidden by the SVG security policy', {});
  }
  const parts = metadata.split(';');
  if (parts.length !== 2 || parts[1] !== 'base64') {
    return blocked(ERROR.DATA_URI_FORBIDDEN, 'only canonical base64 raster image data URLs are allowed', {});
  }
  const mime = parts[0];
  if (mime !== 'image/png' && mime !== 'image/jpeg' && mime !== 'image/webp') {
    return blocked(ERROR.DATA_URI_FORBIDDEN, 'data URL media type is not an allowed raster image type', {});
  }
  if (!base64PayloadIsCanonical(payload)) {
    return blocked(ERROR.DATA_URI_FORBIDDEN, 'raster data URL payload is not canonical base64', {});
  }
  const padding = payload.endsWith('==') ? 2 : payload.endsWith('=') ? 1 : 0;
  const byteLength = Math.floor(payload.length * 3 / 4) - padding;
  if (byteLength > policy.maxDataImageBytes) {
    return blocked(ERROR.MAX_DATA_IMAGE_BYTES, 'maximum raster data image byte length exceeded', {
      limit: policy.maxDataImageBytes,
      actual: byteLength
    });
  }
  const bytes = Buffer.from(payload, 'base64');
  if (bytes.length !== byteLength || !rasterSignatureMatches(mime, bytes)) {
    return blocked(ERROR.DATA_URI_FORBIDDEN, 'raster data URL bytes do not match the declared image type', {});
  }
  return {
    ok: true,
    kind: 'data-image',
    normalized: 'data:' + mime + ';base64,' + payload,
    bytes: byteLength
  };
}

export function analyzeSvgUri(value, context, policy) {
  const trimmed = trimAsciiWhitespaceAndControls(value);
  if (trimmed.length === 0) {
    return blocked(ERROR.INVALID_FRAGMENT, 'URI reference is empty or contains only whitespace and control characters', {});
  }
  if (trimmed.startsWith('#')) return validFragment(trimmed);
  const scheme = readSchemePrefix(trimmed);
  if (scheme === 'data') return analyzeDataUrl(trimmed, context, policy);
  if (scheme === 'javascript' || scheme === 'vbscript' || scheme === 'livescript' || scheme === 'mocha') {
    return blocked(ERROR.DANGEROUS_URI_SCHEME, 'active script URL schemes are forbidden', {
      scheme
    });
  }
  return blocked(ERROR.EXTERNAL_REFERENCE, 'external and relative SVG resource references are forbidden; only same-document fragments are allowed', {
    scheme: scheme || undefined
  });
}

export function validateSvgFragment(value) {
  const trimmed = trimAsciiWhitespaceAndControls(value);
  return validFragment(trimmed);
}

export function uriProbeLooksActive(value) {
  const scheme = readSchemePrefix(trimAsciiWhitespaceAndControls(value));
  return scheme === 'javascript' || scheme === 'vbscript' || scheme === 'livescript' || scheme === 'mocha';
}

export function uriProbeLooksExternal(value) {
  const trimmed = trimAsciiWhitespaceAndControls(value);
  return trimmed.length > 0 && !trimmed.startsWith('#');
}
