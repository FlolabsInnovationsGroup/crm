import { Field, InputType } from '@nestjs/graphql';

import { IsEmail, IsOptional, MaxLength } from 'class-validator';

import { UUIDScalarType } from 'src/engine/api/graphql/workspace-schema-builder/graphql-types/scalars';

@InputType('ManualReviewHistoryItemInput')
export class ManualReviewHistoryItemInput {
  @Field(() => UUIDScalarType)
  messageThreadId: string;

  @Field(() => String, { nullable: true })
  @IsOptional()
  @IsEmail()
  @MaxLength(320)
  applicantEmail?: string | null;
}
