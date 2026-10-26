import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { FilesFieldModule } from 'src/engine/core-modules/file/files-field/files-field.module';
import { ThrottlerModule } from 'src/engine/core-modules/throttler/throttler.module';
import { ToolModule } from 'src/engine/core-modules/tool/tool.module';
import { WorkspaceEntity } from 'src/engine/core-modules/workspace/workspace.entity';
import { WorkspaceManyOrAllFlatEntityMapsCacheModule } from 'src/engine/metadata-modules/flat-entity/services/workspace-many-or-all-flat-entity-maps-cache.module';
import { PublicFormController } from 'src/modules/public-form/controllers/public-form.controller';
import { PublicFormStatsResolver } from 'src/modules/public-form/resolvers/public-form-stats.resolver';
import { PublicFormActionsService } from 'src/modules/public-form/services/public-form-actions.service';
import { PublicFormStatsService } from 'src/modules/public-form/services/public-form-stats.service';
import { PublicFormService } from 'src/modules/public-form/services/public-form.service';

@Module({
  imports: [
    FilesFieldModule,
    ThrottlerModule,
    ToolModule,
    WorkspaceManyOrAllFlatEntityMapsCacheModule,
    TypeOrmModule.forFeature([WorkspaceEntity]),
  ],
  controllers: [PublicFormController],
  providers: [
    PublicFormService,
    PublicFormActionsService,
    PublicFormStatsService,
    PublicFormStatsResolver,
  ],
})
export class PublicFormModule {}
