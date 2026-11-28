import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { FilesFieldModule } from 'src/engine/core-modules/file/files-field/files-field.module';
import { ToolModule } from 'src/engine/core-modules/tool/tool.module';
import { ConnectedAccountEntity } from 'src/engine/metadata-modules/connected-account/entities/connected-account.entity';
import { PermissionsModule } from 'src/engine/metadata-modules/permissions/permissions.module';
import { DocumensoWebhookController } from 'src/modules/agreement-templates/controllers/documenso-webhook.controller';
import { AgreementSigningResolver } from 'src/modules/agreement-templates/resolvers/agreement-signing.resolver';
import { AgreementTemplateResolver } from 'src/modules/agreement-templates/resolvers/agreement-template.resolver';
import { AgreementSigningService } from 'src/modules/agreement-templates/services/agreement-signing.service';
import { AgreementTemplateService } from 'src/modules/agreement-templates/services/agreement-template.service';
import { DocumensoApiService } from 'src/modules/agreement-templates/services/documenso-api.service';

@Module({
  imports: [
    PermissionsModule,
    FilesFieldModule,
    ToolModule,
    TypeOrmModule.forFeature([ConnectedAccountEntity]),
  ],
  controllers: [DocumensoWebhookController],
  providers: [
    AgreementTemplateService,
    AgreementTemplateResolver,
    AgreementSigningService,
    AgreementSigningResolver,
    DocumensoApiService,
  ],
})
export class AgreementTemplatesModule {}
