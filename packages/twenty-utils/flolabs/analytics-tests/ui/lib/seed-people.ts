import { ADMIN_EMAIL, login, postGraphql } from '../../blackbox/lib/api-client.cjs';

export type SeedPerson = { personId: string; displayName: string };

// Real records, so opening one from a stuck row loads a real person in the side panel.
export const fetchSeedPeople = async (): Promise<SeedPerson[]> => {
  const token = await login(ADMIN_EMAIL);
  const { body } = await postGraphql({
    path: '/graphql',
    token,
    query: `query { people(first: 2) { edges { node { id name { firstName lastName } } } } }`,
  });

  return (body?.data?.people?.edges ?? []).map(
    ({ node }: { node: { id: string; name: { firstName: string; lastName: string } } }) => ({
      personId: node.id,
      displayName: `${node.name.firstName} ${node.name.lastName}`.trim(),
    }),
  );
};
