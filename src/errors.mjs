import { SVGCAGE_ERROR_CODES, svgcageSeverityForCode } from './constants.mjs';

export class SvgCageError extends Error {
  constructor(code, message, details) {
    super(code + ': ' + message);
    this.name = 'SvgCageError';
    this.code = code;
    this.reason = message;
    this.severity = svgcageSeverityForCode(code);
    if (details && typeof details === 'object') {
      for (const key of Object.keys(details)) {
        if (details[key] === undefined) continue;
        if (key === 'name') this.svgName = details[key];
        else this[key] = details[key];
      }
    }
  }

  toJSON() {
    const output = {
      name: this.name,
      code: this.code,
      severity: this.severity,
      reason: this.reason
    };
    for (const key of ['position', 'line', 'column', 'svgName', 'attribute', 'key', 'limit', 'actual', 'depth', 'expected']) {
      if (this[key] !== undefined) output[key] = this[key];
    }
    return output;
  }
}

export function svgcageFail(code, message, details) {
  throw new SvgCageError(code, message, details);
}

export function svgcageInvalidOptions(message, key) {
  throw new SvgCageError(SVGCAGE_ERROR_CODES.INVALID_OPTIONS, message, { key });
}

export function svgcageIsError(value) {
  return value instanceof SvgCageError;
}
