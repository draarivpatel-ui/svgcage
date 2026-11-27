import test from 'node:test';
import { assert, auditSvg, codes, expectNeutralized, expectSafe, expectUnsafe, hasCode, sanitizeSvg, svgWrap, tinyPngDataUrl } from './helpers.mjs';

const safeDeclarations = [
  ['fill', 'red'], ['fill', '#fff'], ['fill', '#a1b2c3'], ['fill', 'rgb(1, 2, 3)'],
  ['fill', 'rgba(1, 2, 3, 0.5)'], ['fill', 'hsl(120, 50%, 50%)'], ['fill', 'url(#a)'],
  ['stroke', 'none'], ['stroke', '#123456'], ['stroke', 'url(#a)'], ['stroke-width', '2'],
  ['stroke-width', '0.5px'], ['stroke-linecap', 'round'], ['stroke-linejoin', 'miter'],
  ['stroke-dasharray', '1 2 3'], ['opacity', '0.5'], ['fill-opacity', '.5'], ['stroke-opacity', '1'],
  ['color', 'red'], ['color', 'currentColor'], ['font-family', 'serif'], ['font-size', '12px'],
  ['font-weight', 'bold'], ['font-style', 'italic'], ['text-anchor', 'middle'], ['display', 'inline'],
  ['visibility', 'hidden'], ['pointer-events', 'none'], ['vector-effect', 'non-scaling-stroke'],
  ['clip-path', 'url(#c)'], ['filter', 'url(#f)'], ['marker-end', 'url(#m)'], ['marker-start', 'url(#m)'],
  ['mask', 'url(#mask)'], ['transform', 'translate(1, 2)'], ['transform-origin', 'center'],
  ['stop-color', '#123'], ['stop-opacity', '0.8'], ['flood-color', '#456'], ['lighting-color', '#789'],
  ['shape-rendering', 'crispEdges'], ['image-rendering', 'optimizeSpeed'], ['writing-mode', 'lr'],
  ['white-space', 'pre'], ['unicode-bidi', 'normal'], ['paint-order', 'stroke fill'], ['overflow', 'hidden']
];

for (const [property, value] of safeDeclarations) {
  test('safe inline CSS declaration survives: ' + property + ' ' + value, () => {
    const result = expectSafe(svgWrap('<rect style="' + property + ':' + value + '"/>'));
    assert.ok(result.svg.includes('style="' + property + ': ' + value + '"'), result.svg);
  });
}

const safePresentation = [
  ['fill', 'red'], ['fill', '#fff'], ['fill', 'url(#a)'], ['stroke', '#123'], ['stroke', 'url(#a)'],
  ['stroke-width', '2'], ['stroke-linecap', 'round'], ['opacity', '.5'], ['fill-opacity', '.5'],
  ['color', 'currentColor'], ['font-size', '12px'], ['text-anchor', 'middle'], ['display', 'inline'],
  ['visibility', 'visible'], ['clip-path', 'url(#c)'], ['filter', 'url(#f)'], ['marker-end', 'url(#m)'],
  ['mask', 'url(#mask)'], ['stop-color', '#123'], ['vector-effect', 'non-scaling-stroke']
];

for (const [property, value] of safePresentation) {
  test('safe presentation attribute survives: ' + property, () => {
    const result = expectSafe(svgWrap('<rect ' + property + '="' + value + '"/>'));
    assert.ok(result.svg.includes(property + '="' + value + '"'), result.svg);
  });
}

const externalCssUrls = [
  'url(https://evil.example/a)',
  'url(http://evil.example/a)',
  'url(//evil.example/a)',
  'url(&quot;https://evil.example/a&quot;)',
  "url('https://evil.example/a')",
  'url( https://evil.example/a )',
  'url(../a.svg)',
  'url(/a.svg)',
  'url(file:///etc/passwd)',
  'url(data:image/png;base64,aaaa)'
];
const urlProperties = ['fill', 'stroke', 'filter', 'clip-path', 'mask', 'marker-end', 'marker-mid', 'marker-start'];

for (const property of urlProperties) {
  for (const [index, value] of externalCssUrls.entries()) {
    test('external CSS url is stripped from ' + property + ' ' + index, () => {
      const result = expectUnsafe(svgWrap('<rect style="' + property + ':' + value + '"/>'), 'SVGCAGE_CSS_EXTERNAL_REFERENCE');
      assert.ok(!result.svg.includes('evil.example'));
      assert.ok(!result.svg.includes('data:image'));
    });
  }
}

for (const property of urlProperties) {
  test('active CSS url is stripped from ' + property, () => {
    const result = expectUnsafe(svgWrap('<rect style="' + property + ':url(javascript:alert(1))"/>'), 'SVGCAGE_CSS_DANGEROUS_CONSTRUCT');
    assert.ok(!result.svg.includes('javascript'));
  });
}

for (const property of urlProperties) {
  test('local CSS url survives in ' + property, () => {
    const result = expectSafe(svgWrap('<rect style="' + property + ':url(#a)"/>'));
    assert.ok(result.svg.includes('url(#a)'));
  });
}

for (const property of ['color', 'font-family', 'display', 'opacity', 'visibility', 'stroke-width']) {
  test('CSS url is forbidden in non-reference property: ' + property, () => {
    expectUnsafe(svgWrap('<rect style="' + property + ':url(#a)"/>'), 'SVGCAGE_CSS_EXTERNAL_REFERENCE');
  });
}

const dangerousCss = [
  ['expression', 'fill:expression(alert(1))'],
  ['expression case', 'fill:EXPRESSION(alert(1))'],
  ['var', 'fill:var(--x)'],
  ['env', 'fill:env(safe-area-inset-top)'],
  ['attr', 'fill:attr(data-fill)'],
  ['image', 'fill:image(url(evil))'],
  ['image-set', 'fill:image-set(url(evil) 1x)'],
  ['webkit image set', 'fill:-webkit-image-set(url(evil) 1x)'],
  ['element', 'fill:element(#x)'],
  ['paint', 'fill:paint(evil)'],
  ['unknown function', 'fill:evilfunc(1)'],
  ['behavior', 'behavior:url(x)'],
  ['moz binding', '-moz-binding:url(x)'],
  ['o link', '-o-link:url(x)'],
  ['o link source', '-o-link-source:current'],
  ['hex escape', 'fill:\\72 ed'],
  ['backslash escape', 'fill:u\\72 l(evil)'],
  ['at rule text', 'fill:red;@import url(evil)'],
  ['markup open', 'fill:&lt;x&gt;'],
  ['markup close', 'fill:x>y'],
  ['unterminated comment', 'fill:red/*'],
  ['unterminated string', 'font-family:&quot;abc'],
  ['unbalanced parentheses', 'fill:rgb(1,2,3'],
  ['block open', 'fill:red{x}'],
  ['block close', 'fill:red}x'],
  ['missing colon', 'fill red'],
  ['custom property', '--x:red'],
  ['vendor property', '-webkit-fill:red'],
  ['unknown property', 'evil-property:red'],
];

for (const [index, [label, css]] of dangerousCss.entries()) {
  test('dangerous or malformed inline CSS is dropped ' + index + ' ' + label, () => {
    const input = svgWrap('<rect style="' + css + '"/>');
    const report = auditSvg(input);
    assert.equal(report.safe, false);
    assert.ok(codes(report).some((code) => code.startsWith('SVGCAGE_CSS_')), codes(report).join(','));
    const result = sanitizeSvg(input);
    assert.ok(!result.svg.includes('expression'));
    assert.ok(!result.svg.includes('behavior'));
    assert.ok(!result.svg.includes('@import'));
    const second = sanitizeSvg(result.svg);
    assert.equal(second.svg, result.svg);
  });
}

test('safe declaration survives while dangerous sibling declaration is dropped', () => {
  const input = svgWrap('<rect style="fill:red;behavior:url(x);stroke:#123"/>');
  const result = expectUnsafe(input, 'SVGCAGE_CSS_DANGEROUS_CONSTRUCT');
  assert.ok(result.svg.includes('fill: red'));
  assert.ok(result.svg.includes('stroke: #123'));
  assert.ok(!result.svg.includes('behavior'));
});

test('external declaration is dropped while safe local declaration survives', () => {
  const input = svgWrap('<rect style="fill:url(https://evil.example);stroke:#123"/>');
  const result = expectUnsafe(input, 'SVGCAGE_CSS_EXTERNAL_REFERENCE');
  assert.ok(result.svg.includes('stroke: #123'));
  assert.ok(!result.svg.includes('evil.example'));
});

test('CSS comments are stripped from safe declarations', () => {
  const result = expectSafe(svgWrap('<rect style="fill/**/:/**/red; stroke: #123"/>'));
  assert.ok(result.svg.includes('fill: red'));
});

test('CSS comment obfuscation cannot smuggle import', () => {
  expectUnsafe(svgWrap('<rect style="fill:red;@/**/import url(evil)"/>'), 'SVGCAGE_CSS_INVALID');
});

test('CSS whitespace obfuscated javascript scheme is caught', () => {
  expectUnsafe(svgWrap('<rect style="fill:url(j a v a s c r i p t:alert(1))"/>'), 'SVGCAGE_CSS_DANGEROUS_CONSTRUCT');
});

test('CSS percent encoded javascript scheme is caught', () => {
  expectUnsafe(svgWrap('<rect style="fill:url(%6a%61vascript%3aalert(1))"/>'), 'SVGCAGE_CSS_DANGEROUS_CONSTRUCT');
});

test('CSS empty url is invalid and dropped', () => {
  expectUnsafe(svgWrap('<rect style="fill:url()"/>'), 'SVGCAGE_CSS_INVALID');
});

test('CSS malformed fragment is invalid and dropped', () => {
  expectUnsafe(svgWrap('<rect style="fill:url(#bad id)"/>'), 'SVGCAGE_CSS_INVALID');
});

test('presentation fill external URL is stripped', () => {
  expectUnsafe(svgWrap('<rect fill="url(https://evil.example/a)"/>'), 'SVGCAGE_CSS_EXTERNAL_REFERENCE');
});

test('presentation filter external URL is stripped', () => {
  expectUnsafe(svgWrap('<rect filter="url(https://evil.example/a)"/>'), 'SVGCAGE_CSS_EXTERNAL_REFERENCE');
});

test('presentation clip-path external URL is stripped', () => {
  expectUnsafe(svgWrap('<rect clip-path="url(https://evil.example/a)"/>'), 'SVGCAGE_CSS_EXTERNAL_REFERENCE');
});

test('presentation marker external URL is stripped', () => {
  expectUnsafe(svgWrap('<rect marker-end="url(//evil.example/a)"/>'), 'SVGCAGE_CSS_EXTERNAL_REFERENCE');
});

test('presentation CSS active URL is stripped', () => {
  expectUnsafe(svgWrap('<rect fill="url(javascript:alert(1))"/>'), 'SVGCAGE_CSS_DANGEROUS_CONSTRUCT');
});

test('local filter presentation reference survives', () => {
  expectSafe(svgWrap('<filter id="f"/><rect filter="url(#f)"/>'));
});

test('style element is forbidden by default', () => {
  const result = expectUnsafe(svgWrap('<style>rect{fill:red}</style>'), 'SVGCAGE_STYLE_ELEMENT_FORBIDDEN');
  assert.ok(!result.svg.includes('<style'));
});

const safeStylesheets = [
  'rect { fill: red }',
  'g rect { fill: red }',
  'g > rect { fill: red }',
  'g + rect { fill: red }',
  'g ~ rect { fill: red }',
  '.icon { fill: red }',
  '#icon { fill: red }',
  'svg rect.icon { fill: red }',
  '* { opacity: 0.5 }',
  'rect, circle { fill: red }',
  'rect { fill: url(#a); stroke: #123 }',
  'text { font-family: serif; font-size: 12px }'
];

for (const [index, sheet] of safeStylesheets.entries()) {
  test('safe style element stylesheet survives when opted in ' + index, () => {
    const result = expectSafe(svgWrap('<style>' + sheet + '</style>'), { allowStyleElements: true });
    assert.ok(result.svg.includes('<style>'));
    const second = sanitizeSvg(result.svg, { allowStyleElements: true });
    assert.equal(second.svg, result.svg);
  });
}

const badStylesheets = [
  ['@import url(https://evil.example/x.css); rect{fill:red}', 'SVGCAGE_CSS_DANGEROUS_CONSTRUCT'],
  ['@media screen { rect{fill:red} }', 'SVGCAGE_CSS_DANGEROUS_CONSTRUCT'],
  ['rect { fill: url(https://evil.example/a) }', 'SVGCAGE_CSS_EXTERNAL_REFERENCE'],
  ['rect { fill: url(javascript:alert(1)) }', 'SVGCAGE_CSS_DANGEROUS_CONSTRUCT'],
  ['rect { fill: expression(alert(1)) }', 'SVGCAGE_CSS_DANGEROUS_CONSTRUCT'],
  ['rect { behavior: url(x) }', 'SVGCAGE_CSS_DANGEROUS_CONSTRUCT'],
  ['rect { fill: \\72 ed }', 'SVGCAGE_CSS_DANGEROUS_CONSTRUCT'],
  ['rect:hover { fill: red }', 'SVGCAGE_SELECTOR_NOT_ALLOWED'],
  ['rect[fill] { fill: red }', 'SVGCAGE_SELECTOR_NOT_ALLOWED'],
  ['rect::before { fill: red }', 'SVGCAGE_SELECTOR_NOT_ALLOWED'],
  ['rect { unknown-property: red }', 'SVGCAGE_CSS_UNKNOWN_PROPERTY'],
  ['rect { fill: red', 'SVGCAGE_CSS_INVALID'],
  ['rect fill: red }', 'SVGCAGE_CSS_INVALID'],
  ['rect { fill: red } trailing', 'SVGCAGE_CSS_INVALID']
];

for (const [index, [sheet, code]] of badStylesheets.entries()) {
  test('unsafe stylesheet is blocked when style elements are enabled ' + index, () => {
    const result = expectUnsafe(svgWrap('<style>' + sheet + '</style>'), code, { allowStyleElements: true });
    assert.ok(!result.svg.includes('evil.example'));
    assert.ok(!result.svg.includes('expression'));
    assert.ok(!result.svg.includes('@import'));
  });
}

test('style element with no safe rules is removed', () => {
  const input = svgWrap('<style>rect { unknown-property: red }</style>');
  const result = expectUnsafe(input, 'SVGCAGE_CSS_UNKNOWN_PROPERTY', { allowStyleElements: true });
  assert.ok(!result.svg.includes('<style'));
});

test('style element child elements are forbidden', () => {
  expectUnsafe(svgWrap('<style><rect/></style>'), 'SVGCAGE_CSS_INVALID', { allowStyleElements: true });
});

test('style element attributes are removed before serialization', () => {
  const input = svgWrap('<style type="text/css" media="screen">rect { fill: red }</style>');
  const result = expectSafe(input, { allowStyleElements: true });
  assert.ok(!result.svg.includes('media='));
  assert.ok(!result.svg.includes('type='));
});

test('inline style is independent of allowStyleElements', () => {
  const result = expectSafe(svgWrap('<rect style="fill:red"/>'), { allowStyleElements: false });
  assert.ok(result.svg.includes('fill: red'));
});

test('default policy blocks raster data image URL', () => {
  expectUnsafe(svgWrap('<image href="' + tinyPngDataUrl() + '"/>'), 'SVGCAGE_DATA_URI_FORBIDDEN');
});

test('opt-in canonical PNG data image survives', () => {
  const result = expectSafe(svgWrap('<image href="' + tinyPngDataUrl() + '"/>'), { allowDataImages: true });
  assert.ok(result.svg.includes('data:image/png;base64'));
});

test('opt-in JPEG data image survives with signature validation', () => {
  const jpeg = 'data:image/jpeg;base64,/9j/AAAA';
  expectSafe(svgWrap('<image href="' + jpeg + '"/>'), { allowDataImages: true });
});

test('opt-in WebP data image survives with signature validation', () => {
  const webp = 'data:image/webp;base64,UklGRhAAAABXRUJQ';
  expectSafe(svgWrap('<image href="' + webp + '"/>'), { allowDataImages: true });
});

const badDataImages = [
  'data:image/png;base64,PGh0bWw+',
  'data:image/png;base64,!!!!',
  'data:image/png;base64,iVBORw0KGgo',
  'data:image/png;base64,iVBORw0KGgo==',
  'data:image/png,iVBORw0KGgo=',
  'data:image/png;base64;extra,iVBORw0KGgo=',
  'data:image/gif;base64,R0lGODlh',
  'data:text/plain;base64,PGh0bWw+',
  'data:image/svg+xml;base64,PHN2Zy8+',
  'data:image/png;base64,PGh0bWw'
];

for (const [index, url] of badDataImages.entries()) {
  test('noncanonical or type-confused data image is blocked ' + index, () => {
    const report = auditSvg(svgWrap('<image href="' + url + '"/>'), { allowDataImages: true });
    assert.equal(report.safe, false);
    assert.ok(codes(report).includes('SVGCAGE_DATA_URI_FORBIDDEN') || codes(report).includes('SVGCAGE_DATA_SVG_FORBIDDEN'), codes(report).join(','));
    const result = sanitizeSvg(svgWrap('<image href="' + url + '"/>'), { allowDataImages: true });
    assert.ok(!result.svg.includes('data:'));
  });
}

test('oversized raster data image is blocked by its own cap', () => {
  const bytes = Buffer.alloc(40, 0);
  bytes[0] = 0x89; bytes[1] = 0x50; bytes[2] = 0x4e; bytes[3] = 0x47;
  bytes[4] = 0x0d; bytes[5] = 0x0a; bytes[6] = 0x1a; bytes[7] = 0x0a;
  const url = 'data:image/png;base64,' + bytes.toString('base64');
  expectUnsafe(svgWrap('<image href="' + url + '"/>'), 'SVGCAGE_MAX_DATA_IMAGE_BYTES', { allowDataImages: true, maxDataImageBytes: 20 });
});

test('data image is forbidden on use even when raster data is enabled', () => {
  expectUnsafe(svgWrap('<use href="' + tinyPngDataUrl() + '"/>'), 'SVGCAGE_DATA_URI_FORBIDDEN', { allowDataImages: true });
});

test('fragment identifiers with spaces are invalid', () => {
  expectUnsafe(svgWrap('<use href="#bad id"/>'), 'SVGCAGE_INVALID_FRAGMENT');
});

test('empty fragment identifiers are invalid', () => {
  expectUnsafe(svgWrap('<use href="#"/>'), 'SVGCAGE_INVALID_FRAGMENT');
});

test('empty href values are invalid', () => {
  expectUnsafe(svgWrap('<use href=""/>'), 'SVGCAGE_INVALID_FRAGMENT');
});

test('control-padded active scheme is caught after XML normalization', () => {
  expectUnsafe(svgWrap('<use href="&#x09;javascript:alert(1)"/>'), 'SVGCAGE_DANGEROUS_URI_SCHEME');
});
