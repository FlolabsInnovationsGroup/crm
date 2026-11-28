import { Injectable } from '@nestjs/common';

import { msg } from '@lingui/core/macro';
import { isNonEmptyString } from '@sniptt/guards';
import { isDefined } from 'twenty-shared/utils';

import { UserVarsService } from 'src/engine/core-modules/user/user-vars/services/user-vars.service';
import {
  ConnectedAccountException,
  ConnectedAccountExceptionCode,
} from 'src/engine/metadata-modules/connected-account/connected-account.exception';
import { TeamMailboxService } from 'src/engine/metadata-modules/connected-account/services/team-mailbox.service';
import {
  getTeamMailboxSignatureKey,
  normalizeTeamMailboxSignature,
  TEAM_MAILBOX_SIGNATURE_MAX_LENGTH,
} from 'src/engine/metadata-modules/connected-account/utils/team-mailbox-signature.util';

// Kept by the CRM: IMAP/SMTP has no signature to read, and fetching Gmail's
// or Outlook's would need extra OAuth scopes.
@Injectable()
export class TeamMailboxSignatureService {
  constructor(
    private readonly teamMailboxService: TeamMailboxService,
    private readonly userVarsService: UserVarsService<Record<string, string>>,
  ) {}

  async getSignature({
    workspaceId,
    connectedAccountId,
  }: {
    workspaceId: string;
    connectedAccountId: string;
  }): Promise<string | null> {
    const signature = await this.userVarsService.get({
      workspaceId,
      key: getTeamMailboxSignatureKey(connectedAccountId),
    });

    return isNonEmptyString(signature) ? signature : null;
  }

  async setSignature({
    workspaceId,
    connectedAccountId,
    signature,
  }: {
    workspaceId: string;
    connectedAccountId: string;
    signature: string;
  }): Promise<string | null> {
    const teamMailboxes =
      await this.teamMailboxService.findTeamMailboxes(workspaceId);

    if (!teamMailboxes.some((mailbox) => mailbox.id === connectedAccountId)) {
      throw new ConnectedAccountException(
        `Mailbox ${connectedAccountId} not found`,
        ConnectedAccountExceptionCode.CONNECTED_ACCOUNT_NOT_FOUND,
      );
    }

    const normalizedSignature = normalizeTeamMailboxSignature(signature);
    const key = getTeamMailboxSignatureKey(connectedAccountId);

    if (!isDefined(normalizedSignature)) {
      await this.userVarsService.delete({ workspaceId, key });

      return null;
    }

    if (normalizedSignature.length > TEAM_MAILBOX_SIGNATURE_MAX_LENGTH) {
      throw new ConnectedAccountException(
        `Signature longer than ${TEAM_MAILBOX_SIGNATURE_MAX_LENGTH} characters`,
        ConnectedAccountExceptionCode.INVALID_CONNECTED_ACCOUNT_INPUT,
        {
          userFriendlyMessage: msg`A signature can have at most ${TEAM_MAILBOX_SIGNATURE_MAX_LENGTH} characters.`,
        },
      );
    }

    await this.userVarsService.set({
      workspaceId,
      key,
      value: normalizedSignature,
    });

    return normalizedSignature;
  }
}
