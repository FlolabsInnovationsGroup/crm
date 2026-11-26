import { Field, ObjectType } from '@nestjs/graphql';

import { UUIDScalarType } from 'src/engine/api/graphql/workspace-schema-builder/graphql-types/scalars';

@ObjectType('ManualReviewHistoryEntry')
export class ManualReviewHistoryEntryDTO {
  @Field(() => UUIDScalarType)
  messageThreadId: string;

  @Field(() => Date, { nullable: true })
  doneAt: Date | null;

  @Field(() => String, { nullable: true })
  doneByName: string | null;

  @Field(() => String, { nullable: true })
  replyText: string | null;

  @Field(() => Date, { nullable: true })
  replySentAt: Date | null;
}
