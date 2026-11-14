import { styled } from '@linaria/react';
import { t } from '@lingui/core/macro';
import { isNonEmptyString } from '@sniptt/guards';
import { CoreObjectNameSingular } from 'twenty-shared/types';
import { getSafeUrl, isDefined } from 'twenty-shared/utils';

import { useAttachments } from '@/activities/files/hooks/useAttachments';
import { useHasPermissionFlag } from '@/settings/roles/hooks/useHasPermissionFlag';
import { PermissionFlagType } from '~/generated-metadata/graphql';
import { formatToHumanReadableDate } from '~/utils/date-utils';
import { openUrlInNewTab } from '~/utils/openUrlInNewTab';

const StyledList = styled.div`
  display: flex;
  flex-direction: column;
  gap: 8px;
`;

const StyledCard = styled.button`
  align-items: center;
  background: var(--fl-surface-sunken);
  border: none;
  border-radius: 12px;
  color: var(--fl-ink);
  cursor: pointer;
  display: flex;
  font-family: inherit;
  gap: 12px;
  padding: 12px;
  text-align: start;
  width: 100%;

  &:disabled {
    cursor: default;
  }
`;

const StyledExtension = styled.span<{ isPdf: boolean }>`
  align-items: center;
  background: ${({ isPdf }) =>
    isPdf ? 'var(--fl-pdf-soft)' : 'var(--fl-chip-strong)'};
  border-radius: 8px;
  color: ${({ isPdf }) => (isPdf ? 'var(--fl-pdf-ink)' : 'var(--fl-ink-soft)')};
  display: flex;
  flex-shrink: 0;
  font-size: 11px;
  font-weight: 800;
  height: 36px;
  justify-content: center;
  text-transform: uppercase;
  width: 36px;
`;

const StyledText = styled.span`
  display: flex;
  flex: 1;
  flex-direction: column;
  min-width: 0;
`;

const StyledName = styled.span`
  font-size: 13px;
  font-weight: 600;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`;

const StyledMeta = styled.span`
  color: var(--fl-faint);
  font-size: 12px;
`;

type TeamInboxContactAttachmentsProps = {
  personId: string;
};

export const TeamInboxContactAttachments = ({
  personId,
}: TeamInboxContactAttachmentsProps) => {
  const hasDownloadPermission = useHasPermissionFlag(
    PermissionFlagType.DOWNLOAD_FILE,
  );
  const { attachments } = useAttachments({
    id: personId,
    targetObjectNameSingular: CoreObjectNameSingular.Person,
  });

  const files = attachments
    .map((attachment) => ({ attachment, file: attachment.file?.[0] }))
    .filter(({ file }) => isDefined(file) && file.isDeleted !== true);

  if (files.length === 0) {
    return null;
  }

  return (
    <StyledList>
      {files.map(({ attachment, file }) => {
        const safeUrl = getSafeUrl(file?.url ?? '');
        const extension = (file?.extension ?? '').replace('.', '');
        const label = isNonEmptyString(file?.label)
          ? file.label
          : attachment.name;

        return (
          <StyledCard
            key={attachment.id}
            type="button"
            disabled={!hasDownloadPermission || !isDefined(safeUrl)}
            onClick={() => {
              if (isDefined(safeUrl)) {
                openUrlInNewTab(safeUrl);
              }
            }}
          >
            <StyledExtension isPdf={extension.toLowerCase() === 'pdf'}>
              {extension.slice(0, 4) || t`File`}
            </StyledExtension>
            <StyledText>
              <StyledName dir="auto">{label}</StyledName>
              <StyledMeta>
                {t`Uploaded ${formatToHumanReadableDate(attachment.createdAt)}`}
              </StyledMeta>
            </StyledText>
          </StyledCard>
        );
      })}
    </StyledList>
  );
};
