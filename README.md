# svgcage

Zero-dependency SVG security sanitization, strict XML parsing, auditing, and canonical serialization for Node.js.

`svgcage` is a fail-closed boundary for untrusted SVG. It treats SVG as active content rather than as a passive image format. The default policy blocks script execution, event handlers, `foreignObject`, embedded HTML and media elements, DTD and entity markup, processing instructions, external resource fetching, active URL schemes, unsafe CSS, namespace confusion, resource exhaustion, coordinate abuse, path bombs, and recursive `<use>` amplification.

The library ships ESM, CommonJS, TypeScript declarations, and a CLI from one audited source tree. It has zero runtime dependencies and zero devDependencies. The deterministic suite contains more than 600 tests.

## Publication status

This repository is prepared for npm publication, but publication is a separate release step. Do not assume that the npm name is live merely because this README exists. From a source checkout, verify the package with:

```sh
npm test
node scripts/build-cjs.mjs --check
node scripts/cli-smoke.mjs
npm pack --dry-run
```

Node 18 or newer is required.

## Threat model

SVG can execute script, load external resources, include HTML through `foreignObject`, animate attributes into dangerous states, reference filter and paint servers through CSS, and amplify small documents through nested `<use>` shadow trees. XML adds DTD, entity, processing-instruction, encoding, and parser-differential risks.

`svgcage` therefore does not use regex substitution as its sanitizer. It uses a bounded XML tokenizer, a namespace-aware tree builder, a strict SVG allowlist, CSS and URI validators, static use-graph analysis, and canonical re-serialization. Output is generated from the sanitized tree, so hostile input markup is never copied through unchanged.

### Covered attacks

| Attack | CWE | Defense |
| --- | --- | --- |
| `<script>`, event attributes, `foreignObject`, embedded HTML or media | CWE-79 | Script-capable elements are removed with their subtrees. Every namespace-stripped `on*` attribute is removed case-insensitively. |
| `javascript:`, `vbscript:`, `data:text/html`, `data:image/svg+xml`, whitespace-padded and percent-encoded schemes | CWE-79 | URL values are entity-decoded by the XML parser, normalized, repeatedly probed for encoded schemes, and rejected before serialization. |
| XXE, DTD, parameter entities, Billion Laughs | CWE-611, CWE-776 | DOCTYPE and every DTD declaration are rejected. Custom entities never exist or expand. Numeric references and expanded bytes are capped. |
| `xml-stylesheet` and processing instructions | CWE-79 | Processing instructions are rejected by default and never serialized. `xml-stylesheet` is always forbidden. |
| External images, use targets, filter references, paint servers, CSS `url()`, and `@import` | CWE-918 | Only strict same-document `#fragment` and `url(#fragment)` references are allowed by default. Optional raster data images are limited to canonical base64 PNG, JPEG, and WebP. |
| CSS expression, behavior, binding, escapes, unknown functions, and import injection | CWE-79 | Inline CSS is parsed into declarations. Properties and functions are allowlisted. CSS escape sequences, at-rules, external URLs, active functions, comments tricks, and unknown properties are dropped. |
| Recursive or exponential `<use>` expansion | CWE-400 | The use-reference graph is statically analyzed. Cycles are removed and total expansion weight is capped by `maxUseExpansions`. |
| Depth, element, attribute, text, output, path-command, and coordinate bombs | CWE-400 | Input and output byte limits, parse limits, path command limits, and numeric magnitude limits are enforced before output allocation where possible. NUL bytes, invalid XML characters, invalid UTF-8, and lone surrogates are rejected. |
| Namespace and case parser differentials | CWE-79 | Namespace-resolved duplicate attributes are rejected. Output uses unprefixed SVG elements, one root SVG namespace, canonical `href`, and no attacker-controlled namespace declarations. Attributes differing only by ASCII case are removed. |

## Quick start

```js
import { sanitizeSvg, auditSvg, validateSvg } from 'svgcage';

const input = '<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"><rect width="10" height="10"/></svg>';

const result = sanitizeSvg(input);
console.log(result.svg);
console.log(result.findings);

const report = auditSvg(input);
if (!report.safe) {
  console.error(report.findings[0]);
}

console.log(validateSvg(result.svg));
```

When imported from a source checkout rather than an installed package, use a relative path to `src/index.mjs` or `cjs/index.cjs`.

## API

### `sanitizeSvg(input, options)`

Returns an immutable result object:

```js
{
  svg,
  changed,
  strippedElements,
  strippedAttributes,
  findings,
  stats
}
```

`input` may be a string, `Uint8Array`, `ArrayBuffer`, or another ArrayBuffer view. Bytes must be well-formed UTF-8. The output is canonical XML SVG. Serializing a second time is idempotent:

```js
const first = sanitizeSvg(input);
const second = sanitizeSvg(first.svg);
second.svg === first.svg;
```

Malformed or disallowed input fails closed. The fallback output is an empty SVG root whenever the configured output byte cap can hold it. Caller configuration errors, such as unknown option keys, still throw `SvgCageError` immediately.

### `auditSvg(input, options)`

Returns `{ safe, findings, stats }` without changing the caller's input. The audit uses the same parser, policy engine, resource limits, and serializer checks as sanitization. Findings use stable `SVGCAGE_*` codes and include a `severity` of `critical`, `high`, `medium`, or `low`.

### `validateSvg(input, options)` and `isSafeSvg(input, options)`

Return a boolean equivalent to `auditSvg(input, options).safe`.

### `assertSafeSvg(input, options)`

Returns the audit report when safe. Throws an `SvgCageError` with `findings` and `stats` when unsafe.

### `createSvgPolicy(options)`

Returns a frozen, fully normalized policy object. Unknown keys, non-boolean feature flags, and out-of-range integer limits throw `SVGCAGE_INVALID_OPTIONS`. The object can be passed as the options argument to every public API.

## Options and defaults

| Option | Default | Meaning |
| --- | ---: | --- |
| `allowDataImages` | `false` | Allow canonical base64 PNG, JPEG, and WebP data URLs on `image` and `feImage`. SVG data URLs remain forbidden. |
| `allowStyleElements` | `false` | Allow strictly sanitized SVG style elements with a limited selector subset. Inline style attributes are always parsed and sanitized. |
| `allowProcessingInstructions` | `false` | Parse non-XML processing instructions before stripping them. `xml-stylesheet` is always forbidden. |
| `requireSvgNamespace` | `false` | Require the root to use `http://www.w3.org/2000/svg`. Without this option, namespace-less fragments are accepted and canonicalized into the SVG namespace. |
| `maxBytes` | `1048576` | Maximum input byte length. |
| `maxOutputBytes` | `1048576` | Maximum serialized output byte length. |
| `maxDepth` | `32` | Maximum element nesting depth. |
| `maxElements` | `10000` | Maximum element count. |
| `maxAttributesPerElement` | `64` | Maximum attributes on one element. |
| `maxTotalAttributes` | `25000` | Maximum attributes in the document. |
| `maxAttributeLength` | `8192` | Maximum decoded attribute value length. |
| `maxTextLength` | `65536` | Maximum text node or CDATA length. |
| `maxNameLength` | `256` | Maximum XML or entity name length. |
| `maxComments` | `1000` | Maximum comments before rejection. Comments are never serialized. |
| `maxEntityReferences` | `10000` | Maximum predefined or numeric references. |
| `maxExpandedTextBytes` | `1048576` | Maximum decoded reference expansion bytes. |
| `maxProcessingInstructions` | `1000` | Maximum processing instructions. |
| `maxUseExpansions` | `1000` | Maximum static `<use>` expansion weight. Cycles are always removed. |
| `maxPathCommands` | `5000` | Maximum path command letters in one path attribute. |
| `maxCoordinateValue` | `1000000` | Maximum absolute numeric coordinate or geometry magnitude. |
| `maxDataImageBytes` | `262144` | Maximum decoded raster data-image bytes. |
| `maxFindings` | `1024` | Maximum collected findings. |

## CLI

```sh
svgcage audit input.svg --json
svgcage validate input.svg
svgcage sanitize input.svg --out safe.svg
cat input.svg | svgcage sanitize - --strict
```

Commands are `audit`, `sanitize`, and `validate`. Use `-` for standard input. Options are `--json`, `--out FILE`, `--max-bytes N`, and `--strict`. Strict mode requires the SVG root namespace and keeps every optional feature disabled.

Exit codes:

- `0`: input is safe under the selected policy
- `1`: unsafe findings were reported
- `2`: usage, file, or input-output error

A sanitize run writes the sanitized output even when it exits `1`, because the output itself has been neutralized. The nonzero status warns the caller that the input was not already safe.

## Finding codes

Important stable codes include:

- `SVGCAGE_SCRIPT_ELEMENT`
- `SVGCAGE_FOREIGN_OBJECT_ELEMENT`
- `SVGCAGE_EMBEDDED_CONTENT_ELEMENT`
- `SVGCAGE_EVENT_HANDLER_ATTRIBUTE`
- `SVGCAGE_DANGEROUS_URI_SCHEME`
- `SVGCAGE_EXTERNAL_REFERENCE`
- `SVGCAGE_DATA_URI_FORBIDDEN`
- `SVGCAGE_DATA_SVG_FORBIDDEN`
- `SVGCAGE_DOCTYPE_FORBIDDEN`
- `SVGCAGE_ENTITY_FORBIDDEN`
- `SVGCAGE_PROCESSING_INSTRUCTION_FORBIDDEN`
- `SVGCAGE_UNKNOWN_ENTITY`
- `SVGCAGE_NAMESPACE_FORBIDDEN`
- `SVGCAGE_ELEMENT_NOT_ALLOWED`
- `SVGCAGE_ATTRIBUTE_NOT_ALLOWED`
- `SVGCAGE_CSS_INVALID`
- `SVGCAGE_CSS_EXTERNAL_REFERENCE`
- `SVGCAGE_CSS_DANGEROUS_CONSTRUCT`
- `SVGCAGE_ANIMATION_HREF_TARGET`
- `SVGCAGE_ANIMATION_EVENT_TARGET`
- `SVGCAGE_ANIMATION_DANGEROUS_VALUE`
- `SVGCAGE_USE_CYCLE`
- `SVGCAGE_USE_AMPLIFICATION`
- `SVGCAGE_USE_MISSING_TARGET`
- `SVGCAGE_MAX_BYTES`
- `SVGCAGE_MAX_OUTPUT_BYTES`
- `SVGCAGE_MAX_DEPTH`
- `SVGCAGE_MAX_ELEMENTS`
- `SVGCAGE_MAX_ATTRIBUTES_PER_ELEMENT`
- `SVGCAGE_MAX_ATTRIBUTE_LENGTH`
- `SVGCAGE_MAX_TEXT_LENGTH`
- `SVGCAGE_MAX_USE_EXPANSIONS`
- `SVGCAGE_MAX_PATH_COMMANDS`
- `SVGCAGE_MAX_COORDINATE_VALUE`
- `SVGCAGE_MALFORMED_XML`
- `SVGCAGE_INVALID_UTF8`

The complete frozen map is exported as `SVGCAGE_ERROR_CODES` and `SVGCAGE_FINDING_CODES`.

## Security and contribution

See `SECURITY.md`, `CONTRIBUTING.md`, `CODE_OF_CONDUCT.md`, `CHANGELOG.md`, and `docs/THREAT_MODEL.md`.
