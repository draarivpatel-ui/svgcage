# Security policy

## Reporting a vulnerability

Use the private GitHub Security Advisory form at [Report a vulnerability](https://github.com/draarivpatel-ui/svgcage/security/advisories/new). Do not open a public issue, pull request or discussion with exploit details.

Never include a live secret, token, cookie, private key, victim hostname or proprietary payload in a report. Use synthetic values and redacted transcripts.

## Supported versions

| Version | Status |
| --- | --- |
| 1.x | Supported |

Security fixes are applied to the latest release line.

## Scope

This policy covers SVG sanitization, strict XML parsing, auditing, canonical serialization and CLI output.

In scope:

- Script execution, event handlers, foreignObject, active URL schemes or dangerous CSS surviving sanitization.
- XXE, DTD, entity expansion, processing instruction or namespace confusion bypasses.
- External resource fetching, unsafe data URLs, use graph cycles or amplification bypasses.
- Input, output, depth, attribute, path or coordinate resource cap bypasses.

Out of scope:

- Browser or rendering engine vulnerabilities that do not depend on a sanitization bypass.
- Resource use caused by caller configurations far above documented safe defaults.
- Application access control after sanitized SVG is displayed.

## Coordinated disclosure

- Acknowledgment: within 48 hours.
- Initial assessment: within 7 calendar days.
- Fix or mitigation plan: within 30 calendar days for confirmed high-impact reports.
- Coordinated public disclosure: up to 90 days by default, adjusted by mutual agreement when exploitation or user risk requires a different date.
