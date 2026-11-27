import { Field, InputType } from '@nestjs/graphql';

import { IsIn, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

import { type ManualReviewAnswerSource } from 'src/modules/manual-review-answers/types/manual-review-answer-record.type';

const MAX_TEXT_LENGTH = 20_000;
const MAX_SHORT_TEXT_LENGTH = 300;

@InputType()
export class RecordManualReviewAnswerInput {
  @Field(() => String)
  @IsUUID()
  reviewThreadId: string;

  @Field(() => String)
  @IsString()
  @MaxLength(MAX_SHORT_TEXT_LENGTH)
  applicantEmail: string;

  @Field(() => String)
  @IsString()
  @MaxLength(MAX_TEXT_LENGTH)
  question: string;

  @Field(() => String, { nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(MAX_TEXT_LENGTH)
  answer?: string | null;

  @Field(() => String, { nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(MAX_SHORT_TEXT_LENGTH)
  category?: string | null;

  @Field(() => String, { nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(MAX_SHORT_TEXT_LENGTH)
  templateName?: string | null;

  @Field(() => String)
  @IsIn(['REPLY_FROM_CARD', 'MARKED_DONE'])
  source: ManualReviewAnswerSource;
}
