'use strict';
// Hard safety rule of this suite: every target passes through here before it is used,
// so no setting can aim a test at a machine other than this one. See README.md.
const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1']);
const PROOF_DATABASE_PATTERN = /^analytics_proof(_[a-z0-9]+)?$/;

class RefusedTargetError extends Error {}

const assertLocalUrl = (value, settingName) => {
  let url;

  try {
    url = new URL(value);
  } catch {
    throw new RefusedTargetError(
      `Refused: ${settingName} is not a URL: "${value}".`,
    );
  }

  if (
    !LOCAL_HOSTS.has(url.hostname) ||
    (url.protocol !== 'http:' && url.protocol !== 'https:')
  ) {
    throw new RefusedTargetError(
      `Refused: ${settingName} is "${value}". This suite only ever talks to http(s)://localhost or 127.0.0.1.`,
    );
  }

  return url.origin;
};

const assertLocalDatabaseHost = (host) => {
  if (!LOCAL_HOSTS.has(host)) {
    throw new RefusedTargetError(
      `Refused: database host is "${host}". This suite only ever uses a local Postgres on localhost or 127.0.0.1.`,
    );
  }

  return host;
};

// Each run drops and recreates this database, so it can never be a CRM database.
const assertProofDatabaseName = (name) => {
  if (!PROOF_DATABASE_PATTERN.test(name)) {
    throw new RefusedTargetError(
      `Refused: database "${name}". This suite only drops and recreates analytics_proof.`,
    );
  }

  return name;
};

// For addresses a page may load by itself. Chromium always resolves *.localhost to this
// machine, and the CRM's multi-workspace mode serves workspaces from such subdomains.
const isLocalBrowserUrl = (value) => {
  const url = new URL(value);

  if (url.protocol === 'data:' || url.protocol === 'blob:') {
    return true;
  }

  return (
    LOCAL_HOSTS.has(url.hostname) || url.hostname.endsWith('.localhost')
  );
};

module.exports = {
  RefusedTargetError,
  assertLocalUrl,
  assertLocalDatabaseHost,
  assertProofDatabaseName,
  isLocalBrowserUrl,
};
