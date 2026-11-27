# Good first issues

These are bounded contribution ideas. None of them should weaken the default security policy.

## 1. Add benign SVG fixture coverage

Add small valid SVG fixtures that exercise gradients, markers, filters, text paths, clipping, masks, and transforms. Each fixture must have an expected canonical output and an idempotence assertion.

## 2. Expand TypeScript consumer checks

Add compile-time tests for every public option and result field. Include negative tests for unknown option keys if the TypeScript harness supports them.

## 3. Add aria and metadata attribute review

Review the safe use of accessibility and metadata attributes in SVG. Propose a small allowlist expansion only when no attribute can contain markup, script, URLs, or event behavior.

## 4. Add CLI fixture snapshots

Add deterministic CLI snapshots for safe input, hostile input, standard input, output-file mode, strict mode, and JSON mode across LF and CRLF input.

## 5. Add fuzz seeds for XML edge cases

Contribute malformed UTF-8, odd entity references, deep nesting, duplicate attributes, namespace rebindings, unterminated comments, and invalid XML declaration seeds. Keep seeds small and deterministic.

## 6. Add fuzz seeds for CSS edge cases

Contribute compact CSS seeds for strings, comments, functions, `url()`, selector combinators, malformed declarations, and numeric forms. A seed must never depend on network access or browser execution.

## 7. Benchmark parser and sanitizer throughput

Build a local benchmark that measures small, medium, and adversarial SVG throughput without adding dependencies. Report allocation and time behavior at default resource limits.

## 8. Improve finding documentation

Add one concise documentation example per stable finding code. Each example should show a minimal input, the security reason, and whether sanitization removes the construct or rejects the document.

## 9. Add alternate platform CI checks

Propose additional read-only platform coverage for current macOS or ARM runners. The Linux and Windows Node matrix must remain unchanged and required.

## 10. Review safe SVG feature gaps

Compare the element allowlist with the SVG specification and file a focused report on missing inert graphical elements. Do not include scripting, embedded HTML, external resource loading, or declarative navigation features.
