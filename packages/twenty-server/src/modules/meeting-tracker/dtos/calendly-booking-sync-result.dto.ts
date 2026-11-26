import { Field, Int, ObjectType } from '@nestjs/graphql';

@ObjectType('CalendlyBookingSyncResult')
export class CalendlyBookingSyncResultDTO {
  @Field(() => Int)
  bookingsRead: number;

  @Field(() => Int)
  bookingsAdded: number;

  @Field(() => Int)
  bookingsWithoutPerson: number;
}
