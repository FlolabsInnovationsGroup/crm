#!/usr/bin/env node
// Says whether a branch is safe to merge into main, and in plain words why not.
//   node packages/twenty-utils/flolabs/analytics-tests/merge-guard/check-before-merge.mjs --ref <branch>
// Exit code: 0 passed, 1 problems found, 2 could not check.
import {
  BASE_REF,
  EXAMPLE_EMAIL_PATTERN,
  EXPECTED_INTEGRATION_FILE_COUNT,
  GuardError,
  SOURCE_BRANCH,
  TEST_DATA_REFERENCE_PATTERN,
  findForkPoint,
  isExcludedPath,
  loadExcludedEntries,
  readFakeMarkers,
  readIntegrationFiles,
  resolveCommit,
  runGit,
  shortSha,
  splitNul,
} from './lib.mjs';

const ALSO_ALLOWED_EXISTING_FILES = ['CLAUDE.md'];

const TEST_FILE_PATTERN =
  /(^|\/)(__tests__|__mocks__|__stories__|__snapshots__|tests?)\/|\.(spec|test|stories)\.[^/]+$/;

const PRODUCT_PATH_PATTERNS = [
  /^packages\/twenty-server\/src\//,
  // Copied into the image by the Dockerfile.
  /^packages\/twenty-server\/scripts\//,
  /^packages\/twenty-front\/src\//,
  /^packages\/twenty-docker\//,
  /^packages\/twenty-utils\/flolabs\/deploy\.sh$/,
  /(^|\/)entrypoint[^/]*$/,
  /(^|\/)upgrade-version-command\//,
  /(^|\/)migrations?\//,
];

const FORBIDDEN_FILE_KINDS = [
  { pattern: /(^|\/)\.env(\.[^/]*)?$/, kind: 'an .env file' },
  {
    pattern:
      /(^|\/)(test-results|playwright-report|blob-report|coverage)\/|(^|\/)(latest-[^/]+\.(json|log)|history\.jsonl|junit[^/]*\.xml)$/,
    kind: 'a test result',
  },
  {
    pattern: /(^|\/)locales\/[^/]*\.po$|(^|\/)locales\/generated\//,
    kind: 'a translation catalog',
  },
  { pattern: /(^|\/)analytics-work\//, kind: 'a scratch file from analytics-work' },
];

const AI_ATTRIBUTION_PATTERNS = [
  /co-authored-by:[^\n]*anthropic\.com/i,
  /generated (with|by) \[?claude/i,
];

const parseRefArgument = (argv) => {
  const inline = argv.find((argument) => argument.startsWith('--ref='));

  if (inline !== undefined) {
    return inline.slice('--ref='.length);
  }

  const flagIndex = argv.indexOf('--ref');

  return flagIndex === -1 ? undefined : argv[flagIndex + 1];
};

const listChanges = (forkPoint, commit) => {
  const fields = splitNul(
    runGit(['diff', '--name-status', '--no-renames', '-z', forkPoint, commit]),
  );
  const changes = [];

  for (let index = 0; index < fields.length; index += 2) {
    changes.push({ status: fields[index], file: fields[index + 1] });
  }

  return changes;
};

const readBlobs = (commit, files) => {
  if (files.length === 0) {
    return new Map();
  }

  const output = runGit(['cat-file', '--batch'], {
    input: files.map((file) => `${commit}:${file}\n`).join(''),
    encoding: 'buffer',
  });
  const blobs = new Map();
  let offset = 0;

  for (const file of files) {
    const headerEnd = output.indexOf(10, offset);
    const size = Number(output.subarray(offset, headerEnd).toString().split(' ')[2]);

    if (Number.isNaN(size)) {
      offset = headerEnd + 1;
      continue;
    }

    blobs.set(file, output.subarray(headerEnd + 1, headerEnd + 1 + size));
    offset = headerEnd + 1 + size + 1;
  }

  return blobs;
};

const readAddedLines = (forkPoint, commit, file) => {
  const diff = runGit([
    'diff',
    '-U0',
    '--no-color',
    '--no-ext-diff',
    '--no-renames',
    forkPoint,
    commit,
    '--',
    file,
  ]);
  const addedLines = [];
  let nextLineNumber = 0;

  for (const line of diff.split('\n')) {
    const hunk = /^@@ -\S+ \+(\d+)/.exec(line);

    if (hunk !== null) {
      nextLineNumber = Number(hunk[1]);
    } else if (nextLineNumber > 0 && line.startsWith('+')) {
      addedLines.push({ number: nextLineNumber, text: line.slice(1) });
      nextLineNumber += 1;
    }
  }

  return addedLines;
};

const isBinary = (blob) => blob.subarray(0, 8000).includes(0);

// New files count in full. Changed files count only for the lines this branch added,
// because main's own lines are not this branch's doing.
const readChangedContent = ({ changes, commit, forkPoint, excludedEntries }) => {
  const present = changes.filter(
    ({ status, file }) => status !== 'D' && !isExcludedPath(file, excludedEntries),
  );
  const blobs = readBlobs(
    commit,
    present.filter(({ status }) => status === 'A').map(({ file }) => file),
  );

  return present.map(({ status, file }) => {
    const blob = blobs.get(file);

    if (status !== 'A') {
      return { status, file, lines: readAddedLines(forkPoint, commit, file) };
    }

    if (blob === undefined || isBinary(blob)) {
      return { status, file, lines: [], binaryContent: blob };
    }

    return {
      status,
      file,
      lines: blob
        .toString('utf8')
        .split(/\r?\n/)
        .map((text, index) => ({ number: index + 1, text })),
    };
  });
};

const clipLine = (text) => {
  const trimmed = text.trim();

  return trimmed.length > 120 ? `${trimmed.slice(0, 120)}...` : trimmed;
};

const findExcludedPathProblems = ({ commit, excludedEntries }) => {
  const treeFiles = splitNul(runGit(['ls-tree', '-r', '--name-only', '-z', commit]));

  return excludedEntries.flatMap((entry) => {
    const inBranch = treeFiles.filter((file) => isExcludedPath(file, [entry]));

    return inBranch.length === 0
      ? []
      : [
          `${entry.path} is in this branch (${inBranch.length} files, for example ${inBranch[0]}). It must stay on ${SOURCE_BRANCH}. ${entry.reason}`,
        ];
  });
};

const findExcludedHistoryProblems = ({ commit, forkPoint, excludedEntries }) => {
  const commitBlocks = splitNul(
    runGit([
      'log',
      '--full-history',
      '--no-renames',
      '--format=%x00%h',
      '--name-only',
      `${forkPoint}..${commit}`,
      '--',
      ...excludedEntries.map(({ path: excludedPath }) => excludedPath),
    ]),
  );

  if (commitBlocks.length === 0) {
    return [];
  }

  const [sha, ...files] = commitBlocks[0].split('\n').filter(Boolean);

  return [
    `${commitBlocks.length} commit(s) on this branch changed excluded paths (for example ${sha} changed ${files[0] ?? 'one of them'}). A normal merge would carry them into the history of main, even if a later commit removed the files. Use the one-commit branch made by prepare-merge.mjs.`,
  ];
};

const findMarkerProblems = ({ changedContent, markers }) => {
  const lowerCaseMarkers = markers.map((marker) => marker.toLowerCase());

  return changedContent.flatMap(({ file, lines, binaryContent }) => {
    if (binaryContent !== undefined) {
      const marker = markers.find((candidate) => binaryContent.includes(candidate));

      return marker === undefined
        ? []
        : [`${file} contains the test data marker "${marker}". Fake test data must not reach main.`];
    }

    for (const { number, text } of lines) {
      const lowerCaseText = text.toLowerCase();
      const markerIndex = lowerCaseMarkers.findIndex((marker) =>
        lowerCaseText.includes(marker),
      );

      if (markerIndex !== -1) {
        return [
          `${file} line ${number} contains the test data marker "${markers[markerIndex]}". Fake test data must not reach main.`,
        ];
      }
    }

    return [];
  });
};

const findExampleEmailProblems = ({ changedContent }) =>
  changedContent
    .filter(({ status, file }) => status === 'A' && !TEST_FILE_PATTERN.test(file))
    .flatMap(({ file, lines }) => {
      for (const { number, text } of lines) {
        const email = text.match(EXAMPLE_EMAIL_PATTERN)?.[0];

        if (email !== undefined) {
          return [
            `${file} line ${number} has the example.com email ${email}, in a new file outside the tests. Fake people must not reach main.`,
          ];
        }
      }

      return [];
    });

const findProductReferenceProblems = ({ changedContent }) =>
  changedContent
    .filter(({ file }) => PRODUCT_PATH_PATTERNS.some((pattern) => pattern.test(file)))
    .flatMap(({ file, lines }) =>
      lines
        .filter(({ text }) => TEST_DATA_REFERENCE_PATTERN.test(text))
        .map(
          ({ number, text }) =>
            `${file} line ${number} is product code that refers to the test suite or seed data: ${clipLine(text)}`,
        ),
    );

const findForbiddenFileProblems = ({ changes }) =>
  changes
    .filter(({ status }) => status !== 'D')
    .flatMap(({ file }) => {
      const forbidden = FORBIDDEN_FILE_KINDS.find(({ pattern }) => pattern.test(file));

      return forbidden === undefined
        ? []
        : [`${file} is ${forbidden.kind}. It must not go to main.`];
    });

const findAttributionProblems = ({ commit, forkPoint }) => {
  const fields = runGit(['log', '--format=%h%x00%B%x00', `${forkPoint}..${commit}`]).split('\0');
  const problems = [];

  for (let index = 0; index + 1 < fields.length; index += 2) {
    if (AI_ATTRIBUTION_PATTERNS.some((pattern) => pattern.test(fields[index + 1]))) {
      problems.push(
        `Commit ${fields[index].trim()} has AI attribution in its message, which CI rejects.`,
      );
    }
  }

  return problems;
};

const findExistingFileProblems = ({ existingChanges, allowedFiles }) =>
  existingChanges.flatMap(({ status, file }) => {
    if (status === 'D') {
      return [`${file} is an existing CRM file and this branch deletes it.`];
    }

    return allowedFiles.includes(file)
      ? []
      : [
          `${file} is an existing CRM file and this branch changes it. Only the ${EXPECTED_INTEGRATION_FILE_COUNT} files in contract section 2 and CLAUDE.md may change.`,
        ];
  });

const printExistingFiles = ({ existingChanges, integrationFiles }) => {
  console.log(`Existing CRM files this branch changes (${existingChanges.length}):`);

  for (const { file } of existingChanges) {
    console.log(`  ${file}`);
  }

  console.log(
    `A person should confirm this is only the ${EXPECTED_INTEGRATION_FILE_COUNT} files in contract section 2, plus CLAUDE.md.`,
  );

  const missing = integrationFiles.filter(
    (file) => !existingChanges.some((change) => change.file === file),
  );

  if (missing.length > 0) {
    console.log(
      `Note: ${missing.length} of the ${EXPECTED_INTEGRATION_FILE_COUNT} expected files are not changed on this branch, so the tool would not be wired in. Are they committed?`,
    );

    for (const file of missing) {
      console.log(`  ${file}`);
    }
  }
};

const main = () => {
  const ref = parseRefArgument(process.argv.slice(2));

  if (ref === undefined || ref === '' || ref.startsWith('-')) {
    throw new GuardError(
      'Usage: node packages/twenty-utils/flolabs/analytics-tests/merge-guard/check-before-merge.mjs --ref <branch>',
    );
  }

  const commit = resolveCommit(ref);

  if (commit === null) {
    throw new GuardError(`There is no branch or commit named ${ref} here.`);
  }

  const { baseTip, forkPoint } = findForkPoint(commit);
  const excludedEntries = loadExcludedEntries();
  const integrationFiles = readIntegrationFiles(commit);
  const allowedFiles = [...integrationFiles, ...ALSO_ALLOWED_EXISTING_FILES];
  const { markers, source: markerSource } = readFakeMarkers();
  const changes = listChanges(forkPoint, commit);
  const existingChanges = changes.filter(({ status }) => status !== 'A');
  const changedContent = readChangedContent({ changes, commit, forkPoint, excludedEntries });

  console.log(
    `Checking ${ref} (${shortSha(commit)}) against ${BASE_REF} (${shortSha(baseTip)}): ${changes.length} files differ from the point it branched off.`,
  );
  console.log(`Test data markers: ${markers.length} (${markerSource}).\n`);
  printExistingFiles({ existingChanges, integrationFiles });

  const problems = [
    ...findExcludedPathProblems({ commit, excludedEntries }),
    ...findExcludedHistoryProblems({ commit, forkPoint, excludedEntries }),
    ...findMarkerProblems({ changedContent, markers }),
    ...findExampleEmailProblems({ changedContent }),
    ...findProductReferenceProblems({ changedContent }),
    ...findForbiddenFileProblems({ changes }),
    ...findAttributionProblems({ commit, forkPoint }),
    ...findExistingFileProblems({ existingChanges, allowedFiles }),
  ];

  if (problems.length === 0) {
    console.log(`\nPASSED: ${ref} has nothing that must stay off main.`);

    return;
  }

  console.log(`\nFAILED: ${problems.length} problem(s) in ${ref}:`);

  for (const [index, problem] of problems.entries()) {
    console.log(`  ${index + 1}. ${problem}`);
  }

  process.exitCode = 1;
};

try {
  main();
} catch (error) {
  if (!(error instanceof GuardError)) {
    throw error;
  }

  console.error(`COULD NOT CHECK: ${error.message}`);
  process.exitCode = 2;
}
