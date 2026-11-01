import { useMutation, useQuery } from '@apollo/client/react';
import { useLingui } from '@lingui/react/macro';
import { CoreObjectNameSingular } from 'twenty-shared/types';
import { useToast } from 'twenty-ui/components/feedback';
import { Section } from 'twenty-ui/components/layout';
import { IconAt } from 'twenty-ui/icon';
import { Card } from 'twenty-ui/primitives/surfaces';

import { GET_MY_SENDER_CONNECTED_ACCOUNTS } from '@/accounts/graphql/queries/getMySenderConnectedAccounts';
import { useFindManyRecords } from '@/object-record/hooks/useFindManyRecords';
import { SettingsOptionCardContentSwitch } from '@/settings/components/SettingsOptions/SettingsOptionCardContentSwitch';
import {
  GET_TEAM_MAILBOXES,
  SET_TEAM_MAILBOX_MEMBERS,
} from '@/settings/team-mailboxes/graphql/teamMailboxes';
import { type WorkspaceMember } from '@/workspace-member/types/WorkspaceMember';

type TeamMailbox = {
  id: string;
  handle: string;
  provider: string;
  ownerUserId: string | null;
  sharedWithWorkspaceMemberIds: string[];
};

export const SettingsTeamMailboxesSection = () => {
  const { t } = useLingui();
  const { enqueueToast } = useToast();

  const { data, loading } = useQuery<{ teamMailboxes: TeamMailbox[] }>(
    GET_TEAM_MAILBOXES,
  );

  const { records: workspaceMembers } = useFindManyRecords<WorkspaceMember>({
    objectNameSingular: CoreObjectNameSingular.WorkspaceMember,
    orderBy: [{ name: { firstName: 'AscNullsLast' } }],
    limit: 200,
  });

  const [setTeamMailboxMembers] = useMutation(SET_TEAM_MAILBOX_MEMBERS, {
    refetchQueries: [{ query: GET_MY_SENDER_CONNECTED_ACCOUNTS }],
  });

  const handleToggle = async (
    mailbox: TeamMailbox,
    workspaceMemberId: string,
    isAllowed: boolean,
  ) => {
    const workspaceMemberIds = isAllowed
      ? [...mailbox.sharedWithWorkspaceMemberIds, workspaceMemberId]
      : mailbox.sharedWithWorkspaceMemberIds.filter(
          (id) => id !== workspaceMemberId,
        );

    try {
      await setTeamMailboxMembers({
        variables: { connectedAccountId: mailbox.id, workspaceMemberIds },
      });
    } catch {
      enqueueToast({
        status: 'error',
        children: t`Could not update who can send`,
      });
    }
  };

  const teamMailboxes = data?.teamMailboxes ?? [];

  if (loading && teamMailboxes.length === 0) {
    return null;
  }

  if (teamMailboxes.length === 0) {
    return (
      <Section.Root>
        <Section.Header
          title={t`Mailboxes`}
          description={t`No mailbox that can send email is connected yet.`}
        />
      </Section.Root>
    );
  }

  return (
    <>
      {teamMailboxes.map((mailbox) => (
        <Section.Root key={mailbox.id}>
          <Section.Header
            title={mailbox.handle}
            description={t`Choose who can send emails from this mailbox. Its owner always can.`}
          />
          <Card.Root rounded>
            {workspaceMembers.map((workspaceMember, index) => {
              const isOwner = workspaceMember.userId === mailbox.ownerUserId;
              const fullName =
                `${workspaceMember.name.firstName} ${workspaceMember.name.lastName}`.trim();

              return (
                <SettingsOptionCardContentSwitch
                  key={workspaceMember.id}
                  Icon={IconAt}
                  title={fullName || workspaceMember.userEmail}
                  description={
                    isOwner
                      ? t`Owner · ${workspaceMember.userEmail}`
                      : workspaceMember.userEmail
                  }
                  divider={index < workspaceMembers.length - 1}
                  disabled={isOwner}
                  checked={
                    isOwner ||
                    mailbox.sharedWithWorkspaceMemberIds.includes(
                      workspaceMember.id,
                    )
                  }
                  onChange={(isAllowed) =>
                    handleToggle(mailbox, workspaceMember.id, isAllowed)
                  }
                />
              );
            })}
          </Card.Root>
        </Section.Root>
      ))}
    </>
  );
};
