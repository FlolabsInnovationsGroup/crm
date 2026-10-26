import { Injectable } from '@nestjs/common';

import { isDefined } from 'twenty-shared/utils';

import { UserVarsService } from 'src/engine/core-modules/user/user-vars/services/user-vars.service';
import {
  createTeamInboxReadState,
  markTeamInboxThreadUnread,
  markTeamInboxThreadsRead,
  type TeamInboxReadState,
} from 'src/engine/core-modules/messaging/utils/team-inbox-read-state.util';

const TEAM_INBOX_READ_STATE_KEY = 'TEAM_INBOX_READ_STATE';

type UserAndWorkspace = { userId: string; workspaceId: string };

@Injectable()
export class TeamInboxReadStateService {
  constructor(
    private readonly userVarsService: UserVarsService<{
      [TEAM_INBOX_READ_STATE_KEY]: TeamInboxReadState;
    }>,
  ) {}

  async getState({
    userId,
    workspaceId,
  }: UserAndWorkspace): Promise<TeamInboxReadState> {
    const stored = await this.userVarsService.get({
      userId,
      workspaceId,
      key: TEAM_INBOX_READ_STATE_KEY,
    });

    if (isDefined(stored)) {
      return stored;
    }

    const initialState = createTeamInboxReadState(new Date());

    await this.saveState({ userId, workspaceId }, initialState);

    return initialState;
  }

  async markRead(
    userAndWorkspace: UserAndWorkspace,
    threadIds: string[],
  ): Promise<void> {
    const state = await this.getState(userAndWorkspace);

    await this.saveState(
      userAndWorkspace,
      markTeamInboxThreadsRead(state, threadIds, new Date()),
    );
  }

  async markUnread(
    userAndWorkspace: UserAndWorkspace,
    threadId: string,
  ): Promise<void> {
    const state = await this.getState(userAndWorkspace);

    await this.saveState(
      userAndWorkspace,
      markTeamInboxThreadUnread(state, threadId),
    );
  }

  async markAllRead(userAndWorkspace: UserAndWorkspace): Promise<void> {
    await this.saveState(
      userAndWorkspace,
      createTeamInboxReadState(new Date()),
    );
  }

  private async saveState(
    { userId, workspaceId }: UserAndWorkspace,
    state: TeamInboxReadState,
  ) {
    await this.userVarsService.set({
      userId,
      workspaceId,
      key: TEAM_INBOX_READ_STATE_KEY,
      value: state,
    });
  }
}
