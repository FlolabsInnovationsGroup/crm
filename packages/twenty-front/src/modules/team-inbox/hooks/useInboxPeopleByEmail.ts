import { isNonEmptyString } from '@sniptt/guards';
import { CoreObjectNameSingular } from 'twenty-shared/types';
import { isDefined } from 'twenty-shared/utils';
import { type ThemeColor } from 'twenty-ui/theme';

import { useObjectMetadataItem } from '@/object-metadata/hooks/useObjectMetadataItem';
import { useFindManyRecords } from '@/object-record/hooks/useFindManyRecords';
import { type ObjectRecord } from '@/object-record/types/ObjectRecord';
import { TEAM_INBOX_POSITION_FIELD_NAME } from '@/team-inbox/constants/TeamInboxPositionFieldName';
import { TEAM_INBOX_STAGE_FIELD_NAME } from '@/team-inbox/constants/TeamInboxStageFieldName';
import { formatContactFieldValue } from '@/team-inbox/utils/formatContactFieldValue';

export type InboxPersonByEmail = {
  personId: string;
  name: string;
  stageLabel: string;
  stageColor: ThemeColor;
  position: string;
};

type PersonRecord = ObjectRecord & {
  name?: { firstName?: string; lastName?: string } | null;
  emails?: { primaryEmail?: string | null } | null;
};

// The review cards only know the applicant's email from the triage subject.
export const useInboxPeopleByEmail = (emails: string[]) => {
  const { objectMetadataItem } = useObjectMetadataItem({
    objectNameSingular: CoreObjectNameSingular.Person,
  });

  const stageField = objectMetadataItem.fields.find(
    (field) => field.name === TEAM_INBOX_STAGE_FIELD_NAME && field.isActive,
  );
  const positionField = objectMetadataItem.fields.find(
    (field) => field.name === TEAM_INBOX_POSITION_FIELD_NAME && field.isActive,
  );
  const sortedEmails = [
    ...new Set(emails.map((email) => email.toLowerCase())),
  ].sort();

  const { records } = useFindManyRecords<PersonRecord>({
    objectNameSingular: CoreObjectNameSingular.Person,
    filter: {
      or: sortedEmails.map((email) => ({
        emails: { primaryEmail: { ilike: email } },
      })),
    },
    limit: sortedEmails.length * 2,
    recordGqlFields: {
      id: true,
      name: true,
      emails: true,
      ...(isDefined(stageField) ? { [stageField.name]: true } : {}),
      ...(isDefined(positionField) ? { [positionField.name]: true } : {}),
    },
    skip: sortedEmails.length === 0,
  });

  return new Map<string, InboxPersonByEmail>(
    records
      .filter((person) => isNonEmptyString(person.emails?.primaryEmail))
      .map((person) => {
        const stageOption = stageField?.options?.find(
          (option) => option.value === person[stageField.name],
        );
        const positions = isDefined(positionField)
          ? formatContactFieldValue(positionField, person[positionField.name])
          : '';

        return [
          (person.emails?.primaryEmail ?? '').toLowerCase(),
          {
            personId: person.id,
            name: [person.name?.firstName, person.name?.lastName]
              .filter(isNonEmptyString)
              .join(' '),
            stageLabel: stageOption?.label ?? '',
            stageColor: stageOption?.color ?? 'gray',
            position: positions.split(', ')[0] ?? '',
          },
        ];
      }),
  );
};
