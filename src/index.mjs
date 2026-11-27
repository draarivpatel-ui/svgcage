import { SVGCAGE_VERSION, SVGCAGE_ERROR_CODES, SVGCAGE_FINDING_CODES, CODE, SEVERITY } from './constants.mjs';
import { SvgCageError } from './errors.mjs';
import { createSvgPolicy } from './policy.mjs';
import { sanitizeSvg, auditSvg, validateSvg, isSafeSvg, assertSafeSvg } from './api.mjs';

export {
  SVGCAGE_VERSION,
  SVGCAGE_ERROR_CODES,
  SVGCAGE_FINDING_CODES,
  CODE,
  SEVERITY,
  SvgCageError,
  createSvgPolicy,
  sanitizeSvg,
  auditSvg,
  validateSvg,
  isSafeSvg,
  assertSafeSvg
};

const svgcage = Object.freeze({
  SVGCAGE_VERSION,
  SVGCAGE_ERROR_CODES,
  SVGCAGE_FINDING_CODES,
  CODE,
  SEVERITY,
  SvgCageError,
  createSvgPolicy,
  sanitizeSvg,
  auditSvg,
  validateSvg,
  isSafeSvg,
  assertSafeSvg
});

export default svgcage;
