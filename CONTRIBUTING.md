# Contributing to svgcage

Thanks for helping improve a zero-dependency security library.

## Ground rules

- Keep runtime dependencies and devDependencies empty.
- Keep Node 18 compatibility.
- Fail closed when SVG, XML, CSS, namespace, or URL behavior is ambiguous.
- Do not weaken an existing default to make a payload parse.
- Keep ESM sources in `src/*.mjs` as the single source of truth.
- Never edit `cjs/index.cjs` directly. Run `node scripts/build-cjs.mjs` after changing the source.
- Keep public API behavior, TypeScript definitions, CLI behavior, and documentation in sync.

## Local verification

Run all of these before opening a pull request:

```sh
npm test
node scripts/build-cjs.mjs --check
node scripts/cli-smoke.mjs
npm pack --dry-run
```

The test runner intentionally uses explicit cross-platform file discovery in `scripts/run-tests.mjs` rather than shell glob expansion.

## Tests

Every security fix needs a regression test. Add both positive and negative cases when changing parser behavior:

- A hostile payload must be rejected or neutralized for the reason intended.
- A safe control SVG must remain accepted.
- If behavior is part of the public API, test it through both ESM and CommonJS.
- If the change affects a resource limit, test exactly at the boundary and one unit beyond it.
- If output is serialized, test idempotence with a second sanitize pass.

## Code style

Use compact dependency-free modern JavaScript. Keep document traversal iterative. Validate resource limits before allocating attacker-controlled output. Use null-prototype objects for parsed attribute maps and tree nodes. Finding codes are stable once published.
