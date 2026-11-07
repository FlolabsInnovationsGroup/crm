'use strict';
// Talks to the running CRM the way a user's browser does: log in, then POST GraphQL.
// Knows only the API in contract section 7, nothing about how it is built.
const { assertLocalUrl } = require('../../lib/local-only.cjs');

const REQUEST_TIMEOUT_MS = 30_000;
const PREREQUISITE_TIMEOUT_MS = 5_000;

const SEED_PASSWORD = 'tim@apple.dev';
const ADMIN_EMAIL = 'tim@apple.dev';

const getApiUrl = () =>
  assertLocalUrl(
    process.env.ANALYTICS_TEST_API_URL ?? 'http://localhost:3000',
    'ANALYTICS_TEST_API_URL',
  );

const getFrontUrl = () =>
  assertLocalUrl(
    process.env.ANALYTICS_TEST_FRONT_URL ?? 'http://localhost:3001',
    'ANALYTICS_TEST_FRONT_URL',
  );

// redirect: 'error' so no answer can walk a request off this machine.
const send = (url, init, timeoutMs) =>
  fetch(url, {
    ...init,
    redirect: 'error',
    signal: AbortSignal.timeout(timeoutMs),
  });

const postGraphql = async ({
  path,
  query,
  variables = {},
  token = undefined,
  timeoutMs = REQUEST_TIMEOUT_MS,
}) => {
  const response = await send(
    `${getApiUrl()}${path}`,
    {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        origin: getFrontUrl(),
        ...(token ? { authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ query, variables }),
    },
    timeoutMs,
  );
  const text = await response.text();
  let body = null;

  try {
    body = JSON.parse(text);
  } catch {
    body = null;
  }

  return { status: response.status, body, text };
};

const getClientConfig = async (timeoutMs = REQUEST_TIMEOUT_MS) => {
  const response = await send(`${getApiUrl()}/client-config`, {}, timeoutMs);
  const text = await response.text();
  let body = null;

  try {
    body = JSON.parse(text);
  } catch {
    body = null;
  }

  return {
    status: response.status,
    contentType: response.headers.get('content-type'),
    body,
  };
};

const firstErrorMessage = (body) =>
  body?.errors?.[0]?.message ?? 'no token in the response';

class LoginRefusedError extends Error {}

// In multi-workspace mode the Apple seed workspace is chosen by its subdomain.
const getWorkspaceOrigin = async (timeoutMs) => {
  const { body } = await getClientConfig(timeoutMs);
  const frontUrl = new URL(getFrontUrl());

  if (body?.isMultiWorkspaceEnabled === true) {
    frontUrl.hostname = `apple.${frontUrl.hostname}`;
  }

  return frontUrl.origin;
};

const login = async (
  email,
  password = SEED_PASSWORD,
  timeoutMs = REQUEST_TIMEOUT_MS,
) => {
  const origin = await getWorkspaceOrigin(timeoutMs);
  const loginResponse = await postGraphql({
    path: '/metadata',
    timeoutMs,
    query: `mutation ($email: String!, $password: String!, $origin: String!) {
      getLoginTokenFromCredentials(email: $email, password: $password, origin: $origin) {
        loginToken { token }
      }
    }`,
    variables: { email, password, origin },
  });
  const loginToken =
    loginResponse.body?.data?.getLoginTokenFromCredentials?.loginToken?.token;

  if (!loginToken) {
    throw new LoginRefusedError(firstErrorMessage(loginResponse.body));
  }

  const tokenResponse = await postGraphql({
    path: '/metadata',
    timeoutMs,
    query: `mutation ($loginToken: String!, $origin: String!) {
      getAuthTokensFromLoginToken(loginToken: $loginToken, origin: $origin) {
        tokens { accessOrWorkspaceAgnosticToken { token } }
      }
    }`,
    variables: { loginToken, origin },
  });
  const token =
    tokenResponse.body?.data?.getAuthTokensFromLoginToken?.tokens
      ?.accessOrWorkspaceAgnosticToken?.token;

  if (!token) {
    throw new LoginRefusedError(firstErrorMessage(tokenResponse.body));
  }

  return token;
};

const getPermissionFlags = async (token) => {
  const { body } = await postGraphql({
    path: '/metadata',
    token,
    query: `query { currentUser { currentUserWorkspace { permissionFlags } } }`,
  });

  return body?.data?.currentUser?.currentUserWorkspace?.permissionFlags ?? [];
};

const ANALYTICS_QUERIES = {
  meta: {
    field: 'getCrmAnalyticsMeta',
    query: 'query { getCrmAnalyticsMeta { payload } }',
  },
  overview: {
    field: 'getCrmAnalyticsOverview',
    query:
      'query ($filter: CrmAnalyticsFilterInput!) { getCrmAnalyticsOverview(filter: $filter) { payload } }',
    defaultVariables: { filter: {} },
  },
  funnel: {
    field: 'getCrmAnalyticsFunnel',
    query:
      'query ($filter: CrmAnalyticsFilterInput!) { getCrmAnalyticsFunnel(filter: $filter) { payload } }',
    defaultVariables: { filter: {} },
  },
  categories: {
    field: 'getCrmAnalyticsCategories',
    query:
      'query ($filter: CrmAnalyticsFilterInput!, $groupBy: String!) { getCrmAnalyticsCategories(filter: $filter, groupBy: $groupBy) { payload } }',
    defaultVariables: { filter: {}, groupBy: 'TRACK_PROGRAM' },
  },
  trends: {
    field: 'getCrmAnalyticsTrends',
    query:
      'query ($filter: CrmAnalyticsFilterInput!, $metric: String!, $stageKey: String) { getCrmAnalyticsTrends(filter: $filter, metric: $metric, stageKey: $stageKey) { payload } }',
    defaultVariables: { filter: {}, metric: 'TOTAL_CONTACTS', stageKey: null },
  },
  reports: {
    field: 'getCrmAnalyticsReports',
    query: 'query { getCrmAnalyticsReports { payload } }',
  },
  report: {
    field: 'getCrmAnalyticsReport',
    query:
      'query ($periodType: String!, $periodStart: String!) { getCrmAnalyticsReport(periodType: $periodType, periodStart: $periodStart) { payload } }',
    defaultVariables: { periodType: 'WEEK', periodStart: '2000-01-03' },
  },
};

const callAnalytics = async (name, variables, token) => {
  const { field, query, defaultVariables } = ANALYTICS_QUERIES[name];
  const { status, body, text } = await postGraphql({
    path: '/graphql',
    query,
    variables: { ...defaultVariables, ...variables },
    token,
  });

  return {
    status,
    text,
    errors: body?.errors ?? [],
    code: body?.errors?.[0]?.extensions?.code,
    message: body?.errors?.[0]?.message,
    field: body?.data?.[field] ?? null,
    payload: body?.data?.[field]?.payload ?? null,
  };
};

const describeNetworkError = (error) =>
  error?.cause?.code ?? error?.cause?.message ?? error?.name ?? String(error);

// Returns null when the blackbox layer can run, else the exact reason it cannot.
const checkAnalyticsApi = async () => {
  const apiUrl = getApiUrl();

  getFrontUrl();

  let clientConfig;

  try {
    clientConfig = await getClientConfig(PREREQUISITE_TIMEOUT_MS);
  } catch (error) {
    return `The local CRM is not answering on ${apiUrl} (${describeNetworkError(error)}). Start the server, see README.md.`;
  }

  if (typeof clientConfig.body?.authProviders !== 'object') {
    return `${apiUrl} answers, but it is not the CRM: GET /client-config returned ${clientConfig.status} ${clientConfig.contentType ?? ''}. Another app may hold the port.`;
  }

  let token;

  try {
    token = await login(ADMIN_EMAIL, SEED_PASSWORD, PREREQUISITE_TIMEOUT_MS * 3);
  } catch (error) {
    return `The seed user ${ADMIN_EMAIL} cannot log in on ${apiUrl}: ${error?.message ?? error}. Seed the local database first.`;
  }

  const meta = await callAnalytics('meta', {}, token);

  if (meta.errors.some(({ message }) => /Cannot query field/.test(message))) {
    return `The CRM on ${apiUrl} has no getCrmAnalyticsMeta query: the running server was built without the analytics module.`;
  }

  return null;
};

const checkFront = async () => {
  const frontUrl = getFrontUrl();

  try {
    const response = await send(`${frontUrl}/`, {}, PREREQUISITE_TIMEOUT_MS);
    const html = await response.text();

    if (!/FloLabs CRM|Twenty/.test(html)) {
      return `${frontUrl} answers, but it is not the CRM front: the page has no CRM title. Another app may hold the port.`;
    }

    return null;
  } catch (error) {
    return `The CRM front is not answering on ${frontUrl} (${describeNetworkError(error)}). Start it: npx nx start twenty-front`;
  }
};

module.exports = {
  ADMIN_EMAIL,
  SEED_PASSWORD,
  LoginRefusedError,
  getApiUrl,
  getFrontUrl,
  postGraphql,
  login,
  getPermissionFlags,
  callAnalytics,
  checkAnalyticsApi,
  checkFront,
};
