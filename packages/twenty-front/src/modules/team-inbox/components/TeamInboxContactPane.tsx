import { styled } from '@linaria/react';
import { t } from '@lingui/core/macro';
import { isNonEmptyString } from '@sniptt/guards';
import { CoreObjectNameSingular } from 'twenty-shared/types';
import { isDefined } from 'twenty-shared/utils';
import { useToast } from 'twenty-ui/components/feedback';
import { Avatar } from 'twenty-ui/primitives/data-display';
import { Button } from 'twenty-ui/primitives/input';
import { themeCssVariables } from 'twenty-ui/theme';

import { FormBuilderNativeSelect } from '@/form-builder/components/FormBuilderNativeSelect';
import { useObjectMetadataItem } from '@/object-metadata/hooks/useObjectMetadataItem';
import { useFindOneRecord } from '@/object-record/hooks/useFindOneRecord';
import { useUpdateOneRecord } from '@/object-record/hooks/useUpdateOneRecord';
import { type ObjectRecord } from '@/object-record/types/ObjectRecord';
import { useOpenRecordInSidePanel } from '@/side-panel/hooks/useOpenRecordInSidePanel';
import { TeamInboxContactAttachments } from '@/team-inbox/components/TeamInboxContactAttachments';
import { TEAM_INBOX_CONTACT_FIELD_NAMES } from '@/team-inbox/constants/TeamInboxContactFieldNames';
import { TEAM_INBOX_POSITION_FIELD_NAME } from '@/team-inbox/constants/TeamInboxPositionFieldName';
import { TEAM_INBOX_STAGE_FIELD_NAME } from '@/team-inbox/constants/TeamInboxStageFieldName';
import { formatContactFieldValue } from '@/team-inbox/utils/formatContactFieldValue';
import { getAbsoluteImageUrl } from '~/utils/image/getAbsoluteImageUrl';

const StyledContainer = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${themeCssVariables.spacing[5]};
  padding: ${themeCssVariables.spacing[6]} ${themeCssVariables.spacing[5]};
`;

const StyledIdentity = styled.div`
  align-items: center;
  display: flex;
  gap: ${themeCssVariables.spacing[3]};
`;

const StyledIdentityText = styled.div`
  display: flex;
  flex-direction: column;
  min-width: 0;
`;

const StyledName = styled.span`
  font-size: ${themeCssVariables.font.size.xl};
  font-weight: ${themeCssVariables.font.weight.semiBold};
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`;

const StyledMuted = styled.span`
  color: ${themeCssVariables.font.color.tertiary};
  font-size: ${themeCssVariables.font.size.sm};
`;

const StyledStage = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${themeCssVariables.spacing[2]};
`;

const StyledStageRow = styled.div`
  align-items: center;
  display: flex;
  justify-content: space-between;
`;

const StyledStageName = styled.span`
  color: ${themeCssVariables.tag.text.turquoise};
  font-size: ${themeCssVariables.font.size.sm};
  font-weight: ${themeCssVariables.font.weight.semiBold};
`;

const StyledProgress = styled.div<{ steps: number }>`
  display: grid;
  gap: 4px;
  grid-template-columns: repeat(${({ steps }) => steps}, minmax(0, 1fr));
`;

const StyledStep = styled.span<{ isReached: boolean }>`
  background: ${({ isReached }) =>
    isReached
      ? themeCssVariables.color.turquoise
      : themeCssVariables.background.tertiary};
  border-radius: 3px;
  height: 6px;
`;

const StyledSectionTitle = styled.span`
  color: ${themeCssVariables.font.color.light};
  font-size: ${themeCssVariables.font.size.xs};
  font-weight: ${themeCssVariables.font.weight.semiBold};
  letter-spacing: 0.04em;
  text-transform: uppercase;
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
  const { updateOneRecord } = useUpdateOneRecord();
  const { enqueueToast } = useToast();
  const { objectMetadataItem } = useObjectMetadataItem({
    objectNameSingular: CoreObjectNameSingular.Person,
  });

  const activeField = (fieldName: string) =>
    objectMetadataItem.fields.find(
      (field) => field.name === fieldName && field.isActive === true,
    );

  const stageField = activeField(TEAM_INBOX_STAGE_FIELD_NAME);
  const positionField = activeField(TEAM_INBOX_POSITION_FIELD_NAME);
  const detailFields = TEAM_INBOX_CONTACT_FIELD_NAMES.filter(
    (fieldName) =>
      fieldName !== TEAM_INBOX_STAGE_FIELD_NAME &&
      fieldName !== TEAM_INBOX_POSITION_FIELD_NAME,
  )
    .map(activeField)
    .filter(isDefined);

  const { record: person } = useFindOneRecord<PersonRecord>({
    objectNameSingular: CoreObjectNameSingular.Person,
    objectRecordId: personId ?? undefined,
    recordGqlFields: {
      id: true,
      name: true,
      avatarUrl: true,
      ...Object.fromEntries(
        [stageField, positionField, ...detailFields]
          .filter(isDefined)
          .map((field) => [field.name, true]),
      ),
    },
    skip: !isDefined(personId),
  });

  if (!isDefined(personId) || !isDefined(person)) {
    return (
      <StyledContainer>
        <StyledIdentity>
          <Avatar
            name={fallbackName}
            colorSeed={fallbackName}
            shape="circle"
            size="xl"
          />
          <StyledIdentityText>
            <StyledName dir="auto">{fallbackName}</StyledName>
            <StyledMuted>{t`Not a person in the CRM yet.`}</StyledMuted>
          </StyledIdentityText>
        </StyledIdentity>
      </StyledContainer>
    );
  }

  const name =
    [person.name?.firstName, person.name?.lastName]
      .filter(isNonEmptyString)
      .join(' ') || fallbackName;

  const position = isDefined(positionField)
    ? formatContactFieldValue(positionField, person[positionField.name])
    : '';
  const countryField = activeField('country');
  const country = isDefined(countryField)
    ? formatContactFieldValue(countryField, person[countryField.name])
    : '';

  const stageOptions = [...(stageField?.options ?? [])].sort(
    (first, second) => first.position - second.position,
  );
  const currentStage = isDefined(stageField)
    ? person[stageField.name]
    : undefined;
  const currentStageIndex = stageOptions.findIndex(
    (option) => option.value === currentStage,
  );

  const handleStageChange = async (stage: string) => {
    if (!isDefined(stageField) || stage === '' || stage === currentStage) {
      return;
    }

    try {
      await updateOneRecord({
        objectNameSingular: CoreObjectNameSingular.Person,
        idToUpdate: person.id,
        updateOneRecordInput: { [stageField.name]: stage },
      });
    } catch {
      enqueueToast({
        status: 'error',
        children: t`Could not move the stage. Please try again.`,
      });
    }
  };

  const filledFields = detailFields
    .map((field) => ({
      field,
      value: formatContactFieldValue(field, person[field.name]),
    }))
    .filter(({ value }) => isNonEmptyString(value));

  return (
    <StyledContainer>
      <StyledIdentity>
        <Avatar
          src={getAbsoluteImageUrl(person.avatarUrl)}
          name={name}
          colorSeed={person.id}
          shape="circle"
          size="xl"
        />
        <StyledIdentityText>
          <StyledName dir="auto">{name}</StyledName>
          <StyledMuted dir="auto">
            {[position.split(', ')[0], country]
              .filter(isNonEmptyString)
              .join(' · ')}
          </StyledMuted>
        </StyledIdentityText>
      </StyledIdentity>

      {isDefined(stageField) && stageOptions.length > 0 && (
        <StyledStage>
          <StyledStageRow>
            <StyledMuted>{stageField.label}</StyledMuted>
            <StyledStageName>
              {stageOptions[currentStageIndex]?.label ?? t`Not set`}
            </StyledStageName>
          </StyledStageRow>
          <StyledProgress steps={stageOptions.length}>
            {stageOptions.map((option, index) => (
              <StyledStep
                key={option.id}
                title={option.label}
                isReached={index <= currentStageIndex}
              />
            ))}
          </StyledProgress>
          <FormBuilderNativeSelect
            value={isDefined(currentStage) ? String(currentStage) : ''}
            ariaLabel={t`Move stage`}
            options={[
              { value: '', label: t`Move stage…` },
              ...stageOptions.map((option) => ({
                value: option.value,
                label: option.label,
              })),
            ]}
            onChange={(stage) => void handleStageChange(stage)}
          />
        </StyledStage>
      )}

      <Button
        variant="soft"
        size="sm"
        onClick={() =>
          openRecordInSidePanel({
            recordId: person.id,
            objectNameSingular: CoreObjectNameSingular.Person,
          })
        }
      >
        {t`Open profile`}
      </Button>

      {filledFields.length > 0 && (
        <StyledFields>
          <StyledSectionTitle>{t`Details`}</StyledSectionTitle>
          {filledFields.map(({ field, value }) => (
            <div key={field.id}>
              <StyledLabel>{field.label}</StyledLabel>
              <StyledValue dir="auto">{value}</StyledValue>
            </div>
          ))}
        </StyledFields>
      )}

      <TeamInboxContactAttachments personId={person.id} />
    </StyledContainer>
  );
};
