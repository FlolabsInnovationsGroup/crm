import { Field, Int, ObjectType } from '@nestjs/graphql';

@ObjectType('PublicFormStats')
export class PublicFormStatsDTO {
  @Field(() => Int)
  views: number;

  @Field(() => Int)
  starts: number;

  // How many visitors reached each step, first step first.
  @Field(() => [Int])
  stepReaches: number[];
}
