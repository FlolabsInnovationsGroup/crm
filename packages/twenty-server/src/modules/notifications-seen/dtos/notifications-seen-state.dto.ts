import { Field, ObjectType } from '@nestjs/graphql';

@ObjectType('NotificationsSeenState')
export class NotificationsSeenStateDTO {
  @Field(() => String, { nullable: true })
  seenAt: string | null;

  // Kept so the page can still highlight what was new when it was opened.
  @Field(() => String, { nullable: true })
  previousSeenAt: string | null;
}
