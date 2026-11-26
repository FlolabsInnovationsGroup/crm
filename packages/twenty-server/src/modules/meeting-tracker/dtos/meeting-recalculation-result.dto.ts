import { Field, Int, ObjectType } from '@nestjs/graphql';

@ObjectType('MeetingRecalculationResult')
export class MeetingRecalculationResultDTO {
  @Field(() => Int)
  peopleChecked: number;

  @Field(() => Int)
  peopleWithMeeting: number;
}
