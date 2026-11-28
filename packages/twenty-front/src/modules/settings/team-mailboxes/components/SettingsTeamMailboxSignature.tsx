import { useMutation, useQuery } from '@apollo/client/react';
import { styled } from '@linaria/react';
import { useLingui } from '@lingui/react/macro';
import { useState } from 'react';
import { isDefined } from 'twenty-shared/utils';
import { useToast } from 'twenty-ui/components/feedback';
import { themeCssVariables } from 'twenty-ui/theme';

import {
  GET_TEAM_MAILBOX_SIGNATURE,
  SET_TEAM_MAILBOX_SIGNATURE,
} from '@/settings/team-mailboxes/graphql/teamMailboxSignature';
import { TextArea } from '@/ui/input/components/TextArea';

const TEAM_MAILBOX_SIGNATURE_MAX_LENGTH = 2000;

const StyledSignature = styled.div`
  margin-top: ${themeCssVariables.spacing[4]};
`;

type SettingsTeamMailboxSignatureProps = {
  connectedAccountId: string;
};

export const SettingsTeamMailboxSignature = ({
  connectedAccountId,
}: SettingsTeamMailboxSignatureProps) => {
  const { t } = useLingui();
  const { enqueueToast } = useToast();
  const [draft, setDraft] = useState<string | null>(null);

  const variables = { connectedAccountId };
  const { data } = useQuery<{ teamMailboxSignature: string | null }>(
    GET_TEAM_MAILBOX_SIGNATURE,
    { variables },
  );
  const [setTeamMailboxSignature] = useMutation(SET_TEAM_MAILBOX_SIGNATURE, {
    refetchQueries: [{ query: GET_TEAM_MAILBOX_SIGNATURE, variables }],
    awaitRefetchQueries: true,
  });

  const savedSignature = data?.teamMailboxSignature ?? '';

  const handleBlur = async () => {
    if (!isDefined(draft) || draft.trim() === savedSignature) {
      setDraft(null);

      return;
    }

    if (draft.trim().length > TEAM_MAILBOX_SIGNATURE_MAX_LENGTH) {
      enqueueToast({
        status: 'error',
        children: t`A signature can have at most ${TEAM_MAILBOX_SIGNATURE_MAX_LENGTH} characters.`,
      });

      return;
    }

    try {
      await setTeamMailboxSignature({
        variables: { connectedAccountId, signature: draft },
      });
      setDraft(null);
    } catch {
      enqueueToast({
        status: 'error',
        children: t`Could not save the signature`,
      });
    }
  };

  return (
    <StyledSignature>
      <TextArea
        textAreaId={`team-mailbox-signature-${connectedAccountId}`}
        label={t`Signature`}
        placeholder={t`Added under replies sent from this mailbox in the Team inbox`}
        minRows={3}
        maxRows={10}
        value={draft ?? savedSignature}
        onChange={setDraft}
        onBlur={handleBlur}
      />
    </StyledSignature>
  );
};
