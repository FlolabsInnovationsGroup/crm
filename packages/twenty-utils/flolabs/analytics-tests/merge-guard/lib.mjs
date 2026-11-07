// Shared by prepare-merge.mjs, check-before-merge.mjs and the test layer.
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const GUARD_ROOT = path.dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = path.resolve(GUARD_ROOT, '..', '..', '..', '..', '..');
export const CHECK_SCRIPT = path.join(GUARD_ROOT, 'check-before-merge.mjs');

export const SOURCE_BRANCH = 'analytics_tool';
export const MERGE_BRANCH = 'analytics_tool_merge';
export const BASE_REF = 'origin/main';

const CLAUDE_FILE = 'CLAUDE.md';
const STATE_START_MARKER = '<!-- analytics-state:start -->';
const STATE_END_MARKER = '<!-- analytics-state:end -->';
const STATE_HEADING = '## CRM Analytics tool: project state';
// Keeps the name that Rule #1 in CLAUDE.md points readers to.
export const PROJECT_STATE_POINTER =
  '**CRM Analytics tool: project state** is kept on the `analytics_tool` branch. The design is in `docs/analytics/contract.md`.';

const CONTRACT_FILE = 'docs/analytics/contract.md';
export const EXPECTED_INTEGRATION_FILE_COUNT = 5;

export const TEST_DATA_REFERENCE_PATTERN = /analytics[-_]tests|seed/i;

export const EXAMPLE_EMAIL_PATTERN = /[a-z0-9._%+-]+@(?:[a-z0-9-]+\.)*example\.com\b/gi;

export const BUILT_IN_MARKERS = ['analytics_seed'];
// The seed's own list: constants named *SENTINEL*, strings found nowhere else.
const SENTINEL_PATTERN = /\bconst\s+\w*SENTINEL\w*\s*=\s*['"`]([^'"`]+)['"`]/g;
// Left to the email rule, which allows example.com addresses in test files.
const BARE_EMAIL_DOMAIN = '@example.com';

const MAX_GIT_OUTPUT_BYTES = 1024 ** 3;

// A problem the person running the script can act on, printed without a stack trace.
export class GuardError extends Error {}

export const runGit = (
  args,
  { env, input, encoding = 'utf8', okExitCodes = [0] } = {},
) => {
  // No optional locks, so this never competes with other git commands in the working copy.
  const result = spawnSync('git', ['--no-optional-locks', ...args], {
    cwd: REPO_ROOT,
    env: { ...process.env, ...env },
    input: input === undefined ? undefined : Buffer.from(input),
    encoding,
    maxBuffer: MAX_GIT_OUTPUT_BYTES,
  });

  if (result.error !== undefined) {
    throw result.error;
  }

  if (!okExitCodes.includes(result.status)) {
    throw new GuardError(
      `git ${args.join(' ')} failed: ${String(result.stderr).trim()}`,
    );
  }

  return result.stdout;
};

export const splitNul = (text) => text.split('\0').filter(Boolean);

export const shortSha = (sha) => sha.slice(0, 8);

export const resolveCommit = (ref, env) => {
  const commit = runGit(['rev-parse', '--verify', '--quiet', `${ref}^{commit}`], {
    env,
    okExitCodes: [0, 1],
  }).trim();

  return commit === '' ? null : commit;
};

export const findForkPoint = (commit, env) => {
  const baseTip = resolveCommit(BASE_REF, env);

  if (baseTip === null) {
    throw new GuardError(`${BASE_REF} is not known here. Run: git fetch origin main`);
  }

  const forkPoint = runGit(['merge-base', baseTip, commit], {
    env,
    okExitCodes: [0, 1],
  }).trim();

  if (forkPoint === '') {
    throw new GuardError(`${shortSha(commit)} shares no history with ${BASE_REF}.`);
  }

  return { baseTip, forkPoint };
};

export const loadExcludedEntries = () => {
  const { excluded } = JSON.parse(
    fs.readFileSync(path.join(GUARD_ROOT, 'excluded-from-main.json'), 'utf8'),
  );

  if (!Array.isArray(excluded) || excluded.length === 0) {
    throw new GuardError('excluded-from-main.json lists no paths.');
  }

  return excluded;
};

export const isExcludedPath = (file, excludedEntries) =>
  excludedEntries.some(({ path: excludedPath }) =>
    excludedPath.endsWith('/') ? file.startsWith(excludedPath) : file === excludedPath,
  );

const readContractText = (commit, env) => {
  const fromBranch = runGit(['show', `${commit}:${CONTRACT_FILE}`], {
    env,
    okExitCodes: [0, 128],
  });

  if (fromBranch !== '') {
    return fromBranch;
  }

  const localContract = path.join(REPO_ROOT, CONTRACT_FILE);

  if (!fs.existsSync(localContract)) {
    throw new GuardError(`${CONTRACT_FILE} was not found, so the allowed files are unknown.`);
  }

  return fs.readFileSync(localContract, 'utf8');
};

// An exact count, so an edited table cannot quietly widen what may change.
export const readIntegrationFiles = (commit, env) => {
  const contract = readContractText(commit, env);
  const sectionStart = contract.indexOf('**INTEGRATION**');
  const sectionEnd = contract.indexOf('\n## 3.', sectionStart);
  const files =
    sectionStart === -1 || sectionEnd === -1
      ? []
      : [...contract.slice(sectionStart, sectionEnd).matchAll(/^\|\s*`([^`]+)`\s*\|/gm)].map(
          ([, file]) => file,
        );

  if (files.length !== EXPECTED_INTEGRATION_FILE_COUNT) {
    throw new GuardError(
      `Contract section 2 should list ${EXPECTED_INTEGRATION_FILE_COUNT} existing files to edit, and ${files.length} were found. Check ${CONTRACT_FILE} before merging.`,
    );
  }

  return files;
};

export const readFakeMarkers = () => {
  const seedFolder =
    process.env.MERGE_GUARD_SEED_FOLDER ?? path.join(GUARD_ROOT, '..', 'seed');

  if (!fs.existsSync(seedFolder)) {
    return {
      markers: BUILT_IN_MARKERS,
      source: 'seed folder not present, built-in list only',
    };
  }

  const markers = new Set(BUILT_IN_MARKERS);
  const seedFiles = fs
    .readdirSync(seedFolder, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile() && !entry.name.endsWith('.md'))
    .map((entry) => path.join(entry.parentPath, entry.name));

  for (const seedFile of seedFiles) {
    const text = fs.readFileSync(seedFile, 'utf8');

    for (const [, sentinel] of text.matchAll(SENTINEL_PATTERN)) {
      markers.add(sentinel);
    }

    for (const [email] of text.matchAll(EXAMPLE_EMAIL_PATTERN)) {
      markers.add(email);
    }
  }

  markers.delete(BARE_EMAIL_DOMAIN);

  return { markers: [...markers], source: 'read from the seed folder, plus the built-in list' };
};

export const replaceProjectStateBlock = (claudeText) => {
  const start = claudeText.indexOf(STATE_START_MARKER);
  const end = claudeText.indexOf(STATE_END_MARKER);

  if (start === -1 && end === -1) {
    if (claudeText.includes(STATE_HEADING)) {
      throw new GuardError(
        'CLAUDE.md has the project state section without its analytics-state markers, so it cannot be removed safely.',
      );
    }

    return claudeText;
  }

  if (start === -1 || end < start) {
    throw new GuardError('CLAUDE.md has only one of the analytics-state markers.');
  }

  const replaced = `${claudeText.slice(0, start)}${PROJECT_STATE_POINTER}\n${claudeText
    .slice(end + STATE_END_MARKER.length)
    .replace(/^\r?\n/, '')}`;

  if (replaced.includes(STATE_HEADING) || replaced.includes('analytics-state:')) {
    throw new GuardError('CLAUDE.md has more than one project state section.');
  }

  return replaced;
};

const replaceProjectStateInIndex = ({ env, indexEnv }) => {
  const [mode, blob] = runGit(['ls-files', '--stage', '--', CLAUDE_FILE], {
    env: indexEnv,
  })
    .trim()
    .split(/\s+/);

  if (blob === undefined) {
    return false;
  }

  const before = runGit(['cat-file', 'blob', blob], { env });
  const after = replaceProjectStateBlock(before);

  if (after === before) {
    return false;
  }

  const newBlob = runGit(['hash-object', '-w', '--no-filters', '--stdin'], {
    env,
    input: after,
  }).trim();

  runGit(['update-index', '--add', '--cacheinfo', `${mode},${newBlob},${CLAUDE_FILE}`], {
    env: indexEnv,
  });

  return true;
};

const buildCommitMessage = (sourceCommit) =>
  `Add the CRM Analytics tool

The work on ${SOURCE_BRANCH} at ${shortSha(sourceCommit)}, as one commit. The test suite,
test data and research notes stay on ${SOURCE_BRANCH}.
`;

// A temporary index, so the working copy and its real index are never touched.
//
// The commit sits on the fork point, not on top of the source branch. On top, a normal
// merge would carry every old commit into main, seed files included, and merging main
// back later would delete the tests from the source branch.
export const buildCleanCommit = ({ sourceCommit, excludedEntries, env }) => {
  const { forkPoint } = findForkPoint(sourceCommit, env);
  const temporaryFolder = fs.mkdtempSync(path.join(os.tmpdir(), 'merge-guard-index-'));
  const indexEnv = { ...env, GIT_INDEX_FILE: path.join(temporaryFolder, 'index') };

  try {
    runGit(['read-tree', sourceCommit], { env: indexEnv });

    const removedFiles = splitNul(runGit(['ls-files', '-z'], { env: indexEnv })).filter(
      (file) => isExcludedPath(file, excludedEntries),
    );

    if (removedFiles.length > 0) {
      runGit(['update-index', '--force-remove', '-z', '--stdin'], {
        env: indexEnv,
        input: `${removedFiles.join('\0')}\0`,
      });
    }

    const isProjectStateReplaced = replaceProjectStateInIndex({ env, indexEnv });
    const tree = runGit(['write-tree'], { env: indexEnv }).trim();
    const commit = runGit(['commit-tree', tree, '-p', forkPoint, '-F', '-'], {
      env,
      input: buildCommitMessage(sourceCommit),
    }).trim();

    return { commit, tree, forkPoint, removedFiles, isProjectStateReplaced };
  } finally {
    fs.rmSync(temporaryFolder, { recursive: true, force: true });
  }
};
