'use strict';
// Another Playwright on this machine may hold a newer browser than the repo's expects,
// which is enough to run these tests without a download. A build can also be present
// and still fail to start, so each candidate must prove it runs.
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const HEADLESS_SHELL_PATH = path.join(
  'chrome-headless-shell-win64',
  'chrome-headless-shell.exe',
);

const canStart = (executablePath) => {
  if (!fs.existsSync(executablePath)) {
    return false;
  }

  const { status } = spawnSync(executablePath, ['--version'], {
    stdio: 'ignore',
    timeout: 10_000,
  });

  return status === 0;
};

const listNewestFirst = (browsersRoot, prefix) =>
  fs
    .readdirSync(browsersRoot)
    .filter((name) => new RegExp(`^${prefix}-\\d+$`).test(name))
    .sort((left, right) => Number(right.split('-').at(-1)) - Number(left.split('-').at(-1)));

const findChromium = (playwrightChromium) => {
  const expected = playwrightChromium.executablePath();

  if (canStart(expected)) {
    return expected;
  }

  const buildFolder = path.resolve(expected, '..', '..');
  const browsersRoot = path.dirname(buildFolder);

  if (!fs.existsSync(browsersRoot)) {
    return null;
  }

  const candidates = [
    ...listNewestFirst(browsersRoot, 'chromium_headless_shell').map((name) =>
      path.join(browsersRoot, name, HEADLESS_SHELL_PATH),
    ),
    ...listNewestFirst(browsersRoot, 'chromium').map((name) =>
      path.join(browsersRoot, name, path.relative(buildFolder, expected)),
    ),
  ];

  return candidates.find(canStart) ?? null;
};

module.exports = { findChromium };
