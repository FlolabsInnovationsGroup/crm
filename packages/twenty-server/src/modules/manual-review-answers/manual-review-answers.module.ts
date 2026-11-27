import { Module } from '@nestjs/common';

import { UserModule } from 'src/engine/core-modules/user/user.module';
import { PermissionsModule } from 'src/engine/metadata-modules/permissions/permissions.module';
import { ManualReviewAnswerResolver } from 'src/modules/manual-review-answers/resolvers/manual-review-answer.resolver';
import { ManualReviewAnswerService } from 'src/modules/manual-review-answers/services/manual-review-answer.service';

@Module({
  imports: [UserModule, PermissionsModule],
  providers: [ManualReviewAnswerService, ManualReviewAnswerResolver],
})
export class ManualReviewAnswersModule {}
