import { Field, ObjectType } from '@nestjs/graphql';

import { UUIDScalarType } from 'src/engine/api/graphql/workspace-schema-builder/graphql-types/scalars';

@ObjectType('EmailSentToApplicant')
export class EmailSentToApplicantDTO {
  @Field(() => UUIDScalarType)
  messageThreadId: string;

  @Field(() => Date)
  sentAt: Date;

  @Field(() => String, { nullable: true })
  subject: string | null;

  @Field(() => String, { nullable: true })
  excerpt: string | null;

  @Field(() => String, { nullable: true })
  senderName: string | null;

  @Field(() => String, { nullable: true })
  senderEmail: string | null;
}
