import { Field, ObjectType } from '@nestjs/graphql';

import { UUIDScalarType } from 'src/engine/api/graphql/workspace-schema-builder/graphql-types/scalars';

@ObjectType('TeamMailbox')
export class TeamMailboxDTO {
  @Field(() => UUIDScalarType)
  id: string;

  @Field(() => String)
  handle: string;

  @Field(() => String)
  provider: string;

  @Field(() => String, { nullable: true })
  ownerUserId: string | null;

  @Field(() => [String])
  sharedWithWorkspaceMemberIds: string[];
}
