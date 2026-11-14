import { Injectable } from '@nestjs/common';

import { UserVarsService } from 'src/engine/core-modules/user/user-vars/services/user-vars.service';
import {
  getManualReviewDoneKey,
  getManualReviewDoneThreadIds,
} from 'src/engine/core-modules/messaging/utils/team-inbox-manual-review.util';

// Stored at workspace level: once one teammate handles a reply, it is done
// for everyone.
@Injectable()
export class TeamInboxManualReviewService {
  constructor(
    private readonly userVarsService: UserVarsService<Record<string, true>>,
  ) {}

  async getDoneThreadIds(workspaceId: string): Promise<string[]> {
    const workspaceVars = await this.userVarsService.getAll({ workspaceId });

    return getManualReviewDoneThreadIds(workspaceVars.keys());
  }

  async setDone({
    workspaceId,
    messageThreadId,
    isDone,
  }: {
    workspaceId: string;
    messageThreadId: string;
    isDone: boolean;
  }): Promise<void> {
    const key = getManualReviewDoneKey(messageThreadId);

    if (isDone) {
      await this.userVarsService.set({ workspaceId, key, value: true });

      return;
    }

    await this.userVarsService.delete({ workspaceId, key });
  }
}
