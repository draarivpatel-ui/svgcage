import test from 'node:test';
import { assert, auditSvg, codes, expectSafe, expectUnsafe, hasCode, sanitizeSvg, svgWrap } from './helpers.mjs';

const namespaceSafe = [
  '<svg><rect/></svg>',
  '<svg xmlns="http://www.w3.org/2000/svg"><rect/></svg>',
  '<s:svg xmlns:s="http://www.w3.org/2000/svg"><s:rect/></s:svg>',
  '<svg xmlns="http://www.w3.org/2000/svg"><g><rect/></g></svg>',
  '<svg xmlns="http://www.w3.org/2000/svg"><svg><rect/></svg></svg>',
  '<svg xmlns="http://www.w3.org/2000/svg" xml:space="preserve" xml:lang="en"><text>x</text></svg>',
  '<svg><rect xmlns:xlink="http://www.w3.org/1999/xlink"/></svg>'
];

for (const [index, input] of namespaceSafe.entries()) {
  test('safe namespace form canonicalizes without findings ' + index, () => {
    const result = expectSafe(input);
    assert.ok(result.svg.startsWith('<svg xmlns="http://www.w3.org/2000/svg"'));
    assert.ok(!result.svg.includes('xmlns:xlink'));
  });
}

test('strict mode accepts the SVG namespace', () => {
  expectSafe('<svg xmlns="http://www.w3.org/2000/svg"><rect/></svg>', { requireSvgNamespace: true });
});

test('strict mode rejects a namespace-less fragment', () => {
  expectUnsafe('<svg><rect/></svg>', 'SVGCAGE_SVG_NAMESPACE_REQUIRED', { requireSvgNamespace: true });
});

test('wrong root namespace is rejected', () => {
  expectUnsafe('<svg xmlns="urn:evil"><rect/></svg>', 'SVGCAGE_NAMESPACE_FORBIDDEN');
});

test('HTML namespace root is rejected', () => {
  expectUnsafe('<svg xmlns="http://www.w3.org/1999/xhtml"><rect/></svg>', 'SVGCAGE_NAMESPACE_FORBIDDEN');
});

test('foreign namespace child is stripped in an SVG document', () => {
  const input = '<svg xmlns="http://www.w3.org/2000/svg" xmlns:e="urn:evil"><e:rect/></svg>';
  const result = expectUnsafe(input, 'SVGCAGE_NAMESPACE_FORBIDDEN');
  assert.ok(!result.svg.includes('e:rect'));
});

test('namespace rebinding to no namespace is stripped in an SVG document', () => {
  const input = '<svg xmlns="http://www.w3.org/2000/svg"><g xmlns=""><rect/></g></svg>';
  const result = expectUnsafe(input, 'SVGCAGE_NAMESPACE_FORBIDDEN');
  assert.ok(!result.svg.includes('<g'));
});

test('namespace-less fragment accepts namespace-less children', () => {
  expectSafe('<svg><g><rect/></g></svg>');
});

test('explicit SVG child inside a namespace-less fragment is accepted', () => {
  expectSafe('<svg><g xmlns="http://www.w3.org/2000/svg"><rect/></g></svg>');
});

test('prefixed SVG child canonicalizes to an unprefixed SVG element', () => {
  const input = '<svg xmlns="http://www.w3.org/2000/svg" xmlns:s="http://www.w3.org/2000/svg"><s:g><s:rect width="1"/></s:g></svg>';
  const result = expectSafe(input);
  assert.ok(result.svg.includes('<g><rect width="1"/></g>'));
  assert.ok(!result.svg.includes('s:rect'));
});

test('unbound element prefix is malformed XML', () => {
  expectUnsafe('<svg><x:rect/></svg>', 'SVGCAGE_MALFORMED_XML');
});

test('unbound attribute prefix is malformed XML', () => {
  expectUnsafe('<svg><rect x:href="#a"/></svg>', 'SVGCAGE_MALFORMED_XML');
});

test('fake xlink namespace is stripped', () => {
  const input = '<svg xmlns:xlink="urn:evil"><use xlink:href="javascript:alert(1)"/></svg>';
  expectUnsafe(input, 'SVGCAGE_NAMESPACE_FORBIDDEN');
});

test('real xlink namespace is accepted for href migration', () => {
  const input = '<svg xmlns:xlink="http://www.w3.org/1999/xlink"><g id="a"/><use xlink:href="#a"/></svg>';
  expectSafe(input);
});

test('prefixed non-href SVG-namespace attribute is stripped as namespace confusion', () => {
  const input = '<svg xmlns:s="http://www.w3.org/2000/svg"><rect s:width="1"/></svg>';
  expectUnsafe(input, 'SVGCAGE_NAMESPACE_FORBIDDEN');
});

test('foreign namespaced inert attribute is stripped', () => {
  const input = '<svg xmlns:e="urn:evil"><rect e:width="1"/></svg>';
  expectUnsafe(input, 'SVGCAGE_NAMESPACE_FORBIDDEN');
});

test('xml prefix cannot be rebound', () => {
  expectUnsafe('<svg xmlns:xml="urn:evil"/>', 'SVGCAGE_MALFORMED_XML');
});

test('reserved XML namespace cannot bind to another prefix', () => {
  expectUnsafe('<svg xmlns:p="http://www.w3.org/XML/1998/namespace"/>', 'SVGCAGE_MALFORMED_XML');
});

test('xmlns prefix cannot be rebound', () => {
  expectUnsafe('<svg xmlns:xmlns="http://www.w3.org/2000/xmlns/"/>', 'SVGCAGE_MALFORMED_XML');
});

test('prefixed namespace binding cannot be empty', () => {
  expectUnsafe('<svg xmlns:p=""/>', 'SVGCAGE_MALFORMED_XML');
});

test('namespace URI containing whitespace is malformed', () => {
  expectUnsafe('<svg xmlns:p="urn:evil evil"><p:rect/></svg>', 'SVGCAGE_MALFORMED_XML');
});

test('xml:space values are constrained', () => {
  expectUnsafe('<svg xml:space="evil"/>', 'SVGCAGE_ATTRIBUTE_NOT_ALLOWED');
});

test('unknown xml namespace attribute is stripped', () => {
  expectUnsafe('<svg xml:evil="x"/>', 'SVGCAGE_ATTRIBUTE_NOT_ALLOWED');
});

test('root element that is not svg is rejected', () => {
  expectUnsafe('<html><body/></html>', 'SVGCAGE_ROOT_NOT_SVG');
});

test('uppercase SVG root is not the svg element', () => {
  expectUnsafe('<SVG/>', 'SVGCAGE_ROOT_NOT_SVG');
});

test('mixed case graphical element is not in the exact SVG allowlist', () => {
  expectUnsafe(svgWrap('<RECT width="1"/>'), 'SVGCAGE_ELEMENT_NOT_ALLOWED');
});

const validIds = ['a', 'icon', 'icon-1', 'icon_1', 'icon.1', 'A9', '_a'];
for (const id of validIds) {
  test('strict safe id is accepted: ' + id, () => {
    expectSafe(svgWrap('<g id="' + id + '"/><use href="#' + id + '"/>'));
  });
}

const invalidIds = ['1a', '-a', '.a', 'x:y', 'a b', 'a;b', 'a<b', 'a\\b', 'é'];
for (const id of invalidIds) {
  test('unsafe id is rejected: ' + JSON.stringify(id), () => {
    const encoded = id.replace(/</g, '&lt;');
    expectUnsafe(svgWrap('<g id="' + encoded + '"/>'), 'SVGCAGE_INVALID_ID');
  });
}

test('duplicate id is stripped from the later element', () => {
  const input = svgWrap('<g id="a"/><rect id="a" width="1"/><use href="#a"/>');
  const result = expectUnsafe(input, 'SVGCAGE_DUPLICATE_ID');
  assert.equal((result.svg.match(/id="a"/g) || []).length, 1);
});

test('local fragment punctuation is restricted', () => {
  expectUnsafe(svgWrap('<use href="#a%20b"/>'), 'SVGCAGE_INVALID_FRAGMENT');
});

const dtdPayloads = [
  ['<!DOCTYPE svg><svg/>', 'SVGCAGE_DOCTYPE_FORBIDDEN'],
  ['<!DOCTYPE svg SYSTEM "http://evil.example/x.dtd"><svg/>', 'SVGCAGE_DOCTYPE_FORBIDDEN'],
  ['<!DOCTYPE svg [<!ENTITY xxe SYSTEM "file:///etc/passwd">]><svg><text>&xxe;</text></svg>', 'SVGCAGE_DOCTYPE_FORBIDDEN'],
  ['<!DOCTYPE svg [<!ENTITY % pe "<!ENTITY xxe SYSTEM \'file:///etc/passwd\'>">%pe;]><svg/>', 'SVGCAGE_DOCTYPE_FORBIDDEN'],
  ['<!DOCTYPE svg [<!ELEMENT svg ANY>]><svg/>', 'SVGCAGE_DOCTYPE_FORBIDDEN'],
  ['<!DOCTYPE svg [<!ATTLIST svg onload CDATA #IMPLIED>]><svg/>', 'SVGCAGE_DOCTYPE_FORBIDDEN'],
  ['<!DOCTYPE svg [<!NOTATION x SYSTEM "x">]><svg/>', 'SVGCAGE_DOCTYPE_FORBIDDEN'],
  ['<!doctype svg><svg/>', 'SVGCAGE_DOCTYPE_FORBIDDEN'],
  ['<!ENTITY xxe SYSTEM "file:///etc/passwd"><svg/>', 'SVGCAGE_ENTITY_FORBIDDEN'],
  ['<!ELEMENT svg ANY><svg/>', 'SVGCAGE_ELEMENT_DECLARATION_FORBIDDEN'],
  ['<!ATTLIST svg onload CDATA #IMPLIED><svg/>', 'SVGCAGE_ATTLIST_FORBIDDEN'],
  ['<!NOTATION x SYSTEM "x"><svg/>', 'SVGCAGE_NOTATION_FORBIDDEN']
];

for (const [index, [input, code]] of dtdPayloads.entries()) {
  test('DTD and XXE declaration is rejected ' + index, () => {
    const result = expectUnsafe(input, code);
    assert.equal(result.svg, '<svg xmlns="http://www.w3.org/2000/svg"/>');
  });
}

test('billion laughs style entity expansion cannot start because DTD is forbidden', () => {
  let entities = '<!ENTITY a "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa">';
  for (let index = 0; index < 8; index += 1) entities += '<!ENTITY b' + index + ' "&a;&a;&a;&a;&a;&a;&a;&a;">';
  const input = '<!DOCTYPE svg [' + entities + ']><svg><text>&b7;</text></svg>';
  expectUnsafe(input, 'SVGCAGE_DOCTYPE_FORBIDDEN');
});

test('unknown custom entity reference is rejected without a DTD', () => {
  expectUnsafe('<svg><text>&xxe;</text></svg>', 'SVGCAGE_UNKNOWN_ENTITY');
});

const piPayloads = [
  '<?xml-stylesheet href="https://evil.example/x.css"?><svg/>',
  '<?xml-stylesheet type="text/css" href="data:text/css,body{fill:red}"?><svg/>',
  '<svg><?xml-stylesheet href="https://evil.example/x.css"?></svg>',
  '<svg><?php echo 1 ?></svg>',
  '<svg><?xmlfoo x?></svg>',
  '<svg><?pi javascript:alert(1)?></svg>'
];

for (const [index, input] of piPayloads.entries()) {
  test('processing instruction attack is rejected ' + index, () => {
    expectUnsafe(input, 'SVGCAGE_PROCESSING_INSTRUCTION_FORBIDDEN');
  });
}

test('ordinary processing instructions can be parsed but are stripped when explicitly allowed', () => {
  const report = auditSvg('<svg><?pi harmless?></svg>', { allowProcessingInstructions: true });
  assert.equal(report.safe, true);
  const result = sanitizeSvg('<svg><?pi harmless?></svg>', { allowProcessingInstructions: true });
  assert.ok(!result.svg.includes('<?pi'));
});

test('xml-stylesheet remains forbidden even when processing instructions are allowed', () => {
  expectUnsafe('<svg><?xml-stylesheet href="x"?></svg>', 'SVGCAGE_PROCESSING_INSTRUCTION_FORBIDDEN', { allowProcessingInstructions: true });
});

test('processing instruction count cap is enforced when parsing is allowed', () => {
  expectUnsafe('<svg><?a x?><?b x?></svg>', 'SVGCAGE_MAX_PROCESSING_INSTRUCTIONS', { allowProcessingInstructions: true, maxProcessingInstructions: 1 });
});

const cycleCases = [
  ['self cycle', '<svg><g id="a"><use href="#a"/></g><use href="#a"/></svg>'],
  ['two node cycle', '<svg><g id="a"><use href="#b"/></g><g id="b"><use href="#a"/></g><use href="#a"/></svg>'],
  ['three node cycle', '<svg><g id="a"><use href="#b"/></g><g id="b"><use href="#c"/></g><g id="c"><use href="#a"/></g><use href="#a"/></svg>'],
  ['nested direct cycle', '<svg><g id="a"><g><use href="#a"/></g></g><use href="#a"/></svg>'],
  ['cycle through symbol', '<svg><symbol id="s"><use href="#s"/></symbol><use href="#s"/></svg>'],
  ['cycle through nested group chain', '<svg><g id="a"><g id="b"><use href="#a"/></g></g><use href="#b"/></svg>']
];

for (const [label, input] of cycleCases) {
  test('use cycle bomb is neutralized: ' + label, () => {
    const result = expectUnsafe(input, 'SVGCAGE_USE_CYCLE');
    assert.ok(!result.svg.includes('<use'));
    const second = sanitizeSvg(result.svg);
    assert.equal(second.svg, result.svg);
  });
}

test('noncyclic use chain survives', () => {
  const input = '<svg><g id="a"><rect width="1"/></g><g id="b"><use href="#a"/></g><use href="#b"/></svg>';
  const result = expectSafe(input);
  assert.ok((result.svg.match(/<use/g) || []).length === 2);
});

test('missing use target is removed', () => {
  const result = expectUnsafe(svgWrap('<use href="#missing"/>'), 'SVGCAGE_USE_MISSING_TARGET');
  assert.ok(!result.svg.includes('<use'));
});

test('use target removed as hostile leads to missing target removal', () => {
  const result = expectUnsafe(svgWrap('<script id="a"/><use href="#a"/>'), 'SVGCAGE_SCRIPT_ELEMENT');
  assert.ok(!result.svg.includes('<use'));
});

function amplificationDocument(depth, width) {
  let defs = '';
  for (let level = 0; level < depth; level += 1) {
    const target = level === depth - 1 ? null : 'g' + (level + 1);
    const uses = target === null ? '<rect width="1"/>' : Array.from({ length: width }, () => '<use href="#' + target + '"/>').join('');
    defs += '<g id="g' + level + '">' + uses + '</g>';
  }
  return '<svg>' + defs + '<use href="#g0"/></svg>';
}

for (const [depth, width, cap] of [[2, 2, 20], [3, 2, 40], [4, 2, 80], [5, 2, 160], [3, 3, 80], [4, 3, 160]]) {
  test('use amplification below or near configured cap is bounded depth ' + depth + ' width ' + width, () => {
    const input = amplificationDocument(depth, width);
    const report = auditSvg(input, { maxUseExpansions: cap });
    if (!report.safe) assert.ok(hasCode(report, 'SVGCAGE_USE_AMPLIFICATION'));
    assert.ok(report.stats.useExpansions <= cap + 1);
  });
}

for (const cap of [10, 20, 40]) {
  test('doubling use amplification bomb exceeds a small cap ' + cap, () => {
    const report = auditSvg(amplificationDocument(6, 2), { maxUseExpansions: cap });
    assert.equal(report.safe, false);
    assert.ok(hasCode(report, 'SVGCAGE_USE_AMPLIFICATION'));
    const result = sanitizeSvg(amplificationDocument(6, 2), { maxUseExpansions: cap });
    assert.ok(!result.svg.includes('<use'));
  });
}

test('default cap catches a deep doubling use bomb', () => {
  const report = auditSvg(amplificationDocument(10, 2));
  assert.equal(report.safe, false);
  assert.ok(hasCode(report, 'SVGCAGE_USE_AMPLIFICATION'));
});

test('use expansion counter is present for safe use graphs', () => {
  const report = auditSvg('<svg><g id="a"><rect width="1"/></g><use href="#a"/></svg>');
  assert.equal(report.stats.useReferences, 1);
  assert.ok(report.stats.useExpansions > 0);
});

const pathCases = [
  ['safe simple path', '<svg><path d="M0 0 L10 10 Z"/></svg>', true],
  ['safe cubic path', '<svg><path d="M0 0 C1 1 2 2 3 3"/></svg>', true],
  ['many commands within cap', '<svg><path d="' + 'M0 0 L1 1 '.repeat(10) + '"/></svg>', true],
  ['huge coordinate', '<svg><path d="M0 0 L1000000000 1"/></svg>', false],
  ['huge exponent coordinate', '<svg><path d="M0 0 L1e999 1"/></svg>', false],
  ['negative huge coordinate', '<svg><path d="M0 0 L-1000000000 1"/></svg>', false]
];

for (const [label, input, safe] of pathCases) {
  test('path resource validation: ' + label, () => {
    const report = auditSvg(input);
    assert.equal(report.safe, safe);
    if (!safe) assert.ok(hasCode(report, 'SVGCAGE_MAX_COORDINATE_VALUE'));
  });
}

test('path command cap is enforced', () => {
  const d = 'M0 0 ' + 'L1 1 '.repeat(20);
  expectUnsafe('<svg><path d="' + d + '"/></svg>', 'SVGCAGE_MAX_PATH_COMMANDS', { maxPathCommands: 20 });
});

test('path command counter is populated', () => {
  const report = auditSvg('<svg><path d="M0 0 L1 1 Z"/></svg>');
  assert.equal(report.stats.pathCommands, 3);
});

const coordinateAttributes = ['width', 'height', 'x', 'y', 'cx', 'cy', 'r', 'stroke-width'];
for (const name of coordinateAttributes) {
  test('huge numeric coordinate is stripped from ' + name, () => {
    expectUnsafe(svgWrap('<rect ' + name + '="1000000000000"/>'), 'SVGCAGE_MAX_COORDINATE_VALUE');
  });
}

for (const name of coordinateAttributes) {
  test('exponent-overflow numeric coordinate is stripped from ' + name, () => {
    expectUnsafe(svgWrap('<rect ' + name + '="1e999"/>'), 'SVGCAGE_MAX_COORDINATE_VALUE');
  });
}

test('viewBox must have exactly four numeric values', () => {
  expectUnsafe('<svg viewBox="0 0 10"/>', 'SVGCAGE_INVALID_COORDINATE');
});

test('safe viewBox survives', () => {
  expectSafe('<svg viewBox="0 0 10 10"><rect width="1"/></svg>');
});

test('huge viewBox coordinate is stripped', () => {
  expectUnsafe('<svg viewBox="0 0 1000000000 10"/>', 'SVGCAGE_MAX_COORDINATE_VALUE');
});

test('transform function outside allowlist is stripped', () => {
  expectUnsafe(svgWrap('<rect transform="evil(1)"/>'), 'SVGCAGE_CSS_DANGEROUS_CONSTRUCT');
});

test('huge transform coordinate is stripped', () => {
  expectUnsafe(svgWrap('<rect transform="translate(1000000000,0)"/>'), 'SVGCAGE_MAX_COORDINATE_VALUE');
});

test('safe transform survives', () => {
  expectSafe(svgWrap('<rect transform="translate(1,2) rotate(3)"/>'));
});

test('huge CSS stroke width is stripped under numeric cap', () => {
  expectUnsafe(svgWrap('<rect style="stroke-width:1000000000"/>'), 'SVGCAGE_MAX_COORDINATE_VALUE');
});

test('huge CSS transform exponent is stripped under numeric cap', () => {
  expectUnsafe(svgWrap('<rect style="transform:translate(1e999,0)"/>'), 'SVGCAGE_MAX_COORDINATE_VALUE');
});

test('CSS infinite math constant is stripped under numeric cap', () => {
  expectUnsafe(svgWrap('<rect style="stroke-width:calc(infinity)"/>'), 'SVGCAGE_MAX_COORDINATE_VALUE');
});

test('negative CSS infinite math constant is stripped under numeric cap', () => {
  expectUnsafe(svgWrap('<rect style="transform:translate(calc(-infinity * 1px),0)"/>'), 'SVGCAGE_MAX_COORDINATE_VALUE');
});

test('unquoted font family containing infinity remains safe', () => {
  expectSafe(svgWrap('<text style="font-family:infinity">x</text>'));
});

test('deeply nested safe CSS math functions are scanned linearly', () => {
  const value = 'calc('.repeat(900) + '1px' + ')'.repeat(900);
  expectSafe(svgWrap('<rect style="stroke-width:' + value + '"/>'), { maxAttributeLength: 12000 });
});

test('maximum output bytes rejects oversized canonical output', () => {
  expectUnsafe('<svg><rect width="1"/></svg>', 'SVGCAGE_MAX_OUTPUT_BYTES', { maxOutputBytes: 10 });
});

test('fallback empty output is used when full output exceeds maxOutputBytes', () => {
  const result = sanitizeSvg('<svg><rect width="1"/></svg>', { maxOutputBytes: 41 });
  assert.equal(result.svg, '<svg xmlns="http://www.w3.org/2000/svg"/>');
});

test('output cannot exceed output byte cap even when fallback cannot fit', () => {
  const result = sanitizeSvg('<svg><rect width="1"/></svg>', { maxOutputBytes: 5 });
  assert.equal(result.svg, '');
});

test('input maxBytes counts UTF-8 bytes rather than UTF-16 units', () => {
  const input = '<svg><text>😀</text></svg>';
  const byteLength = new TextEncoder().encode(input).length;
  assert.equal(auditSvg(input, { maxBytes: byteLength }).safe, true);
  expectUnsafe(input, 'SVGCAGE_MAX_BYTES', { maxBytes: byteLength - 1 });
});

test('maxFindings bounds collected findings', () => {
  const input = svgWrap('<rect onload="x" onclick="y" onerror="z"/>');
  const report = auditSvg(input, { maxFindings: 2 });
  assert.equal(report.findings.length, 2);
});
