import { DEFAULT_SVG_POLICY, SVG_POLICY_KEYS } from './constants.mjs';
import { svgcageInvalidOptions } from './errors.mjs';

const OPTION_KEY_SET = new Set(SVG_POLICY_KEYS);
const BOOLEAN_OPTIONS = new Set([
  'allowDataImages',
  'allowStyleElements',
  'allowProcessingInstructions',
  'requireSvgNamespace'
]);

function minimumForIntegerOption(key) {
  if (key === 'maxBytes' || key === 'maxOutputBytes' || key === 'maxDepth' || key === 'maxElements' || key === 'maxNameLength' || key === 'maxFindings') return 1;
  return 0;
}

export function normalizeSvgPolicyOptions(input) {
  if (input === undefined || input === null) input = {};
  if (typeof input !== 'object' || Array.isArray(input)) {
    svgcageInvalidOptions('options must be a plain object');
  }
  const output = { ...DEFAULT_SVG_POLICY };
  for (const key of Object.keys(input)) {
    if (!OPTION_KEY_SET.has(key)) svgcageInvalidOptions('unknown svgcage option', key);
    if (input[key] !== undefined) output[key] = input[key];
  }
  for (const key of SVG_POLICY_KEYS) {
    const value = output[key];
    if (BOOLEAN_OPTIONS.has(key)) {
      if (typeof value !== 'boolean') svgcageInvalidOptions(key + ' must be a boolean', key);
      continue;
    }
    const minimum = minimumForIntegerOption(key);
    if (!Number.isSafeInteger(value) || value < minimum || value > 4294967295) {
      svgcageInvalidOptions(key + ' must be a safe integer within the supported range', key);
    }
  }
  return output;
}

export function mergeSvgPolicyOptions(base, overrides) {
  if (overrides === undefined || overrides === null) return normalizeSvgPolicyOptions(base);
  if (typeof overrides !== 'object' || Array.isArray(overrides)) {
    svgcageInvalidOptions('options must be a plain object');
  }
  return normalizeSvgPolicyOptions({ ...base, ...overrides });
}

export function createSvgPolicy(options) {
  const normalized = normalizeSvgPolicyOptions(options);
  return Object.freeze({ ...normalized });
}
