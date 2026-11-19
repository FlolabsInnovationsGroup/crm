import { Field, InputType } from '@nestjs/graphql';

@InputType()
export class AddSendingSenderInput {
  @Field()
  name: string;

  @Field()
  email: string;

  @Field()
  replyTo: string;
}
