import test from 'node:test';
import { assert, auditSvg, codes, expectSafe, expectUnsafe, hasCode, sanitizeSvg, svgWrap } from './helpers.mjs';
import { sanitizeSvg as directSanitize, auditSvg as directAudit } from '../src/index.mjs';

const validDocuments = [
  '<svg/>',
  '<svg />',
  '<svg></svg>',
  '<svg><g><rect/></g></svg>',
  '<svg><rect width="1" height="2"/></svg>',
  "<svg><rect width='1'/></svg>",
  '<svg><text>abc</text></svg>',
  '<svg><text>Hello &amp; &lt;x&gt;</text></svg>',
  '<svg><text>&quot;&apos;</text></svg>',
  '<svg><text>&#65;&#x41;</text></svg>',
  '<svg><text><![CDATA[a<b&c]]></text></svg>',
  '<svg><!-- harmless --><rect/></svg>',
  '<svg><title>A title</title><desc>A description</desc></svg>',
  '<svg xml:space="preserve"><text> a </text></svg>',
  '<svg xml:lang="en"><text>hello</text></svg>',
  '<svg version="1.1" baseProfile="full"><circle cx="1" cy="2" r="3"/></svg>',
  '<svg viewBox="0 0 10 10"><path d="M0 0 L10 10"/></svg>',
  '<svg><text>Unicode π and emoji 😀</text></svg>',
  '<svg\n><rect\nwidth="1"\n/></svg\n>',
  '<svg><rect width="  1  "/></svg>'
];

for (const [index, input] of validDocuments.entries()) {
  test('parser accepts well-formed SVG document ' + index, () => {
    expectSafe(input);
  });
}

const declarations = [
  '<?xml version="1.0"?><svg/>',
  '<?xml version="1.0" encoding="UTF-8"?><svg/>',
  '<?xml version="1.0" encoding="utf-8"?><svg/>',
  "<?xml version='1.0' encoding='UTF-8'?><svg/>",
  '<?xml version="1.0" standalone="yes"?><svg/>',
  '<?xml version="1.0" standalone="no"?><svg/>',
  '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><svg/>',
  '<?xml version="1.0" encoding="UTF-8" standalone="no"?><svg/>',
  '<?xml version="1.0"  encoding="UTF-8"  ?><svg/>',
  '<?xml version="1.0"?>\n<svg/>'
];

for (const [index, input] of declarations.entries()) {
  test('parser accepts safe XML declaration ' + index, () => {
    const result = expectSafe(input);
    assert.ok(!result.svg.startsWith('<?xml'), 'XML declaration must not be copied into canonical output');
  });
}

const malformedDocuments = [
  '',
  ' ',
  '<svg>',
  '</svg>',
  '<svg></g>',
  '<svg><g></svg>',
  '<svg><g></g></svg><svg/>',
  'text<svg/>',
  '<svg/>text',
  '<svg><rect></svg>',
  '<svg><rect',
  '<svg><rect width="1"',
  '<svg><rect width=1/></svg>',
  '<svg><rect width="1></rect></svg>',
  '<svg><rect width="1"width="2"/></svg>',
  '<svg><rect width="1" width="1"/></svg>',
  '<svg><rect width="<"/></svg>',
  '<svg><rect/></svg',
  '<svg>< rect/></svg>',
  '<svg><rect //></svg>',
  '<svg><rect width:="1"/></svg>',
  '<svg><rect :width="1"/></svg>',
  '<svg><rect width::x="1"/></svg>',
  '<svg><rect x:width="1"/></svg>',
  '<svg><rect xmlns:="x"/></svg>',
  '<svg><rect xmlns:x=""/></svg>',
  '<svg xmlns:xml="wrong"/>',
  '<svg xmlns:p="http://www.w3.org/XML/1998/namespace"/>',
  '<svg xmlns:xmlns="http://www.w3.org/2000/xmlns/"/>',
  '<svg xmlns="http://www.w3.org/2000/xmlns/"/>',
  '<svg><!-- bad -- inside --></svg>',
  '<svg><!-- unterminated</svg>',
  '<svg><![CDATA[unterminated</svg>',
  '<svg>]]></svg>',
  '<svg><?pi unterminated</svg>'
];

for (const [index, input] of malformedDocuments.entries()) {
  test('parser rejects malformed XML document ' + index, () => {
    const report = auditSvg(input);
    assert.equal(report.safe, false);
    assert.ok(report.findings.length > 0);
    assert.ok(['SVGCAGE_MALFORMED_XML','SVGCAGE_INVALID_INPUT','SVGCAGE_DUPLICATE_ATTRIBUTE'].some((code) => codes(report).includes(code)), JSON.stringify(codes(report)));
    const result = sanitizeSvg(input);
    assert.equal(result.svg, '<svg xmlns="http://www.w3.org/2000/svg"/>');
  });
}

const badReferences = [
  '<svg><text>&bogus;</text></svg>',
  '<svg><text>&;</text></svg>',
  '<svg><text>&amp</text></svg>',
  '<svg><text>&#;</text></svg>',
  '<svg><text>&#x;</text></svg>',
  '<svg><text>&#x110000;</text></svg>',
  '<svg><text>&#0;</text></svg>',
  '<svg><text>&#xD800;</text></svg>',
  '<svg><text>&#xDFFF;</text></svg>',
  '<svg><text>&#xFFFE;</text></svg>',
  '<svg><text>&#xFFFF;</text></svg>',
  '<svg><text>&#xG;</text></svg>'
];

for (const [index, input] of badReferences.entries()) {
  test('parser rejects invalid or unknown entity reference ' + index, () => {
    const report = auditSvg(input);
    assert.equal(report.safe, false);
    assert.ok(codes(report).some((code) => code === 'SVGCAGE_UNKNOWN_ENTITY' || code === 'SVGCAGE_ILLEGAL_CHAR_REF' || code === 'SVGCAGE_MALFORMED_XML'), codes(report).join(','));
  });
}

test('numeric references decode and serialize canonically', () => {
  const result = expectSafe('<svg><text>&#65;&#x42;&amp;</text></svg>');
  assert.ok(result.svg.includes('AB&amp;'));
});

test('predefined entities decode and serialize canonically', () => {
  const result = expectSafe('<svg><text>&lt;&gt;&amp;&quot;&apos;</text></svg>');
  assert.ok(result.svg.includes('&lt;>&amp;"\''));
});

test('CDATA is converted to ordinary escaped text', () => {
  const result = expectSafe('<svg><text><![CDATA[x<y&z]]></text></svg>');
  assert.ok(result.svg.includes('x&lt;y&amp;z'));
  assert.ok(!result.svg.includes('CDATA'));
});

test('comments are removed without a finding', () => {
  const result = expectSafe('<svg><!--<script>alert(1)</script>--><rect/></svg>');
  assert.ok(!result.svg.includes('script'));
});

test('CRLF input normalizes but output remains deterministic', () => {
  const input = '<svg>\r\n<text>a\r\nb</text>\r\n</svg>';
  const first = sanitizeSvg(input);
  const second = sanitizeSvg(first.svg);
  assert.equal(second.svg, first.svg);
});

test('carriage return in text is serialized as a character reference', () => {
  const result = sanitizeSvg('<svg><text>a&#13;b</text></svg>');
  assert.ok(result.svg.includes('a&#13;b'));
});

test('attribute newline and tab normalize to spaces', () => {
  const result = expectSafe('<svg><rect width="1\t2" height="1\n2"/></svg>');
  assert.ok(result.svg.includes('width="1 2"'));
  assert.ok(result.svg.includes('height="1 2"'));
});

test('attribute entity expansion is decoded before validation', () => {
  const result = sanitizeSvg('<svg><rect width="&#49;"/></svg>');
  assert.ok(result.svg.includes('width="1"'));
});

test('input string may contain supplementary Unicode characters', () => {
  const result = expectSafe('<svg><text>😀𐍈</text></svg>');
  assert.ok(result.svg.includes('😀𐍈'));
});

test('lone high surrogate is rejected as malformed XML', () => {
  expectUnsafe('<svg><text>\ud800</text></svg>', 'SVGCAGE_MALFORMED_XML');
});

test('lone low surrogate is rejected as malformed XML', () => {
  expectUnsafe('<svg><text>\udc00</text></svg>', 'SVGCAGE_MALFORMED_XML');
});

test('NUL character is rejected as malformed XML', () => {
  expectUnsafe('<svg><text>\u0000</text></svg>', 'SVGCAGE_MALFORMED_XML');
});

test('vertical tab character is rejected as malformed XML', () => {
  expectUnsafe('<svg><text>\u000b</text></svg>', 'SVGCAGE_MALFORMED_XML');
});

test('form feed character is rejected as malformed XML', () => {
  expectUnsafe('<svg><text>\f</text></svg>', 'SVGCAGE_MALFORMED_XML');
});

test('ArrayBuffer input is decoded as UTF-8', () => {
  const bytes = new TextEncoder().encode('<svg><rect width="1"/></svg>');
  const report = auditSvg(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
  assert.equal(report.safe, true);
});

test('Uint8Array input is decoded as UTF-8', () => {
  const bytes = new TextEncoder().encode('<svg><rect width="1"/></svg>');
  assert.equal(auditSvg(bytes).safe, true);
});

test('DataView input is decoded as UTF-8', () => {
  const bytes = new TextEncoder().encode('<svg><rect width="1"/></svg>');
  assert.equal(auditSvg(new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)).safe, true);
});

test('UTF-8 BOM bytes are ignored by the byte decoder', () => {
  const bytes = new Uint8Array([0xef, 0xbb, 0xbf, ...new TextEncoder().encode('<svg/>')]);
  assert.equal(auditSvg(bytes).safe, true);
});

test('invalid UTF-8 continuation bytes are rejected', () => {
  expectUnsafe(new Uint8Array([0x3c, 0x73, 0x76, 0x67, 0x3e, 0xff, 0x3c, 0x2f, 0x73, 0x76, 0x67, 0x3e]), 'SVGCAGE_INVALID_UTF8');
});

test('truncated UTF-8 sequence is rejected', () => {
  expectUnsafe(new Uint8Array([0x3c, 0x73, 0x76, 0x67, 0x3e, 0xe2, 0x82, 0x3c, 0x2f, 0x73, 0x76, 0x67, 0x3e]), 'SVGCAGE_INVALID_UTF8');
});

test('UTF-16LE byte pattern is rejected', () => {
  const bytes = new Uint8Array([0x3c, 0, 0x73, 0, 0x76, 0, 0x67, 0, 0x2f, 0, 0x3e, 0]);
  expectUnsafe(bytes, 'SVGCAGE_INVALID_UTF8');
});

test('UTF-16BE byte pattern is rejected', () => {
  const bytes = new Uint8Array([0, 0x3c, 0, 0x73, 0, 0x76, 0, 0x67, 0, 0x2f, 0, 0x3e]);
  expectUnsafe(bytes, 'SVGCAGE_INVALID_UTF8');
});

test('unsupported input types are rejected with invalid input findings', () => {
  expectUnsafe(42, 'SVGCAGE_INVALID_INPUT');
});

test('null input is rejected with an invalid input finding', () => {
  expectUnsafe(null, 'SVGCAGE_INVALID_INPUT');
});

const exactLimitCases = [
  ['maxBytes', '<svg><rect width="123456"/></svg>', (input, n) => auditSvg(input, { maxBytes: n }).safe, input => input.length],
  ['maxDepth', '<svg><g><rect/></g></svg>', (input, n) => auditSvg(input, { maxDepth: n }).safe, () => 3],
  ['maxElements', '<svg><g><rect/></g></svg>', (input, n) => auditSvg(input, { maxElements: n }).safe, () => 3],
  ['maxAttributesPerElement', '<svg><rect width="1" height="2"/></svg>', (input, n) => auditSvg(input, { maxAttributesPerElement: n }).safe, () => 2],
  ['maxTotalAttributes', '<svg><rect width="1" height="2"/></svg>', (input, n) => auditSvg(input, { maxTotalAttributes: n }).safe, () => 2]
];

for (const [name, input, run, boundary] of exactLimitCases) {
  test(name + ' boundary accepts exactly at the cap', () => {
    assert.equal(run(input, boundary(input)), true);
  });
  test(name + ' boundary rejects one beyond the cap', () => {
    assert.equal(run(input, boundary(input) - 1), false);
  });
}

test('maxTextLength boundary accepts exactly at the cap', () => {
  assert.equal(auditSvg('<svg><text>abc</text></svg>', { maxTextLength: 3 }).safe, true);
});

test('maxTextLength boundary rejects one beyond the cap', () => {
  const report = auditSvg('<svg><text>abc</text></svg>', { maxTextLength: 2 });
  assert.equal(report.safe, false);
  assert.ok(hasCode(report, 'SVGCAGE_MAX_TEXT_LENGTH'));
});

test('maxAttributeLength boundary accepts exactly at the cap', () => {
  assert.equal(auditSvg('<svg><rect width="abc"/></svg>', { maxAttributeLength: 3 }).safe, true);
});

test('maxAttributeLength boundary rejects one beyond the cap', () => {
  const report = auditSvg('<svg><rect width="abc"/></svg>', { maxAttributeLength: 2 });
  assert.equal(report.safe, false);
  assert.ok(hasCode(report, 'SVGCAGE_MAX_ATTRIBUTE_LENGTH'));
});

test('maxNameLength boundary accepts exactly at the cap', () => {
  assert.equal(auditSvg('<svg><rect width="1"/></svg>', { maxNameLength: 5 }).safe, true);
});

test('maxNameLength boundary rejects one beyond the cap', () => {
  const report = auditSvg('<svg><rect width="1"/></svg>', { maxNameLength: 4 });
  assert.equal(report.safe, false);
  assert.ok(hasCode(report, 'SVGCAGE_MAX_NAME_LENGTH'));
});

test('maxComments boundary accepts exactly at the cap', () => {
  assert.equal(auditSvg('<svg><!--a--><!--b--></svg>', { maxComments: 2 }).safe, true);
});

test('maxComments boundary rejects one beyond the cap', () => {
  expectUnsafe('<svg><!--a--><!--b--></svg>', 'SVGCAGE_MAX_COMMENTS', { maxComments: 1 });
});

test('maxEntityReferences boundary accepts exactly at the cap', () => {
  assert.equal(auditSvg('<svg><text>&amp;&amp;</text></svg>', { maxEntityReferences: 2 }).safe, true);
});

test('maxEntityReferences boundary rejects one beyond the cap', () => {
  expectUnsafe('<svg><text>&amp;&amp;</text></svg>', 'SVGCAGE_MAX_ENTITY_REFERENCES', { maxEntityReferences: 1 });
});

test('maxExpandedTextBytes boundary accepts exactly at the cap', () => {
  assert.equal(auditSvg('<svg><text>&amp;&amp;</text></svg>', { maxExpandedTextBytes: 2 }).safe, true);
});

test('maxExpandedTextBytes boundary rejects one beyond the cap', () => {
  expectUnsafe('<svg><text>&amp;&amp;</text></svg>', 'SVGCAGE_MAX_EXPANDED_TEXT_BYTES', { maxExpandedTextBytes: 1 });
});

test('stats count elements, attributes, text, comments, entities and CDATA', () => {
  const report = auditSvg('<svg><!--x--><g a="1" unknown="2"><text>A&amp;<![CDATA[B]]></text></g></svg>');
  assert.equal(report.stats.elements, 3);
  assert.equal(report.stats.attributes, 2);
  assert.equal(report.stats.comments, 1);
  assert.equal(report.stats.cdataSections, 1);
  assert.equal(report.stats.entityReferences, 1);
  assert.ok(report.stats.textCharacters >= 2);
});

test('line and column are attached to parse findings', () => {
  const report = auditSvg('<svg>\n<rect width="<"/></svg>');
  const finding = report.findings[0];
  assert.equal(typeof finding.line, 'number');
  assert.equal(typeof finding.column, 'number');
  assert.ok(finding.line >= 2);
});

test('parser output does not depend on shell glob behavior or recursion', () => {
  let input = '<svg>';
  for (let index = 0; index < 25; index += 1) input += '<g>';
  input += '<rect/>';
  for (let index = 0; index < 25; index += 1) input += '</g>';
  input += '</svg>';
  const result = expectSafe(input);
  assert.equal(result.stats.maxDepthObserved, 27);
});
