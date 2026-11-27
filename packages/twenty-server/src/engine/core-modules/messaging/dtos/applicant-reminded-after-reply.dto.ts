import { Field, ObjectType } from '@nestjs/graphql';

import { UUIDScalarType } from 'src/engine/api/graphql/workspace-schema-builder/graphql-types/scalars';

@ObjectType('ApplicantRemindedAfterReply')
export class ApplicantRemindedAfterReplyDTO {
  @Field(() => UUIDScalarType)
  personId: string;

  @Field(() => String, { nullable: true })
  name: string | null;

  @Field(() => String, { nullable: true })
  email: string | null;

  @Field(() => String, { nullable: true })
  currentStage: string | null;

  @Field(() => String)
  reminderStage: string;

  @Field(() => Date)
  remindedAt: Date;

  @Field(() => Date)
  applicantMessageAt: Date;

  @Field(() => Date, { nullable: true })
  lastSentBeforeReminderAt: Date | null;
}
