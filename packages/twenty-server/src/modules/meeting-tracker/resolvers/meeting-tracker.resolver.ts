import { UseFilters, UseGuards } from '@nestjs/common';
import { Mutation } from '@nestjs/graphql';

import { PermissionFlagType } from 'twenty-shared/constants';

import { CoreResolver } from 'src/engine/api/graphql/graphql-config/decorators/core-resolver.decorator';
import { AuthGraphqlApiExceptionFilter } from 'src/engine/core-modules/auth/filters/auth-graphql-api-exception.filter';
import { PreventNestToAutoLogGraphqlErrorsFilter } from 'src/engine/core-modules/graphql/filters/prevent-nest-to-auto-log-graphql-errors.filter';
import { UserInputError } from 'src/engine/core-modules/graphql/utils/graphql-errors.util';
import { WorkspaceEntity } from 'src/engine/core-modules/workspace/workspace.entity';
import { AuthWorkspace } from 'src/engine/decorators/auth/auth-workspace.decorator';
import { AuthPrincipalGuard } from 'src/engine/guards/auth-principal.guard';
import { SettingsPermissionGuard } from 'src/engine/guards/settings-permission.guard';
import { PermissionsGraphqlApiExceptionFilter } from 'src/engine/metadata-modules/permissions/utils/permissions-graphql-api-exception.filter';
import { MeetingRecalculationResultDTO } from 'src/modules/meeting-tracker/dtos/meeting-recalculation-result.dto';
import { MeetingTrackerService } from 'src/modules/meeting-tracker/services/meeting-tracker.service';
import { getMeetingTrackerWorkspaceId } from 'src/modules/meeting-tracker/utils/get-meeting-tracker-workspace-id.util';

@UseGuards(
  AuthPrincipalGuard({
    userSession: {
      standard: true,
      impersonated: false,
      playground: true,
      workspaceAgnostic: false,
    },
    apiKey: false,
    oauthClient: false,
    application: false,
  }),
  SettingsPermissionGuard(PermissionFlagType.WORKSPACE),
)
@CoreResolver(() => MeetingRecalculationResultDTO)
@UseFilters(
  AuthGraphqlApiExceptionFilter,
  PermissionsGraphqlApiExceptionFilter,
  PreventNestToAutoLogGraphqlErrorsFilter,
)
export class MeetingTrackerResolver {
  constructor(private readonly meetingTrackerService: MeetingTrackerService) {}

  // Fills the meeting fields for calendar events synced before this module
  // existed and repairs any that went stale. Re-running only changes what is
  // out of date, so a run cut short by a timeout can simply be repeated.
  @Mutation(() => MeetingRecalculationResultDTO)
  async recalculateMeetingTimes(
    @AuthWorkspace() workspace: WorkspaceEntity,
  ): Promise<MeetingRecalculationResultDTO> {
    if (getMeetingTrackerWorkspaceId() !== workspace.id) {
      throw new UserInputError(
        'Meeting tracking is not set up for this workspace',
      );
    }

    return this.meetingTrackerService.recalculateEveryone(workspace.id);
  }
}
