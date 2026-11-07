import { type ErrorLike } from '@apollo/client';
import { styled } from '@linaria/react';
import { t } from '@lingui/core/macro';
import { isDefined } from 'twenty-shared/utils';
import { IconRefresh } from 'twenty-ui/icon';
import { Button } from 'twenty-ui/primitives/input';
import { themeCssVariables } from 'twenty-ui/theme';

import { ToastOnQueryErrorEffect } from '@/apollo/components/ToastOnQueryErrorEffect';
import { EmptyState } from '@/ui/feedback/empty-state/components/EmptyState';
import { ErrorState } from '@/ui/feedback/empty-state/components/ErrorState';

const StyledPanel = styled.div`
  align-items: center;
  box-sizing: border-box;
  display: flex;
  justify-content: center;
  min-height: 280px;
  padding: ${themeCssVariables.spacing[8]} ${themeCssVariables.spacing[4]};
  width: 100%;
`;

type AnalyticsStatePanelKind =
  | 'FORBIDDEN'
  | 'DISABLED'
  | 'NO_STAGE_FIELD'
  | 'NEVER_SYNCED'
  | 'EMPTY'
  | 'EMPTY_FUNNEL'
  | 'ERROR'
  | 'PAGE_ERROR';

type AnalyticsStatePanelProps = {
  kind: AnalyticsStatePanelKind;
  error?: ErrorLike;
  onRetry?: () => void;
  onReset?: () => void;
};

const getMessage = (
  kind: Exclude<AnalyticsStatePanelKind, 'ERROR' | 'PAGE_ERROR'>,
) => {
  switch (kind) {
    case 'FORBIDDEN':
      return t`You do not have access to analytics. Ask an admin.`;
    case 'DISABLED':
      return t`Analytics is switched off.`;
    case 'NO_STAGE_FIELD':
      return t`This workspace has no Stage field on People, so there is nothing to measure yet.`;
    case 'NEVER_SYNCED':
      return t`The first sync has not finished.`;
    case 'EMPTY':
      return t`No people match these filters`;
    case 'EMPTY_FUNNEL':
      return t`No one matching these filters has entered the funnel yet`;
  }
};

export const AnalyticsStatePanel = ({
  kind,
  error,
  onRetry,
  onReset,
}: AnalyticsStatePanelProps) => {
  if (kind === 'ERROR' || kind === 'PAGE_ERROR') {
    return (
      <StyledPanel>
        <ToastOnQueryErrorEffect error={error} />
        <ErrorState.Root>
          <ErrorState.Content>
            {kind === 'PAGE_ERROR' ? (
              <ErrorState.Title>{t`Analytics could not load`}</ErrorState.Title>
            ) : (
              <>
                <ErrorState.Title>
                  {t`This view could not load`}
                </ErrorState.Title>
                <ErrorState.Description>
                  {t`The other tabs may still work.`}
                </ErrorState.Description>
              </>
            )}
          </ErrorState.Content>
          {isDefined(onRetry) && (
            <Button
              variant="outline"
              size="sm"
              startIcon={<IconRefresh size={14} />}
              onClick={() => onRetry()}
            >
              {t`Retry`}
            </Button>
          )}
        </ErrorState.Root>
      </StyledPanel>
    );
  }

  return (
    <StyledPanel>
      <EmptyState.Root>
        <EmptyState.Content>
          <EmptyState.Title>{getMessage(kind)}</EmptyState.Title>
          {kind === 'EMPTY_FUNNEL' && (
            <EmptyState.Description>
              {t`Imported people are not in the funnel, so a filter can match them and still leave this empty. The Overview tab shows them.`}
            </EmptyState.Description>
          )}
        </EmptyState.Content>
        {(kind === 'EMPTY' || kind === 'EMPTY_FUNNEL') &&
          isDefined(onReset) && (
            <Button variant="outline" size="sm" onClick={() => onReset()}>
              {t`Reset filters`}
            </Button>
          )}
      </EmptyState.Root>
    </StyledPanel>
  );
};
