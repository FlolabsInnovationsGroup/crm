import { useQuery } from '@apollo/client/react';
import { isNonEmptyString } from '@sniptt/guards';

import {
  GET_AGREEMENT_PERSON,
  GET_AGREEMENT_REQUESTS,
  GET_AGREEMENT_TEMPLATES,
  SEARCH_AGREEMENT_PEOPLE,
} from '@/agreements/graphql/agreementQueries';
import { useAreAgreementsSetUp } from '@/agreements/hooks/useAreAgreementsSetUp';
import {
  type AgreementPerson,
  type AgreementRequest,
  type AgreementTemplate,
} from '@/agreements/types/Agreement';
import { getAgreementPeopleFilter } from '@/agreements/utils/getAgreementPeopleFilter';
import { useApolloCoreClient } from '@/object-metadata/hooks/useApolloCoreClient';

type Connection<TNode> = { edges: { node: TNode }[] };

export const useAgreementTemplates = () => {
  const apolloCoreClient = useApolloCoreClient();
  const isSetUp = useAreAgreementsSetUp();
  const { data, loading, error } = useQuery<{
    agreementTemplates: Connection<AgreementTemplate>;
  }>(GET_AGREEMENT_TEMPLATES, {
    client: apolloCoreClient,
    skip: !isSetUp,
    fetchPolicy: 'cache-and-network',
  });

  return {
    templates: (data?.agreementTemplates.edges ?? [])
      .map(({ node }) => node)
      .filter((template) => template.isActive !== false),
    loading,
    error,
  };
};

export const useAgreementRequests = () => {
  const apolloCoreClient = useApolloCoreClient();
  const isSetUp = useAreAgreementsSetUp();
  const { data, previousData, loading, error, refetch } = useQuery<{
    agreementRequests: Connection<AgreementRequest>;
  }>(GET_AGREEMENT_REQUESTS, {
    client: apolloCoreClient,
    skip: !isSetUp,
    fetchPolicy: 'cache-and-network',
    notifyOnNetworkStatusChange: true,
  });

  return {
    requests: ((data ?? previousData)?.agreementRequests.edges ?? []).map(
      ({ node }) => node,
    ),
    loading,
    error,
    refetch,
  };
};

export const useAgreementPeopleSearch = (searchTerm: string) => {
  const apolloCoreClient = useApolloCoreClient();
  const trimmed = searchTerm.trim();
  const { data, previousData, loading } = useQuery<{
    people: Connection<AgreementPerson>;
  }>(SEARCH_AGREEMENT_PEOPLE, {
    client: apolloCoreClient,
    variables: { filter: getAgreementPeopleFilter(trimmed) },
    skip: trimmed.length < 2,
  });

  return {
    people:
      trimmed.length < 2
        ? []
        : ((data ?? previousData)?.people.edges ?? []).map(({ node }) => node),
    loading,
  };
};

export const useAgreementPerson = (personId: string | null) => {
  const apolloCoreClient = useApolloCoreClient();
  const { data } = useQuery<{ person: AgreementPerson | null }>(
    GET_AGREEMENT_PERSON,
    {
      client: apolloCoreClient,
      variables: { personId },
      skip: !isNonEmptyString(personId),
    },
  );

  return data?.person ?? null;
};
