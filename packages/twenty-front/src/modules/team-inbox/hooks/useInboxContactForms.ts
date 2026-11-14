import { useQuery } from '@apollo/client/react';
import { isNonEmptyString } from '@sniptt/guards';
import { isDefined } from 'twenty-shared/utils';

import { useObjectMetadataItems } from '@/object-metadata/hooks/useObjectMetadataItems';
import { useApolloCoreClient } from '@/object-metadata/hooks/useApolloCoreClient';
import { TEAM_INBOX_FOLLOW_UP_FORM_NAMES } from '@/team-inbox/constants/TeamInboxFollowUpFormNames';
import { GET_CONTACT_FORM_SUBMISSIONS } from '@/team-inbox/graphql/getContactFormSubmissions';

type FormSubmissionNode = {
  id: string;
  submittedAt: string | null;
  createdAt: string;
  form: { id: string; name: string | null } | null;
};

export type InboxContactForm = {
  name: string;
  submittedAt: string | null;
};

export const useInboxContactForms = (personId: string | null) => {
  const apolloCoreClient = useApolloCoreClient();
  const { objectMetadataItems } = useObjectMetadataItems();
  const hasFormSubmissions = objectMetadataItems.some(
    (item) => item.nameSingular === 'formSubmission' && item.isActive,
  );

  const { data } = useQuery<{
    formSubmissions: { edges: { node: FormSubmissionNode }[] };
  }>(GET_CONTACT_FORM_SUBMISSIONS, {
    client: apolloCoreClient,
    variables: { personId },
    skip: !isDefined(personId) || !hasFormSubmissions,
  });

  const submitted: InboxContactForm[] = (data?.formSubmissions.edges ?? [])
    .map(({ node }) => ({
      name: node.form?.name ?? '',
      submittedAt: node.submittedAt ?? node.createdAt,
    }))
    .filter(({ name }) => isNonEmptyString(name));

  const submittedNames = new Set(submitted.map(({ name }) => name));
  // Only applicants, who have sent at least one form, are waiting on others.
  const waiting: InboxContactForm[] =
    submitted.length === 0
      ? []
      : TEAM_INBOX_FOLLOW_UP_FORM_NAMES.filter(
          (name) => !submittedNames.has(name),
        ).map((name) => ({ name, submittedAt: null }));

  return isDefined(data) ? [...submitted, ...waiting] : [];
};
