import { isNonEmptyString } from '@sniptt/guards';
import { t } from '@lingui/core/macro';
import { isDefined } from 'twenty-shared/utils';

import { ComposerFieldRow } from '@/activities/components/ComposerFieldRow';
import { EMAIL_TEMPLATE_OBJECT_NAME_SINGULAR } from '@/activities/emails/constants/EmailTemplateObjectNameSingular';
import { type EmailComposerContextRecord } from '@/activities/emails/recipients/types/EmailComposerContextRecord';
import { type EmailComposerState } from '@/activities/emails/types/EmailComposerState';
import { fillEmailTemplateVariables } from '@/activities/emails/utils/fillEmailTemplateVariables';
import { useObjectMetadataItems } from '@/object-metadata/hooks/useObjectMetadataItems';
import { useFindManyRecords } from '@/object-record/hooks/useFindManyRecords';
import { useFindOneRecord } from '@/object-record/hooks/useFindOneRecord';
import { type ObjectRecord } from '@/object-record/types/ObjectRecord';
import { Select } from '@/ui/input/components/Select';
import { CoreObjectNameSingular } from 'twenty-shared/types';

type EmailTemplateRecord = ObjectRecord & {
  name: string | null;
  subject: string | null;
  bodyHtml: string | null;
};

type PersonNameRecord = ObjectRecord & {
  name: { firstName: string | null; lastName: string | null } | null;
};

type EmailTemplatePickerProps = {
  composerState: EmailComposerState;
  contextRecord?: EmailComposerContextRecord | null;
};

const NO_TEMPLATE_VALUE = '';

type EmailTemplatePickerContentProps = EmailTemplatePickerProps;

const EmailTemplatePickerContent = ({
  composerState,
  contextRecord,
}: EmailTemplatePickerContentProps) => {
  const { records: templates } = useFindManyRecords<EmailTemplateRecord>({
    objectNameSingular: EMAIL_TEMPLATE_OBJECT_NAME_SINGULAR,
    orderBy: [{ name: 'AscNullsLast' }],
    recordGqlFields: { id: true, name: true, subject: true, bodyHtml: true },
    limit: 200,
  });

  const isPersonContext =
    contextRecord?.objectNameSingular === CoreObjectNameSingular.Person;

  const { record: person } = useFindOneRecord<PersonNameRecord>({
    objectNameSingular: CoreObjectNameSingular.Person,
    objectRecordId: contextRecord?.recordId,
    recordGqlFields: { id: true, name: true },
    skip: !isPersonContext,
  });

  const getRecipientName = () => {
    if (isDefined(person?.name)) {
      return person.name;
    }

    const displayName = composerState.to[0]?.displayName?.trim() ?? '';
    const [firstName = '', ...lastNameParts] = displayName.split(/\s+/);

    return { firstName, lastName: lastNameParts.join(' ') };
  };

  const handleTemplateChange = (templateId: string) => {
    const template = templates.find((record) => record.id === templateId);

    if (!isDefined(template)) {
      return;
    }

    const recipientName = getRecipientName();

    composerState.applyTemplate({
      subject: isNonEmptyString(composerState.subject)
        ? composerState.subject
        : fillEmailTemplateVariables(template.subject ?? '', recipientName),
      body: fillEmailTemplateVariables(template.bodyHtml ?? '', recipientName),
    });
  };

  const options = templates
    .filter((template) => isNonEmptyString(template.bodyHtml))
    .map((template) => ({
      value: template.id,
      label: template.name ?? t`Untitled template`,
    }));

  if (options.length === 0) {
    return null;
  }

  return (
    <ComposerFieldRow label={t`Template`}>
      <Select
        dropdownId="email-composer-template"
        fullWidth
        variant="transparent"
        withSearchInput
        value={NO_TEMPLATE_VALUE}
        emptyOption={{ value: NO_TEMPLATE_VALUE, label: t`Insert a template` }}
        options={options}
        onChange={handleTemplateChange}
      />
    </ComposerFieldRow>
  );
};

export const EmailTemplatePicker = ({
  composerState,
  contextRecord,
}: EmailTemplatePickerProps) => {
  const { objectMetadataItems } = useObjectMetadataItems();

  const hasEmailTemplateObject = objectMetadataItems.some(
    (objectMetadataItem) =>
      objectMetadataItem.nameSingular === EMAIL_TEMPLATE_OBJECT_NAME_SINGULAR &&
      objectMetadataItem.isActive,
  );

  if (!hasEmailTemplateObject) {
    return null;
  }

  return (
    <EmailTemplatePickerContent
      composerState={composerState}
      contextRecord={contextRecord}
    />
  );
};
