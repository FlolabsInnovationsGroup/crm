import { Field, ObjectType } from '@nestjs/graphql';

import { UUIDScalarType } from 'src/engine/api/graphql/workspace-schema-builder/graphql-types/scalars';

@ObjectType('ApplicantReplyState')
export class ApplicantReplyStateDTO {
  @Field(() => String)
  email: string;

  @Field(() => UUIDScalarType, { nullable: true })
  personId: string | null;

  @Field(() => String, { nullable: true })
  stage: string | null;

  @Field(() => Date, { nullable: true })
  lastApplicantMessageAt: Date | null;

  @Field(() => Date, { nullable: true })
  lastSentToApplicantAt: Date | null;

  @Field(() => Boolean)
  isAwaitingOurReply: boolean;

  @Field(() => Boolean)
  hasRepliedSince: boolean;
}
