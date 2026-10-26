import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { FilesFieldModule } from 'src/engine/core-modules/file/files-field/files-field.module';
import { ThrottlerModule } from 'src/engine/core-modules/throttler/throttler.module';
import { ToolModule } from 'src/engine/core-modules/tool/tool.module';
import { WorkspaceEntity } from 'src/engine/core-modules/workspace/workspace.entity';
import { PublicFormController } from 'src/modules/public-form/controllers/public-form.controller';
import { PublicFormActionsService } from 'src/modules/public-form/services/public-form-actions.service';
import { PublicFormService } from 'src/modules/public-form/services/public-form.service';

@Module({
  imports: [
    FilesFieldModule,
    ThrottlerModule,
    ToolModule,
    TypeOrmModule.forFeature([WorkspaceEntity]),
  ],
  controllers: [PublicFormController],
  providers: [PublicFormService, PublicFormActionsService],
})
export class PublicFormModule {}
