// Prepares the local Apple workspace for the seed: an API key, the three applicant fields
// with every option the seed writes, and the form objects. Safe to run again.
// Local only. From the worktree root, with the server up on port 3000:
//   node ../analytics-work/e2e/local-run/setup-seed-objects.mjs
import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const WORKTREE = path.resolve(HERE, '..', '..', '..', 'analytics_tool');
const API = 'http://localhost:3000';
const FRONT = 'http://localhost:3001';
// The local demo user from the CRM's dev seeder, not a real account.
const DEMO_EMAIL = 'tim@apple.dev';
const DEMO_PASSWORD = 'tim@apple.dev';

const post = async ({ pathName = '/metadata', token, query, variables = {} }) => {
  const response = await fetch(`${API}${pathName}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ query, variables }),
  });
  const body = await response.json().catch(() => ({}));

  if (!response.ok || body.errors) {
    throw new Error(`Request failed (${response.status}): ${JSON.stringify(body.errors ?? body).slice(0, 600)}`);
  }

  return body.data;
};

const clientConfig = await (await fetch(`${API}/client-config`)).json();
const originUrl = new URL(FRONT);

if (clientConfig.isMultiWorkspaceEnabled === true) {
  originUrl.hostname = `apple.${originUrl.hostname}`;
}

const origin = originUrl.origin;
const { getLoginTokenFromCredentials } = await post({
  query: `mutation ($email: String!, $password: String!, $origin: String!) {
    getLoginTokenFromCredentials(email: $email, password: $password, origin: $origin) { loginToken { token } }
  }`,
  variables: { email: DEMO_EMAIL, password: DEMO_PASSWORD, origin },
});
const { getAuthTokensFromLoginToken } = await post({
  query: `mutation ($loginToken: String!, $origin: String!) {
    getAuthTokensFromLoginToken(loginToken: $loginToken, origin: $origin) {
      tokens { accessOrWorkspaceAgnosticToken { token } }
    }
  }`,
  variables: { loginToken: getLoginTokenFromCredentials.loginToken.token, origin },
});
const userToken = getAuthTokensFromLoginToken.tokens.accessOrWorkspaceAgnosticToken.token;

const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24 * 30).toISOString();
const { getApiKeyRoles } = await post({ token: userToken, query: 'query { getApiKeyRoles { id canAccessAllTools } }' });
const roleId = getApiKeyRoles.find((role) => role.canAccessAllTools)?.id;

if (!roleId) {
  throw new Error('No API key role with every tool.');
}

const { createApiKey } = await post({
  token: userToken,
  query: 'mutation ($input: CreateApiKeyInput!) { createApiKey(input: $input) { id } }',
  variables: { input: { name: 'local seed setup', expiresAt, roleId } },
});
const { generateApiKeyToken } = await post({
  token: userToken,
  query: 'mutation ($apiKeyId: UUID!, $expiresAt: String!) { generateApiKeyToken(apiKeyId: $apiKeyId, expiresAt: $expiresAt) { token } }',
  variables: { apiKeyId: createApiKey.id, expiresAt },
});
const tokenFile = path.join(HERE, '..', 'token.txt');

mkdirSync(path.dirname(tokenFile), { recursive: true });
writeFileSync(tokenFile, generateApiKeyToken.token);
const token = generateApiKeyToken.token;

const seedModule = await import(
  pathToFileURL(path.join(WORKTREE, 'packages/twenty-utils/flolabs/analytics-tests/seed/seed-data.mjs')).href
);
const seed = seedModule.buildSeed(new Date().toISOString());
const people = seed.workspaces.main.people;
const unique = (values) => [...new Set(values.filter((value) => value !== null && value !== undefined))];
const stageValues = unique(people.flatMap((person) => [person.initialRaw, ...person.changes.map((change) => change.to)]));
const positionValues = unique(people.flatMap((person) => person.positions ?? []));
const sourceValues = unique(people.map((person) => person.source));

const labelFor = (value) =>
  value
    .toLowerCase()
    .split('_')
    .map((word, index) => (index === 0 ? word.charAt(0).toUpperCase() + word.slice(1) : word))
    .join(' ');
const toOptions = (values) =>
  values.map((value, position) => ({ value, label: labelFor(value), position, color: 'gray' }));

const findPerson = async () => {
  const data = await post({
    token,
    query: `query { objects(paging: { first: 1000 }) { edges { node { id nameSingular fieldsList { name } } } } }`,
  });

  return data.objects.edges.map((edge) => edge.node).find((object) => object.nameSingular === 'person');
};

const person = await findPerson();

for (const field of [
  { name: 'stage', label: 'Stage', type: 'SELECT', icon: 'IconProgress', options: toOptions(stageValues) },
  { name: 'positionsAppliedFor', label: 'Positions applied for', type: 'MULTI_SELECT', icon: 'IconBriefcase', options: toOptions(positionValues) },
  { name: 'applicantSource', label: 'Applicant source', type: 'SELECT', icon: 'IconAntenna', options: toOptions(sourceValues) },
]) {
  if (person.fieldsList.some((existing) => existing.name === field.name)) {
    console.log(`= field person.${field.name} already exists`);
    continue;
  }

  await post({
    token,
    query: 'mutation ($input: CreateOneFieldMetadataInput!) { createOneField(input: $input) { id } }',
    variables: { input: { field: { objectMetadataId: person.id, ...field } } },
  });
  console.log(`+ field person.${field.name} with ${field.options.length} options`);
}

const forms = spawnSync(process.execPath, [path.join(WORKTREE, 'packages/twenty-utils/flolabs/setup-forms.mjs')], {
  cwd: WORKTREE,
  encoding: 'utf8',
  env: { ...process.env, TWENTY_URL: API, TWENTY_TOKEN_FILE: tokenFile },
});

console.log(forms.stdout.trim());

if (forms.status !== 0) {
  console.error(forms.stderr);
  process.exit(1);
}

console.log(`Ready: ${stageValues.length} stages, ${positionValues.length} positions, ${sourceValues.length} sources.`);
