import { useQuery } from '@apollo/client/react';
import { isNonEmptyString } from '@sniptt/guards';

import { EMAIL_TEMPLATE_OBJECT_NAME_SINGULAR } from '@/activities/emails/constants/EmailTemplateObjectNameSingular';
import { type EmailTemplateBodySource } from '@/activities/emails/utils/getEmailTemplateBody';
import { useApolloCoreClient } from '@/object-metadata/hooks/useApolloCoreClient';
import { useObjectMetadataItems } from '@/object-metadata/hooks/useObjectMetadataItems';
import { GET_INBOX_EMAIL_TEMPLATES } from '@/team-inbox/graphql/getInboxEmailTemplates';

export type InboxEmailTemplate = EmailTemplateBodySource & {
  id: string;
  name: string | null;
  subject: string | null;
};

// A plain query: useFindManyRecords throws in workspaces without the
// Email Templates object, and this hook runs on every inbox page.
export const useInboxEmailTemplates = (): InboxEmailTemplate[] => {
  const apolloCoreClient = useApolloCoreClient();
  const { objectMetadataItems } = useObjectMetadataItems();
  const hasEmailTemplateObject = objectMetadataItems.some(
    (objectMetadataItem) =>
      objectMetadataItem.nameSingular === EMAIL_TEMPLATE_OBJECT_NAME_SINGULAR &&
      objectMetadataItem.isActive,
  );

  const { data } = useQuery<{
    emailTemplates: { edges: { node: InboxEmailTemplate }[] };
  }>(GET_INBOX_EMAIL_TEMPLATES, {
    client: apolloCoreClient,
    skip: !hasEmailTemplateObject,
  });

  return (data?.emailTemplates.edges ?? [])
    .map(({ node }) => node)
    .filter(
      (template) =>
        isNonEmptyString(template.body?.markdown?.trim()) ||
        isNonEmptyString(template.bodyHtml),
    );
};
