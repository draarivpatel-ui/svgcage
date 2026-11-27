# API notes

All public functions accept the same option object shape. `createSvgPolicy` validates and freezes it. Sanitization and audit share one parser and policy path so a caller cannot receive a permissive validation result for input that sanitization would reject.

`findings` is a bounded frozen array. `strippedElements` and `strippedAttributes` describe constructive removals. `stats` is a frozen object with parser, sanitizer, CSS, path, use-reference, input-byte, and output-byte counters.

Result and report objects are frozen as defense in depth. Treat them as read-only even in JavaScript runtimes with strict mode disabled.
