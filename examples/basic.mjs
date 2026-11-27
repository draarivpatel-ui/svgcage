import { auditSvg, sanitizeSvg } from '../src/index.mjs';

const input = '<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"><rect width="32" height="32" fill="#69c"/></svg>';
const result = sanitizeSvg(input);

console.log(result.svg);
console.log(result.findings.map((finding) => finding.code));
console.log(auditSvg(result.svg).safe);
