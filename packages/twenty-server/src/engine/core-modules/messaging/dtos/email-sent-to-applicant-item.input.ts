import { Field, InputType } from '@nestjs/graphql';

import { IsString, MaxLength } from 'class-validator';

import { UUIDScalarType } from 'src/engine/api/graphql/workspace-schema-builder/graphql-types/scalars';

@InputType('EmailSentToApplicantItemInput')
export class EmailSentToApplicantItemInput {
  @Field(() => UUIDScalarType)
  messageThreadId: string;

  @Field(() => String)
  @IsString()
  @MaxLength(320)
  applicantEmail: string;
}
