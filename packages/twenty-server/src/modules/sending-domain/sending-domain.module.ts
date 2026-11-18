import { Module } from '@nestjs/common';

import { PermissionsModule } from 'src/engine/metadata-modules/permissions/permissions.module';
import { SendingDomainResolver } from 'src/modules/sending-domain/resolvers/sending-domain.resolver';
import { SendingDomainService } from 'src/modules/sending-domain/services/sending-domain.service';

@Module({
  imports: [PermissionsModule],
  providers: [SendingDomainService, SendingDomainResolver],
  exports: [SendingDomainService],
})
export class SendingDomainModule {}
