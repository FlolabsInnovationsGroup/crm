import { Field, ObjectType } from '@nestjs/graphql';

import { type MessageParticipantRole } from 'twenty-shared/types';

@ObjectType('ApplicantEmailHistoryParticipant')
export class ApplicantEmailHistoryParticipantDTO {
  @Field(() => String)
  role: MessageParticipantRole;

  @Field(() => String)
  handle: string;

  @Field(() => String, { nullable: true })
  displayName: string | null;
}
