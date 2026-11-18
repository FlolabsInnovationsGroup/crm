import { Field, InputType, Int } from '@nestjs/graphql';

import {
  ArrayNotEmpty,
  IsArray,
  IsInt,
  IsNotEmpty,
  IsString,
  MaxLength,
} from 'class-validator';

@InputType()
export class CreateCampaignInput {
  @Field()
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  name: string;

  @Field()
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  subject: string;

  @Field()
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  fromName: string;

  @Field()
  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  fromLocalPart: string;

  @Field()
  @IsString()
  @IsNotEmpty()
  fromDomain: string;

  @Field(() => [Int])
  @IsArray()
  @ArrayNotEmpty()
  @IsInt({ each: true })
  audienceIds: number[];

  // Markdown; the campaign server wraps it in its template with the unsubscribe footer.
  @Field()
  @IsString()
  @IsNotEmpty()
  body: string;
}
