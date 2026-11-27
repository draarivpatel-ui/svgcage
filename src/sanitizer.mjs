import {
  SVG_NAMESPACE,
  XLINK_NAMESPACE,
  XML_NAMESPACE,
  XMLNS_NAMESPACE,
  SVGCAGE_ERROR_CODES
} from './constants.mjs';
import { SvgCageError } from './errors.mjs';
import {
  CSS_ALLOWED_PROPERTIES,
  analyzeCssValue,
  sanitizeCssDeclarations,
  sanitizeCssStylesheet
} from './css.mjs';
import { analyzeSvgUri, uriProbeLooksActive } from './uri.mjs';
import {
  addSvgFinding,
  copySvgStats,
  escapeXmlAttribute,
  escapeXmlText,
  hasExcessiveNumber,
  isAsciiLetter,
  isStrictSvgId,
  scanNumericLiterals,
  trimAsciiWhitespaceAndControls,
  utf8ByteLength
} from './xml-utils.mjs';

const ERROR = SVGCAGE_ERROR_CODES;

export const SVG_ALLOWED_ELEMENTS = new Set([
  'svg',
  'g',
  'defs',
  'desc',
  'title',
  'symbol',
  'use',
  'switch',
  'marker',
  'pattern',
  'clipPath',
  'mask',
  'linearGradient',
  'radialGradient',
  'stop',
  'path',
  'rect',
  'circle',
  'ellipse',
  'line',
  'polyline',
  'polygon',
  'text',
  'tspan',
  'textPath',
  'image',
  'filter',
  'feBlend',
  'feColorMatrix',
  'feComponentTransfer',
  'feFuncR',
  'feFuncG',
  'feFuncB',
  'feFuncA',
  'feComposite',
  'feConvolveMatrix',
  'feDiffuseLighting',
  'feDistantLight',
  'feDisplacementMap',
  'feDropShadow',
  'feFlood',
  'feGaussianBlur',
  'feImage',
  'feMerge',
  'feMergeNode',
  'feMorphology',
  'feOffset',
  'fePointLight',
  'feSpecularLighting',
  'feSpotLight',
  'feTile',
  'feTurbulence',
  'view',
  'animate',
  'animateMotion',
  'animateTransform',
  'set',
  'mpath'
]);

const EMBEDDED_CONTENT_ELEMENTS = new Set([
  'iframe',
  'object',
  'embed',
  'applet',
  'audio',
  'video',
  'canvas',
  'form',
  'input',
  'meta',
  'link',
  'base',
  'frame',
  'frameset',
  'portal',
  'img',
  'picture',
  'source',
  'track',
  'button',
  'select',
  'textarea'
]);

const ANIMATION_ELEMENTS = new Set(['animate', 'animateMotion', 'animateTransform', 'set']);

const FILTER_ELEMENTS = new Set([
  'feBlend',
  'feColorMatrix',
  'feComponentTransfer',
  'feFuncR',
  'feFuncG',
  'feFuncB',
  'feFuncA',
  'feComposite',
  'feConvolveMatrix',
  'feDiffuseLighting',
  'feDistantLight',
  'feDisplacementMap',
  'feDropShadow',
  'feFlood',
  'feGaussianBlur',
  'feImage',
  'feMerge',
  'feMergeNode',
  'feMorphology',
  'feOffset',
  'fePointLight',
  'feSpecularLighting',
  'feSpotLight',
  'feTile',
  'feTurbulence'
]);

const HREF_ELEMENTS = new Set([
  'use',
  'image',
  'feImage',
  'mpath',
  'textPath',
  'linearGradient',
  'radialGradient',
  'pattern'
]);

const DATA_IMAGE_ELEMENTS = new Set(['image', 'feImage']);

const FORBIDDEN_URI_ATTRIBUTES = new Set([
  'src',
  'action',
  'formaction',
  'poster',
  'background',
  'data'
]);

const GENERAL_ATTRIBUTES = new Set([
  'id',
  'class',
  'role',
  'tabindex',
  'focusable',
  'lang',
  'version',
  'baseProfile',
  'viewBox',
  'preserveAspectRatio',
  'zoomAndPan',
  'x',
  'y',
  'z',
  'width',
  'height',
  'cx',
  'cy',
  'r',
  'rx',
  'ry',
  'x1',
  'x2',
  'y1',
  'y2',
  'dx',
  'dy',
  'fx',
  'fy',
  'fr',
  'points',
  'd',
  'pathLength',
  'startOffset',
  'method',
  'spacing',
  'side',
  'textLength',
  'lengthAdjust',
  'gradientUnits',
  'gradientTransform',
  'spreadMethod',
  'patternUnits',
  'patternContentUnits',
  'patternTransform',
  'markerUnits',
  'markerWidth',
  'markerHeight',
  'orient',
  'refX',
  'refY',
  'clipPathUnits',
  'maskUnits',
  'maskContentUnits',
  'primitiveUnits',
  'filterUnits',
  'filterRes',
  'transform',
  'type',
  'rotate',
  'scale',
  'origin',
  'operator',
  'mode',
  'radius',
  'stdDeviation',
  'baseFrequency',
  'numOctaves',
  'seed',
  'stitchTiles',
  'k1',
  'k2',
  'k3',
  'k4',
  'order',
  'kernelMatrix',
  'divisor',
  'bias',
  'targetX',
  'targetY',
  'edgeMode',
  'kernelUnitLength',
  'preserveAlpha',
  'surfaceScale',
  'specularConstant',
  'specularExponent',
  'limitingConeAngle',
  'pointsAtX',
  'pointsAtY',
  'pointsAtZ',
  'azimuth',
  'elevation',
  'diffuseConstant',
  'tableValues',
  'slope',
  'intercept',
  'amplitude',
  'exponent',
  'offset',
  'xChannelSelector',
  'yChannelSelector',
  'result',
  'in',
  'in2'
]);

const ANIMATION_ATTRIBUTES = new Set([
  'attributeName',
  'attributeType',
  'begin',
  'dur',
  'end',
  'min',
  'max',
  'restart',
  'repeatCount',
  'repeatDur',
  'fill',
  'keyTimes',
  'keySplines',
  'keyPoints',
  'calcMode',
  'additive',
  'accumulate',
  'from',
  'to',
  'by',
  'values',
  'path',
  'rotate',
  'type',
  'origin'
]);

const NUMERIC_CAP_ATTRIBUTES = new Set([
  'viewBox',
  'x',
  'y',
  'z',
  'width',
  'height',
  'cx',
  'cy',
  'r',
  'rx',
  'ry',
  'x1',
  'x2',
  'y1',
  'y2',
  'dx',
  'dy',
  'fx',
  'fy',
  'fr',
  'points',
  'd',
  'pathLength',
  'startOffset',
  'textLength',
  'refX',
  'refY',
  'markerWidth',
  'markerHeight',
  'filterRes',
  'radius',
  'stdDeviation',
  'baseFrequency',
  'numOctaves',
  'seed',
  'k1',
  'k2',
  'k3',
  'k4',
  'order',
  'kernelMatrix',
  'divisor',
  'bias',
  'targetX',
  'targetY',
  'kernelUnitLength',
  'surfaceScale',
  'specularConstant',
  'specularExponent',
  'limitingConeAngle',
  'pointsAtX',
  'pointsAtY',
  'pointsAtZ',
  'azimuth',
  'elevation',
  'diffuseConstant',
  'tableValues',
  'slope',
  'intercept',
  'amplitude',
  'exponent',
  'offset',
  'stroke-width',
  'stroke-dasharray',
  'stroke-dashoffset',
  'stroke-miterlimit',
  'fill-opacity',
  'stroke-opacity',
  'stop-opacity',
  'opacity',
  'font-size',
  'letter-spacing',
  'word-spacing',
  'keyTimes',
  'keySplines',
  'keyPoints',
  'values',
  'path',
  'transform',
  'gradientTransform',
  'patternTransform'
]);

const TRANSFORM_ATTRIBUTES = new Set(['transform', 'gradientTransform', 'patternTransform']);
const PATH_ATTRIBUTES = new Set(['d', 'path']);
const URL_CAPABLE_ANIMATION_TARGETS = new Set([
  'fill',
  'stroke',
  'filter',
  'clip-path',
  'mask',
  'marker-start',
  'marker-mid',
  'marker-end'
]);

function asciiLower(value) {
  return value.replace(/[A-Z]/g, (character) => character.toLowerCase());
}

function createSanitizerContext(policy, stats, lineIndexer) {
  return {
    policy,
    stats,
    lineIndexer,
    findings: [],
    strippedElements: [],
    strippedAttributes: [],
    note(code, message, details) {
      addSvgFinding(this.findings, policy, code, message, details, lineIndexer);
    },
    stripElement(element, code, message) {
      this.strippedElements.push({
        name: element.localName || element.name,
        code,
        reason: message
      });
      this.stats.strippedElements += 1;
      this.note(code, message, {
        position: element.position,
        element: element.localName || element.name
      });
    },
    stripAttribute(element, attribute, code, message) {
      this.strippedAttributes.push({
        element: element.localName || element.name,
        name: attribute.name,
        code,
        reason: message
      });
      this.stats.strippedAttributes += 1;
      this.note(code, message, {
        position: attribute.position,
        element: element.localName || element.name,
        attribute: attribute.name
      });
    },
    cssIssues(element, attribute, issues) {
      for (const item of issues) {
        this.note(item.code, item.message, {
          position: attribute ? attribute.position : element.position,
          element: element.localName || element.name,
          attribute: attribute ? attribute.name : undefined,
          property: item.property
        });
      }
    }
  };
}

function elementViolationCode(element) {
  const local = element.localName;
  const lower = asciiLower(local);
  if (lower === 'script') return ERROR.SCRIPT_ELEMENT;
  if (lower === 'foreignobject') return ERROR.FOREIGN_OBJECT_ELEMENT;
  if (EMBEDDED_CONTENT_ELEMENTS.has(lower)) return ERROR.EMBEDDED_CONTENT_ELEMENT;
  if (local === 'style') return null;
  if (!SVG_ALLOWED_ELEMENTS.has(local)) return ERROR.ELEMENT_NOT_ALLOWED;
  return null;
}

function namespaceIsAllowed(element, ctx) {
  if (ctx.rootNamespace === SVG_NAMESPACE) return element.namespaceURI === SVG_NAMESPACE;
  return element.namespaceURI === null || element.namespaceURI === SVG_NAMESPACE;
}

function copyAttributeWith(attribute, name, value) {
  const copy = Object.create(null);
  copy.name = name;
  copy.localName = name.includes(':') ? name.slice(name.indexOf(':') + 1) : name;
  copy.prefix = name.includes(':') ? name.slice(0, name.indexOf(':')) : null;
  copy.namespaceURI = name.startsWith('xml:') ? XML_NAMESPACE : null;
  copy.value = value;
  copy.position = attribute.position;
  return copy;
}

function rebuildAttributeMap(element) {
  element.attributes = Object.create(null);
  for (const attribute of element.attributeList) {
    element.attributes[attribute.name] = attribute.value;
  }
}

function canonicalPlainAttributeValue(value) {
  let output = '';
  for (let index = 0; index < value.length; index += 1) {
    const unit = value.charCodeAt(index);
    if (unit === 0x9 || unit === 0xa || unit === 0xd) {
      output += ' ';
    } else if (unit < 0x20 || unit === 0x7f) {
      return null;
    } else {
      output += value[index];
    }
  }
  return output;
}

function countPathCommands(value) {
  let count = 0;
  let index = 0;
  while (index < value.length) {
    const character = value[index];
    if (isAsciiLetter(character)) {
      count += 1;
      index += 1;
      continue;
    }
    if ((character >= '0' && character <= '9') || character === '+' || character === '-' || character === '.') {
      let end = index;
      if (value[end] === '+' || value[end] === '-') end += 1;
      while (end < value.length && value[end] >= '0' && value[end] <= '9') end += 1;
      if (value[end] === '.') {
        end += 1;
        while (end < value.length && value[end] >= '0' && value[end] <= '9') end += 1;
      }
      if ((value[end] === 'e' || value[end] === 'E') && end + 1 < value.length) {
        let exponent = end + 1;
        if (value[exponent] === '+' || value[exponent] === '-') exponent += 1;
        let digits = 0;
        while (exponent < value.length && value[exponent] >= '0' && value[exponent] <= '9') {
          exponent += 1;
          digits += 1;
        }
        if (digits > 0) end = exponent;
      }
      index = Math.max(end, index + 1);
      continue;
    }
    index += 1;
  }
  return count;
}

function validateNumericCaps(element, attribute, value, ctx) {
  if (!NUMERIC_CAP_ATTRIBUTES.has(attribute.name)) return true;
  if (hasExcessiveNumber(value, ctx.policy.maxCoordinateValue)) {
    ctx.stripAttribute(element, attribute, ERROR.MAX_COORDINATE_VALUE, 'coordinate or numeric value exceeds the configured SVG resource cap');
    return false;
  }
  if (attribute.name === 'viewBox') {
    let count = 0;
    scanNumericLiterals(value, () => {
      count += 1;
    });
    if (count !== 4) {
      ctx.stripAttribute(element, attribute, ERROR.INVALID_COORDINATE, 'viewBox must contain exactly four numeric values');
      return false;
    }
  }
  return true;
}

function validatePathAttribute(element, attribute, value, ctx) {
  const commands = countPathCommands(value);
  ctx.stats.pathCommands += commands;
  if (commands > ctx.policy.maxPathCommands) {
    ctx.stripAttribute(element, attribute, ERROR.MAX_PATH_COMMANDS, 'maximum SVG path command count exceeded');
    return false;
  }
  return validateNumericCaps(element, attribute, value, ctx);
}

function scanTransformFunctions(value) {
  const allowed = new Set(['matrix', 'translate', 'scale', 'rotate', 'skewx', 'skewy']);
  const pattern = /([A-Za-z][A-Za-z0-9]*)\s*\(/g;
  let match;
  while ((match = pattern.exec(value)) !== null) {
    if (!allowed.has(match[1].toLowerCase())) return false;
  }
  return !value.includes('\\') && !value.includes('@') && !value.includes('<') && !value.includes('>');
}

function validateTransformAttribute(element, attribute, value, ctx) {
  if (!scanTransformFunctions(value)) {
    ctx.stripAttribute(element, attribute, ERROR.INVALID_COORDINATE, 'transform contains a function outside the strict SVG transform allowlist');
    return false;
  }
  return validateNumericCaps(element, attribute, value, ctx);
}

function validateClassAttribute(element, attribute, value, ctx) {
  for (let index = 0; index < value.length; index += 1) {
    const unit = value.charCodeAt(index);
    if ((unit < 0x20 && unit !== 0x9 && unit !== 0xa && unit !== 0xd) || unit === 0x7f) {
      ctx.stripAttribute(element, attribute, ERROR.ATTRIBUTE_NOT_ALLOWED, 'class attribute contains a forbidden control character');
      return null;
    }
  }
  return value.split(/[ \t\n\r]+/).filter((part) => part.length > 0).join(' ');
}

function isHrefLikeAttribute(attribute) {
  if (asciiLower(attribute.localName) !== 'href') return false;
  if (attribute.namespaceURI === null) return attribute.prefix === null;
  return attribute.namespaceURI === XLINK_NAMESPACE;
}

function semanticHrefDuplicates(attributes) {
  const hrefLike = attributes.filter((attribute) => isHrefLikeAttribute(attribute));
  return hrefLike.length > 1 ? hrefLike : [];
}

function attributeIsAnimationOnly(name) {
  return ANIMATION_ATTRIBUTES.has(name);
}

function attributeAllowedOnElement(element, name) {
  if (GENERAL_ATTRIBUTES.has(name)) return true;
  if (name === 'xml:space' || name === 'xml:lang') return true;
  if (CSS_ALLOWED_PROPERTIES.has(name)) return true;
  if (name.startsWith('aria-') && name.length > 5) return true;
  if (ANIMATION_ELEMENTS.has(element.localName) && attributeIsAnimationOnly(name)) return true;
  if (FILTER_ELEMENTS.has(element.localName) && (name === 'values' || name === 'type' || name === 'in' || name === 'in2' || name === 'result')) return true;
  return false;
}

function validateSimpleEnumerations(element, attribute, value, ctx) {
  const name = attribute.name;
  if (name === 'xml:space' && value !== 'default' && value !== 'preserve') {
    ctx.stripAttribute(element, attribute, ERROR.ATTRIBUTE_NOT_ALLOWED, 'xml:space must be default or preserve');
    return false;
  }
  if (name === 'tabindex' && !/^[+-]?\d+$/.test(value)) {
    ctx.stripAttribute(element, attribute, ERROR.ATTRIBUTE_NOT_ALLOWED, 'tabindex must be an integer');
    return false;
  }
  if (name === 'focusable' && value !== 'true' && value !== 'false' && value !== 'auto') {
    ctx.stripAttribute(element, attribute, ERROR.ATTRIBUTE_NOT_ALLOWED, 'focusable must be true, false, or auto');
    return false;
  }
  if (name === 'role' && !/^[A-Za-z][A-Za-z0-9_-]*$/.test(value)) {
    ctx.stripAttribute(element, attribute, ERROR.ATTRIBUTE_NOT_ALLOWED, 'role must be a single safe token');
    return false;
  }
  return true;
}

function sanitizeOneAttribute(element, attribute, ctx) {
  const originalName = attribute.name;
  const lowerLocal = asciiLower(attribute.localName);
  const lowerName = asciiLower(originalName);

  if (originalName === 'xmlns' || originalName.startsWith('xmlns:')) {
    return null;
  }
  if (lowerLocal.startsWith('on')) {
    ctx.stripAttribute(element, attribute, ERROR.EVENT_HANDLER_ATTRIBUTE, 'event handler attributes are forbidden in SVG');
    return null;
  }
  if (attribute.namespaceURI !== null && attribute.namespaceURI !== XLINK_NAMESPACE && attribute.namespaceURI !== XML_NAMESPACE && attribute.namespaceURI !== XMLNS_NAMESPACE) {
    ctx.stripAttribute(element, attribute, ERROR.NAMESPACE_FORBIDDEN, 'attributes outside the SVG, XML, and XLink namespace contract are forbidden');
    return null;
  }
  if (attribute.namespaceURI === XML_NAMESPACE) {
    if (originalName !== 'xml:space' && originalName !== 'xml:lang') {
      ctx.stripAttribute(element, attribute, ERROR.ATTRIBUTE_NOT_ALLOWED, 'only xml:space and xml:lang are allowed from the XML namespace');
      return null;
    }
  } else if (attribute.prefix !== null && !isHrefLikeAttribute(attribute)) {
    ctx.stripAttribute(element, attribute, ERROR.NAMESPACE_FORBIDDEN, 'prefixed attributes outside the controlled XLink href migration are forbidden');
    return null;
  }

  if (FORBIDDEN_URI_ATTRIBUTES.has(lowerLocal)) {
    if (uriProbeLooksActive(attribute.value)) {
      ctx.stripAttribute(element, attribute, ERROR.DANGEROUS_URI_SCHEME, 'active script URL schemes are forbidden in resource attributes');
    } else {
      ctx.stripAttribute(element, attribute, ERROR.EXTERNAL_REFERENCE, 'resource-loading attributes such as src, action, and formaction are forbidden in SVG');
    }
    return null;
  }

  if (isHrefLikeAttribute(attribute)) {
    if (!HREF_ELEMENTS.has(element.localName)) {
      ctx.stripAttribute(element, attribute, ERROR.ATTRIBUTE_NOT_ALLOWED, 'href is not allowed on this SVG element');
      return null;
    }
    const analysis = analyzeSvgUri(attribute.value, { image: DATA_IMAGE_ELEMENTS.has(element.localName) }, ctx.policy);
    if (!analysis.ok) {
      ctx.stripAttribute(element, attribute, analysis.code, analysis.message);
      return null;
    }
    return copyAttributeWith(attribute, 'href', analysis.normalized);
  }

  if (lowerName === 'style') {
    const declarations = sanitizeCssDeclarations(attribute.value, ctx.policy.maxCoordinateValue);
    ctx.cssIssues(element, attribute, declarations.issues);
    ctx.stats.cssDeclarations += declarations.css.length === 0 ? 0 : declarations.css.split(';').length;
    if (declarations.css.length === 0) {
      if (declarations.issues.length === 0) {
        ctx.stripAttribute(element, attribute, ERROR.CSS_INVALID, 'style attribute contains no safe CSS declarations');
      }
      return null;
    }
    return copyAttributeWith(attribute, 'style', declarations.css);
  }

  const canonicalName = originalName;
  if (!attributeAllowedOnElement(element, canonicalName)) {
    ctx.stripAttribute(element, attribute, ERROR.ATTRIBUTE_NOT_ALLOWED, 'attribute is not in the strict SVG allowlist');
    return null;
  }

  if (canonicalName === 'id') {
    if (!isStrictSvgId(attribute.value)) {
      ctx.stripAttribute(element, attribute, ERROR.INVALID_ID, 'id attributes must use the strict SVG identifier subset');
      return null;
    }
    return copyAttributeWith(attribute, canonicalName, attribute.value);
  }

  const plain = canonicalPlainAttributeValue(attribute.value);
  if (plain === null) {
    ctx.stripAttribute(element, attribute, ERROR.ATTRIBUTE_NOT_ALLOWED, 'attribute contains a forbidden control character');
    return null;
  }

  let value = plain;
  if (canonicalName === 'class') {
    value = validateClassAttribute(element, attribute, value, ctx);
    if (value === null) return null;
    if (value.length === 0) return null;
  }

  if (!validateSimpleEnumerations(element, attribute, value, ctx)) return null;

  if (CSS_ALLOWED_PROPERTIES.has(canonicalName) && !(ANIMATION_ELEMENTS.has(element.localName) && canonicalName === 'fill')) {
    const analysis = analyzeCssValue(canonicalName, value, ctx.policy.maxCoordinateValue);
    ctx.cssIssues(element, attribute, analysis.issues);
    if (!analysis.ok) return null;
    value = analysis.canonical;
  }

  if (PATH_ATTRIBUTES.has(canonicalName) && (canonicalName === 'd' || element.localName === 'animateMotion')) {
    if (!validatePathAttribute(element, attribute, value, ctx)) return null;
  } else if (TRANSFORM_ATTRIBUTES.has(canonicalName)) {
    if (!validateTransformAttribute(element, attribute, value, ctx)) return null;
  } else if (!validateNumericCaps(element, attribute, value, ctx)) {
    return null;
  }

  if ((canonicalName === 'from' || canonicalName === 'to' || canonicalName === 'by' || canonicalName === 'values') && ANIMATION_ELEMENTS.has(element.localName)) {
    return copyAttributeWith(attribute, canonicalName, value);
  }
  return copyAttributeWith(attribute, canonicalName, value);
}

function sanitizeElementAttributes(element, ctx) {
  const original = element.attributeList;
  const dropAll = new Set();

  const caseGroups = new Map();
  for (const attribute of original) {
    const key = asciiLower(attribute.name);
    if (!caseGroups.has(key)) caseGroups.set(key, []);
    caseGroups.get(key).push(attribute);
  }
  for (const group of caseGroups.values()) {
    if (group.length > 1) {
      for (const attribute of group) {
        if (!dropAll.has(attribute)) {
          dropAll.add(attribute);
          ctx.stripAttribute(element, attribute, ERROR.CASE_INSENSITIVE_DUPLICATE_ATTRIBUTE, 'attributes differing only by ASCII case are forbidden as parser differentials');
        }
      }
    }
  }

  for (const attribute of semanticHrefDuplicates(original)) {
    if (!dropAll.has(attribute)) {
      dropAll.add(attribute);
      ctx.stripAttribute(element, attribute, ERROR.SEMANTIC_DUPLICATE_ATTRIBUTE, 'href and xlink:href duplicates are forbidden; use one canonical href attribute');
    }
  }

  const output = [];
  for (const attribute of original) {
    if (dropAll.has(attribute)) continue;
    const sanitized = sanitizeOneAttribute(element, attribute, ctx);
    if (sanitized !== null) output.push(sanitized);
  }
  element.attributeList = output;
  rebuildAttributeMap(element);
}

function animationTargetName(raw) {
  const trimmed = trimAsciiWhitespaceAndControls(raw);
  const colon = trimmed.lastIndexOf(':');
  const local = colon === -1 ? trimmed : trimmed.slice(colon + 1);
  return asciiLower(local);
}

function animationValues(element) {
  const values = [];
  for (const name of ['from', 'to', 'by', 'values']) {
    if (typeof element.attributes[name] === 'string') values.push(element.attributes[name]);
  }
  return values;
}

function validateAnimationElement(element, ctx) {
  if (!ANIMATION_ELEMENTS.has(element.localName)) return true;
  const rawTarget = element.attributes.attributeName;
  if (typeof rawTarget !== 'string' || rawTarget.trim().length === 0) {
    ctx.stripElement(element, ERROR.ATTRIBUTE_NOT_ALLOWED, 'SVG animation elements must declare a safe attributeName');
    return false;
  }
  const target = animationTargetName(rawTarget);
  if (target.length === 0 || target.includes(' ') || target.includes('\t')) {
    ctx.stripElement(element, ERROR.ATTRIBUTE_NOT_ALLOWED, 'SVG animation target attributeName is malformed');
    return false;
  }
  if (target.startsWith('on')) {
    ctx.stripElement(element, ERROR.ANIMATION_EVENT_TARGET, 'SVG animation elements must not target event handler attributes');
    return false;
  }
  if (target === 'href' || target === 'src' || target === 'srcset' || target === 'action' || target === 'formaction' || target === 'poster' || target === 'background' || target === 'data' || target === 'style' || target === 'xlink:href') {
    ctx.stripElement(element, ERROR.ANIMATION_HREF_TARGET, 'SVG animation elements must not mutate URL, style, or resource-loading attributes');
    return false;
  }
  const values = animationValues(element);
  if (URL_CAPABLE_ANIMATION_TARGETS.has(target)) {
    for (const value of values) {
      const analysis = analyzeCssValue(target, value, ctx.policy.maxCoordinateValue);
      if (!analysis.ok) {
        for (const item of analysis.issues) {
          ctx.note(item.code, item.message, {
            position: element.position,
            element: element.localName,
            attribute: 'attributeName'
          });
        }
        ctx.stripElement(element, ERROR.ANIMATION_DANGEROUS_VALUE, 'SVG animation would mutate a URL-capable property to a forbidden value');
        return false;
      }
    }
    return true;
  }
  for (const value of values) {
    const pieces = value.split(';');
    for (const piece of pieces) {
      if (uriProbeLooksActive(piece)) {
        ctx.stripElement(element, ERROR.ANIMATION_DANGEROUS_VALUE, 'SVG animation values contain an active script URL scheme');
        return false;
      }
    }
    const lowered = asciiLower(value);
    if (lowered.includes('url(') || lowered.includes('expression(') || lowered.includes('@import')) {
      ctx.stripElement(element, ERROR.ANIMATION_DANGEROUS_VALUE, 'SVG animation values contain a CSS resource or active construct');
      return false;
    }
  }
  return true;
}

function childTextContent(element) {
  const parts = [];
  for (const child of element.children) {
    if (child.type === 'text' || child.type === 'cdata') parts.push(child.value);
  }
  return parts.join('');
}

function sanitizeStyleElement(element, ctx) {
  if (!ctx.policy.allowStyleElements) {
    ctx.stripElement(element, ERROR.STYLE_ELEMENT_FORBIDDEN, 'style elements are forbidden by the default SVG security policy');
    return false;
  }
  for (const child of element.children) {
    if (child.type === 'element') {
      ctx.stripElement(element, ERROR.CSS_INVALID, 'style elements must not contain child elements');
      return false;
    }
  }
  const sanitized = sanitizeCssStylesheet(childTextContent(element), ctx.policy.maxCoordinateValue);
  ctx.cssIssues(element, null, sanitized.issues);
  if (sanitized.css.length === 0) {
    ctx.stripElement(element, ERROR.CSS_INVALID, 'style element contains no safe CSS rules');
    return false;
  }
  const text = Object.create(null);
  text.type = 'text';
  text.position = element.position;
  text.value = sanitized.css;
  element.children = [text];
  element.attributeList = [];
  rebuildAttributeMap(element);
  ctx.stats.cssDeclarations += sanitized.css.split(';').length;
  return true;
}

function sanitizeTree(root, ctx) {
  const stack = [root];
  while (stack.length > 0) {
    const element = stack.pop();
    sanitizeElementAttributes(element, ctx);
    const kept = [];
    for (const child of element.children) {
      if (child.type === 'element') {
        if (!namespaceIsAllowed(child, ctx)) {
          ctx.stripElement(child, ERROR.NAMESPACE_FORBIDDEN, 'elements outside the SVG namespace are forbidden');
          continue;
        }
        const violation = elementViolationCode(child);
        if (violation !== null) {
          const messages = {
            [ERROR.SCRIPT_ELEMENT]: 'script elements are forbidden in SVG',
            [ERROR.FOREIGN_OBJECT_ELEMENT]: 'foreignObject elements are forbidden because they embed active HTML content',
            [ERROR.EMBEDDED_CONTENT_ELEMENT]: 'embedded or interactive non-SVG content elements are forbidden',
            [ERROR.ELEMENT_NOT_ALLOWED]: 'element is not in the strict SVG allowlist'
          };
          ctx.stripElement(child, violation, messages[violation] || 'element is forbidden');
          continue;
        }
        if (child.localName === 'style' && !sanitizeStyleElement(child, ctx)) continue;
        kept.push(child);
        stack.push(child);
        continue;
      }
      if (child.type === 'comment' || child.type === 'processing-instruction') {
        continue;
      }
      if (child.type === 'cdata') {
        child.type = 'text';
        kept.push(child);
        continue;
      }
      kept.push(child);
    }
    element.children = kept;
  }
}


function pruneInvalidAnimations(root, ctx) {
  const walk = [root];
  while (walk.length > 0) {
    const element = walk.pop();
    const kept = [];
    for (const child of element.children) {
      if (child.type === 'element') {
        if (ANIMATION_ELEMENTS.has(child.localName) && !validateAnimationElement(child, ctx)) {
          continue;
        }
        walk.push(child);
      }
      kept.push(child);
    }
    element.children = kept;
  }
}

function collectElements(root) {
  const order = [];
  const stack = [root];
  while (stack.length > 0) {
    const element = stack.pop();
    order.push(element);
    for (let index = element.children.length - 1; index >= 0; index -= 1) {
      const child = element.children[index];
      if (child.type === 'element') stack.push(child);
    }
  }
  return order;
}

function collectAndDeduplicateIds(root, ctx) {
  const ids = new Map();
  for (const element of collectElements(root)) {
    const id = element.attributes.id;
    if (typeof id !== 'string') continue;
    if (ids.has(id)) {
      const attribute = element.attributeList.find((item) => item.name === 'id');
      if (attribute) {
        element.attributeList = element.attributeList.filter((item) => item !== attribute);
        rebuildAttributeMap(element);
        ctx.stripAttribute(element, attribute, ERROR.DUPLICATE_ID, 'duplicate SVG id attributes are forbidden');
      }
      continue;
    }
    ids.set(id, element);
  }
  return ids;
}

function computeUseGraph(root, ids) {
  const order = collectElements(root);
  const staticCount = new Map();
  const inclusiveUses = new Map();
  for (let index = order.length - 1; index >= 0; index -= 1) {
    const element = order[index];
    let count = 1;
    const uses = element.localName === 'use' ? [element] : [];
    for (const child of element.children) {
      if (child.type !== 'element') continue;
      count += staticCount.get(child);
      uses.push(...inclusiveUses.get(child));
    }
    staticCount.set(element, count);
    inclusiveUses.set(element, uses);
  }

  const useElements = [];
  const dependencies = new Map();
  for (const [id, element] of ids.entries()) {
    const deps = [];
    for (const use of inclusiveUses.get(element)) {
      const href = use.attributes.href;
      if (typeof href === 'string' && href.startsWith('#')) {
        const target = href.slice(1);
        if (ids.has(target)) deps.push(target);
      }
    }
    dependencies.set(id, deps);
  }
  for (const element of order) {
    if (element.localName === 'use') useElements.push(element);
  }
  return { order, staticCount, inclusiveUses, dependencies, useElements };
}

function detectUseCycles(ids, dependencies) {
  const color = new Map();
  const cyclic = new Set();
  for (const id of ids.keys()) color.set(id, 0);
  for (const start of ids.keys()) {
    if (color.get(start) !== 0) continue;
    const stack = [{ id: start, index: 0 }];
    const path = [start];
    color.set(start, 1);
    while (stack.length > 0) {
      const frame = stack[stack.length - 1];
      const deps = dependencies.get(frame.id) || [];
      if (frame.index < deps.length) {
        const next = deps[frame.index];
        frame.index += 1;
        const nextColor = color.get(next) || 0;
        if (nextColor === 0) {
          color.set(next, 1);
          stack.push({ id: next, index: 0 });
          path.push(next);
        } else if (nextColor === 1) {
          const cycleStart = path.indexOf(next);
          for (let index = Math.max(0, cycleStart); index < path.length; index += 1) {
            cyclic.add(path[index]);
          }
        }
        continue;
      }
      color.set(frame.id, 2);
      stack.pop();
      path.pop();
    }
  }
  if (cyclic.size === 0) return new Set();
  const reverse = new Map();
  for (const [source, deps] of dependencies.entries()) {
    for (const dep of deps) {
      if (!reverse.has(dep)) reverse.set(dep, []);
      reverse.get(dep).push(source);
    }
  }
  const leads = new Set(cyclic);
  const queue = [...cyclic];
  while (queue.length > 0) {
    const current = queue.shift();
    for (const source of reverse.get(current) || []) {
      if (!leads.has(source)) {
        leads.add(source);
        queue.push(source);
      }
    }
  }
  return leads;
}

function computeUseWeights(starts, dependencies, staticCount, cap) {
  const memo = new Map();
  const resolve = (start) => {
    if (memo.has(start)) return memo.get(start);
    const stack = [{ id: start, index: 0, total: staticCount.get(start) || 1 }];
    while (stack.length > 0) {
      const frame = stack[stack.length - 1];
      const deps = dependencies.get(frame.id) || [];
      if (frame.index < deps.length) {
        const dep = deps[frame.index];
        frame.index += 1;
        if (memo.has(dep)) {
          frame.total += memo.get(dep);
        } else {
          stack.push({ id: dep, index: 0, total: staticCount.get(dep) || 1 });
        }
        if (frame.total > cap) frame.total = cap + 1;
        continue;
      }
      const total = Math.min(frame.total, cap + 1);
      memo.set(frame.id, total);
      stack.pop();
      if (stack.length > 0) {
        stack[stack.length - 1].total += total;
        if (stack[stack.length - 1].total > cap) stack[stack.length - 1].total = cap + 1;
      }
    }
    return memo.get(start);
  };
  for (const start of starts) resolve(start);
  return memo;
}

function pruneElements(root, actions, ctx) {
  const walk = [root];
  while (walk.length > 0) {
    const element = walk.pop();
    const kept = [];
    for (const child of element.children) {
      if (child.type === 'element') {
        const action = actions.get(child);
        if (action) {
          ctx.stripElement(child, action.code, action.message);
          continue;
        }
        walk.push(child);
      }
      kept.push(child);
    }
    element.children = kept;
  }
}

function analyzeUseReferences(root, ctx, ids) {
  const graph = computeUseGraph(root, ids);
  ctx.stats.useReferences = graph.useElements.length;
  if (graph.useElements.length === 0) return;
  const leadsToCycle = detectUseCycles(ids, graph.dependencies);
  const actions = new Map();
  const liveDependencies = new Map();
  for (const [id, deps] of graph.dependencies.entries()) {
    liveDependencies.set(id, deps.filter((dep) => !leadsToCycle.has(dep)));
  }

  for (const use of graph.useElements) {
    const href = use.attributes.href;
    if (typeof href !== 'string' || !href.startsWith('#')) {
      actions.set(use, {
        code: ERROR.USE_MISSING_TARGET,
        message: 'use element has no valid same-document target after sanitization'
      });
      continue;
    }
    const target = href.slice(1);
    if (!ids.has(target)) {
      actions.set(use, {
        code: ERROR.USE_MISSING_TARGET,
        message: 'use element target does not exist in the sanitized document'
      });
      continue;
    }
    if (leadsToCycle.has(target)) {
      actions.set(use, {
        code: ERROR.USE_CYCLE,
        message: 'recursive or cyclic use reference expansion is forbidden'
      });
    }
  }

  const weightStarts = [];
  for (const use of graph.useElements) {
    if (actions.has(use)) continue;
    weightStarts.push(use.attributes.href.slice(1));
  }
  const staticCountById = new Map();
  for (const [id, element] of ids.entries()) staticCountById.set(id, graph.staticCount.get(element) || 1);
  const weights = computeUseWeights(weightStarts, liveDependencies, staticCountById, ctx.policy.maxUseExpansions);
  let total = 0;
  for (const use of graph.useElements) {
    if (actions.has(use)) continue;
    total += weights.get(use.attributes.href.slice(1)) || 0;
    if (total > ctx.policy.maxUseExpansions) break;
  }
  ctx.stats.useExpansions = Math.min(total, ctx.policy.maxUseExpansions + 1);
  if (total > ctx.policy.maxUseExpansions) {
    for (const use of graph.useElements) {
      if (!actions.has(use)) {
        actions.set(use, {
          code: ERROR.USE_AMPLIFICATION,
          message: 'use element expansion fan-out exceeds the configured SVG resource cap'
        });
      }
    }
    ctx.note(ERROR.USE_AMPLIFICATION, 'maximum SVG use expansion count exceeded', {
      limit: ctx.policy.maxUseExpansions,
      actual: total
    });
  }
  if (actions.size > 0) pruneElements(root, actions, ctx);
}

function canonicalOutputName(attribute) {
  return attribute.name;
}

function appendSerialized(state, part) {
  const bytes = utf8ByteLength(part);
  if (state.outputBytes + bytes > state.policy.maxOutputBytes) {
    throw new SvgCageError(ERROR.MAX_OUTPUT_BYTES, 'maximum serialized SVG byte length exceeded', {
      limit: state.policy.maxOutputBytes,
      actual: state.outputBytes + bytes
    });
  }
  state.outputBytes += bytes;
  state.parts.push(part);
}

function serializeAttributes(element, isRoot, state) {
  const attributes = element.attributeList.slice().sort((left, right) => {
    const a = canonicalOutputName(left);
    const b = canonicalOutputName(right);
    return a < b ? -1 : a > b ? 1 : 0;
  });
  if (isRoot) appendSerialized(state, ' xmlns="' + SVG_NAMESPACE + '"');
  for (const attribute of attributes) {
    if (isRoot && attribute.name === 'xmlns') continue;
    appendSerialized(state, ' ' + attribute.name + '="');
    appendSerialized(state, escapeXmlAttribute(attribute.value));
    appendSerialized(state, '"');
  }
}

export function serializeSanitizedSvg(root, policy, stats) {
  const state = {
    policy,
    parts: [],
    outputBytes: 0
  };
  const work = [{ node: root, element: true, depth: 0 }];
  while (work.length > 0) {
    const item = work.pop();
    if (item.close) {
      appendSerialized(state, '</' + item.name + '>');
      continue;
    }
    const node = item.node;
    if (node.type === 'text' || node.type === 'cdata') {
      appendSerialized(state, escapeXmlText(node.value));
      continue;
    }
    if (node.type !== 'element') continue;
    appendSerialized(state, '<' + node.localName);
    serializeAttributes(node, node === root, state);
    if (node.children.length === 0) {
      appendSerialized(state, '/>');
      continue;
    }
    appendSerialized(state, '>');
    work.push({ close: true, name: node.localName });
    for (let index = node.children.length - 1; index >= 0; index -= 1) {
      work.push({ node: node.children[index], depth: item.depth + 1 });
    }
  }
  stats.outputBytes = state.outputBytes;
  return state.parts.join('');
}

export function makeEmptySafeSvg() {
  return '<svg xmlns="' + SVG_NAMESPACE + '"/>';
}

export function sanitizeParsedSvgDocument(documentNode, policy, stats, lineIndexer) {
  const ctx = createSanitizerContext(policy, stats, lineIndexer);
  const root = documentNode.root;
  ctx.rootNamespace = root ? root.namespaceURI : null;
  if (!root || root.localName !== 'svg') {
    ctx.note(ERROR.ROOT_NOT_SVG, 'document root must be an SVG svg element', {
      position: root ? root.position : 0,
      element: root ? root.localName : undefined
    });
    return { root: null, findings: ctx.findings, strippedElements: ctx.strippedElements, strippedAttributes: ctx.strippedAttributes };
  }
  if (root.namespaceURI !== null && root.namespaceURI !== SVG_NAMESPACE) {
    ctx.note(ERROR.NAMESPACE_FORBIDDEN, 'SVG root element uses a forbidden namespace', {
      position: root.position,
      element: root.localName
    });
    return { root: null, findings: ctx.findings, strippedElements: ctx.strippedElements, strippedAttributes: ctx.strippedAttributes };
  }
  if (policy.requireSvgNamespace && root.namespaceURI !== SVG_NAMESPACE) {
    ctx.note(ERROR.SVG_NAMESPACE_REQUIRED, 'the strict policy requires the SVG root namespace', {
      position: root.position,
      element: root.localName
    });
    return { root: null, findings: ctx.findings, strippedElements: ctx.strippedElements, strippedAttributes: ctx.strippedAttributes };
  }

  sanitizeTree(root, ctx);
  pruneInvalidAnimations(root, ctx);
  const ids = collectAndDeduplicateIds(root, ctx);
  analyzeUseReferences(root, ctx, ids);
  return {
    root,
    findings: ctx.findings,
    strippedElements: ctx.strippedElements,
    strippedAttributes: ctx.strippedAttributes,
    stats: copySvgStats(stats)
  };
}
