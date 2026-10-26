import { styled } from '@linaria/react';
import { t } from '@lingui/core/macro';
import { type PublicFormDefinition } from 'twenty-shared/utils';
import { themeCssVariables } from 'twenty-ui/theme';

import { FormBuilderActionsEditor } from '@/form-builder/components/FormBuilderActionsEditor';
import { FormBuilderEndingsEditor } from '@/form-builder/components/FormBuilderEndingsEditor';
import { FormBuilderVariablesEditor } from '@/form-builder/components/FormBuilderVariablesEditor';
import { type FormBuilderMappableField } from '@/form-builder/types/FormBuilderMappableField';
import { getFormBuilderConditionSources } from '@/form-builder/utils/getFormBuilderConditionSources';
import { removeInvalidFormConditions } from '@/form-builder/utils/removeInvalidFormConditions';

const StyledContainer = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${themeCssVariables.spacing[6]};
`;

const StyledSection = styled.section`
  display: flex;
  flex-direction: column;
  gap: ${themeCssVariables.spacing[2]};
`;

const StyledTitle = styled.h3`
  color: ${themeCssVariables.font.color.primary};
  font-size: ${themeCssVariables.font.size.md};
  font-weight: ${themeCssVariables.font.weight.semiBold};
  margin: 0;
`;

const StyledDescription = styled.p`
  color: ${themeCssVariables.font.color.tertiary};
  font-size: ${themeCssVariables.font.size.sm};
  margin: 0;
`;

type FormBuilderLogicTabProps = {
  definition: PublicFormDefinition;
  mappableFields: FormBuilderMappableField[];
  onChange: (definition: PublicFormDefinition) => void;
};

export const FormBuilderLogicTab = ({
  definition,
  mappableFields,
  onChange,
}: FormBuilderLogicTabProps) => {
  const sources = getFormBuilderConditionSources(
    definition.fields,
    definition.variables,
  );

  return (
    <StyledContainer>
      <StyledSection>
        <StyledTitle>{t`Calculations`}</StyledTitle>
        <StyledDescription>
          {t`Scores and values computed from the answers. Use them in conditions, endings and emails; they are saved with each submission.`}
        </StyledDescription>
        <FormBuilderVariablesEditor
          definition={definition}
          onChange={(variables) =>
            onChange({
              ...definition,
              variables: variables.length > 0 ? variables : undefined,
              fields: removeInvalidFormConditions(
                definition.fields,
                variables.map((variable) => variable.id),
              ),
            })
          }
        />
      </StyledSection>
      <StyledSection>
        <StyledTitle>{t`Endings`}</StyledTitle>
        <StyledDescription>
          {t`Show a different message, or send visitors to a different page, depending on their answers.`}
        </StyledDescription>
        <FormBuilderEndingsEditor
          endings={definition.endings ?? []}
          sources={sources}
          onChange={(endings) =>
            onChange({
              ...definition,
              endings: endings.length > 0 ? endings : undefined,
            })
          }
        />
      </StyledSection>
      <StyledSection>
        <StyledTitle>{t`After submit`}</StyledTitle>
        <StyledDescription>
          {t`Update the person, create a task, email the team or reply to the person automatically.`}
        </StyledDescription>
        <FormBuilderActionsEditor
          definition={definition}
          mappableFields={mappableFields}
          sources={sources}
          onChange={(actions) =>
            onChange({
              ...definition,
              actions: actions.length > 0 ? actions : undefined,
            })
          }
        />
      </StyledSection>
    </StyledContainer>
  );
};
