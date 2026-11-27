import {
  SVGCAGE_ERROR_CODES,
  XML_NAMESPACE,
  XMLNS_NAMESPACE
} from './constants.mjs';
import { svgcageFail } from './errors.mjs';
import {
  codePointAt,
  emptySvgStats,
  isAsciiLetter,
  isLegalXmlCodePoint,
  isXmlNameCodePoint,
  isXmlNameStartCodePoint,
  isXmlWhitespaceUnit,
  splitQName,
  utf8ByteLength,
  validateXmlCharacters,
  validateXmlName
} from './xml-utils.mjs';

const ERROR = SVGCAGE_ERROR_CODES;

function createLexer(text, options, stats) {
  return {
    text,
    pos: 0,
    options,
    stats: stats || emptySvgStats()
  };
}

function readName(ctx) {
  const text = ctx.text;
  const start = ctx.pos;
  if (start >= text.length) return null;
  const first = codePointAt(text, start);
  if (!isXmlNameStartCodePoint(first.codePoint)) return null;
  let index = start + first.width;
  while (index < text.length) {
    if (index - start > ctx.options.maxNameLength) {
      svgcageFail(ERROR.MAX_NAME_LENGTH, 'maximum XML name length exceeded', {
        position: start,
        limit: ctx.options.maxNameLength,
        actual: index - start
      });
    }
    const next = codePointAt(text, index);
    if (!isXmlNameCodePoint(next.codePoint)) break;
    index += next.width;
  }
  const name = text.slice(start, index);
  if (name.length > ctx.options.maxNameLength) {
    svgcageFail(ERROR.MAX_NAME_LENGTH, 'maximum XML name length exceeded', {
      position: start,
      limit: ctx.options.maxNameLength,
      actual: name.length,
      name: name.slice(0, 80)
    });
  }
  ctx.pos = index;
  return name;
}

function skipWhitespace(ctx) {
  let moved = false;
  while (ctx.pos < ctx.text.length && isXmlWhitespaceUnit(ctx.text.charCodeAt(ctx.pos))) {
    ctx.pos += 1;
    moved = true;
  }
  return moved;
}

function expectCharacter(ctx, character, message) {
  if (ctx.text[ctx.pos] !== character) {
    svgcageFail(ERROR.MALFORMED_XML, message, { position: ctx.pos });
  }
  ctx.pos += 1;
}

function countEntityReference(ctx, replacement, position) {
  ctx.stats.entityReferences += 1;
  if (ctx.stats.entityReferences > ctx.options.maxEntityReferences) {
    svgcageFail(ERROR.MAX_ENTITY_REFERENCES, 'maximum entity or character reference count exceeded', {
      position,
      limit: ctx.options.maxEntityReferences,
      actual: ctx.stats.entityReferences
    });
  }
  const expansionBytes = utf8ByteLength(replacement);
  if (ctx.stats.expandedTextBytes + expansionBytes > ctx.options.maxExpandedTextBytes) {
    svgcageFail(ERROR.MAX_EXPANDED_TEXT_BYTES, 'maximum expanded entity text byte count exceeded', {
      position,
      limit: ctx.options.maxExpandedTextBytes,
      actual: ctx.stats.expandedTextBytes + expansionBytes
    });
  }
  ctx.stats.expandedTextBytes += expansionBytes;
}

function decodeNumericReference(body, position) {
  let value = 0;
  let digits;
  let hexadecimal = false;
  if (body.startsWith('#x') || body.startsWith('#X')) {
    hexadecimal = true;
    digits = body.slice(2);
  } else {
    digits = body.slice(1);
  }
  if (digits.length === 0) {
    svgcageFail(ERROR.ILLEGAL_CHAR_REF, 'numeric character reference has no digits', { position });
  }
  for (let index = 0; index < digits.length; index += 1) {
    const unit = digits.charCodeAt(index);
    let digit = -1;
    if (unit >= 0x30 && unit <= 0x39) digit = unit - 0x30;
    else if (hexadecimal && unit >= 0x41 && unit <= 0x46) digit = unit - 0x41 + 10;
    else if (hexadecimal && unit >= 0x61 && unit <= 0x66) digit = unit - 0x61 + 10;
    if (digit < 0) {
      svgcageFail(ERROR.ILLEGAL_CHAR_REF, 'numeric character reference contains a non-digit', { position });
    }
    value = value * (hexadecimal ? 16 : 10) + digit;
    if (value > 0x10ffff) {
      svgcageFail(ERROR.ILLEGAL_CHAR_REF, 'numeric character reference is outside the Unicode range', {
        position,
        actual: value
      });
    }
  }
  if (!isLegalXmlCodePoint(value)) {
    svgcageFail(ERROR.ILLEGAL_CHAR_REF, 'numeric character reference is not a legal XML 1.0 scalar', {
      position,
      actual: value
    });
  }
  return String.fromCodePoint(value);
}

function parseReference(ctx, position, end) {
  const text = ctx.text;
  let cursor = position + 1;
  if (cursor >= end) {
    svgcageFail(ERROR.MALFORMED_XML, 'unterminated entity reference', { position });
  }
  let semicolon = cursor;
  while (semicolon < end && text.charCodeAt(semicolon) !== 0x3b) {
    if (semicolon - cursor > ctx.options.maxNameLength) {
      svgcageFail(ERROR.MAX_NAME_LENGTH, 'maximum entity reference name length exceeded', {
        position,
        limit: ctx.options.maxNameLength,
        actual: semicolon - cursor
      });
    }
    semicolon += 1;
  }
  if (semicolon >= end) {
    svgcageFail(ERROR.MALFORMED_XML, 'unterminated entity reference', { position });
  }
  const body = text.slice(cursor, semicolon);
  if (body.length === 0) {
    svgcageFail(ERROR.MALFORMED_XML, 'empty entity reference', { position });
  }
  let replacement;
  if (body.charCodeAt(0) === 0x23) {
    replacement = decodeNumericReference(body, position);
  } else if (body === 'amp') {
    replacement = '&';
  } else if (body === 'lt') {
    replacement = '<';
  } else if (body === 'gt') {
    replacement = '>';
  } else if (body === 'quot') {
    replacement = '"';
  } else if (body === 'apos') {
    replacement = "'";
  } else {
    svgcageFail(ERROR.UNKNOWN_ENTITY, 'unknown or custom entity reference rejected', {
      position,
      name: body.slice(0, 80)
    });
  }
  countEntityReference(ctx, replacement, position);
  return { replacement, end: semicolon + 1 };
}

function appendLimitedPart(parts, state, part, limit, position, code, message) {
  if (state.length + part.length > limit) {
    svgcageFail(code, message, {
      position,
      limit,
      actual: state.length + part.length
    });
  }
  state.length += part.length;
  parts.push(part);
}

function decodeTextRange(ctx, start, end, attributeMode) {
  const text = ctx.text;
  const parts = [];
  const state = { length: 0 };
  const limit = attributeMode ? ctx.options.maxAttributeLength : ctx.options.maxTextLength;
  const code = attributeMode ? ERROR.MAX_ATTRIBUTE_LENGTH : ERROR.MAX_TEXT_LENGTH;
  const message = attributeMode ? 'maximum SVG attribute length exceeded' : 'maximum SVG text node length exceeded';
  let chunkStart = start;
  let position = start;

  function flush(until) {
    if (until <= chunkStart) return;
    let chunk = text.slice(chunkStart, until);
    if (attributeMode && (chunk.includes('\t') || chunk.includes('\n'))) {
      chunk = chunk.replace(/[\t\n]/g, ' ');
    }
    appendLimitedPart(parts, state, chunk, limit, chunkStart, code, message);
  }

  while (position < end) {
    const character = text[position];
    if (character === '&') {
      flush(position);
      const reference = parseReference(ctx, position, end);
      appendLimitedPart(parts, state, reference.replacement, limit, position, code, message);
      position = reference.end;
      chunkStart = position;
      continue;
    }
    if (attributeMode && character === '<') {
      svgcageFail(ERROR.MALFORMED_XML, 'raw less-than sign is forbidden in an attribute value', { position });
    }
    position += 1;
  }
  flush(end);
  return parts.join('');
}

function incrementElements(ctx, position) {
  if (ctx.stats.elements + 1 > ctx.options.maxElements) {
    svgcageFail(ERROR.MAX_ELEMENTS, 'maximum SVG element count exceeded', {
      position,
      limit: ctx.options.maxElements,
      actual: ctx.stats.elements + 1
    });
  }
  ctx.stats.elements += 1;
}

function incrementAttributes(ctx, position) {
  if (ctx.stats.attributes + 1 > ctx.options.maxTotalAttributes) {
    svgcageFail(ERROR.MAX_TOTAL_ATTRIBUTES, 'maximum total SVG attribute count exceeded', {
      position,
      limit: ctx.options.maxTotalAttributes,
      actual: ctx.stats.attributes + 1
    });
  }
  ctx.stats.attributes += 1;
}

function parseAttribute(ctx, elementPosition) {
  const position = ctx.pos;
  const name = readName(ctx);
  if (name === null) {
    svgcageFail(ERROR.MALFORMED_XML, 'expected an attribute name', { position });
  }
  const parts = validateXmlName(name, position, ctx.options.maxNameLength, 'attribute');
  skipWhitespace(ctx);
  expectCharacter(ctx, '=', 'expected equals sign after attribute name');
  skipWhitespace(ctx);
  const quote = ctx.text[ctx.pos];
  if (quote !== '"' && quote !== "'") {
    svgcageFail(ERROR.MALFORMED_XML, 'attribute value must be quoted', { position: ctx.pos });
  }
  ctx.pos += 1;
  const valueStart = ctx.pos;
  let valueEnd = valueStart;
  while (valueEnd < ctx.text.length && ctx.text[valueEnd] !== quote) {
    valueEnd += 1;
  }
  if (valueEnd >= ctx.text.length) {
    svgcageFail(ERROR.MALFORMED_XML, 'unterminated attribute value', { position: valueStart });
  }
  const value = decodeTextRange(ctx, valueStart, valueEnd, true);
  ctx.pos = valueEnd + 1;
  return {
    name,
    prefix: parts.prefix,
    localName: parts.localName,
    namespaceURI: null,
    value,
    position,
    elementPosition
  };
}

function parseStartTagToken(ctx) {
  const startPosition = ctx.pos;
  incrementElements(ctx, startPosition);
  ctx.pos += 1;
  const namePosition = ctx.pos;
  const name = readName(ctx);
  if (name === null) {
    svgcageFail(ERROR.MALFORMED_XML, 'expected an element name after less-than sign', { position: namePosition });
  }
  const parts = validateXmlName(name, namePosition, ctx.options.maxNameLength, 'element');
  const attributes = [];
  const rawNames = new Set();
  let selfClosing = false;
  let hadWhitespace = false;
  for (;;) {
    const whitespace = skipWhitespace(ctx);
    hadWhitespace = hadWhitespace || whitespace;
    if (ctx.text.startsWith('/>', ctx.pos)) {
      ctx.pos += 2;
      selfClosing = true;
      break;
    }
    if (ctx.text[ctx.pos] === '>') {
      ctx.pos += 1;
      break;
    }
    if (ctx.pos >= ctx.text.length) {
      svgcageFail(ERROR.MALFORMED_XML, 'unterminated start tag', { position: startPosition });
    }
    if (!hadWhitespace) {
      svgcageFail(ERROR.MALFORMED_XML, 'attributes must be separated by whitespace', { position: ctx.pos });
    }
    if (attributes.length >= ctx.options.maxAttributesPerElement) {
      svgcageFail(ERROR.MAX_ATTRIBUTES_PER_ELEMENT, 'maximum attributes per element exceeded', {
        position: ctx.pos,
        limit: ctx.options.maxAttributesPerElement,
        actual: attributes.length + 1
      });
    }
    const attribute = parseAttribute(ctx, startPosition);
    if (rawNames.has(attribute.name)) {
      svgcageFail(ERROR.DUPLICATE_ATTRIBUTE, 'duplicate attribute on element', {
        position: attribute.position,
        attribute: attribute.name
      });
    }
    rawNames.add(attribute.name);
    incrementAttributes(ctx, attribute.position);
    attributes.push(attribute);
    hadWhitespace = false;
  }
  return {
    type: 'start-tag',
    name,
    prefix: parts.prefix,
    localName: parts.localName,
    attributes,
    selfClosing,
    position: startPosition,
    namePosition
  };
}

function parseEndTagToken(ctx) {
  const position = ctx.pos;
  ctx.pos += 2;
  const namePosition = ctx.pos;
  const name = readName(ctx);
  if (name === null) {
    svgcageFail(ERROR.MALFORMED_XML, 'expected an element name in end tag', { position: namePosition });
  }
  validateXmlName(name, namePosition, ctx.options.maxNameLength, 'element');
  skipWhitespace(ctx);
  expectCharacter(ctx, '>', 'expected greater-than sign at end of end tag');
  return { type: 'end-tag', name, position };
}

function parseCommentToken(ctx) {
  const position = ctx.pos;
  if (ctx.stats.comments + 1 > ctx.options.maxComments) {
    svgcageFail(ERROR.MAX_COMMENTS, 'maximum XML comment count exceeded', {
      position,
      limit: ctx.options.maxComments,
      actual: ctx.stats.comments + 1
    });
  }
  ctx.stats.comments += 1;
  const contentStart = position + 4;
  const hyphen = ctx.text.indexOf('--', contentStart);
  if (hyphen === -1) {
    svgcageFail(ERROR.MALFORMED_XML, 'unterminated XML comment', { position });
  }
  if (ctx.text[hyphen + 2] !== '>') {
    svgcageFail(ERROR.MALFORMED_XML, 'double hyphen is forbidden inside an XML comment', { position: hyphen });
  }
  const value = ctx.text.slice(contentStart, hyphen);
  ctx.pos = hyphen + 3;
  return { type: 'comment', value, position };
}

function parseCdataToken(ctx) {
  const position = ctx.pos;
  const contentStart = position + 9;
  const end = ctx.text.indexOf(']]>', contentStart);
  if (end === -1) {
    svgcageFail(ERROR.MALFORMED_XML, 'unterminated CDATA section', { position });
  }
  const length = end - contentStart;
  if (length > ctx.options.maxTextLength) {
    svgcageFail(ERROR.MAX_TEXT_LENGTH, 'maximum CDATA section length exceeded', {
      position: contentStart,
      limit: ctx.options.maxTextLength,
      actual: length
    });
  }
  ctx.stats.cdataSections += 1;
  ctx.stats.textCharacters += length;
  ctx.pos = end + 3;
  return {
    type: 'cdata',
    value: ctx.text.slice(contentStart, end),
    position
  };
}

function parseProcessingInstructionToken(ctx) {
  const position = ctx.pos;
  if (ctx.stats.processingInstructions + 1 > ctx.options.maxProcessingInstructions) {
    svgcageFail(ERROR.MAX_PROCESSING_INSTRUCTIONS, 'maximum processing instruction count exceeded', {
      position,
      limit: ctx.options.maxProcessingInstructions,
      actual: ctx.stats.processingInstructions + 1
    });
  }
  ctx.pos += 2;
  const targetPosition = ctx.pos;
  const target = readName(ctx);
  if (target === null) {
    svgcageFail(ERROR.MALFORMED_XML, 'processing instruction target is missing', { position: targetPosition });
  }
  validateXmlName(target, targetPosition, ctx.options.maxNameLength, 'processing instruction target');
  if (ctx.pos < ctx.text.length && !isXmlWhitespaceUnit(ctx.text.charCodeAt(ctx.pos)) && !ctx.text.startsWith('?>', ctx.pos)) {
    svgcageFail(ERROR.MALFORMED_XML, 'processing instruction target must be followed by whitespace or its terminator', {
      position: ctx.pos
    });
  }
  if (isXmlWhitespaceUnit(ctx.text.charCodeAt(ctx.pos))) skipWhitespace(ctx);
  const dataStart = ctx.pos;
  const end = ctx.text.indexOf('?>', dataStart);
  if (end === -1) {
    svgcageFail(ERROR.MALFORMED_XML, 'unterminated processing instruction', { position });
  }
  const data = ctx.text.slice(dataStart, end);
  const stylesheet = target.toLowerCase() === 'xml-stylesheet';
  if (stylesheet || !ctx.options.allowProcessingInstructions) {
    svgcageFail(ERROR.PROCESSING_INSTRUCTION_FORBIDDEN, stylesheet
      ? 'xml-stylesheet processing instructions are forbidden'
      : 'processing instructions are forbidden by the SVG security policy', {
      position,
      name: target
    });
  }
  if (target.toLowerCase().startsWith('xml')) {
    svgcageFail(ERROR.MALFORMED_XML, 'processing instruction targets beginning with xml are reserved', { position: targetPosition });
  }
  ctx.stats.processingInstructions += 1;
  ctx.pos = end + 2;
  return { type: 'processing-instruction', target, data, position };
}

function parseVersionOrValue(ctx, label, position) {
  if (!ctx.text.startsWith(label, ctx.pos)) {
    svgcageFail(ERROR.MALFORMED_XML, 'expected ' + label + ' in XML declaration', { position: ctx.pos });
  }
  ctx.pos += label.length;
  skipWhitespace(ctx);
  expectCharacter(ctx, '=', 'expected equals sign in XML declaration');
  skipWhitespace(ctx);
  const quote = ctx.text[ctx.pos];
  if (quote !== '"' && quote !== "'") {
    svgcageFail(ERROR.MALFORMED_XML, 'XML declaration values must be quoted', { position: ctx.pos });
  }
  ctx.pos += 1;
  const end = ctx.text.indexOf(quote, ctx.pos);
  if (end === -1) {
    svgcageFail(ERROR.MALFORMED_XML, 'unterminated XML declaration value', { position });
  }
  const value = ctx.text.slice(ctx.pos, end);
  ctx.pos = end + 1;
  return value;
}

function parseXmlDeclarationToken(ctx) {
  const position = ctx.pos;
  ctx.pos += 5;
  if (!skipWhitespace(ctx)) {
    svgcageFail(ERROR.MALFORMED_XML, 'XML declaration must have whitespace before version', { position });
  }
  const version = parseVersionOrValue(ctx, 'version', position);
  if (version !== '1.0') {
    svgcageFail(ERROR.MALFORMED_XML, 'only XML version 1.0 is accepted', { position, actual: version });
  }
  let encoding = null;
  let standalone = null;
  const whitespace = skipWhitespace(ctx);
  if (!ctx.text.startsWith('?>', ctx.pos)) {
    if (!whitespace) {
      svgcageFail(ERROR.MALFORMED_XML, 'XML declaration fields must be separated by whitespace', { position: ctx.pos });
    }
    if (ctx.text.startsWith('encoding', ctx.pos)) {
      encoding = parseVersionOrValue(ctx, 'encoding', position);
      if (!/^[A-Za-z][A-Za-z0-9._-]*$/.test(encoding)) {
        svgcageFail(ERROR.MALFORMED_XML, 'XML declaration encoding name is malformed', { position, actual: encoding });
      }
      const standaloneWhitespace = skipWhitespace(ctx);
      if (!ctx.text.startsWith('?>', ctx.pos)) {
        if (!standaloneWhitespace) {
          svgcageFail(ERROR.MALFORMED_XML, 'XML declaration fields must be separated by whitespace', { position: ctx.pos });
        }
        standalone = parseVersionOrValue(ctx, 'standalone', position);
      }
    } else {
      standalone = parseVersionOrValue(ctx, 'standalone', position);
    }
  }
  if (standalone !== null) {
    if (standalone !== 'yes' && standalone !== 'no') {
      svgcageFail(ERROR.MALFORMED_XML, 'standalone must be yes or no', { position, actual: standalone });
    }
    standalone = standalone === 'yes';
  }
  if (encoding !== null && encoding.toLowerCase() !== 'utf-8') {
    svgcageFail(ERROR.ENCODING_MISMATCH, 'svgcage accepts UTF-8 input only; declared encoding does not match', {
      position,
      actual: encoding
    });
  }
  skipWhitespace(ctx);
  if (!ctx.text.startsWith('?>', ctx.pos)) {
    svgcageFail(ERROR.MALFORMED_XML, 'XML declaration is malformed or has trailing content', { position: ctx.pos });
  }
  ctx.pos += 2;
  return {
    type: 'xml-declaration',
    version: '1.0',
    encoding: encoding === null ? null : 'UTF-8',
    standalone,
    position
  };
}

function markupDeclarationCode(text, position) {
  const probe = text.slice(position, position + 16).toLowerCase();
  if (probe.startsWith('<!doctype')) return ERROR.DOCTYPE_FORBIDDEN;
  if (probe.startsWith('<!entity')) return ERROR.ENTITY_FORBIDDEN;
  if (probe.startsWith('<!element')) return ERROR.ELEMENT_DECLARATION_FORBIDDEN;
  if (probe.startsWith('<!attlist')) return ERROR.ATTLIST_FORBIDDEN;
  if (probe.startsWith('<!notation')) return ERROR.NOTATION_FORBIDDEN;
  return ERROR.MALFORMED_XML;
}

function parseMarkupDeclarationToken(ctx) {
  const position = ctx.pos;
  const code = markupDeclarationCode(ctx.text, position);
  const messages = {
    [ERROR.DOCTYPE_FORBIDDEN]: 'DOCTYPE and DTD declarations are forbidden in SVG input',
    [ERROR.ENTITY_FORBIDDEN]: 'entity declarations are forbidden in SVG input',
    [ERROR.ELEMENT_DECLARATION_FORBIDDEN]: 'ELEMENT declarations are forbidden in SVG input',
    [ERROR.ATTLIST_FORBIDDEN]: 'ATTLIST declarations are forbidden in SVG input',
    [ERROR.NOTATION_FORBIDDEN]: 'NOTATION declarations are forbidden in SVG input',
    [ERROR.MALFORMED_XML]: 'markup declaration is not allowed in SVG input'
  };
  svgcageFail(code, messages[code], { position });
}

function parseTextToken(ctx) {
  const position = ctx.pos;
  let end = ctx.text.indexOf('<', position);
  if (end === -1) end = ctx.text.length;
  const cdataTerminator = ctx.text.indexOf(']]>', position);
  if (cdataTerminator !== -1 && cdataTerminator < end) {
    svgcageFail(ERROR.MALFORMED_XML, 'CDATA terminator sequence is forbidden in ordinary text', {
      position: cdataTerminator
    });
  }
  const value = decodeTextRange(ctx, position, end, false);
  ctx.stats.textCharacters += value.length;
  ctx.pos = end;
  return { type: 'text', value, position };
}

export function tokenizeSvgXml(text, options, stats) {
  validateXmlCharacters(text);
  const ctx = createLexer(text, options, stats);
  const tokens = [];
  if (ctx.text.startsWith('<?xml', 0) && isXmlWhitespaceUnit(ctx.text.charCodeAt(5))) {
    tokens.push(parseXmlDeclarationToken(ctx));
  }
  while (ctx.pos < ctx.text.length) {
    if (ctx.text.startsWith('<!--', ctx.pos)) {
      tokens.push(parseCommentToken(ctx));
      continue;
    }
    if (ctx.text.startsWith('<![CDATA[', ctx.pos)) {
      tokens.push(parseCdataToken(ctx));
      continue;
    }
    if (ctx.text.startsWith('<?', ctx.pos)) {
      tokens.push(parseProcessingInstructionToken(ctx));
      continue;
    }
    if (ctx.text.startsWith('<!', ctx.pos)) {
      parseMarkupDeclarationToken(ctx);
    }
    if (ctx.text.startsWith('</', ctx.pos)) {
      tokens.push(parseEndTagToken(ctx));
      continue;
    }
    if (ctx.text[ctx.pos] === '<') {
      tokens.push(parseStartTagToken(ctx));
      continue;
    }
    tokens.push(parseTextToken(ctx));
  }
  return tokens;
}

function newNode(type, position) {
  const node = Object.create(null);
  node.type = type;
  node.position = position;
  return node;
}

function validateNamespaceUri(value, position) {
  if (value.length === 0) return;
  for (let index = 0; index < value.length; index += 1) {
    const unit = value.charCodeAt(index);
    if (isXmlWhitespaceUnit(unit) || unit < 0x20) {
      svgcageFail(ERROR.MALFORMED_XML, 'namespace URI contains whitespace or a control character', { position });
    }
  }
}

function applyNamespaceBindings(state, attributes) {
  const undo = [];
  for (const attribute of attributes) {
    let prefix = null;
    if (attribute.name === 'xmlns') prefix = '';
    else if (attribute.name.startsWith('xmlns:')) prefix = attribute.name.slice(6);
    if (prefix === null) continue;
    const value = attribute.value;
    validateNamespaceUri(value, attribute.position);
    if (prefix === 'xmlns') {
      svgcageFail(ERROR.MALFORMED_XML, 'the xmlns prefix must not be rebound', { position: attribute.position });
    }
    if (prefix === 'xml' && value !== XML_NAMESPACE) {
      svgcageFail(ERROR.MALFORMED_XML, 'the xml prefix must bind to its reserved namespace', { position: attribute.position });
    }
    if (prefix !== 'xml' && value === XML_NAMESPACE) {
      svgcageFail(ERROR.MALFORMED_XML, 'the reserved XML namespace must use the xml prefix', { position: attribute.position });
    }
    if (value === XMLNS_NAMESPACE) {
      svgcageFail(ERROR.MALFORMED_XML, 'the xmlns namespace URI must not be bound as a normal namespace', { position: attribute.position });
    }
    if (prefix !== '' && value.length === 0) {
      svgcageFail(ERROR.MALFORMED_XML, 'a prefixed namespace binding must not be empty', { position: attribute.position });
    }
    undo.push({
      prefix,
      had: Object.hasOwn(state.nsBindings, prefix),
      previous: state.nsBindings[prefix]
    });
    state.nsBindings[prefix] = value;
  }
  return undo;
}

function undoNamespaceBindings(state, undo) {
  for (let index = undo.length - 1; index >= 0; index -= 1) {
    const entry = undo[index];
    if (entry.had) state.nsBindings[entry.prefix] = entry.previous;
    else delete state.nsBindings[entry.prefix];
  }
}

function lookupNamespace(state, prefix) {
  if (prefix === 'xml') return XML_NAMESPACE;
  if (prefix === 'xmlns') return XMLNS_NAMESPACE;
  if (Object.hasOwn(state.nsBindings, prefix)) {
    const value = state.nsBindings[prefix];
    return value.length === 0 ? null : value;
  }
  return null;
}

function resolveElementNamespace(state, token) {
  if (token.prefix === null) {
    return lookupNamespace(state, '') || null;
  }
  if (token.prefix === 'xmlns') {
    svgcageFail(ERROR.MALFORMED_XML, 'the xmlns prefix must not be used as an element prefix', { position: token.namePosition });
  }
  const namespaceURI = lookupNamespace(state, token.prefix);
  if (namespaceURI === null) {
    svgcageFail(ERROR.MALFORMED_XML, 'element namespace prefix is not bound', {
      position: token.namePosition,
      name: token.prefix
    });
  }
  return namespaceURI;
}

function resolveAttributeNamespaces(state, attributes) {
  const seen = new Set();
  for (const attribute of attributes) {
    if (attribute.name === 'xmlns' || attribute.name.startsWith('xmlns:')) {
      attribute.namespaceURI = XMLNS_NAMESPACE;
      continue;
    }
    const parts = splitQName(attribute.name);
    let namespaceURI = null;
    if (parts.prefix !== null) {
      if (parts.prefix === 'xmlns') {
        svgcageFail(ERROR.MALFORMED_XML, 'the xmlns prefix is reserved', { position: attribute.position });
      }
      namespaceURI = lookupNamespace(state, parts.prefix);
      if (namespaceURI === null) {
        svgcageFail(ERROR.MALFORMED_XML, 'attribute namespace prefix is not bound', {
          position: attribute.position,
          name: parts.prefix
        });
      }
    }
    attribute.namespaceURI = namespaceURI;
    const identity = (namespaceURI || '') + '\u0001' + parts.localName;
    if (seen.has(identity)) {
      svgcageFail(ERROR.DUPLICATE_ATTRIBUTE, 'duplicate attribute after namespace resolution', {
        position: attribute.position,
        attribute: attribute.name
      });
    }
    seen.add(identity);
  }
}

function makeElementNode(token, namespaceURI, depth) {
  const element = newNode('element', token.position);
  element.name = token.name;
  element.localName = token.localName;
  element.prefix = token.prefix;
  element.namespaceURI = namespaceURI;
  element.attributes = Object.create(null);
  element.attributeList = [];
  for (const attribute of token.attributes) {
    element.attributes[attribute.name] = attribute.value;
    const exposed = Object.create(null);
    exposed.name = attribute.name;
    exposed.localName = attribute.localName;
    exposed.prefix = attribute.prefix;
    exposed.namespaceURI = attribute.namespaceURI;
    exposed.value = attribute.value;
    exposed.position = attribute.position;
    element.attributeList.push(exposed);
  }
  element.children = [];
  element.depth = depth;
  return element;
}

function appendContentNode(state, node) {
  state.stack[state.stack.length - 1].element.children.push(node);
}

function isWhitespaceOnlyText(token) {
  for (let index = 0; index < token.value.length; index += 1) {
    if (!isXmlWhitespaceUnit(token.value.charCodeAt(index))) return false;
  }
  return true;
}

export function buildSvgXmlTree(tokens, options, stats) {
  const state = {
    nsBindings: Object.create(null),
    stack: [],
    rootSeen: false
  };
  const documentNode = newNode('document', 0);
  documentNode.xmlDeclaration = null;
  documentNode.root = null;
  documentNode.prolog = [];
  documentNode.epilog = [];
  documentNode.children = [];

  for (const token of tokens) {
    if (token.type === 'xml-declaration') {
      if (documentNode.xmlDeclaration !== null || documentNode.children.length > 0) {
        svgcageFail(ERROR.MALFORMED_XML, 'XML declaration is only allowed at the start of the document', {
          position: token.position
        });
      }
      documentNode.xmlDeclaration = Object.freeze({
        version: token.version,
        encoding: token.encoding,
        standalone: token.standalone
      });
      continue;
    }

    if (state.stack.length === 0) {
      if (token.type === 'text') {
        if (isWhitespaceOnlyText(token)) continue;
        svgcageFail(ERROR.MALFORMED_XML, 'character data is not allowed outside the root element', {
          position: token.position
        });
      }
      if (token.type === 'comment' || token.type === 'processing-instruction') {
        if (state.rootSeen) documentNode.epilog.push(token);
        else documentNode.prolog.push(token);
        documentNode.children.push(token);
        continue;
      }
      if (token.type === 'cdata') {
        svgcageFail(ERROR.MALFORMED_XML, 'CDATA is not allowed outside the root element', {
          position: token.position
        });
      }
      if (token.type === 'end-tag') {
        svgcageFail(ERROR.MALFORMED_XML, 'end tag has no matching start tag', {
          position: token.position,
          name: token.name
        });
      }
      if (token.type !== 'start-tag') {
        svgcageFail(ERROR.MALFORMED_XML, 'unexpected token outside the root element', {
          position: token.position
        });
      }
      if (state.rootSeen) {
        svgcageFail(ERROR.MALFORMED_XML, 'XML document must contain exactly one root element', {
          position: token.position
        });
      }
    }

    if (token.type === 'start-tag') {
      const depth = state.stack.length + 1;
      if (depth > options.maxDepth) {
        svgcageFail(ERROR.MAX_DEPTH, 'maximum SVG nesting depth exceeded', {
          position: token.position,
          limit: options.maxDepth,
          actual: depth,
          depth
        });
      }
      const undo = applyNamespaceBindings(state, token.attributes);
      const namespaceURI = resolveElementNamespace(state, token);
      resolveAttributeNamespaces(state, token.attributes);
      const element = makeElementNode(token, namespaceURI, depth);
      if (state.stack.length === 0) {
        documentNode.root = element;
        documentNode.children.push(element);
      } else {
        appendContentNode(state, element);
      }
      state.rootSeen = true;
      if (depth > stats.maxDepthObserved) stats.maxDepthObserved = depth;
      if (!token.selfClosing) {
        state.stack.push({ name: token.name, element, undo, depth });
      } else {
        undoNamespaceBindings(state, undo);
      }
      continue;
    }

    if (token.type === 'end-tag') {
      if (state.stack.length === 0) {
        svgcageFail(ERROR.MALFORMED_XML, 'end tag has no matching start tag', {
          position: token.position,
          name: token.name
        });
      }
      const frame = state.stack[state.stack.length - 1];
      if (frame.name !== token.name) {
        svgcageFail(ERROR.MALFORMED_XML, 'end tag does not match the open element', {
          position: token.position,
          name: token.name,
          expected: frame.name
        });
      }
      state.stack.pop();
      undoNamespaceBindings(state, frame.undo);
      continue;
    }

    if (state.stack.length === 0) continue;
    if (token.type === 'text' || token.type === 'cdata' || token.type === 'comment' || token.type === 'processing-instruction') {
      const node = newNode(token.type, token.position);
      if (token.type === 'processing-instruction') {
        node.target = token.target;
        node.data = token.data;
      } else {
        node.value = token.value;
      }
      appendContentNode(state, node);
      continue;
    }
  }

  if (state.stack.length > 0) {
    const frame = state.stack[state.stack.length - 1];
    svgcageFail(ERROR.MALFORMED_XML, 'document ended before the root element was closed', {
      position: -1,
      name: frame.name
    });
  }
  if (!state.rootSeen || documentNode.root === null) {
    svgcageFail(ERROR.MALFORMED_XML, 'XML document must contain a root element', { position: -1 });
  }
  return documentNode;
}

export function parseSvgXmlDocument(text, options, existingStats) {
  const stats = existingStats || emptySvgStats();
  const tokens = tokenizeSvgXml(text, options, stats);
  const documentNode = buildSvgXmlTree(tokens, options, stats);
  return { document: documentNode, stats, tokens };
}
