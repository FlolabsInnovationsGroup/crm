import { CoreObjectNameSingular } from 'twenty-shared/types';
import { isDefined } from 'twenty-shared/utils';
import { type ThemeColor } from 'twenty-ui/theme';

import { useObjectMetadataItem } from '@/object-metadata/hooks/useObjectMetadataItem';
import { useFindManyRecords } from '@/object-record/hooks/useFindManyRecords';
import { type ObjectRecord } from '@/object-record/types/ObjectRecord';
import { TEAM_INBOX_POSITION_FIELD_NAME } from '@/team-inbox/constants/TeamInboxPositionFieldName';
import { TEAM_INBOX_STAGE_FIELD_NAME } from '@/team-inbox/constants/TeamInboxStageFieldName';
import { formatContactFieldValue } from '@/team-inbox/utils/formatContactFieldValue';

export type InboxContactSummary = {
  stageLabel: string;
  stageColor: ThemeColor;
  position: string;
};

// One query per page of threads, so each row can show where the applicant
// stands without opening the conversation.
export const useInboxContactPeople = (personIds: string[]) => {
  const { objectMetadataItem } = useObjectMetadataItem({
    objectNameSingular: CoreObjectNameSingular.Person,
  });

  const stageField = objectMetadataItem.fields.find(
    (field) => field.name === TEAM_INBOX_STAGE_FIELD_NAME && field.isActive,
  );
  const positionField = objectMetadataItem.fields.find(
    (field) => field.name === TEAM_INBOX_POSITION_FIELD_NAME && field.isActive,
  );
  const sortedPersonIds = [...new Set(personIds)].sort();

  const { records } = useFindManyRecords<ObjectRecord>({
    objectNameSingular: CoreObjectNameSingular.Person,
    filter: { id: { in: sortedPersonIds } },
    limit: sortedPersonIds.length,
    recordGqlFields: {
      id: true,
      ...(isDefined(stageField) ? { [stageField.name]: true } : {}),
      ...(isDefined(positionField) ? { [positionField.name]: true } : {}),
    },
    skip:
      sortedPersonIds.length === 0 ||
      (!isDefined(stageField) && !isDefined(positionField)),
  });

  return new Map<string, InboxContactSummary>(
    records.map((person) => {
      const stageValue = isDefined(stageField)
        ? person[stageField.name]
        : undefined;
      const stageOption = stageField?.options?.find(
        (option) => option.value === stageValue,
      );
      const positions = isDefined(positionField)
        ? formatContactFieldValue(positionField, person[positionField.name])
        : '';

      return [
        person.id,
        {
          stageLabel: stageOption?.label ?? '',
          stageColor: stageOption?.color ?? 'gray',
          position: positions.split(', ')[0] ?? '',
        },
      ];
    }),
  );
};
