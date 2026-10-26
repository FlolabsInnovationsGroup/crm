import { styled } from '@linaria/react';
import { t } from '@lingui/core/macro';
import { IconCopy, IconExternalLink } from 'twenty-ui/icon';
import { Button } from 'twenty-ui/primitives/input';
import { themeCssVariables } from 'twenty-ui/theme';

import { type FormShareLinks } from '@/form-builder/utils/buildFormShareLinks';
import { useCopyToClipboard } from '~/hooks/useCopyToClipboard';

const StyledContainer = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${themeCssVariables.spacing[5]};
`;

const StyledNotice = styled.div`
  background: ${themeCssVariables.background.transparent.orange};
  border-radius: ${themeCssVariables.border.radius.sm};
  color: ${themeCssVariables.font.color.secondary};
  font-size: ${themeCssVariables.font.size.sm};
  padding: ${themeCssVariables.spacing[3]};
`;

const StyledBlock = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${themeCssVariables.spacing[2]};
`;

const StyledBlockHeader = styled.div`
  align-items: center;
  display: flex;
  gap: ${themeCssVariables.spacing[2]};
  justify-content: space-between;
`;

const StyledBlockTitle = styled.h4`
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

const StyledCode = styled.pre`
  background: ${themeCssVariables.background.secondary};
  border: 1px solid ${themeCssVariables.border.color.light};
  border-radius: ${themeCssVariables.border.radius.sm};
  color: ${themeCssVariables.font.color.secondary};
  direction: ltr;
  font-size: ${themeCssVariables.font.size.xs};
  margin: 0;
  overflow-x: auto;
  padding: ${themeCssVariables.spacing[3]};
  white-space: pre-wrap;
  word-break: break-all;
`;

const StyledActions = styled.div`
  display: flex;
  gap: ${themeCssVariables.spacing[1]};
`;

type FormBuilderShareTabProps = {
  isPublished: boolean;
  hasUnsavedChanges: boolean;
  links: FormShareLinks;
};

export const FormBuilderShareTab = ({
  isPublished,
  hasUnsavedChanges,
  links,
}: FormBuilderShareTabProps) => {
  const { copyToClipboard } = useCopyToClipboard();

  const blocks = [
    {
      title: t`Direct link`,
      description: t`Share it anywhere, or use it as a button link on your site.`,
      code: links.pageUrl,
      canOpen: true,
    },
    {
      title: t`Embed on a website (recommended)`,
      description: t`Paste where the form should appear. It resizes itself and passes UTM parameters from the page URL.`,
      code: links.embedScript,
      canOpen: false,
    },
    {
      title: t`Embed with an iframe`,
      description: t`For site builders that only accept iframes. Set the height yourself.`,
      code: links.iframe,
      canOpen: false,
    },
  ];

  return (
    <StyledContainer>
      {!isPublished && (
        <StyledNotice>
          {t`This form is a draft. Links show "Form not available" until you publish it.`}
        </StyledNotice>
      )}
      {isPublished && hasUnsavedChanges && (
        <StyledNotice>
          {t`You have unsaved changes. Visitors see the last saved version.`}
        </StyledNotice>
      )}
      {blocks.map((block) => (
        <StyledBlock key={block.title}>
          <StyledBlockHeader>
            <StyledBlockTitle>{block.title}</StyledBlockTitle>
            <StyledActions>
              {block.canOpen && (
                <Button
                  variant="ghost"
                  size="sm"
                  startIcon={<IconExternalLink size={14} />}
                  href={links.pageUrl}
                  target="_blank"
                  rel="noreferrer"
                >
                  {t`Open`}
                </Button>
              )}
              <Button
                variant="outline"
                size="sm"
                startIcon={<IconCopy size={14} />}
                onClick={() => copyToClipboard(block.code)}
              >
                {t`Copy`}
              </Button>
            </StyledActions>
          </StyledBlockHeader>
          <StyledDescription>{block.description}</StyledDescription>
          <StyledCode>{block.code}</StyledCode>
        </StyledBlock>
      ))}
    </StyledContainer>
  );
};
