import { styled } from '@linaria/react';
import { useLingui } from '@lingui/react/macro';
import { useState } from 'react';
import { Button } from 'twenty-ui/primitives/input';
import { themeCssVariables } from 'twenty-ui/theme';
import { useDebounce } from 'use-debounce';

import { useAgreementPeopleSearch } from '@/agreements/hooks/useAgreementData';
import { type AgreementPerson } from '@/agreements/types/Agreement';
import { getAgreementPersonLabel } from '@/agreements/utils/getAgreementPersonLabel';
import { SettingsTextInput } from '@/ui/input/components/SettingsTextInput';

const StyledPicker = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${themeCssVariables.spacing[2]};
`;

const StyledResults = styled.div`
  border: 1px solid ${themeCssVariables.border.color.medium};
  border-radius: ${themeCssVariables.border.radius.sm};
  display: flex;
  flex-direction: column;
`;

const StyledResult = styled.button`
  background: none;
  border: none;
  color: ${themeCssVariables.font.color.primary};
  cursor: pointer;
  display: flex;
  font-family: inherit;
  font-size: ${themeCssVariables.font.size.md};
  gap: ${themeCssVariables.spacing[2]};
  justify-content: space-between;
  padding: ${themeCssVariables.spacing[2]} ${themeCssVariables.spacing[3]};
  text-align: left;

  &:hover {
    background: ${themeCssVariables.background.transparent.light};
  }
`;

const StyledSecondary = styled.span`
  color: ${themeCssVariables.font.color.tertiary};
`;

const StyledSelected = styled.div`
  align-items: center;
  display: flex;
  gap: ${themeCssVariables.spacing[2]};
  justify-content: space-between;
`;

type AgreementPersonPickerProps = {
  person: AgreementPerson | null;
  onChange: (person: AgreementPerson | null) => void;
};

export const AgreementPersonPicker = ({
  person,
  onChange,
}: AgreementPersonPickerProps) => {
  const { t } = useLingui();
  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedSearchTerm] = useDebounce(searchTerm, 300);
  const { people, loading } = useAgreementPeopleSearch(debouncedSearchTerm);

  if (person !== null) {
    return (
      <StyledSelected>
        <span>
          {getAgreementPersonLabel(person)}{' '}
          <StyledSecondary>
            {person.emails?.primaryEmail ?? t`no email`}
          </StyledSecondary>
        </span>
        <Button size="sm" variant="ghost" onClick={() => onChange(null)}>
          {t`Change`}
        </Button>
      </StyledSelected>
    );
  }

  return (
    <StyledPicker>
      <SettingsTextInput
        instanceId="agreement-person-search"
        label={t`Person`}
        placeholder={t`Search by name or email`}
        value={searchTerm}
        onChange={setSearchTerm}
        fullWidth
      />
      {people.length > 0 && (
        <StyledResults>
          {people.map((candidate) => (
            <StyledResult
              key={candidate.id}
              type="button"
              onClick={() => {
                setSearchTerm('');
                onChange(candidate);
              }}
            >
              <span>{getAgreementPersonLabel(candidate)}</span>
              <StyledSecondary>
                {candidate.emails?.primaryEmail ?? ''}
              </StyledSecondary>
            </StyledResult>
          ))}
        </StyledResults>
      )}
      {!loading &&
        debouncedSearchTerm.trim().length >= 2 &&
        people.length === 0 && (
          <StyledSecondary>{t`No one found.`}</StyledSecondary>
        )}
    </StyledPicker>
  );
};
