import { Injectable } from '@nestjs/common';

import { UserVarsService } from 'src/engine/core-modules/user/user-vars/services/user-vars.service';
import { getManualReviewDoneByKey } from 'src/engine/core-modules/messaging/utils/team-inbox-manual-review-history.util';
import {
  getManualReviewDoneKey,
  getManualReviewDoneThreadIds,
  getManualReviewDoneThreadIdsSince,
} from 'src/engine/core-modules/messaging/utils/team-inbox-manual-review.util';

// Stored at workspace level: once one teammate handles a reply, it is done
// for everyone.
@Injectable()
export class TeamInboxManualReviewService {
  constructor(
    private readonly userVarsService: UserVarsService<
      Record<string, true | string>
    >,
  ) {}

  async getDoneThreadIds(workspaceId: string): Promise<string[]> {
    const workspaceVars = await this.userVarsService.getAll({ workspaceId });

    return getManualReviewDoneThreadIds(workspaceVars.keys());
  }

  async getDoneThreadIdsSince(
    workspaceId: string,
    since: Date,
  ): Promise<string[]> {
    const workspaceVars = await this.userVarsService.getAll({ workspaceId });

    return getManualReviewDoneThreadIdsSince(workspaceVars.entries(), since);
  }

  async setDone({
    workspaceId,
    messageThreadId,
    isDone,
    workspaceMemberId,
  }: {
    workspaceId: string;
    messageThreadId: string;
    isDone: boolean;
    workspaceMemberId: string;
  }): Promise<void> {
    const key = getManualReviewDoneKey(messageThreadId);
    const doneByKey = getManualReviewDoneByKey(messageThreadId);

    if (isDone) {
      await this.userVarsService.set({
        workspaceId,
        key,
        value: new Date().toISOString(),
      });
      await this.userVarsService.set({
        workspaceId,
        key: doneByKey,
        value: workspaceMemberId,
      });

      return;
    }

    await this.userVarsService.delete({ workspaceId, key });
    await this.userVarsService.delete({ workspaceId, key: doneByKey });
  }
}
