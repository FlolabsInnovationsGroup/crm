import { isNonEmptyString } from '@sniptt/guards';

import { EMAIL_TEMPLATE_OBJECT_NAME_SINGULAR } from '@/activities/emails/constants/EmailTemplateObjectNameSingular';
import { type EmailTemplateBodySource } from '@/activities/emails/utils/getEmailTemplateBody';
import { useObjectMetadataItems } from '@/object-metadata/hooks/useObjectMetadataItems';
import { useFindManyRecords } from '@/object-record/hooks/useFindManyRecords';
import { type ObjectRecord } from '@/object-record/types/ObjectRecord';

export type InboxEmailTemplate = ObjectRecord &
  EmailTemplateBodySource & {
    name: string | null;
    subject: string | null;
  };

export const useInboxEmailTemplates = () => {
  const { objectMetadataItems } = useObjectMetadataItems();
  const hasEmailTemplateObject = objectMetadataItems.some(
    (objectMetadataItem) =>
      objectMetadataItem.nameSingular === EMAIL_TEMPLATE_OBJECT_NAME_SINGULAR &&
      objectMetadataItem.isActive,
  );

  const { records } = useFindManyRecords<InboxEmailTemplate>({
    objectNameSingular: EMAIL_TEMPLATE_OBJECT_NAME_SINGULAR,
    orderBy: [{ name: 'AscNullsLast' }],
    recordGqlFields: {
      id: true,
      name: true,
      subject: true,
      body: true,
      bodyHtml: true,
    },
    limit: 200,
    skip: !hasEmailTemplateObject,
  });

  return records.filter(
    (template) =>
      isNonEmptyString(template.body?.markdown?.trim()) ||
      isNonEmptyString(template.bodyHtml),
  );
};
