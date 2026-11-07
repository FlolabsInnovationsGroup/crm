#!/usr/bin/env node
// The merge-guard layer. Safe on analytics_tool, where seed files exist on purpose: every
// commit it makes lives in a temporary object folder, so no branch, index or file changes.
//   node packages/twenty-utils/flolabs/analytics-tests/merge-guard/merge-guard.test.mjs
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import {
  BUILT_IN_MARKERS,
  CHECK_SCRIPT,
  GUARD_ROOT,
  MERGE_BRANCH,
  PROJECT_STATE_POINTER,
  REPO_ROOT,
  TEST_DATA_REFERENCE_PATTERN,
  buildCleanCommit,
  findForkPoint,
  isExcludedPath,
  loadExcludedEntries,
  readFakeMarkers,
  readIntegrationFiles,
  resolveCommit,
  runGit,
  splitNul,
} from './lib.mjs';

const RESULTS_ROOT =
  process.env.ANALYTICS_TEST_RESULTS_DIR ??
  path.resolve(REPO_ROOT, '..', 'analytics-work', 'test-results');

const REQUIRED_EXCLUDED_PATHS = [
  'packages/twenty-utils/flolabs/analytics-tests/',
  'docs/analytics/research/',
];
const FILES_THAT_GO_TO_MAIN = [
  'docs/analytics/contract.md',
  'docs/analytics/CRM-Analytics-Architecture.pdf',
  '.github/workflows/flolabs-analytics-merge-guard.yml',
  'packages/twenty-server/src/modules/analytics/crm-analytics.module.ts',
  'packages/twenty-server/src/modules/analytics/services/__tests__/some.service.spec.ts',
];

const SEED_FILE = 'packages/twenty-utils/flolabs/analytics-tests/seed/seed-data.mjs';
const SEED_FOLDER = process.env.MERGE_GUARD_SEED_FOLDER ?? path.join(GUARD_ROOT, '..', 'seed');
const FIXTURE_MARKER = 'ZZ-FAKE-PERSON-MARKER';
const FIXTURE_MARKER_EMAIL = 'fake.person.one@example.com';

const PRODUCT_TREE = [
  'packages/twenty-server/src',
  'packages/twenty-server/scripts',
  'packages/twenty-front/src',
  'packages/twenty-docker',
  'packages/twenty-utils/flolabs/deploy.sh',
];
const NEW_PRODUCT_FOLDERS = [
  'packages/twenty-server/src/modules/analytics',
  'packages/twenty-front/src/modules/crm-analytics',
  'packages/twenty-front/src/pages/analytics',
];
const STARTUP_PATHS = [
  'packages/twenty-docker',
  'packages/twenty-server/scripts',
  'packages/twenty-server/package.json',
  'packages/twenty-server/src/main.ts',
  'packages/twenty-server/src/queue-worker/queue-worker.ts',
  'packages/twenty-server/src/command/command.ts',
  'packages/twenty-utils/flolabs/deploy.sh',
];
const SUITE_REFERENCE_PATTERN = 'twenty-utils|analytics[-_]tests|analytics_seed';

// .invalid never resolves, and the test's hook stops any attempt, so nothing can leave.
const NON_LOCAL_HOST = 'crm-live.merge-guard.invalid';
const LOADER_RUNS_THAT_MUST_BE_REFUSED = [
  { args: ['--host', NON_LOCAL_HOST], env: {} },
  { args: ['--crm', '--i-am-local', '--host', NON_LOCAL_HOST], env: {} },
  { args: [], env: { ANALYTICS_TEST_PG_HOST: NON_LOCAL_HOST } },
  { args: ['--crm'], env: {} },
];

const WORKFLOW_FILE = '.github/workflows/flolabs-analytics-merge-guard.yml';
const WORKFLOW_STEP_NAME = 'Fail if the pull request contains an excluded path';

const FAILURE_MESSAGE_LIMIT = 2000;

const results = { passed: 0, failures: [], skippedTests: [] };
const findings = {};

class SkipTest extends Error {}

const describeFailure = (error) => {
  const message = String(error?.message ?? error).trim();

  return message.length > FAILURE_MESSAGE_LIMIT
    ? `${message.slice(0, FAILURE_MESSAGE_LIMIT)}...`
    : message;
};

const runTest = async (name, body) => {
  try {
    await body();
    results.passed += 1;
    console.log(`ok      ${name}`);
  } catch (error) {
    if (error instanceof SkipTest) {
      results.skippedTests.push({ test: name, reason: error.message });
      console.log(`SKIPPED ${name}: ${error.message}`);
    } else {
      results.failures.push({ test: name, message: describeFailure(error) });
      console.log(`FAILED  ${name}\n  ${describeFailure(error).split('\n').join('\n  ')}`);
    }
  }
};

const readRepoFile = (file) =>
  fs.readFileSync(path.join(REPO_ROOT, file), 'utf8').replace(/\r\n/g, '\n');

const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), 'merge-guard-test-'));
const sandboxObjects = path.join(sandbox, 'objects');

fs.mkdirSync(sandboxObjects);

const sandboxEnv = {
  GIT_OBJECT_DIRECTORY: sandboxObjects,
  GIT_ALTERNATE_OBJECT_DIRECTORIES: path.resolve(
    REPO_ROOT,
    runGit(['rev-parse', '--git-path', 'objects']).trim(),
  ),
  GIT_AUTHOR_NAME: 'Merge Guard Test',
  GIT_AUTHOR_EMAIL: 'merge-guard-test@localhost',
  GIT_COMMITTER_NAME: 'Merge Guard Test',
  GIT_COMMITTER_EMAIL: 'merge-guard-test@localhost',
};

const fixtureSeedFolder = path.join(sandbox, 'seed');

fs.mkdirSync(fixtureSeedFolder);
fs.writeFileSync(
  path.join(fixtureSeedFolder, 'seed-data.mjs'),
  `export const NAME_SENTINEL = '${FIXTURE_MARKER}';
export const EMAIL_DOMAIN_SENTINEL = '@example.com';
export const people = [{ email: '${FIXTURE_MARKER_EMAIL}' }];
`,
);

let fixtureCount = 0;

const commitFixture = ({ parent, write = {}, remove = [], message = 'Fixture commit\n' }) => {
  fixtureCount += 1;

  const indexEnv = {
    ...sandboxEnv,
    GIT_INDEX_FILE: path.join(sandbox, `index-${fixtureCount}`),
  };

  runGit(['read-tree', parent], { env: indexEnv });

  for (const [file, content] of Object.entries(write)) {
    const blob = runGit(['hash-object', '-w', '--no-filters', '--stdin'], {
      env: sandboxEnv,
      input: content,
    }).trim();

    runGit(['update-index', '--add', '--cacheinfo', `100644,${blob},${file}`], {
      env: indexEnv,
    });
  }

  if (remove.length > 0) {
    runGit(['update-index', '--force-remove', '--', ...remove], { env: indexEnv });
  }

  const tree = runGit(['write-tree'], { env: indexEnv }).trim();

  return runGit(['commit-tree', tree, '-p', parent, '-F', '-'], {
    env: sandboxEnv,
    input: message,
  }).trim();
};

const showFile = (commit, file) => runGit(['show', `${commit}:${file}`], { env: sandboxEnv });

const listTree = (commit) =>
  splitNul(runGit(['ls-tree', '-r', '--name-only', '-z', commit], { env: sandboxEnv }));

const runCheck = (ref, { seedFolder = fixtureSeedFolder } = {}) => {
  const result = spawnSync(process.execPath, [CHECK_SCRIPT, '--ref', ref], {
    cwd: REPO_ROOT,
    env: {
      ...process.env,
      ...sandboxEnv,
      ...(seedFolder === null ? {} : { MERGE_GUARD_SEED_FOLDER: seedFolder }),
    },
    encoding: 'utf8',
  });

  return { status: result.status, output: `${result.stdout}${result.stderr}` };
};

const searchTree = ({ pattern, paths, ignoreCase = false }) =>
  runGit(
    [
      'grep',
      '--untracked',
      '-n',
      '-I',
      '-E',
      ...(ignoreCase ? ['-i'] : []),
      pattern,
      '--',
      ...paths,
    ],
    { okExitCodes: [0, 1] },
  )
    .split('\n')
    .filter(Boolean);

const readWorkflowStepScript = (workflow) => {
  const lines = workflow.split('\n');
  const stepIndex = lines.findIndex((line) => line.includes(`name: ${WORKFLOW_STEP_NAME}`));
  const runIndex = lines.findIndex(
    (line, index) => index > stepIndex && line.trim() === 'run: |',
  );

  assert.ok(stepIndex !== -1 && runIndex !== -1, 'The workflow step or its script was not found.');

  const runIndent = lines[runIndex].search(/\S/);
  const scriptLines = [];

  for (const line of lines.slice(runIndex + 1)) {
    if (line.trim() !== '' && line.search(/\S/) <= runIndent) {
      break;
    }

    scriptLines.push(line.slice(runIndent + 2));
  }

  return scriptLines.join('\n');
};

// On Windows, a plain `bash` can be WSL, which cannot see this repository's git.
const findBash = () => {
  if (process.platform !== 'win32') {
    return 'bash';
  }

  const gitBash = path.resolve(
    runGit(['--exec-path']).trim(),
    '..',
    '..',
    '..',
    'bin',
    'bash.exe',
  );

  return fs.existsSync(gitBash) ? gitBash : null;
};

const parseDockerSources = (dockerfile) =>
  dockerfile
    .replace(/\\\r?\n/g, ' ')
    .split(/\r?\n/)
    .filter((line) => /^\s*(COPY|ADD)\s/i.test(line) && !/\s--from=/.test(line))
    .flatMap((line) => {
      const tokens = line
        .trim()
        .split(/\s+/)
        .slice(1)
        .filter((token) => !token.startsWith('--'));

      return tokens.slice(0, -1);
    })
    .map((source) => source.replace(/^\.\//, '').replace(/\/$/, ''));

const buildRejectedBranches = ({ forkPoint, integrationFiles }) => {
  const firstFile = integrationFiles[0];

  return [
    {
      name: 'a seed file at its excluded path',
      write: { [SEED_FILE]: 'export const people = [];\n' },
      expected: /analytics-tests\/ is in this branch/,
    },
    {
      name: 'a research note',
      write: { 'docs/analytics/research/notes.md': 'Notes.\n' },
      expected: /docs\/analytics\/research\/ is in this branch/,
    },
    {
      name: 'a seed marker in a file outside the seed folder',
      write: { 'docs/analytics/copied-people.md': `A row: ${FIXTURE_MARKER}\n` },
      expected: new RegExp(`copied-people\\.md line 1 contains the test data marker "${FIXTURE_MARKER}"`),
    },
    {
      name: 'an email from the seed data, even in a test file',
      write: {
        'packages/twenty-server/src/modules/analytics/__tests__/copied.spec.ts': `export const EMAIL = '${FIXTURE_MARKER_EMAIL}';\n`,
      },
      expected: /copied\.spec\.ts line 1 contains the test data marker/,
    },
    {
      name: 'the name of the seed database in a document',
      write: { 'docs/analytics/run-notes.md': 'Load into analytics_seed first.\n' },
      expected: /run-notes\.md line 1 contains the test data marker "analytics_seed"/,
    },
    {
      name: 'an example.com email in a new file outside the tests',
      write: { 'docs/analytics/people.csv': 'name,email\nA Person,a.person@example.com\n' },
      expected: /people\.csv line 2 has the example\.com email a\.person@example\.com/,
    },
    {
      name: 'a new product file that refers to the test suite',
      write: {
        'packages/twenty-server/src/modules/analytics/loader.ts':
          "export const PATH = 'packages/twenty-utils/flolabs/analytics-tests/run-tests.mjs';\n",
      },
      expected: /loader\.ts line 1 is product code that refers to the test suite/,
    },
    {
      name: 'a changed product line that refers to seed data',
      write: { [firstFile]: `${showFile(forkPoint, firstFile)}// Loads the seed.\n` },
      expected: /line \d+ is product code that refers to the test suite or seed data: \/\/ Loads the seed\./,
    },
    {
      name: 'a new entrypoint script that loads seed data',
      write: { 'packages/twenty-docker/extra/entrypoint-extra.sh': 'node seed/load.mjs\n' },
      expected: /entrypoint-extra\.sh line 1 is product code/,
    },
    {
      name: 'a change to deploy.sh that refers to seed data',
      write: {
        'packages/twenty-utils/flolabs/deploy.sh': `${showFile(forkPoint, 'packages/twenty-utils/flolabs/deploy.sh')}# Load seed.\n`,
      },
      expected: /deploy\.sh line \d+ is product code/,
    },
    {
      name: 'a new migration that refers to seed data',
      write: {
        'packages/twenty-server/src/database/typeorm/core/migrations/common/1-load.ts':
          '// Loads seed rows.\n',
      },
      expected: /1-load\.ts line 1 is product code/,
    },
    {
      name: 'an .env file',
      write: { 'packages/twenty-server/.env.local': 'A=1\n' },
      expected: /\.env\.local is an \.env file/,
    },
    {
      name: 'a test result',
      write: { 'test-results/latest-unit-server.json': '{}\n' },
      expected: /latest-unit-server\.json is a test result/,
    },
    {
      name: 'a translation catalog',
      write: { 'packages/twenty-front/src/locales/xx-XX.po': 'msgid ""\n' },
      expected: /xx-XX\.po is a translation catalog/,
    },
    {
      name: 'a generated translation file',
      write: { 'packages/twenty-front/src/locales/generated/xx-XX.ts': 'export {};\n' },
      expected: /generated\/xx-XX\.ts is a translation catalog/,
    },
    {
      name: 'a co-author line with an anthropic.com address',
      message: 'Add a thing\n\nCo-Authored-By: Claude <noreply@anthropic.com>\n',
      expected: /has AI attribution in its message/,
    },
    {
      name: 'a generated-with line',
      message: 'Add a thing\n\nGenerated with [Claude Code](https://claude.ai/code)\n',
      expected: /has AI attribution in its message/,
    },
    {
      name: 'a change to an existing file outside the allowed list',
      write: { 'package.json': `${showFile(forkPoint, 'package.json')}\n` },
      expected: /package\.json is an existing CRM file and this branch changes it/,
    },
    {
      name: 'a deleted file from the allowed list',
      remove: [integrationFiles[1]],
      expected: /is an existing CRM file and this branch deletes it/,
    },
  ];
};

const startedAt = Date.now();

try {
  const excludedEntries = loadExcludedEntries();
  const headCommit = resolveCommit('HEAD');
  const { forkPoint } = findForkPoint(headCommit);
  const integrationFiles = readIntegrationFiles(headCommit);
  const baseIntegrationFile = integrationFiles[0];

  const cleanRef = commitFixture({
    parent: forkPoint,
    write: {
      'docs/analytics/contract.md': showFile(headCommit, 'docs/analytics/contract.md'),
      'docs/analytics/overview.md': 'Check there are no example.com test people after deploying.\n',
      '.github/workflows/flolabs-analytics-merge-guard.yml':
        'Lists packages/twenty-utils/flolabs/analytics-tests/ and says seed data stays out.\n',
      'packages/twenty-server/src/modules/analytics/merge-guard-fixture.ts':
        'export const MERGE_GUARD_FIXTURE = 1;\n',
      'packages/twenty-server/src/modules/analytics/__tests__/merge-guard-fixture.spec.ts':
        "export const EMAIL_IN_A_TEST = 'someone@example.com';\n",
      [baseIntegrationFile]: `${showFile(forkPoint, baseIntegrationFile)}// An allowed edit.\n`,
      'CLAUDE.md': `${showFile(forkPoint, 'CLAUDE.md')}\n${PROJECT_STATE_POINTER}\n`,
    },
  });

  await runTest('the exclusion list covers the suite and the research notes, with a reason each', () => {
    const excludedPaths = excludedEntries.map(({ path: excludedPath }) => excludedPath);

    for (const required of REQUIRED_EXCLUDED_PATHS) {
      assert.ok(excludedPaths.includes(required), `${required} is not on the list.`);
    }

    for (const { path: excludedPath, reason } of excludedEntries) {
      assert.ok(
        typeof reason === 'string' && reason.trim() !== '' && !reason.includes('\n'),
        `${excludedPath} needs a one-line reason.`,
      );
    }

    assert.ok(
      isExcludedPath(
        'packages/twenty-utils/flolabs/analytics-tests/seed/load.mjs',
        excludedEntries,
      ),
    );

    for (const file of FILES_THAT_GO_TO_MAIN) {
      assert.ok(!isExcludedPath(file, excludedEntries), `${file} should go to main.`);
    }
  });

  const refsBefore = runGit(['for-each-ref', `refs/heads/${MERGE_BRANCH}*`]);
  const cleanHead = buildCleanCommit({
    sourceCommit: headCommit,
    excludedEntries,
    env: sandboxEnv,
  });

  await runTest('simulated prepare-merge: the current commit loses every excluded path', () => {
    const left = listTree(cleanHead.commit).filter((file) =>
      isExcludedPath(file, excludedEntries),
    );

    assert.deepEqual(left, []);
  });

  await runTest('simulated prepare-merge: only excluded paths and CLAUDE.md differ', () => {
    const fields = splitNul(
      runGit(['diff', '--name-status', '--no-renames', '-z', headCommit, cleanHead.commit], {
        env: sandboxEnv,
      }),
    );

    for (let index = 0; index < fields.length; index += 2) {
      const [status, file] = [fields[index], fields[index + 1]];
      const isExpected =
        (status === 'D' && isExcludedPath(file, excludedEntries)) ||
        (status === 'M' && file === 'CLAUDE.md');

      assert.ok(isExpected, `Unexpected difference: ${status} ${file}`);
    }
  });

  await runTest('simulated prepare-merge: the project state becomes one pointer line', () => {
    const before = showFile(headCommit, 'CLAUDE.md');
    const after = showFile(cleanHead.commit, 'CLAUDE.md');
    const keptPart = before.slice(0, before.indexOf('<!-- analytics-state:start -->'));

    assert.ok(cleanHead.isProjectStateReplaced);
    assert.ok(!after.includes('analytics-state:'), 'A marker is left.');
    assert.ok(!after.includes('## CRM Analytics tool: project state'), 'The section is left.');
    assert.equal(after, `${keptPart}${PROJECT_STATE_POINTER}\n`);
  });

  await runTest('simulated prepare-merge: a seed file committed on top is left out too', () => {
    const withSeed = commitFixture({
      parent: headCommit,
      write: { [SEED_FILE]: `export const people = ['${FIXTURE_MARKER_EMAIL}'];\n` },
    });
    const clean = buildCleanCommit({
      sourceCommit: withSeed,
      excludedEntries,
      env: sandboxEnv,
    });

    assert.ok(clean.removedFiles.includes(SEED_FILE));
    assert.ok(!listTree(clean.commit).includes(SEED_FILE));
    assert.equal(runCheck(withSeed).status, 1, 'The source branch itself should fail.');

    const cleanCheck = runCheck(clean.commit);

    assert.equal(cleanCheck.status, 0, cleanCheck.output);
  });

  await runTest('simulated prepare-merge: one commit on the fork point, so no old commit comes along', () => {
    const parent = runGit(['rev-parse', `${cleanHead.commit}^`], { env: sandboxEnv }).trim();
    const message = runGit(['log', '-1', '--format=%B', cleanHead.commit], { env: sandboxEnv });

    assert.equal(parent, forkPoint);
    assert.ok(!/anthropic|claude/i.test(message), `AI attribution in: ${message}`);
  });

  await runTest('simulated prepare-merge: the current commit, cleaned, passes the real check', () => {
    const check = runCheck(cleanHead.commit, { seedFolder: null });

    assert.equal(check.status, 0, check.output);
  });

  await runTest('simulated prepare-merge: no branch was created', () => {
    assert.equal(runGit(['for-each-ref', `refs/heads/${MERGE_BRANCH}*`]), refsBefore);
  });

  await runTest('no product file names the test suite or the seed database', () => {
    assert.deepEqual(
      searchTree({ pattern: 'analytics[-_]tests|analytics_seed', paths: PRODUCT_TREE, ignoreCase: true }),
      [],
    );
  });

  await runTest('no new analytics product file mentions seed at all', () => {
    assert.deepEqual(searchTree({ pattern: 'seed', paths: NEW_PRODUCT_FOLDERS, ignoreCase: true }), []);
  });

  await runTest('the edits to the five existing files do not refer to the suite or seed', () => {
    const addedLines = runGit(['diff', '-U0', '--no-color', forkPoint, '--', ...integrationFiles])
      .split('\n')
      .filter((line) => line.startsWith('+') && !line.startsWith('+++'))
      .filter((line) => TEST_DATA_REFERENCE_PATTERN.test(line));

    assert.deepEqual(addedLines, []);
  });

  await runTest('the Docker image takes nothing from packages/twenty-utils', () => {
    const sources = parseDockerSources(readRepoFile('packages/twenty-docker/twenty/Dockerfile'));
    const dockerignore = readRepoFile('.dockerignore');

    // Real sources, so a broken parser cannot pass by finding nothing.
    assert.ok(sources.includes('packages/twenty-server'));
    assert.ok(sources.includes('packages/twenty-docker/twenty/entrypoint.sh'));

    const reaching = sources.filter(
      (source) =>
        source === '.' ||
        source === 'packages' ||
        source.startsWith('packages/*') ||
        source.startsWith('packages/twenty-utils'),
    );

    findings.twentyUtilsReachesImage = reaching.length > 0;
    findings.detail =
      reaching.length > 0
        ? `The Dockerfile copies it through: ${reaching.join(', ')}.`
        : `No COPY or ADD in the Dockerfile takes it${/twenty-utils/.test(dockerignore) ? '' : '. .dockerignore does not list it, so it is in the build context only'}.`;

    assert.deepEqual(reaching, []);
  });

  await runTest('nothing in the image startup path can invoke the suite or the seed', () => {
    for (const startupPath of STARTUP_PATHS) {
      assert.ok(fs.existsSync(path.join(REPO_ROOT, startupPath)), `${startupPath} is missing.`);
    }

    assert.deepEqual(searchTree({ pattern: SUITE_REFERENCE_PATTERN, paths: STARTUP_PATHS }), []);

    const entrypoint = readRepoFile('packages/twenty-docker/twenty/entrypoint.sh');
    const compose = readRepoFile('packages/twenty-docker/docker-compose.yml');
    const yarnScripts = [
      ...entrypoint.matchAll(/yarn ([\w:-]+)/g),
      ...compose.matchAll(/"yarn",\s*"([\w:-]+)"/g),
    ].map(([, script]) => script);
    const serverScripts = JSON.parse(readRepoFile('packages/twenty-server/package.json')).scripts;
    const rootScripts = JSON.parse(readRepoFile('package.json')).scripts ?? {};
    const startupPattern = new RegExp(SUITE_REFERENCE_PATTERN);

    assert.ok(yarnScripts.includes('command:prod') && yarnScripts.includes('worker:prod'));

    for (const script of yarnScripts) {
      assert.ok(
        typeof serverScripts[script] === 'string',
        `${script} is not a server package script.`,
      );
      assert.ok(!startupPattern.test(serverScripts[script]), `${script}: ${serverScripts[script]}`);
    }

    for (const [script, command] of Object.entries(rootScripts)) {
      assert.ok(!startupPattern.test(command), `Root script ${script}: ${command}`);
    }
  });

  await runTest('the seed loader refuses a non-local host before connecting', () => {
    const loader = path.join(SEED_FOLDER, 'load.mjs');

    if (!fs.existsSync(loader)) {
      throw new SkipTest('seed/load.mjs does not exist yet.');
    }

    const attemptLog = path.join(sandbox, 'connection-attempts.log');
    const hook = path.join(sandbox, 'block-outside-world.mjs');

    fs.writeFileSync(
      hook,
      `import childProcess from 'node:child_process';
import fs from 'node:fs';
import { syncBuiltinESMExports } from 'node:module';
import net from 'node:net';

const record = (entry) => fs.appendFileSync(process.env.MERGE_GUARD_ATTEMPT_LOG, entry + '\\n');

net.Socket.prototype.connect = function (...args) {
  const target = args[0];
  record('socket ' + (typeof target === 'object' ? (target?.host ?? 'unknown') : args.slice(0, 2).join(' ')));
  throw new Error('Stopped by the merge guard test.');
};

for (const name of ['spawn', 'spawnSync', 'exec', 'execSync', 'execFile', 'execFileSync']) {
  childProcess[name] = (command) => {
    record('process ' + command);
    throw new Error('Stopped by the merge guard test.');
  };
}

syncBuiltinESMExports();
`,
    );

    for (const { args, env } of LOADER_RUNS_THAT_MUST_BE_REFUSED) {
      fs.rmSync(attemptLog, { force: true });

      const result = spawnSync(
        process.execPath,
        ['--import', pathToFileURL(hook).href, loader, ...args],
        {
          cwd: REPO_ROOT,
          env: { ...process.env, ...env, MERGE_GUARD_ATTEMPT_LOG: attemptLog },
          encoding: 'utf8',
          timeout: 30_000,
        },
      );
      const output = `${result.stdout}${result.stderr}`;
      const attempts = fs.existsSync(attemptLog) ? fs.readFileSync(attemptLog, 'utf8') : '';
      const description = `seed/load.mjs ${args.join(' ')} ${JSON.stringify(env)}`;

      assert.equal(attempts, '', `${description} tried to connect before refusing.`);
      assert.notEqual(result.status, 0, `${description} did not stop:\n${output}`);
      assert.match(output, /refused/i, `${description} did not say it refused:\n${output}`);
    }
  });

  await runTest('check-before-merge passes a branch with only allowed things in it', () => {
    const check = runCheck(cleanRef);

    assert.equal(check.status, 0, check.output);
    assert.match(check.output, /PASSED/);
    assert.ok(check.output.includes(baseIntegrationFile), 'The changed file is not listed.');
    assert.ok(check.output.includes('CLAUDE.md'), 'CLAUDE.md is not listed.');
  });

  await runTest('check-before-merge reads the real seed sentinels and fails a copy of one', () => {
    if (!fs.existsSync(path.join(SEED_FOLDER, 'seed-data.mjs'))) {
      throw new SkipTest('seed/seed-data.mjs does not exist yet.');
    }

    const { markers } = readFakeMarkers();
    const seedMarkers = markers.filter((marker) => !BUILT_IN_MARKERS.includes(marker));

    assert.ok(seedMarkers.length > 0, 'No sentinel was found: were the constants renamed?');
    assert.ok(!markers.includes('@example.com'), 'The bare domain would flag test files too.');

    const check = runCheck(
      commitFixture({
        parent: cleanRef,
        write: { 'docs/analytics/copied.md': `A row: ${seedMarkers[0]}\n` },
      }),
      { seedFolder: null },
    );

    assert.equal(check.status, 1, check.output);
    assert.ok(check.output.includes(`"${seedMarkers[0]}"`), check.output);
  });

  for (const { name, write, remove, message, expected } of buildRejectedBranches({
    forkPoint,
    integrationFiles,
  })) {
    await runTest(`check-before-merge fails a branch with ${name}`, () => {
      const check = runCheck(commitFixture({ parent: cleanRef, write, remove, message }));

      assert.equal(check.status, 1, check.output);
      assert.match(check.output, expected);
    });
  }

  const addedSeed = commitFixture({ parent: cleanRef, write: { [SEED_FILE]: 'export {};\n' } });
  const removedSeed = commitFixture({ parent: addedSeed, remove: [SEED_FILE] });

  await runTest('check-before-merge fails when only the history holds an excluded path', () => {
    const check = runCheck(removedSeed);

    assert.equal(check.status, 1, check.output);
    assert.match(check.output, /carry them into the history of main/);
  });

  const workflow = readRepoFile(WORKFLOW_FILE);

  await runTest('the workflow runs on pull requests to main only, read-only, with no secrets or installs', () => {
    const code = workflow
      .split('\n')
      .filter((line) => !line.trim().startsWith('#'))
      .join('\n');

    assert.match(code, /^on:\n {2}pull_request:\n {4}branches: \[main\]/m);
    assert.doesNotMatch(code, /^\s*(push|pull_request_target|workflow_dispatch|workflow_run|schedule):/m);
    assert.match(code, /^permissions:\n {2}contents: read\n\n/m);
    assert.doesNotMatch(code, /secrets\.|GITHUB_TOKEN/);
    assert.doesNotMatch(code, /\b(npm|npx|yarn|pnpm)\b/);
    assert.match(code, /uses: actions\/checkout@v5\n\s+with:\n\s+persist-credentials: false/);
  });

  await runTest('the workflow lists the same paths as excluded-from-main.json', () => {
    const inlineList = /excluded_paths=\(\n([\s\S]*?)\n\s*\)/.exec(workflow)?.[1];

    assert.ok(inlineList !== undefined, 'The inline list was not found.');
    assert.deepEqual(
      inlineList.split('\n').map((line) => line.trim()).sort(),
      excludedEntries.map(({ path: excludedPath }) => excludedPath).sort(),
    );
    assert.ok(
      workflow.includes('merge-guard/excluded-from-main.json'),
      'The comment naming the file it mirrors is missing.',
    );
  });

  await runTest('the workflow script passes a clean branch and fails one with an excluded path', () => {
    const bash = findBash();

    if (bash === null) {
      throw new SkipTest('Git Bash was not found next to git.');
    }

    const script = readWorkflowStepScript(workflow);
    const runScript = (headSha) =>
      spawnSync(bash, ['-c', script], {
        cwd: REPO_ROOT,
        env: { ...process.env, ...sandboxEnv, BASE_SHA: forkPoint, HEAD_SHA: headSha },
        encoding: 'utf8',
      });

    const clean = runScript(cleanRef);

    assert.equal(clean.status, 0, `${clean.stdout}${clean.stderr}`);

    const contaminated = runScript(addedSeed);

    assert.equal(contaminated.status, 1, `${contaminated.stdout}${contaminated.stderr}`);
    assert.ok(contaminated.stdout.includes(SEED_FILE), contaminated.stdout);

    const onlyInHistory = runScript(removedSeed);

    assert.equal(onlyInHistory.status, 1, `${onlyInHistory.stdout}${onlyInHistory.stderr}`);
    assert.match(onlyInHistory.stdout, /history of main/);
  });

  await runTest('the scripts never run a git command that changes the working copy or the remote', () => {
    const scripts = ['lib.mjs', 'prepare-merge.mjs', 'check-before-merge.mjs'].map((file) =>
      fs.readFileSync(path.join(GUARD_ROOT, file), 'utf8'),
    );

    for (const script of scripts) {
      assert.doesNotMatch(
        script,
        /runGit\(\s*\[\s*'(push|fetch|pull|checkout|switch|stash|reset|clean|add|commit|merge|rebase)'/,
      );
    }
  });
} catch (error) {
  results.failures.push({ test: 'merge-guard layer', message: describeFailure(error) });
  console.log(`FAILED  merge-guard layer\n  ${describeFailure(error)}`);
} finally {
  fs.rmSync(sandbox, { recursive: true, force: true });
}

const hasFailures = results.failures.length > 0;
const report = {
  layer: 'merge-guard',
  timestamp: new Date(startedAt).toISOString(),
  durationMs: Date.now() - startedAt,
  status: hasFailures ? 'FAILED' : results.passed > 0 ? 'PASSED' : 'SKIPPED',
  reason: hasFailures
    ? `${results.failures.length} failed`
    : results.passed > 0
      ? null
      : 'No test ran.',
  passed: results.passed,
  failed: results.failures.length,
  skipped: results.skippedTests.length,
  failures: results.failures,
  skippedTests: results.skippedTests,
  findings,
};

fs.mkdirSync(RESULTS_ROOT, { recursive: true });
fs.writeFileSync(
  path.join(RESULTS_ROOT, 'latest-merge-guard.json'),
  `${JSON.stringify(report, null, 2)}\n`,
);

console.log(
  `\nmerge-guard ${report.status}: passed ${report.passed}, failed ${report.failed}, skipped ${report.skipped}.`,
);
console.log(`packages/twenty-utils reaches the Docker image: ${findings.twentyUtilsReachesImage ? 'YES' : 'no'}. ${findings.detail ?? ''}`);
process.exitCode = hasFailures ? 1 : 0;
