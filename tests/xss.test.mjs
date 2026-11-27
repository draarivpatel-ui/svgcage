import test from 'node:test';
import { assert, auditSvg, codes, expectNeutralized, expectSafe, expectUnsafe, hasCode, sanitizeSvg, svgWrap } from './helpers.mjs';

const scriptPayloads = [
  '<script>alert(1)</script>',
  '<script/>',
  '<SCRIPT>alert(1)</SCRIPT>',
  '<ScRiPt>alert(1)</ScRiPt>',
  '<defs><script>alert(1)</script></defs>',
  '<g><rect/><script>alert(document.cookie)</script></g>',
  '<script xlink:href="https://evil.example/x.js" xmlns:xlink="http://www.w3.org/1999/xlink"/>',
  '<script href="data:text/javascript,alert(1)"/>',
  '<script>/*<![CDATA[*/alert(1)/*]]>*/</script>',
  '<script>alert(1)</script><rect width="1"/>',
  '<s:script xmlns:s="http://www.w3.org/2000/svg">alert(1)</s:script>',
  '<script xml:space="preserve"> alert(1) </script>'
];

for (const [index, payload] of scriptPayloads.entries()) {
  test('script element payload is removed ' + index, () => {
    const input = '<svg xmlns:xlink="http://www.w3.org/1999/xlink">' + payload + '</svg>';
    const result = expectUnsafe(input, 'SVGCAGE_SCRIPT_ELEMENT');
    assert.ok(!/<script/i.test(result.svg));
    assert.ok(!result.svg.includes('alert(1)'));
  });
}

const foreignPayloads = [
  '<foreignObject><body xmlns="http://www.w3.org/1999/xhtml"><script>alert(1)</script></body></foreignObject>',
  '<foreignObject/>',
  '<FOREIGNOBJECT><div/></FOREIGNOBJECT>',
  '<foreignobject><iframe src="https://evil.example"/></foreignobject>',
  '<g><foreignObject width="100" height="100"><p xmlns="http://www.w3.org/1999/xhtml">x</p></foreignObject></g>',
  '<foreignObject requiredExtensions="http://www.w3.org/1999/xhtml"><div xmlns="http://www.w3.org/1999/xhtml">x</div></foreignObject>'
];

for (const [index, payload] of foreignPayloads.entries()) {
  test('foreignObject payload is removed ' + index, () => {
    const result = expectUnsafe(svgWrap(payload), 'SVGCAGE_FOREIGN_OBJECT_ELEMENT');
    assert.ok(!/foreignobject/i.test(result.svg));
    assert.ok(!result.svg.includes('<div'));
    assert.ok(!result.svg.includes('<iframe'));
  });
}

const embeddedElements = [
  'iframe', 'object', 'embed', 'applet', 'audio', 'video', 'canvas', 'form', 'input', 'meta',
  'link', 'base', 'frame', 'frameset', 'portal', 'img', 'picture', 'source', 'track', 'button',
  'select', 'textarea'
];

for (const name of embeddedElements) {
  test('embedded active or interactive element is removed: ' + name, () => {
    const result = expectUnsafe(svgWrap('<' + name + '/>'), 'SVGCAGE_EMBEDDED_CONTENT_ELEMENT');
    assert.ok(!result.svg.includes('<' + name));
  });
}

for (const name of ['iframe', 'object', 'embed', 'video', 'form', 'meta', 'link', 'base', 'img', 'button']) {
  test('embedded element matching is case-insensitive: ' + name, () => {
    const upper = name.toUpperCase();
    expectUnsafe(svgWrap('<' + upper + '/>'), 'SVGCAGE_EMBEDDED_CONTENT_ELEMENT');
  });
}

const eventAttributes = [
  'onload', 'onclick', 'onactivate', 'onbegin', 'onend', 'onrepeat', 'onfocusin', 'onfocusout',
  'onmouseover', 'onmouseout', 'onmousedown', 'onmouseup', 'onmousemove', 'onerror', 'onabort',
  'onzoom', 'onresize', 'onscroll', 'onunload', 'oncopy', 'onpaste', 'oncut', 'oninput', 'onchange',
  'onsubmit', 'onreset', 'onselect', 'onblur', 'onfocus', 'onkeydown', 'onkeyup', 'onkeypress',
  'ontouchstart', 'ontouchend', 'ontouchmove', 'onpointerdown', 'onpointerup', 'onpointermove',
  'onanimationstart', 'onanimationend', 'ontransitionend', 'onloadstart', 'onprogress'
];

for (const name of eventAttributes) {
  test('event handler attribute is stripped: ' + name, () => {
    const result = expectUnsafe(svgWrap('<rect width="1" ' + name + '="alert(1)"/>'), 'SVGCAGE_EVENT_HANDLER_ATTRIBUTE');
    assert.ok(!result.svg.includes(name + '='));
    assert.ok(!result.svg.includes('alert(1)'));
  });
}

for (const name of ['ONLOAD', 'oNlOaD', 'OnClIcK', 'ONERROR']) {
  test('event handler matching is ASCII case-insensitive: ' + name, () => {
    const result = expectUnsafe(svgWrap('<rect ' + name + '="alert(1)"/>'), 'SVGCAGE_EVENT_HANDLER_ATTRIBUTE');
    assert.ok(!/onload=|onclick=|onerror=/i.test(result.svg));
  });
}

test('root event handler is stripped', () => {
  const result = expectUnsafe('<svg onload="alert(1)"><rect/></svg>', 'SVGCAGE_EVENT_HANDLER_ATTRIBUTE');
  assert.ok(!result.svg.includes('onload'));
});

test('event handler in an SVG-namespace-prefixed attribute is stripped', () => {
  const input = '<svg xmlns:s="http://www.w3.org/2000/svg"><rect s:onload="alert(1)"/></svg>';
  const result = expectUnsafe(input, 'SVGCAGE_EVENT_HANDLER_ATTRIBUTE');
  assert.ok(!result.svg.includes('onload'));
});

test('event handler in an attacker-controlled namespace is stripped', () => {
  const input = '<svg xmlns:e="https://evil.example/"><rect e:onload="alert(1)"/></svg>';
  const result = expectUnsafe(input, 'SVGCAGE_EVENT_HANDLER_ATTRIBUTE');
  assert.ok(!result.svg.includes('onload'));
});

test('attribute beginning with on is fail-closed even if unknown', () => {
  expectUnsafe(svgWrap('<rect onceuponatime="x"/>'), 'SVGCAGE_EVENT_HANDLER_ATTRIBUTE');
});

const scriptSchemes = [
  'javascript:alert(1)',
  'JavaScript:alert(1)',
  'JAVASCRIPT:alert(1)',
  ' javascript:alert(1)',
  '\tjavascript:alert(1)',
  'java\tscript:alert(1)',
  'java\nscript:alert(1)',
  'java&#x09;script:alert(1)',
  '&#x6a;avascript:alert(1)',
  '&#106;avascript:alert(1)',
  'j&#97;vascript:alert(1)',
  'javascript&#58;alert(1)',
  'javascript%3aalert(1)',
  'javascript%3Aalert(1)',
  '%6a%61vascript:alert(1)',
  '%6A%61vascript:alert(1)',
  '%256a%2561vascript%253aalert(1)',
  'java%20script:alert(1)',
  'java%09script:alert(1)',
  'java%0ascript:alert(1)',
  'vbscript:msgbox(1)',
  'VBScript:msgbox(1)',
  'vbscript%3amsgbox(1)',
  'livescript:alert(1)',
  'mocha:alert(1)',
  ' javascript&#x3a;alert(1)',
  '&#x0000006a;avascript:alert(1)',
  'java%2520script%253aalert(1)'
];

for (const [index, scheme] of scriptSchemes.entries()) {
  test('active URL scheme is stripped from use href ' + index, () => {
    const input = svgWrap('<use href="' + scheme + '"/>');
    const result = expectUnsafe(input, 'SVGCAGE_DANGEROUS_URI_SCHEME');
    assert.ok(!result.svg.includes('href='));
  });
}

const dataHtmlPayloads = [
  'data:text/html,%3Cscript%3Ealert(1)%3C/script%3E',
  'data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==',
  'data:application/xhtml+xml,%3Chtml/%3E',
  'data:image/svg+xml,%3Csvg%20onload%3D%22alert(1)%22/%3E',
  'data:image/svg+xml;base64,PHN2ZyBvbmxvYWQ9ImFsZXJ0KDEpIi8+',
  'DATA:IMAGE/SVG+XML,%3Csvg/%3E',
  'data:image/svg+xml%2c%3Csvg/%3E'
];

for (const [index, payload] of dataHtmlPayloads.entries()) {
  test('active data URL is blocked ' + index, () => {
    const input = svgWrap('<image href="' + payload + '"/>');
    const report = auditSvg(input, { allowDataImages: true });
    assert.equal(report.safe, false);
    assert.ok(['SVGCAGE_DANGEROUS_URI_SCHEME','SVGCAGE_DATA_SVG_FORBIDDEN','SVGCAGE_DATA_URI_FORBIDDEN'].some((code) => codes(report).includes(code)), codes(report).join(','));
    const result = sanitizeSvg(input, { allowDataImages: true });
    assert.ok(!result.svg.includes('data:'));
  });
}

const externalTargets = [
  'https://evil.example/a.svg',
  'http://evil.example/a.svg',
  '//evil.example/a.svg',
  'evil.example/a.svg',
  '../a.svg',
  './a.svg',
  '/local/a.svg',
  'file:///etc/passwd',
  'ftp://evil.example/a',
  'blob:https://evil.example/id',
  'filesystem:https://evil.example/a',
  'chrome-extension://abcdef/a.svg',
  'moz-extension://abcdef/a.svg',
  'ms-appx:///a.svg',
  'intent://evil.example/#Intent;end',
  'a%20b.svg',
  '%2e%2e%2fsecret.svg',
  'https://user@evil.example/a.svg',
  'https:evil.example',
  'x://evil.example/a.svg'
];

for (const [index, target] of externalTargets.entries()) {
  test('external use reference is blocked ' + index, () => {
    const result = expectUnsafe(svgWrap('<use href="' + target + '"/>'), 'SVGCAGE_EXTERNAL_REFERENCE');
    assert.ok(!result.svg.includes(target));
  });
}

for (const element of ['image', 'feImage', 'mpath', 'textPath', 'linearGradient', 'radialGradient', 'pattern']) {
  test('external href is blocked on reference-capable element: ' + element, () => {
    const content = element === 'mpath' || element === 'textPath'
      ? '<' + element + ' href="https://evil.example/a"/>'
      : '<' + element + ' href="https://evil.example/a"/>';
    const result = expectUnsafe(svgWrap(content), 'SVGCAGE_EXTERNAL_REFERENCE');
    assert.ok(!result.svg.includes('https://evil.example'));
  });
}

for (const attribute of ['src', 'action', 'formaction', 'poster', 'background', 'data']) {
  test('resource-loading attribute is stripped: ' + attribute, () => {
    const result = expectUnsafe(svgWrap('<rect ' + attribute + '="https://evil.example/a"/>'), 'SVGCAGE_EXTERNAL_REFERENCE');
    assert.ok(!result.svg.includes(attribute + '='));
  });
  test('active resource-loading attribute is stripped: ' + attribute, () => {
    const result = expectUnsafe(svgWrap('<rect ' + attribute + '="javascript:alert(1)"/>'), 'SVGCAGE_DANGEROUS_URI_SCHEME');
    assert.ok(!result.svg.includes(attribute + '='));
  });
}

test('href is not allowed on arbitrary graphical elements', () => {
  expectUnsafe(svgWrap('<rect href="#a"/>'), 'SVGCAGE_ATTRIBUTE_NOT_ALLOWED');
});

test('fragment href remains safe and canonical', () => {
  const result = expectSafe(svgWrap('<g id="a"><rect/></g><use href="#a"/>'));
  assert.ok(result.svg.includes('href="#a"'));
});

test('xlink:href migrates to canonical href', () => {
  const input = '<svg xmlns:xlink="http://www.w3.org/1999/xlink"><g id="a"/><use xlink:href="#a"/></svg>';
  const result = expectSafe(input);
  assert.ok(result.svg.includes('href="#a"'));
  assert.ok(!result.svg.includes('xlink'));
});

test('href and xlink:href together are semantic duplicates', () => {
  const input = '<svg xmlns:xlink="http://www.w3.org/1999/xlink"><g id="a"/><use href="#a" xlink:href="#a"/></svg>';
  expectUnsafe(input, 'SVGCAGE_SEMANTIC_DUPLICATE_ATTRIBUTE');
});

test('href and case-varied xlink href together are semantic duplicates', () => {
  const input = '<svg xmlns:xlink="http://www.w3.org/1999/xlink"><g id="a"/><use href="#a" xlink:HREF="#a"/></svg>';
  expectUnsafe(input, 'SVGCAGE_SEMANTIC_DUPLICATE_ATTRIBUTE');
});

const animationAttacks = [
  ['<animate attributeName="onload" to="alert(1)"/>', 'SVGCAGE_ANIMATION_EVENT_TARGET', 'onload'],
  ['<animate attributeName="onclick" to="alert(1)"/>', 'SVGCAGE_ANIMATION_EVENT_TARGET', 'onclick'],
  ['<animate attributeName="ONERROR" to="alert(1)"/>', 'SVGCAGE_ANIMATION_EVENT_TARGET', 'ONERROR'],
  ['<set attributeName="onfocusin" to="alert(1)"/>', 'SVGCAGE_ANIMATION_EVENT_TARGET', 'onfocusin'],
  ['<animate attributeName="href" to="javascript:alert(1)"/>', 'SVGCAGE_ANIMATION_HREF_TARGET', 'href'],
  ['<animate attributeName="xlink:href" to="javascript:alert(1)"/>', 'SVGCAGE_ANIMATION_HREF_TARGET', 'xlink:href'],
  ['<animate attributeName="xml:href" to="javascript:alert(1)"/>', 'SVGCAGE_ANIMATION_HREF_TARGET', 'xml:href'],
  ['<animate attributeName="src" to="https://evil.example"/>', 'SVGCAGE_ANIMATION_HREF_TARGET', 'src'],
  ['<animate attributeName="action" to="https://evil.example"/>', 'SVGCAGE_ANIMATION_HREF_TARGET', 'action'],
  ['<animate attributeName="formaction" to="https://evil.example"/>', 'SVGCAGE_ANIMATION_HREF_TARGET', 'formaction'],
  ['<animate attributeName="poster" to="https://evil.example"/>', 'SVGCAGE_ANIMATION_HREF_TARGET', 'poster'],
  ['<animate attributeName="background" to="https://evil.example"/>', 'SVGCAGE_ANIMATION_HREF_TARGET', 'background'],
  ['<animate attributeName="data" to="https://evil.example"/>', 'SVGCAGE_ANIMATION_HREF_TARGET', 'data'],
  ['<animate attributeName="srcset" to="https://evil.example"/>', 'SVGCAGE_ANIMATION_HREF_TARGET', 'srcset'],
  ['<animate attributeName="style" to="fill:url(https://evil.example)"/>', 'SVGCAGE_ANIMATION_HREF_TARGET', 'style'],
  ['<animate attributeName="fill" to="url(https://evil.example)"/>', 'SVGCAGE_ANIMATION_DANGEROUS_VALUE', 'url('],
  ['<animate attributeName="fill" values="red;url(https://evil.example)"/>', 'SVGCAGE_ANIMATION_DANGEROUS_VALUE', 'evil.example'],
  ['<animate attributeName="filter" to="url(https://evil.example)"/>', 'SVGCAGE_ANIMATION_DANGEROUS_VALUE', 'evil.example'],
  ['<animate attributeName="clip-path" to="url(https://evil.example)"/>', 'SVGCAGE_ANIMATION_DANGEROUS_VALUE', 'evil.example'],
  ['<animate attributeName="mask" to="url(javascript:alert(1))"/>', 'SVGCAGE_ANIMATION_DANGEROUS_VALUE', 'javascript'],
  ['<animate attributeName="x" to="javascript:alert(1)"/>', 'SVGCAGE_ANIMATION_DANGEROUS_VALUE', 'javascript'],
  ['<animateTransform attributeName="transform" to="javascript:alert(1)"/>', 'SVGCAGE_ANIMATION_DANGEROUS_VALUE', 'javascript'],
  ['<set attributeName="x" values="0;javascript:alert(1)"/>', 'SVGCAGE_ANIMATION_DANGEROUS_VALUE', 'javascript'],
  ['<animate attributeName="x" to="expression(alert(1))"/>', 'SVGCAGE_ANIMATION_DANGEROUS_VALUE', 'expression'],
  ['<animate attributeName="x" to="@import url(evil)"/>', 'SVGCAGE_ANIMATION_DANGEROUS_VALUE', '@import'],
  ['<animateMotion attributeName="x" path="M0 0" to="url(https://evil.example)"/>', 'SVGCAGE_ANIMATION_DANGEROUS_VALUE', 'evil.example']
];

for (const [index, [payload, code, fragment]] of animationAttacks.entries()) {
  test('animation attack is removed ' + index, () => {
    const result = expectUnsafe(svgWrap(payload), code);
    assert.ok(!result.svg.includes(fragment), result.svg);
  });
}

test('animation without attributeName is removed', () => {
  expectUnsafe(svgWrap('<animate to="1"/>'), 'SVGCAGE_ATTRIBUTE_NOT_ALLOWED');
});

test('animation with blank attributeName is removed', () => {
  expectUnsafe(svgWrap('<animate attributeName=" " to="1"/>'), 'SVGCAGE_ATTRIBUTE_NOT_ALLOWED');
});

test('safe numeric animation survives', () => {
  const result = expectSafe(svgWrap('<rect x="0"><animate attributeName="x" from="0" to="10" dur="1s"/></rect>'));
  assert.ok(result.svg.includes('attributeName="x"'));
});

test('safe local paint animation survives', () => {
  const input = svgWrap('<defs><linearGradient id="g"/></defs><rect><animate attributeName="fill" values="red;url(#g)"/></rect>');
  const result = expectSafe(input);
  assert.ok(result.svg.includes('url(#g)'));
});

const mutationPayloads = [
  '<svg><script>alert(1)</script foo="bar"><rect/></svg>',
  '<svg><scri<script>pt>alert(1)</script></svg>',
  '<svg><rect onload="alert(1)" ONLOAD="alert(2)"/></svg>',
  '<svg><rect WIDTH="1000000000000000000"/></svg>',
  '<svg><rect style="fill:red;*behavior:url(x)"/></svg>',
  '<svg><svg><script>alert(1)</script></svg></svg>',
  '<svg><use href="java&#x09;script:alert(1)"/></svg>'
];

for (const [index, input] of mutationPayloads.entries()) {
  test('mutation XSS payload cannot survive canonical serialization ' + index, () => {
    const report = auditSvg(input);
    assert.equal(report.safe, false);
    const first = sanitizeSvg(input);
    const second = sanitizeSvg(first.svg);
    assert.equal(second.svg, first.svg);
    assert.ok(!/<script[\s>/]/i.test(first.svg));
    assert.ok(!/onload\s*=/i.test(first.svg));
  });
}

test('encoded script text remains inert text rather than markup', () => {
  const result = expectSafe('<svg><text>&lt;script&gt;alert(1)&lt;/script&gt;</text></svg>');
  assert.ok(result.svg.includes('&lt;script>'));
  assert.ok(result.svg.includes('&lt;/script>'));
  assert.ok(!/<script/i.test(result.svg));
});

test('case-insensitive duplicate attributes are both removed', () => {
  const result = expectUnsafe(svgWrap('<rect width="1" WIDTH="2"/>'), 'SVGCAGE_CASE_INSENSITIVE_DUPLICATE_ATTRIBUTE');
  assert.ok(!/width=/i.test(result.svg));
});

test('duplicate exact attribute is rejected by the XML parser', () => {
  expectUnsafe(svgWrap('<rect width="1" width="2"/>'), 'SVGCAGE_DUPLICATE_ATTRIBUTE');
});

test('duplicate resolved namespaced attribute is rejected by the XML parser', () => {
  const input = '<svg xmlns:a="urn:x" xmlns:b="urn:x"><rect a:x="1" b:x="2"/></svg>';
  expectUnsafe(input, 'SVGCAGE_DUPLICATE_ATTRIBUTE');
});

test('prototype pollution element names are rejected by parser policy', () => {
  expectUnsafe(svgWrap('<__proto__/>'), 'SVGCAGE_PROTOTYPE_KEY');
});

test('prototype pollution attribute names are rejected by parser policy', () => {
  expectUnsafe(svgWrap('<rect constructor="x"/>'), 'SVGCAGE_PROTOTYPE_KEY');
});

test('unknown elements are removed without copying children blindly', () => {
  const result = expectUnsafe(svgWrap('<unknown><script>alert(1)</script></unknown>'), 'SVGCAGE_ELEMENT_NOT_ALLOWED');
  assert.ok(!result.svg.includes('unknown'));
  assert.ok(!result.svg.includes('script'));
});

test('safe aria attributes survive', () => {
  const result = expectSafe(svgWrap('<rect aria-label="box" role="img" tabindex="0" focusable="true"/>'));
  assert.ok(result.svg.includes('aria-label="box"'));
});

test('malformed tabindex is stripped', () => {
  expectUnsafe(svgWrap('<rect tabindex="0;alert(1)"/>'), 'SVGCAGE_ATTRIBUTE_NOT_ALLOWED');
});

test('invalid role token is stripped', () => {
  expectUnsafe(svgWrap('<rect role="img alert(1)"/>'), 'SVGCAGE_ATTRIBUTE_NOT_ALLOWED');
});
