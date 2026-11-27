# Security Policy

## Supported versions

Only the latest published `1.x` release receives security fixes.

| Version | Supported |
| --- | --- |
| 1.x | Yes |
| Older than 1.0.0 | No |

## Reporting a vulnerability

Report suspected vulnerabilities privately through the GitHub Security Advisories workflow for `draarivpatel-ui/svgcage`. Do not open a public issue, pull request, or discussion with a working exploit payload.

Include:

- The exact package version and Node.js version
- Whether input reached `sanitizeSvg`, `auditSvg`, `validateSvg`, `isSafeSvg`, `assertSafeSvg`, or the CLI
- The complete options object, with secrets removed
- A minimal SVG or byte fixture, encoded as base64 or hex when control bytes matter
- The expected safe result and the actual result, output, or finding code
- Whether behavior differs between ESM and CommonJS or between operating systems

## Scope

In scope:

- Script execution or event-handler survival after sanitization
- `javascript:`, `vbscript:`, active data URL, or encoded scheme bypasses
- Mutation-XSS or parser differentials caused by canonical serialization
- XXE, DTD, entity expansion, or processing-instruction bypasses
- External resource fetching through SVG references or CSS
- Use expansion, cyclic use graphs, path command, depth, attribute, text, or output resource-cap bypasses
- Namespace confusion with security impact
- ESM and CommonJS behavior differences with security impact

Out of scope:

- Attacker-controlled memory spent before input reaches the library
- Resource use after a caller intentionally raises documented limits far above the defaults
- Rendering engine vulnerabilities that do not depend on a sanitization bypass
- Application-level access control after safe SVG output is displayed
- Reports requiring a modified Node.js runtime

## Hardening guidance

Keep `allowDataImages` and `allowStyleElements` off unless they are required. Use the smallest practical resource limits. Serve SVG as an image or inert markup with a restrictive Content Security Policy when possible. Treat text content as untrusted even when markup is safe.
