import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';

import { EmailOperation } from 'twenty-shared/types';
import {
  canConnectedAccountPerformEmailOperation,
  isDefined,
} from 'twenty-shared/utils';
import { In, IsNull, Repository } from 'typeorm';

import { UserVarsService } from 'src/engine/core-modules/user/user-vars/services/user-vars.service';
import { UserWorkspaceEntity } from 'src/engine/core-modules/user-workspace/user-workspace.entity';
import { ConnectedAccountMetadataService } from 'src/engine/metadata-modules/connected-account/connected-account-metadata.service';
import {
  ConnectedAccountException,
  ConnectedAccountExceptionCode,
} from 'src/engine/metadata-modules/connected-account/connected-account.exception';
import { type SenderConnectedAccountDTO } from 'src/engine/metadata-modules/connected-account/dtos/sender-connected-account.dto';
import { type TeamMailboxDTO } from 'src/engine/metadata-modules/connected-account/dtos/team-mailbox.dto';
import { ConnectedAccountEntity } from 'src/engine/metadata-modules/connected-account/entities/connected-account.entity';
import { buildPublicConnectedAccount } from 'src/engine/metadata-modules/connected-account/utils/build-public-connected-account.util';
import { isConnectedAccountUsableByCaller } from 'src/engine/metadata-modules/connected-account/utils/is-connected-account-usable-by-caller.util';
import {
  getConnectedAccountIdsSharedWith,
  getTeamMailboxMemberIds,
  setTeamMailboxMemberIds,
  type TeamMailboxShares,
} from 'src/engine/metadata-modules/connected-account/utils/team-mailbox-shares.util';
import { MessageChannelEntity } from 'src/engine/metadata-modules/message-channel/entities/message-channel.entity';

const TEAM_MAILBOX_SHARES_KEY = 'TEAM_MAILBOX_SHARES';

type Caller = {
  workspaceId: string;
  userWorkspaceId: string;
  workspaceMemberId: string | undefined;
};

// Sharing only grants sending. Sync, folders and settings of a mailbox stay
// with its owner, so the ownership checks elsewhere are left untouched.
@Injectable()
export class TeamMailboxService {
  constructor(
    @InjectRepository(ConnectedAccountEntity)
    private readonly connectedAccountRepository: Repository<ConnectedAccountEntity>,
    @InjectRepository(MessageChannelEntity)
    private readonly messageChannelRepository: Repository<MessageChannelEntity>,
    @InjectRepository(UserWorkspaceEntity)
    private readonly userWorkspaceRepository: Repository<UserWorkspaceEntity>,
    private readonly connectedAccountMetadataService: ConnectedAccountMetadataService,
    private readonly userVarsService: UserVarsService<{
      [TEAM_MAILBOX_SHARES_KEY]: TeamMailboxShares;
    }>,
  ) {}

  private getShares(workspaceId: string) {
    return this.userVarsService.get({
      workspaceId,
      key: TEAM_MAILBOX_SHARES_KEY,
    });
  }

  private findSendableMailboxes(workspaceId: string, ids?: string[]) {
    return this.connectedAccountRepository
      .find({
        where: {
          workspaceId,
          applicationId: IsNull(),
          archivedAt: IsNull(),
          ...(isDefined(ids) ? { id: In(ids) } : {}),
        },
        order: { createdAt: 'ASC', id: 'ASC' },
      })
      .then((accounts) =>
        accounts.filter((connectedAccount) =>
          canConnectedAccountPerformEmailOperation({
            connectedAccount,
            operation: EmailOperation.SEND,
          }),
        ),
      );
  }

  async findTeamMailboxes(workspaceId: string): Promise<TeamMailboxDTO[]> {
    const [mailboxes, shares] = await Promise.all([
      this.findSendableMailboxes(workspaceId),
      this.getShares(workspaceId),
    ]);

    const owners = await this.userWorkspaceRepository.find({
      where: {
        workspaceId,
        id: In(mailboxes.map((mailbox) => mailbox.userWorkspaceId)),
      },
      select: ['id', 'userId'],
    });

    return mailboxes.map((mailbox) => ({
      id: mailbox.id,
      handle: mailbox.handle,
      provider: mailbox.provider,
      ownerUserId:
        owners.find((owner) => owner.id === mailbox.userWorkspaceId)?.userId ??
        null,
      sharedWithWorkspaceMemberIds: getTeamMailboxMemberIds(shares, mailbox.id),
    }));
  }

  async setTeamMailboxMembers({
    workspaceId,
    connectedAccountId,
    workspaceMemberIds,
  }: {
    workspaceId: string;
    connectedAccountId: string;
    workspaceMemberIds: string[];
  }): Promise<TeamMailboxDTO> {
    const [mailbox] = await this.findSendableMailboxes(workspaceId, [
      connectedAccountId,
    ]);

    if (!isDefined(mailbox)) {
      throw new ConnectedAccountException(
        `Mailbox ${connectedAccountId} not found`,
        ConnectedAccountExceptionCode.CONNECTED_ACCOUNT_NOT_FOUND,
      );
    }

    const shares = await this.getShares(workspaceId);

    await this.userVarsService.set({
      workspaceId,
      key: TEAM_MAILBOX_SHARES_KEY,
      value: setTeamMailboxMemberIds(
        shares,
        connectedAccountId,
        workspaceMemberIds,
      ),
    });

    const teamMailboxes = await this.findTeamMailboxes(workspaceId);

    return teamMailboxes.find(
      (teamMailbox) => teamMailbox.id === connectedAccountId,
    ) as TeamMailboxDTO;
  }

  async findSenderAccounts(
    caller: Caller,
  ): Promise<SenderConnectedAccountDTO[]> {
    const usableAccounts =
      await this.connectedAccountMetadataService.findUsableByCaller(caller);

    const sharedIds = isDefined(caller.workspaceMemberId)
      ? getConnectedAccountIdsSharedWith(
          await this.getShares(caller.workspaceId),
          caller.workspaceMemberId,
        ).filter((id) => !usableAccounts.some((account) => account.id === id))
      : [];

    const sharedAccounts =
      sharedIds.length > 0
        ? await this.findSendableMailboxes(caller.workspaceId, sharedIds)
        : [];

    const accounts = [...usableAccounts, ...sharedAccounts];

    const messageChannels = await this.messageChannelRepository.find({
      where: {
        workspaceId: caller.workspaceId,
        connectedAccountId: In(accounts.map((account) => account.id)),
      },
      select: ['id', 'connectedAccountId'],
    });

    return accounts.map((account) => ({
      ...buildPublicConnectedAccount(account),
      messageChannelIds: messageChannels
        .filter((channel) => channel.connectedAccountId === account.id)
        .map((channel) => channel.id),
    }));
  }

  async verifyCanSendFrom({
    connectedAccountId,
    ...caller
  }: Caller & { connectedAccountId: string }): Promise<void> {
    const connectedAccount =
      await this.connectedAccountMetadataService.findById({
        id: connectedAccountId,
        workspaceId: caller.workspaceId,
      });

    if (
      isDefined(connectedAccount) &&
      isConnectedAccountUsableByCaller({
        connectedAccount,
        userWorkspaceId: caller.userWorkspaceId,
      })
    ) {
      return;
    }

    const isShared =
      isDefined(connectedAccount) &&
      isDefined(caller.workspaceMemberId) &&
      getTeamMailboxMemberIds(
        await this.getShares(caller.workspaceId),
        connectedAccountId,
      ).includes(caller.workspaceMemberId);

    if (!isShared) {
      throw new ConnectedAccountException(
        `Connected account ${connectedAccountId} is not usable by user workspace ${caller.userWorkspaceId}`,
        ConnectedAccountExceptionCode.CONNECTED_ACCOUNT_OWNERSHIP_VIOLATION,
      );
    }
  }
}
