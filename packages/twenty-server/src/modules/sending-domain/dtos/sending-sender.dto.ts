import { Field, ObjectType } from '@nestjs/graphql';

@ObjectType('SendingSender')
export class SendingSenderDTO {
  @Field()
  name: string;

  @Field()
  email: string;

  @Field()
  replyTo: string;

  // False when the reply-to domain has no MX record, so replies would bounce.
  @Field()
  canReceiveReplies: boolean;
}
