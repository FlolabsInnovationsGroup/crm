import { Field, ObjectType } from '@nestjs/graphql';

import { UUIDScalarType } from 'src/engine/api/graphql/workspace-schema-builder/graphql-types/scalars';

@ObjectType('InboxMailbox')
export class InboxMailboxDTO {
  @Field(() => UUIDScalarType)
  id: string;

  @Field(() => String)
  handle: string;
}
