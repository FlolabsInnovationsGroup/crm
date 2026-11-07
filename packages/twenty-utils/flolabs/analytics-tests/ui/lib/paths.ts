import path from 'node:path';

export const RESULTS_ROOT =
  process.env.ANALYTICS_TEST_RESULTS_DIR ??
  path.resolve(__dirname, '../../../../../../../analytics-work/test-results');

export const SCREENSHOTS_DIR = path.join(RESULTS_ROOT, 'screenshots');

export const ADMIN_SESSION_PATH = path.join(
  RESULTS_ROOT,
  'ui-output-session',
  'admin.json',
);

// Second safety line under the URL checks: the browser cannot resolve any other host,
// so a page or a front configured for another server cannot reach it.
export const LOCAL_ONLY_BROWSER_ARGUMENT =
  '--host-resolver-rules=MAP * ~NOTFOUND , EXCLUDE localhost , EXCLUDE 127.0.0.1 , EXCLUDE *.localhost';
