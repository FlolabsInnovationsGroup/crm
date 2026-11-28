import { Field, ObjectType } from '@nestjs/graphql';

import { ApplicantEmailHistoryMessageDTO } from 'src/engine/core-modules/messaging/dtos/applicant-email-history-message.dto';

@ObjectType('ApplicantEmailHistory')
export class ApplicantEmailHistoryDTO {
  // Oldest first.
  @Field(() => [ApplicantEmailHistoryMessageDTO])
  messages: ApplicantEmailHistoryMessageDTO[];

  @Field(() => Boolean)
  isTruncated: boolean;
}
