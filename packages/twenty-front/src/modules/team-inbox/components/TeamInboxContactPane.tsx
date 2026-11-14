import { styled } from '@linaria/react';
import { t } from '@lingui/core/macro';
import { isNonEmptyString } from '@sniptt/guards';
import { CoreObjectNameSingular } from 'twenty-shared/types';
import { isDefined } from 'twenty-shared/utils';
import { useToast } from 'twenty-ui/components/feedback';
import { IconClock, IconMail, IconPhone } from 'twenty-ui/icon';

import { useObjectMetadataItem } from '@/object-metadata/hooks/useObjectMetadataItem';
import { useFindOneRecord } from '@/object-record/hooks/useFindOneRecord';
import { useUpdateOneRecord } from '@/object-record/hooks/useUpdateOneRecord';
import { type ObjectRecord } from '@/object-record/types/ObjectRecord';
import { useOpenRecordInSidePanel } from '@/side-panel/hooks/useOpenRecordInSidePanel';
import { TeamInboxAvatar } from '@/team-inbox/components/TeamInboxAvatar';
import { TeamInboxContactAttachments } from '@/team-inbox/components/TeamInboxContactAttachments';
import { TeamInboxMenu } from '@/team-inbox/components/TeamInboxMenu';
import { TeamInboxStageChip } from '@/team-inbox/components/TeamInboxStageChip';
import { TEAM_INBOX_CONTACT_FIELD_NAMES } from '@/team-inbox/constants/TeamInboxContactFieldNames';
import { TEAM_INBOX_POSITION_FIELD_NAME } from '@/team-inbox/constants/TeamInboxPositionFieldName';
import { TEAM_INBOX_STAGE_FIELD_NAME } from '@/team-inbox/constants/TeamInboxStageFieldName';
import { useInboxContactForms } from '@/team-inbox/hooks/useInboxContactForms';
import { formatContactFieldValue } from '@/team-inbox/utils/formatContactFieldValue';
import { formatToHumanReadableDate } from '~/utils/date-utils';
import { getAbsoluteImageUrl } from '~/utils/image/getAbsoluteImageUrl';

// Shown in the rows at the top; the rest go under Details.
const SUMMARY_FIELD_NAMES = [
  TEAM_INBOX_STAGE_FIELD_NAME,
  TEAM_INBOX_POSITION_FIELD_NAME,
  'emails',
  'phones',
  'country',
  'applicantSource',
];

const StyledContainer = styled.div`
  color: var(--fl-ink);
  display: flex;
  flex-direction: column;
  font-size: 13px;
  gap: 18px;
  padding: 24px 20px;
`;

const StyledIdentity = styled.div`
  align-items: center;
  display: flex;
  gap: 12px;
`;

const StyledIdentityText = styled.div`
  min-width: 0;
`;

const StyledName = styled.div`
  font-family: var(--fl-font-display);
  font-size: 17px;
  font-weight: 700;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`;

const StyledMuted = styled.div`
  color: var(--fl-muted);
  font-size: 13px;
`;

const StyledStageRow = styled.div`
  align-items: center;
  color: var(--fl-muted);
  display: flex;
  font-size: 12px;
  justify-content: space-between;
`;

const StyledActions = styled.div`
  display: grid;
  gap: 8px;
  grid-template-columns: repeat(2, minmax(0, 1fr));
`;

const StyledPrimaryButton = styled.button`
  background: var(--fl-ink);
  border: none;
  border-radius: 9px;
  color: var(--fl-surface);
  cursor: pointer;
  font-family: inherit;
  font-size: 13px;
  font-weight: 600;
  padding: 10px 0;
  width: 100%;
`;

const StyledSecondaryButton = styled.button`
  background: var(--fl-chip);
  border: none;
  border-radius: 9px;
  color: var(--fl-ink-soft);
  cursor: pointer;
  font-family: inherit;
  font-size: 13px;
  font-weight: 500;
  padding: 10px 0;
`;

const StyledInfoList = styled.div`
  display: flex;
  flex-direction: column;
  gap: 12px;
`;

const StyledInfoRow = styled.div`
  align-items: center;
  display: flex;
  gap: 10px;
  min-width: 0;
  overflow-wrap: anywhere;

  svg {
    color: var(--fl-fainter);
    flex-shrink: 0;
  }
`;

const StyledSection = styled.div`
  display: flex;
  flex-direction: column;
  gap: 8px;
`;

const StyledSectionTitle = styled.div`
  color: var(--fl-fainter);
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: uppercase;
`;

const StyledFormRow = styled.div`
  display: flex;
  gap: 12px;
  justify-content: space-between;
`;

const StyledFormStatus = styled.span<{ isDone: boolean }>`
  color: ${({ isDone }) =>
    isDone ? 'var(--fl-accent-ink)' : 'var(--fl-warn-ink)'};
  flex-shrink: 0;
  font-weight: 600;
`;

const StyledDetail = styled.div`
  display: flex;
  flex-direction: column;
  gap: 2px;
`;

const StyledDetailLabel = styled.span`
  color: var(--fl-muted);
  font-size: 12px;
`;

const StyledDetailValue = styled.span`
  overflow-wrap: anywhere;
`;

type PersonRecord = ObjectRecord & {
  name?: { firstName?: string; lastName?: string } | null;
  avatarUrl?: string | null;
  createdAt?: string;
};

type TeamInboxContactPaneProps = {
  personId: string | null;
  fallbackName: string;
  fallbackEmail: string;
};

export const TeamInboxContactPane = ({
  personId,
  fallbackName,
  fallbackEmail,
}: TeamInboxContactPaneProps) => {
  const { openRecordInSidePanel } = useOpenRecordInSidePanel();
  const { updateOneRecord } = useUpdateOneRecord();
  const { enqueueToast } = useToast();
  const forms = useInboxContactForms(personId);
  const { objectMetadataItem } = useObjectMetadataItem({
    objectNameSingular: CoreObjectNameSingular.Person,
  });

  const activeField = (fieldName: string) =>
    objectMetadataItem.fields.find(
      (field) => field.name === fieldName && field.isActive === true,
    );

  const summaryFields = SUMMARY_FIELD_NAMES.map(activeField).filter(isDefined);
  const detailFields = TEAM_INBOX_CONTACT_FIELD_NAMES.filter(
    (fieldName) => !SUMMARY_FIELD_NAMES.includes(fieldName),
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
      createdAt: true,
      ...Object.fromEntries(
        [...summaryFields, ...detailFields].map((field) => [field.name, true]),
      ),
    },
    skip: !isDefined(personId),
  });

  if (!isDefined(personId) || !isDefined(person)) {
    return (
      <StyledContainer>
        <StyledIdentity>
          <TeamInboxAvatar name={fallbackName} size={52} />
          <StyledIdentityText>
            <StyledName dir="auto">{fallbackName}</StyledName>
            <StyledMuted>{t`Not a person in the CRM yet.`}</StyledMuted>
          </StyledIdentityText>
        </StyledIdentity>
        {isNonEmptyString(fallbackEmail) && (
          <StyledInfoRow>
            <IconMail size={16} />
            {fallbackEmail}
          </StyledInfoRow>
        )}
      </StyledContainer>
    );
  }

  const readField = (fieldName: string) => {
    const field = activeField(fieldName);

    return isDefined(field)
      ? formatContactFieldValue(field, person[field.name])
      : '';
  };

  const name =
    [person.name?.firstName, person.name?.lastName]
      .filter(isNonEmptyString)
      .join(' ') || fallbackName;
  const position = readField(TEAM_INBOX_POSITION_FIELD_NAME).split(', ')[0];
  const email = readField('emails').split(', ')[0] || fallbackEmail;
  const phone = readField('phones').split(', ')[0];
  const source = readField('applicantSource');

  const stageField = activeField(TEAM_INBOX_STAGE_FIELD_NAME);
  const stageOptions = [...(stageField?.options ?? [])].sort(
    (first, second) => first.position - second.position,
  );
  const currentStage = isDefined(stageField)
    ? person[stageField.name]
    : undefined;
  const currentStageOption = stageOptions.find(
    (option) => option.value === currentStage,
  );

  const handleStageChange = async (stage: string) => {
    if (!isDefined(stageField) || stage === currentStage) {
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

  const openProfile = () =>
    openRecordInSidePanel({
      recordId: person.id,
      objectNameSingular: CoreObjectNameSingular.Person,
    });

  const addedOn = isNonEmptyString(person.createdAt)
    ? formatToHumanReadableDate(person.createdAt)
    : '';

  const filledDetails = detailFields
    .map((field) => ({
      field,
      value: formatContactFieldValue(field, person[field.name]),
    }))
    .filter(({ value }) => isNonEmptyString(value));

  return (
    <StyledContainer>
      <StyledIdentity>
        <TeamInboxAvatar
          name={name}
          colorSeed={person.id}
          size={52}
          imageUrl={getAbsoluteImageUrl(person.avatarUrl)}
        />
        <StyledIdentityText>
          <StyledName dir="auto">{name}</StyledName>
          <StyledMuted dir="auto">
            {[position, readField('country')]
              .filter(isNonEmptyString)
              .join(' · ')}
          </StyledMuted>
        </StyledIdentityText>
      </StyledIdentity>

      {isDefined(stageField) && stageOptions.length > 0 && (
        <StyledStageRow>
          <span>{stageField.label}</span>
          {isDefined(currentStageOption) ? (
            <TeamInboxStageChip color={currentStageOption.color}>
              {currentStageOption.label}
            </TeamInboxStageChip>
          ) : (
            <span>{t`Not set`}</span>
          )}
        </StyledStageRow>
      )}

      <StyledActions>
        {isDefined(stageField) && stageOptions.length > 0 ? (
          <TeamInboxMenu
            dropdownId={`team-inbox-move-stage-${person.id}`}
            isSearchable
            searchPlaceholder={t`Search stages`}
            selectedValue={
              isDefined(currentStage) ? String(currentStage) : null
            }
            items={stageOptions.map((option) => ({
              value: option.value,
              label: option.label,
            }))}
            onSelect={(stage) => void handleStageChange(stage)}
            trigger={
              <StyledPrimaryButton type="button">
                {t`Move stage`}
              </StyledPrimaryButton>
            }
          />
        ) : (
          <span />
        )}
        <StyledSecondaryButton type="button" onClick={openProfile}>
          {t`Open profile`}
        </StyledSecondaryButton>
      </StyledActions>

      <StyledInfoList>
        {isNonEmptyString(email) && (
          <StyledInfoRow>
            <IconMail size={16} />
            {email}
          </StyledInfoRow>
        )}
        {isNonEmptyString(phone) && (
          <StyledInfoRow>
            <IconPhone size={16} />
            {phone}
          </StyledInfoRow>
        )}
        {isNonEmptyString(addedOn) && (
          <StyledInfoRow>
            <IconClock size={16} />
            {isNonEmptyString(source)
              ? t`Added ${addedOn} · via ${source}`
              : t`Added ${addedOn}`}
          </StyledInfoRow>
        )}
      </StyledInfoList>

      <TeamInboxContactAttachments personId={person.id} />

      {forms.length > 0 && (
        <StyledSection>
          <StyledSectionTitle>{t`Forms`}</StyledSectionTitle>
          {forms.map((form) => (
            <StyledFormRow
              key={form.name}
              title={
                isNonEmptyString(form.submittedAt)
                  ? formatToHumanReadableDate(form.submittedAt)
                  : undefined
              }
            >
              <span dir="auto">{form.name}</span>
              <StyledFormStatus isDone={isNonEmptyString(form.submittedAt)}>
                {isNonEmptyString(form.submittedAt) ? t`Done` : t`Waiting`}
              </StyledFormStatus>
            </StyledFormRow>
          ))}
        </StyledSection>
      )}

      {filledDetails.length > 0 && (
        <StyledSection>
          <StyledSectionTitle>{t`Details`}</StyledSectionTitle>
          {filledDetails.map(({ field, value }) => (
            <StyledDetail key={field.id}>
              <StyledDetailLabel>{field.label}</StyledDetailLabel>
              <StyledDetailValue dir="auto">{value}</StyledDetailValue>
            </StyledDetail>
          ))}
        </StyledSection>
      )}
    </StyledContainer>
  );
};
