import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { FilesFieldModule } from 'src/engine/core-modules/file/files-field/files-field.module';
import { ThrottlerModule } from 'src/engine/core-modules/throttler/throttler.module';
import { WorkspaceEntity } from 'src/engine/core-modules/workspace/workspace.entity';
import { PublicFormController } from 'src/modules/public-form/controllers/public-form.controller';
import { PublicFormService } from 'src/modules/public-form/services/public-form.service';

@Module({
  imports: [
    FilesFieldModule,
    ThrottlerModule,
    TypeOrmModule.forFeature([WorkspaceEntity]),
  ],
  controllers: [PublicFormController],
  providers: [PublicFormService],
})
export class PublicFormModule {}
