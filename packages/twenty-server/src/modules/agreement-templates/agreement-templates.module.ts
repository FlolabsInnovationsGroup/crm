import { Module } from '@nestjs/common';

import { PermissionsModule } from 'src/engine/metadata-modules/permissions/permissions.module';
import { AgreementTemplateResolver } from 'src/modules/agreement-templates/resolvers/agreement-template.resolver';
import { AgreementTemplateService } from 'src/modules/agreement-templates/services/agreement-template.service';

@Module({
  imports: [PermissionsModule],
  providers: [AgreementTemplateService, AgreementTemplateResolver],
})
export class AgreementTemplatesModule {}
