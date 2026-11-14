import { styled } from '@linaria/react';
import { t } from '@lingui/core/macro';
import { isNonEmptyString } from '@sniptt/guards';
import { CoreObjectNameSingular } from 'twenty-shared/types';
import { isDefined } from 'twenty-shared/utils';
import { Avatar } from 'twenty-ui/primitives/data-display';
import { Button } from 'twenty-ui/primitives/input';
import { themeCssVariables } from 'twenty-ui/theme';

import { useObjectMetadataItem } from '@/object-metadata/hooks/useObjectMetadataItem';
import { useFindOneRecord } from '@/object-record/hooks/useFindOneRecord';
import { type ObjectRecord } from '@/object-record/types/ObjectRecord';
import { useOpenRecordInSidePanel } from '@/side-panel/hooks/useOpenRecordInSidePanel';
import { TeamInboxContactAttachments } from '@/team-inbox/components/TeamInboxContactAttachments';
import { TEAM_INBOX_CONTACT_FIELD_NAMES } from '@/team-inbox/constants/TeamInboxContactFieldNames';
import { formatContactFieldValue } from '@/team-inbox/utils/formatContactFieldValue';
import { getAbsoluteImageUrl } from '~/utils/image/getAbsoluteImageUrl';

const StyledContainer = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${themeCssVariables.spacing[4]};
  padding: ${themeCssVariables.spacing[4]};
`;

const StyledHeader = styled.div`
  align-items: center;
  display: flex;
  gap: ${themeCssVariables.spacing[2]};
`;

const StyledName = styled.span`
  font-size: ${themeCssVariables.font.size.lg};
  font-weight: ${themeCssVariables.font.weight.semiBold};
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`;

const StyledFields = styled.dl`
  display: flex;
  flex-direction: column;
  gap: ${themeCssVariables.spacing[3]};
  margin: 0;
`;

const StyledLabel = styled.dt`
  color: ${themeCssVariables.font.color.tertiary};
  font-size: ${themeCssVariables.font.size.sm};
`;

const StyledValue = styled.dd`
  color: ${themeCssVariables.font.color.primary};
  margin: 0;
  overflow-wrap: anywhere;
`;

const StyledEmpty = styled.p`
  color: ${themeCssVariables.font.color.tertiary};
  margin: 0;
`;

type PersonRecord = ObjectRecord & {
  name?: { firstName?: string; lastName?: string } | null;
  avatarUrl?: string | null;
};

type TeamInboxContactPaneProps = {
  personId: string | null;
  fallbackName: string;
};

export const TeamInboxContactPane = ({
  personId,
  fallbackName,
}: TeamInboxContactPaneProps) => {
  const { openRecordInSidePanel } = useOpenRecordInSidePanel();
  const { objectMetadataItem } = useObjectMetadataItem({
    objectNameSingular: CoreObjectNameSingular.Person,
  });

  const contactFields = TEAM_INBOX_CONTACT_FIELD_NAMES.map((fieldName) =>
    objectMetadataItem.fields.find(
      (field) => field.name === fieldName && field.isActive === true,
    ),
  ).filter(isDefined);

  const { record: person } = useFindOneRecord<PersonRecord>({
    objectNameSingular: CoreObjectNameSingular.Person,
    objectRecordId: personId ?? undefined,
    recordGqlFields: {
      id: true,
      name: true,
      avatarUrl: true,
      ...Object.fromEntries(contactFields.map((field) => [field.name, true])),
    },
    skip: !isDefined(personId),
  });

  if (!isDefined(personId) || !isDefined(person)) {
    return (
      <StyledContainer>
        <StyledName>{fallbackName}</StyledName>
        <StyledEmpty>{t`This sender is not a person in the CRM.`}</StyledEmpty>
      </StyledContainer>
    );
  }

  const name =
    [person.name?.firstName, person.name?.lastName]
      .filter(isNonEmptyString)
      .join(' ') || fallbackName;

  const filledFields = contactFields
    .map((field) => ({
      field,
      value: formatContactFieldValue(field, person[field.name]),
    }))
    .filter(({ value }) => isNonEmptyString(value));

  return (
    <StyledContainer>
      <StyledHeader>
        <Avatar
          src={getAbsoluteImageUrl(person.avatarUrl)}
          name={name}
          colorSeed={person.id}
          shape="circle"
          size="lg"
        />
        <StyledName>{name}</StyledName>
      </StyledHeader>
      <Button
        variant="outline"
        size="sm"
        onClick={() =>
          openRecordInSidePanel({
            recordId: person.id,
            objectNameSingular: CoreObjectNameSingular.Person,
          })
        }
      >{t`Open record`}</Button>
      <StyledFields>
        {filledFields.map(({ field, value }) => (
          <div key={field.id}>
            <StyledLabel>{field.label}</StyledLabel>
            <StyledValue dir="auto">{value}</StyledValue>
          </div>
        ))}
      </StyledFields>
      <TeamInboxContactAttachments personId={person.id} />
    </StyledContainer>
  );
};
