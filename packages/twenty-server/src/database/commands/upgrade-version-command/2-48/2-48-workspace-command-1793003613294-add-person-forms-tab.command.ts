import { InjectDataSource } from '@nestjs/typeorm';

import { Command } from 'nest-commander';

import { STANDARD_PAGE_LAYOUT_UNIVERSAL_IDENTIFIERS } from 'twenty-shared/metadata';
import { isDefined } from 'twenty-shared/utils';
import { DataSource } from 'typeorm';

import { ProvisionedWorkspaceCommandRunner } from 'src/database/commands/command-runners/provisioned-workspace.command-runner';
import { WorkspaceIteratorService } from 'src/database/commands/command-runners/workspace-iterator.service';
import { type RunOnWorkspaceArgs } from 'src/database/commands/command-runners/workspace.command-runner';
import { getStandardFlatEntitiesToCreateOrThrow } from 'src/database/commands/upgrade-version-command/2-10/utils/get-standard-flat-entities-to-create-or-throw.util';
import { ApplicationService } from 'src/engine/core-modules/application/application.service';
import { RegisteredWorkspaceCommand } from 'src/engine/core-modules/upgrade/decorators/registered-workspace-command.decorator';
import { type FlatPageLayoutTab } from 'src/engine/metadata-modules/flat-page-layout-tab/types/flat-page-layout-tab.type';
import { type FlatPageLayoutWidget } from 'src/engine/metadata-modules/flat-page-layout-widget/types/flat-page-layout-widget.type';
import { WorkspaceCacheService } from 'src/engine/workspace-cache/services/workspace-cache.service';
import { computeTwentyStandardApplicationAllFlatEntityMaps } from 'src/engine/workspace-manager/twenty-standard-application/utils/twenty-standard-application-all-flat-entity-maps.constant';
import { WorkspaceMigrationValidateBuildAndRunService } from 'src/engine/workspace-manager/workspace-migration/services/workspace-migration-validate-build-and-run-service';

const PERSON_RECORD_PAGE = STANDARD_PAGE_LAYOUT_UNIVERSAL_IDENTIFIERS.personRecordPage;

@RegisteredWorkspaceCommand('2.48.0', 1793003613294)
@Command({
  name: 'upgrade:2-48:add-person-forms-tab',
  description:
    'Add the Forms tab, listing form questions and answers, to the Person record page in existing workspaces',
})
export class AddPersonFormsTabCommand extends ProvisionedWorkspaceCommandRunner {
  private isWidgetTypeAdded = false;

  constructor(
    protected readonly workspaceIteratorService: WorkspaceIteratorService,
    private readonly applicationService: ApplicationService,
    private readonly workspaceCacheService: WorkspaceCacheService,
    private readonly workspaceMigrationValidateBuildAndRunService: WorkspaceMigrationValidateBuildAndRunService,
    @InjectDataSource()
    private readonly coreDataSource: DataSource,
  ) {
    super(workspaceIteratorService);
  }

  // 2.48 was already applied when this shipped, and the upgrade cursor skips
  // an instance command added behind it, so the enum label is added here.
  private async addWidgetTypeOnce() {
    if (this.isWidgetTypeAdded) {
      return;
    }

    await this.coreDataSource.query(
      `ALTER TYPE "core"."pageLayoutWidget_type_enum" ADD VALUE IF NOT EXISTS 'FORM_SUBMISSIONS'`,
    );
    this.isWidgetTypeAdded = true;
  }

  override async runOnWorkspace({
    workspaceId,
    options,
  }: RunOnWorkspaceArgs): Promise<void> {
    const isDryRun = options.dryRun ?? false;

    const { twentyStandardFlatApplication } =
      await this.applicationService.findWorkspaceTwentyStandardAndCustomApplicationOrThrow(
        { workspaceId },
      );

    const { flatPageLayoutMaps, flatPageLayoutTabMaps, flatPageLayoutWidgetMaps } =
      await this.workspaceCacheService.getOrRecompute(workspaceId, [
        'flatPageLayoutMaps',
        'flatPageLayoutTabMaps',
        'flatPageLayoutWidgetMaps',
      ]);

    if (
      !isDefined(
        flatPageLayoutMaps.byUniversalIdentifier[
          PERSON_RECORD_PAGE.universalIdentifier
        ],
      )
    ) {
      this.logger.log(
        `Person page layout does not exist for workspace ${workspaceId}, skipping`,
      );

      return;
    }

    const { allFlatEntityMaps: standardAllFlatEntityMaps } =
      computeTwentyStandardApplicationAllFlatEntityMaps({
        now: new Date().toISOString(),
        workspaceId,
        twentyStandardApplicationId: twentyStandardFlatApplication.id,
      });

    const pageLayoutTabsToCreate =
      getStandardFlatEntitiesToCreateOrThrow<FlatPageLayoutTab>({
        standardFlatEntityMaps: standardAllFlatEntityMaps.flatPageLayoutTabMaps,
        existingFlatEntityMaps: flatPageLayoutTabMaps,
        universalIdentifiers: [PERSON_RECORD_PAGE.tabs.forms.universalIdentifier],
      });

    const pageLayoutWidgetsToCreate =
      getStandardFlatEntitiesToCreateOrThrow<FlatPageLayoutWidget>({
        standardFlatEntityMaps:
          standardAllFlatEntityMaps.flatPageLayoutWidgetMaps,
        existingFlatEntityMaps: flatPageLayoutWidgetMaps,
        universalIdentifiers: [
          PERSON_RECORD_PAGE.tabs.forms.widgets.forms.universalIdentifier,
        ],
      });

    const totalOperationCount =
      pageLayoutTabsToCreate.length + pageLayoutWidgetsToCreate.length;

    if (totalOperationCount === 0) {
      this.logger.log(
        `Person record page already has the Forms tab for workspace ${workspaceId}, skipping`,
      );

      return;
    }

    this.logger.log(
      `${isDryRun ? '[DRY RUN] ' : ''}Applying ${totalOperationCount} Person Forms tab operation(s) for workspace ${workspaceId}`,
    );

    if (isDryRun) {
      return;
    }

    await this.addWidgetTypeOnce();

    const validateAndBuildResult =
      await this.workspaceMigrationValidateBuildAndRunService.validateBuildAndRunLegacyWorkspaceMigration(
        {
          isSystemBuild: true,
          applicationUniversalIdentifier:
            twentyStandardFlatApplication.universalIdentifier,
          workspaceId,
          allFlatEntityOperationByMetadataName: {
            pageLayoutTab: {
              flatEntityToCreate: pageLayoutTabsToCreate,
              flatEntityToDelete: [],
              flatEntityToUpdate: [],
            },
            pageLayoutWidget: {
              flatEntityToCreate: pageLayoutWidgetsToCreate,
              flatEntityToDelete: [],
              flatEntityToUpdate: [],
            },
          },
        },
      );

    if (validateAndBuildResult.status === 'fail') {
      throw new Error(
        `Failed to add the Person Forms tab for workspace ${workspaceId}: ${JSON.stringify(
          validateAndBuildResult,
          null,
          2,
        )}`,
      );
    }

    this.logger.log(`Added the Person Forms tab for workspace ${workspaceId}`);
  }
}
