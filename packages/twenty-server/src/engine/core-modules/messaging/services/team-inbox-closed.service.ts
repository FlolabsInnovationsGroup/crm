import { Injectable } from '@nestjs/common';

import { TimelineMessagingService } from 'src/engine/core-modules/messaging/services/timeline-messaging.service';
import {
  getClosedAtByThreadId,
  getClosedKey,
  isTeamInboxThreadClosed,
} from 'src/engine/core-modules/messaging/utils/team-inbox-closed.util';
import { UserVarsService } from 'src/engine/core-modules/user/user-vars/services/user-vars.service';

// Stored at workspace level: a conversation closed by one teammate is closed
// for everyone.
@Injectable()
export class TeamInboxClosedService {
  constructor(
    private readonly userVarsService: UserVarsService<Record<string, string>>,
    private readonly timelineMessagingService: TimelineMessagingService,
  ) {}

  async getClosedThreadIds(workspaceId: string): Promise<string[]> {
    const workspaceVars = await this.userVarsService.getAll({ workspaceId });
    const closedAtByThreadId = getClosedAtByThreadId(workspaceVars.entries());
    const threadIds = Object.keys(closedAtByThreadId);

    const lastIncomingAtByThreadId =
      await this.timelineMessagingService.getLastIncomingAtByThreadId(
        threadIds,
        workspaceId,
      );

    const isClosedByThreadId = Object.fromEntries(
      threadIds.map((threadId) => [
        threadId,
        isTeamInboxThreadClosed(
          closedAtByThreadId[threadId],
          lastIncomingAtByThreadId[threadId] ?? null,
        ),
      ]),
    );

    // Dropping keys of reopened threads keeps this list to closed threads.
    await Promise.all(
      threadIds
        .filter((threadId) => !isClosedByThreadId[threadId])
        .map((threadId) =>
          this.userVarsService.delete({
            workspaceId,
            key: getClosedKey(threadId),
          }),
        ),
    );

    return threadIds.filter((threadId) => isClosedByThreadId[threadId]);
  }

  async setClosed({
    workspaceId,
    messageThreadId,
    isClosed,
  }: {
    workspaceId: string;
    messageThreadId: string;
    isClosed: boolean;
  }): Promise<void> {
    const key = getClosedKey(messageThreadId);

    if (isClosed) {
      await this.userVarsService.set({
        workspaceId,
        key,
        value: new Date().toISOString(),
      });

      return;
    }

    await this.userVarsService.delete({ workspaceId, key });
  }
}
