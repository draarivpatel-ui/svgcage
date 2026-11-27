import { createSvgPolicy, sanitizeSvg } from '../src/index.mjs';

const policy = createSvgPolicy({
  maxBytes: 64 * 1024,
  maxDepth: 16,
  maxUseExpansions: 100,
  requireSvgNamespace: true
});

const result = sanitizeSvg('<svg xmlns="http://www.w3.org/2000/svg"><circle cx="8" cy="8" r="8"/></svg>', policy);
console.log(result.svg);
