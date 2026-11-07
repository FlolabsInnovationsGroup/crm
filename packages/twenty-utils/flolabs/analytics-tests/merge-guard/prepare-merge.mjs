#!/usr/bin/env node
// Makes the local branch analytics_tool_merge: the committed work on analytics_tool as
// one commit, without the excluded paths. It never pushes and never touches main.
//   node packages/twenty-utils/flolabs/analytics-tests/merge-guard/prepare-merge.mjs
import { spawnSync } from 'node:child_process';

import {
  BASE_REF,
  CHECK_SCRIPT,
  GuardError,
  MERGE_BRANCH,
  REPO_ROOT,
  SOURCE_BRANCH,
  buildCleanCommit,
  findForkPoint,
  loadExcludedEntries,
  readIntegrationFiles,
  resolveCommit,
  runGit,
  shortSha,
} from './lib.mjs';

const ALLOWED_BRANCH_PATTERN = /^analytics_tool_merge(_[a-z0-9_]+)?$/;

const parseBranchArgument = (argv) => {
  const flagIndex = argv.indexOf('--branch');
  const branch = flagIndex === -1 ? MERGE_BRANCH : argv[flagIndex + 1];

  if (branch === undefined || !ALLOWED_BRANCH_PATTERN.test(branch)) {
    throw new GuardError(
      `This script only writes branches named ${MERGE_BRANCH}, so it can never replace main or ${SOURCE_BRANCH}.`,
    );
  }

  return branch;
};

const replaceBranch = (branch, commit) => {
  const oldCommit = resolveCommit(`refs/heads/${branch}`);

  if (oldCommit !== null) {
    console.log(`Replacing the old ${branch}, which was at ${shortSha(oldCommit)}.`);
  }

  try {
    runGit(['branch', '--force', branch, commit]);
  } catch (error) {
    throw new GuardError(
      `Could not write ${branch}. If it is checked out somewhere, switch away from it and run this again. Git said: ${error.message}`,
    );
  }
};

const printUncommittedWarning = () => {
  const currentBranch = runGit(['symbolic-ref', '--short', '--quiet', 'HEAD'], {
    okExitCodes: [0, 1],
  }).trim();

  if (currentBranch !== SOURCE_BRANCH) {
    return false;
  }

  const uncommitted = runGit(['status', '--porcelain']).split('\n').filter(Boolean);

  if (uncommitted.length === 0) {
    return false;
  }

  console.log(
    `\nWarning: ${uncommitted.length} uncommitted change(s) in this working copy are NOT in the branch.`,
  );

  return true;
};

const hasAllIntegrationEdits = ({ commit, forkPoint }) => {
  const changedFiles = runGit(['diff', '--name-only', '--no-renames', forkPoint, commit]).split(
    '\n',
  );

  return readIntegrationFiles(commit).every((file) => changedFiles.includes(file));
};

const printBaseWarnings = ({ branch, forkPoint, baseTip }) => {
  const commitsBehind = Number(
    runGit(['rev-list', '--count', `${forkPoint}..${baseTip}`]).trim(),
  );

  if (commitsBehind > 0) {
    console.log(
      `\nWarning: ${BASE_REF} has ${commitsBehind} newer commit(s). Update ${SOURCE_BRANCH} from it, resolve conflicts, then run this again.`,
    );
  }

  if (resolveCommit(`refs/remotes/origin/${branch}`) !== null) {
    console.log(
      `\nNote: origin already has an older ${branch}. A force push sets off the security scan, so delete that branch on GitHub before pushing this one.`,
    );
  }
};

const main = () => {
  const branch = parseBranchArgument(process.argv.slice(2));
  const sourceCommit = resolveCommit(`refs/heads/${SOURCE_BRANCH}`);

  if (sourceCommit === null) {
    throw new GuardError(`There is no local branch named ${SOURCE_BRANCH}.`);
  }

  const { baseTip, forkPoint } = findForkPoint(sourceCommit);
  const { commit, removedFiles, isProjectStateReplaced } = buildCleanCommit({
    sourceCommit,
    excludedEntries: loadExcludedEntries(),
  });

  replaceBranch(branch, commit);

  console.log(
    `Made ${branch} (${shortSha(commit)}) from ${SOURCE_BRANCH} (${shortSha(sourceCommit)}), as one commit on ${shortSha(forkPoint)}.`,
  );
  console.log(`Left out ${removedFiles.length} excluded file(s).`);
  console.log(
    isProjectStateReplaced
      ? 'CLAUDE.md: replaced the project state section with one pointer line.'
      : 'CLAUDE.md: no project state section to replace.',
  );
  console.log(`${SOURCE_BRANCH} and this working copy were not changed.\n`);

  const check = spawnSync(process.execPath, [CHECK_SCRIPT, '--ref', branch], {
    cwd: REPO_ROOT,
    stdio: 'inherit',
  });

  const hasUncommittedWork = printUncommittedWarning();

  printBaseWarnings({ branch, forkPoint, baseTip });

  if (check.status !== 0) {
    console.log(
      `\nResult: NOT READY. Do not push ${branch}.\nNext step: fix each problem above on ${SOURCE_BRANCH}, commit, and run this script again.`,
    );
    process.exitCode = 1;

    return;
  }

  if (hasUncommittedWork || !hasAllIntegrationEdits({ commit, forkPoint })) {
    console.log(
      `\nResult: THE CHECK PASSED, BUT THE BRANCH IS INCOMPLETE. Work is missing from it, as noted above. Nothing has been pushed and main was not touched.\nNext step: commit what should go to main on ${SOURCE_BRANCH}, then run this script again.`,
    );

    return;
  }

  console.log(
    `\nResult: READY. Nothing has been pushed and main was not touched.\nNext step, once docs/analytics/THINGS-TO-DO-BEFORE-MERGE.md is done:\n  git push origin ${branch}\nThen open a pull request from ${branch} into main. Any merge button is safe, because the branch is one commit with no test data in it.`,
  );
};

try {
  main();
} catch (error) {
  if (!(error instanceof GuardError)) {
    throw error;
  }

  console.error(`STOPPED: ${error.message}`);
  process.exitCode = 2;
}
