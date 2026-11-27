import test from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
import {
  assert, auditSvg, cleanupTempDir, cliPath, codes, expectSafe, expectUnsafe, hasCode,
  makeTempDir, repoJson, repoRoot, repoText, runCli, sanitizeSvg, svgWrap
} from './helpers.mjs';
import svgcage, {
  CODE,
  SEVERITY,
  SVGCAGE_ERROR_CODES,
  SVGCAGE_FINDING_CODES,
  SVGCAGE_VERSION,
  SvgCageError,
  assertSafeSvg,
  createSvgPolicy,
  isSafeSvg,
  validateSvg
} from '../src/index.mjs';

const require = createRequire(import.meta.url);
const cjs = require('../cjs/index.cjs');
const safeInput = '<svg xmlns="http://www.w3.org/2000/svg"><rect width="4" height="4"/></svg>';
const unsafeInput = '<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"><rect width="4" height="4"/></svg>';

test('ESM public exports are present and frozen', () => {
  assert.equal(SVGCAGE_VERSION, '1.0.0');
  assert.equal(Object.isFrozen(SVGCAGE_ERROR_CODES), true);
  assert.equal(Object.isFrozen(SVGCAGE_FINDING_CODES), true);
  assert.equal(Object.isFrozen(CODE), true);
  assert.equal(Object.isFrozen(SEVERITY), true);
  assert.equal(Object.isFrozen(svgcage), true);
  for (const name of ['createSvgPolicy', 'sanitizeSvg', 'auditSvg', 'validateSvg', 'isSafeSvg', 'assertSafeSvg']) {
    assert.equal(typeof svgcage[name], 'function', name);
  }
});

test('error codes expose stable SVGCAGE prefixes', () => {
  assert.ok(Object.keys(SVGCAGE_ERROR_CODES).length >= 50);
  for (const value of Object.values(SVGCAGE_ERROR_CODES)) assert.ok(value.startsWith('SVGCAGE_'));
});

test('severity map exposes four ordered labels', () => {
  assert.deepEqual({ ...SEVERITY }, { CRITICAL: 'critical', HIGH: 'high', MEDIUM: 'medium', LOW: 'low' });
});

test('createSvgPolicy returns a complete immutable policy', () => {
  const policy = createSvgPolicy({ maxDepth: 8, requireSvgNamespace: true });
  assert.equal(policy.maxDepth, 8);
  assert.equal(policy.requireSvgNamespace, true);
  assert.equal(Object.isFrozen(policy), true);
  assert.throws(() => { policy.maxDepth = 99; }, TypeError);
});

test('createSvgPolicy defaults match documented values', () => {
  const policy = createSvgPolicy();
  assert.equal(policy.allowDataImages, false);
  assert.equal(policy.allowStyleElements, false);
  assert.equal(policy.allowProcessingInstructions, false);
  assert.equal(policy.requireSvgNamespace, false);
  assert.equal(policy.maxBytes, 1048576);
  assert.equal(policy.maxDepth, 32);
  assert.equal(policy.maxUseExpansions, 1000);
});

const invalidOptions = [
  { unknown: true },
  { maxDepth: true },
  { maxDepth: 0 },
  { maxDepth: 1.5 },
  { maxDepth: -1 },
  { maxBytes: 0 },
  { maxBytes: 4294967296 },
  { allowDataImages: 1 },
  { allowStyleElements: 'yes' },
  { requireSvgNamespace: null },
  { maxFindings: 0 },
  { maxAttributesPerElement: -2 }
];

for (const [index, options] of invalidOptions.entries()) {
  test('invalid policy options are rejected ' + index, () => {
    assert.throws(() => createSvgPolicy(options), (error) => error instanceof SvgCageError && error.code === 'SVGCAGE_INVALID_OPTIONS');
  });
}

test('array options are rejected', () => {
  assert.throws(() => createSvgPolicy([]), (error) => error.code === 'SVGCAGE_INVALID_OPTIONS');
});

test('nonobject options are rejected', () => {
  assert.throws(() => createSvgPolicy(1), (error) => error.code === 'SVGCAGE_INVALID_OPTIONS');
});

test('sanitize result object and arrays are frozen', () => {
  const result = sanitizeSvg(unsafeInput);
  assert.equal(Object.isFrozen(result), true);
  assert.equal(Object.isFrozen(result.findings), true);
  assert.equal(Object.isFrozen(result.stats), true);
  assert.equal(Object.isFrozen(result.strippedAttributes), true);
  assert.equal(Object.isFrozen(result.strippedElements), true);
});

test('audit report object and findings are frozen', () => {
  const report = auditSvg(unsafeInput);
  assert.equal(Object.isFrozen(report), true);
  assert.equal(Object.isFrozen(report.findings), true);
  assert.equal(Object.isFrozen(report.stats), true);
  assert.equal(Object.isFrozen(report.findings[0]), true);
});

test('validateSvg and isSafeSvg agree with auditSvg', () => {
  assert.equal(validateSvg(safeInput), true);
  assert.equal(isSafeSvg(safeInput), true);
  assert.equal(validateSvg(unsafeInput), false);
  assert.equal(isSafeSvg(unsafeInput), false);
});

test('assertSafeSvg returns a report for safe input', () => {
  const report = assertSafeSvg(safeInput);
  assert.equal(report.safe, true);
});

test('assertSafeSvg throws an SvgCageError with findings for unsafe input', () => {
  assert.throws(() => assertSafeSvg(unsafeInput), (error) => {
    assert.equal(error instanceof SvgCageError, true);
    assert.equal(error.code, 'SVGCAGE_EVENT_HANDLER_ATTRIBUTE');
    assert.equal(error.severity, 'critical');
    assert.ok(Array.isArray(error.findings));
    assert.ok(error.stats);
    return true;
  });
});

test('SvgCageError serializes stable diagnostic fields', () => {
  const error = new SvgCageError('SVGCAGE_INVALID_INPUT', 'bad input', { position: 3, limit: 4 });
  const json = error.toJSON();
  assert.equal(json.name, 'SvgCageError');
  assert.equal(json.code, 'SVGCAGE_INVALID_INPUT');
  assert.equal(json.position, 3);
  assert.equal(json.limit, 4);
});

const parityCorpus = [
  safeInput,
  unsafeInput,
  '<svg><script>alert(1)</script><rect width="1"/></svg>',
  '<svg><use href="javascript:alert(1)"/></svg>',
  '<svg><rect style="fill:red;behavior:url(x)"/></svg>',
  '<svg><g id="a"><use href="#a"/></g><use href="#a"/></svg>',
  '<svg><text>Hello &amp; goodbye</text></svg>',
  '<svg><path d="M0 0 L1e999 1"/></svg>',
  '<svg xmlns:xlink="http://www.w3.org/1999/xlink"><g id="a"/><use xlink:href="#a"/></svg>',
  '<svg><foreignObject><div/></foreignObject></svg>'
];

for (const [index, input] of parityCorpus.entries()) {
  test('CJS and ESM sanitize output match ' + index, () => {
    const esm = sanitizeSvg(input);
    const common = cjs.sanitizeSvg(input);
    assert.equal(common.svg, esm.svg);
    assert.deepEqual(common.findings, JSON.parse(JSON.stringify(esm.findings)));
    assert.deepEqual(common.stats, JSON.parse(JSON.stringify(esm.stats)));
  });
}

for (const [index, input] of parityCorpus.entries()) {
  test('CJS and ESM audit verdicts match ' + index, () => {
    assert.deepEqual(cjs.auditSvg(input).safe, auditSvg(input).safe);
    assert.deepEqual(cjs.auditSvg(input).findings, JSON.parse(JSON.stringify(auditSvg(input).findings)));
  });
}

test('CJS default export and named exports are consistent', () => {
  assert.equal(typeof cjs.sanitizeSvg, 'function');
  assert.equal(cjs.default.sanitizeSvg, cjs.sanitizeSvg);
  assert.equal(cjs.default.SVGCAGE_VERSION, SVGCAGE_VERSION);
});

test('CJS policy validation matches ESM', () => {
  assert.throws(() => cjs.createSvgPolicy({ nope: true }), /SVGCAGE_INVALID_OPTIONS/);
});

test('generated CJS build is current', () => {
  const result = spawnSync(process.execPath, [path.join(repoRoot, 'scripts', 'build-cjs.mjs'), '--check'], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr + result.stdout);
});

const idempotenceCorpus = [
  '<svg><rect width="1"/></svg>',
  '<svg><rect width="1" height="2" fill="red"/></svg>',
  '<svg><text>A &amp; B &#65;</text></svg>',
  '<svg><style>rect { fill: red }</style></svg>',
  '<svg><g id="a"><rect/></g><use href="#a"/></svg>',
  '<svg><rect style="fill: red; stroke-width: 2"/></svg>'
];

for (const [index, input] of idempotenceCorpus.entries()) {
  test('canonical output is byte-for-byte idempotent ' + index, () => {
    const options = index === 3 ? { allowStyleElements: true } : undefined;
    const first = sanitizeSvg(input, options);
    const second = sanitizeSvg(first.svg, options);
    assert.equal(second.svg, first.svg);
  });
}

test('CLI help exits zero', () => {
  const result = runCli(['--help']);
  assert.equal(result.status, 0);
  assert.ok(result.stdout.includes('Usage:'));
});

test('CLI version exits zero and prints package version', () => {
  const result = runCli(['--version']);
  assert.equal(result.status, 0);
  assert.ok(result.stdout.includes('svgcage 1.0.0'));
});

test('CLI missing command exits with usage error', () => {
  const result = runCli([]);
  assert.equal(result.status, 2);
  assert.ok(result.stderr.includes('Usage:'));
});

test('CLI unknown command exits with usage error', () => {
  const result = runCli(['bogus']);
  assert.equal(result.status, 2);
  assert.ok(result.stderr.includes('unknown command'));
});

test('CLI audit safe standard input exits zero', () => {
  const result = runCli(['audit', '-'], safeInput);
  assert.equal(result.status, 0, result.stderr);
  assert.ok(result.stdout.includes('safe'));
});

test('CLI audit unsafe standard input exits one', () => {
  const result = runCli(['audit', '-'], unsafeInput);
  assert.equal(result.status, 1);
  assert.ok(result.stdout.includes('SVGCAGE_EVENT_HANDLER_ATTRIBUTE'));
});

test('CLI validate behaves like audit for safe input', () => {
  assert.equal(runCli(['validate', '-'], safeInput).status, 0);
});

test('CLI validate behaves like audit for unsafe input', () => {
  assert.equal(runCli(['validate', '-'], unsafeInput).status, 1);
});

test('CLI audit JSON is parseable and has stable fields', () => {
  const result = runCli(['audit', '-', '--json'], unsafeInput);
  assert.equal(result.status, 1);
  const report = JSON.parse(result.stdout);
  assert.equal(report.safe, false);
  assert.equal(report.findings[0].code, 'SVGCAGE_EVENT_HANDLER_ATTRIBUTE');
  assert.equal(typeof report.stats.bytes, 'number');
});

test('CLI sanitize emits neutralized SVG on stdout', () => {
  const result = runCli(['sanitize', '-'], unsafeInput);
  assert.equal(result.status, 1);
  assert.ok(!result.stdout.includes('onload'));
  assert.ok(result.stdout.includes('<svg'));
});

test('CLI sanitize safe input exits zero', () => {
  const result = runCli(['sanitize', '-'], safeInput);
  assert.equal(result.status, 0);
  assert.ok(result.stdout.includes('<svg'));
});

test('CLI sanitize JSON emits result object', () => {
  const result = runCli(['sanitize', '-', '--json'], unsafeInput);
  assert.equal(result.status, 1);
  const parsed = JSON.parse(result.stdout);
  assert.equal(typeof parsed.svg, 'string');
  assert.equal(parsed.changed, true);
  assert.ok(Array.isArray(parsed.findings));
});

test('CLI strict mode rejects namespace-less input', () => {
  const result = runCli(['audit', '-', '--strict'], '<svg><rect/></svg>');
  assert.equal(result.status, 1);
  assert.ok(result.stdout.includes('SVGCAGE_SVG_NAMESPACE_REQUIRED'));
});

test('CLI max-bytes rejects oversized input before decode', () => {
  const result = runCli(['audit', '-', '--max-bytes', '10', '--json'], safeInput);
  assert.equal(result.status, 1);
  const report = JSON.parse(result.stdout);
  assert.equal(report.findings[0].code, 'SVGCAGE_MAX_BYTES');
});

test('CLI rejects an unreadable input file with exit two', () => {
  const result = runCli(['audit', path.join(repoRoot, 'does-not-exist.svg')]);
  assert.equal(result.status, 2);
  assert.ok(result.stderr.includes('unable to read input'));
});

test('CLI rejects duplicate input operands with exit two', () => {
  const result = runCli(['audit', '-', '-'], safeInput);
  assert.equal(result.status, 2);
});

test('CLI rejects unknown options with exit two', () => {
  const result = runCli(['audit', '-', '--bogus'], safeInput);
  assert.equal(result.status, 2);
});

test('CLI rejects invalid max-bytes values with exit two', () => {
  assert.equal(runCli(['audit', '-', '--max-bytes', 'abc'], safeInput).status, 2);
  assert.equal(runCli(['audit', '-', '--max-bytes', '0'], safeInput).status, 2);
});

test('CLI rejects --out on audit', () => {
  assert.equal(runCli(['audit', '-', '--out', 'x.svg'], safeInput).status, 2);
});

test('CLI sanitize writes output file and reports nonzero for hostile input', () => {
  const directory = makeTempDir('svgcage-test-');
  try {
    const inputPath = path.join(directory, 'input.svg');
    const outputPath = path.join(directory, 'output.svg');
    fs.writeFileSync(inputPath, unsafeInput);
    const result = runCli(['sanitize', inputPath, '--out', outputPath]);
    assert.equal(result.status, 1, result.stderr);
    const output = fs.readFileSync(outputPath, 'utf8');
    assert.ok(!output.includes('onload'));
    assert.ok(output.includes('<svg'));
  } finally {
    cleanupTempDir(directory);
  }
});

test('CLI reads a regular input file', () => {
  const directory = makeTempDir('svgcage-test-');
  try {
    const inputPath = path.join(directory, 'input.svg');
    fs.writeFileSync(inputPath, safeInput);
    const result = runCli(['audit', inputPath]);
    assert.equal(result.status, 0, result.stderr);
  } finally {
    cleanupTempDir(directory);
  }
});

if (process.platform !== 'win32') {
  test('CLI bin and executable scripts have executable mode on POSIX', () => {
    for (const relative of ['bin/svgcage.mjs', 'scripts/run-tests.mjs', 'scripts/build-cjs.mjs', 'scripts/cli-smoke.mjs']) {
      const mode = fs.statSync(path.join(repoRoot, relative)).mode;
      assert.ok((mode & 0o111) !== 0, relative + ' is not executable');
    }
  });

  test('CLI refuses a symlink input path on POSIX', () => {
    const directory = makeTempDir('svgcage-test-');
    try {
      const target = path.join(directory, 'target.svg');
      const link = path.join(directory, 'link.svg');
      fs.writeFileSync(target, safeInput);
      fs.symlinkSync(target, link);
      const result = runCli(['audit', link]);
      assert.equal(result.status, 2);
    } finally {
      cleanupTempDir(directory);
    }
  });
}

test('CLI stderr neutralizes ANSI, newline, C1 and bidi characters', () => {
  const evil = 'bad\u001b[31m\n\u009b\u202ecommand';
  const result = runCli([evil]);
  assert.equal(result.status, 2);
  const firstLine = result.stderr.split('\n')[0];
  assert.ok(!firstLine.includes('\u001b'));
  assert.ok(!firstLine.includes('\u009b'));
  assert.ok(!firstLine.includes('\u202e'));
});

test('package metadata is zero dependency and dual format', () => {
  const pkg = repoJson('package.json');
  assert.equal(pkg.name, 'svgcage');
  assert.equal(pkg.version, '1.0.0');
  assert.equal(pkg.type, 'module');
  assert.deepEqual(pkg.dependencies, {});
  assert.deepEqual(pkg.devDependencies, { 'fast-check': '4.10.3' });
  assert.equal(pkg.main, './cjs/index.cjs');
  assert.equal(pkg.module, './src/index.mjs');
  assert.equal(pkg.types, './types/index.d.ts');
  assert.equal(pkg.exports['.'].import, './src/index.mjs');
  assert.equal(pkg.exports['.'].require, './cjs/index.cjs');
  assert.equal(pkg.bin.svgcage, 'bin/svgcage.mjs');
  assert.equal(pkg.engines.node, '>=18.0.0');
  assert.equal(pkg.license, 'MIT');
  assert.equal(pkg.sideEffects, false);
});

test('package file list excludes tests scripts scratch and git metadata', () => {
  const pkg = repoJson('package.json');
  for (const forbidden of ['tests', 'scripts', '.git', '.github']) assert.ok(!pkg.files.includes(forbidden));
  for (const required of ['bin', 'src', 'cjs', 'types', 'docs', 'examples', 'README.md', 'SECURITY.md', 'CONTRIBUTING.md', 'CODE_OF_CONDUCT.md', 'CHANGELOG.md', 'LICENSE']) {
    assert.ok(pkg.files.includes(required), required);
  }
});

test('gitattributes forces LF for every required text type', () => {
  const text = repoText('.gitattributes');
  for (const pattern of ['.gitattributes', '.gitignore', 'LICENSE', '*.mjs', '*.cjs', '*.js', '*.ts', '*.d.ts', '*.json', '*.md', '*.yml', '*.yaml']) {
    assert.ok(text.includes(pattern + ' text eol=lf'), pattern);
  }
});

test('CI matrix covers Linux and Windows across four Node versions', () => {
  const ci = repoText('.github/workflows/ci.yml');
  assert.ok(ci.includes('ubuntu-24.04'));
  assert.ok(ci.includes('windows-latest'));
  assert.ok(ci.includes('node: [18, 20, 22, 24]'));
  assert.ok(ci.includes('npm test'));
  assert.ok(ci.includes('npm pack --dry-run'));
});

test('required community and security files exist and are nonempty', () => {
  for (const file of ['README.md', 'SECURITY.md', 'CONTRIBUTING.md', 'CODE_OF_CONDUCT.md', 'CHANGELOG.md', 'LICENSE', 'docs/THREAT_MODEL.md', 'docs/GOOD_FIRST_ISSUES.md', 'docs/API.md']) {
    assert.ok(repoText(file).length > 100, file);
  }
});

test('license uses the required copyright line', () => {
  assert.ok(repoText('LICENSE').includes('Copyright (c) 2026 draarivpatel-ui'));
});

test('README documents at least thirty stable finding codes', () => {
  const matches = new Set(repoText('README.md').match(/SVGCAGE_[A-Z0-9_]+/g) || []);
  assert.ok(matches.size >= 30, String(matches.size));
});

test('good first issues document has exactly ten numbered sections', () => {
  const count = (repoText('docs/GOOD_FIRST_ISSUES.md').match(/^## \d+\. /gm) || []).length;
  assert.equal(count, 10);
});

test('examples directory contains runnable examples and a safe SVG fixture', () => {
  assert.ok(repoText('examples/basic.mjs').includes('sanitizeSvg'));
  assert.ok(repoText('examples/policy.mjs').includes('createSvgPolicy'));
  assert.ok(repoText('examples/safe-icon.svg').startsWith('<svg'));
});

test('examples execute successfully from the source checkout', () => {
  for (const example of ['examples/basic.mjs', 'examples/policy.mjs']) {
    const result = spawnSync(process.execPath, [path.join(repoRoot, example)], { encoding: 'utf8' });
    assert.equal(result.status, 0, example + ': ' + result.stderr);
  }
});

function walkFiles(directory) {
  const output = [];
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (entry.name === '.git' || entry.name === 'node_modules') continue;
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) output.push(...walkFiles(full));
    else if (entry.isFile()) output.push(full);
  }
  return output;
}

test('tracked source files contain no em dash or en dash characters', () => {
  for (const file of walkFiles(repoRoot)) {
    const text = fs.readFileSync(file, 'utf8');
    assert.ok(!text.includes('\u2014') && !text.includes('\u2013'), path.relative(repoRoot, file));
  }
});

test('tracked source files contain no personal email or local machine paths', () => {
  for (const file of walkFiles(repoRoot)) {
    const text = fs.readFileSync(file, 'utf8');
    const relative = path.relative(repoRoot, file);
    assert.ok(!text.includes('/' + 'Users/'), relative);
    assert.ok(!text.includes('someone' + '@gmail'), relative);
    assert.ok(!text.includes('handle-redacted286' + '@gmail'), relative);
    assert.ok(!text.includes('Tan' + 'yard'), relative);
  }
});

test('runtime source imports are relative or node builtins only', () => {
  for (const relative of ['src', 'bin', 'scripts'].flatMap((dir) => fs.readdirSync(path.join(repoRoot, dir)).filter((name) => name.endsWith('.mjs')).map((name) => path.join(dir, name)))) {
    const text = repoText(relative);
    for (const match of text.matchAll(/from\s+['"]([^'"]+)['"]|import\s*\(\s*['"]([^'"]+)['"]/g)) {
      const specifier = match[1] || match[2];
      assert.ok(specifier.startsWith('./') || specifier.startsWith('../') || specifier.startsWith('node:'), relative + ' imports ' + specifier);
    }
  }
});

test('TypeScript declarations expose every public runtime export', () => {
  const types = repoText('types/index.d.ts');
  for (const name of ['SVGCAGE_VERSION', 'SVGCAGE_ERROR_CODES', 'SVGCAGE_FINDING_CODES', 'CODE', 'SEVERITY', 'SvgCageError', 'createSvgPolicy', 'sanitizeSvg', 'auditSvg', 'validateSvg', 'isSafeSvg', 'assertSafeSvg']) {
    assert.ok(types.includes(name), name);
  }
  assert.ok(types.includes('export default svgcage'));
});

test('TypeScript declarations expose every policy option', () => {
  const types = repoText('types/index.d.ts');
  for (const key of Object.keys(createSvgPolicy())) assert.ok(types.includes(key + '?:'), key);
});

test('TypeScript declarations expose result and report contracts', () => {
  const types = repoText('types/index.d.ts');
  for (const name of ['SvgCageSanitizeResult', 'SvgCageAuditReport', 'SvgCageFinding', 'SvgCageStats', 'SvgCagePolicyOptions', 'SvgCagePolicy', 'SvgCageInput']) {
    assert.ok(types.includes('interface ' + name) || types.includes('type ' + name), name);
  }
});

test('README API names match runtime exports', () => {
  const readme = repoText('README.md');
  for (const name of ['sanitizeSvg', 'auditSvg', 'validateSvg', 'isSafeSvg', 'assertSafeSvg', 'createSvgPolicy']) {
    assert.ok(readme.includes('`' + name), name);
  }
});

test('source tree has no TODO or FIXME placeholders', () => {
  for (const dir of ['src', 'bin', 'scripts']) {
    for (const name of fs.readdirSync(path.join(repoRoot, dir))) {
      if (!name.endsWith('.mjs')) continue;
      const text = repoText(path.join(dir, name));
      assert.ok(!text.includes('TODO') && !text.includes('FIXME'), path.join(dir, name));
    }
  }
});
