# svgcage threat model

`svgcage` treats SVG as active content, not as a passive image format. It assumes input may be crafted to exploit XML parser features, SVG resource references, CSS parsing, browser parser differences, or expansion behavior in SVG use shadow trees.

The security boundary is a strict XML tokenizer, a namespace-aware tree builder, a conservative SVG allowlist, CSS and URI validators, static use-graph analysis, and canonical re-serialization. Regular expressions may assist lexical classification, but no security decision is made by regex substitution alone.

The default output contains no scripts, events, foreignObject content, embedded HTML or media elements, DTD markup, processing instructions, comments, external resource references, active schemes, external CSS references, or recursive use expansion. The only references allowed by default are same-document fragments with strict ASCII identifiers.

Optional raster data images are limited to canonical base64 PNG, JPEG, and WebP payloads. SVG data images are never allowed. Optional style elements use a strict selector subset, a presentation-property allowlist, and the same URL restrictions as presentation attributes.
