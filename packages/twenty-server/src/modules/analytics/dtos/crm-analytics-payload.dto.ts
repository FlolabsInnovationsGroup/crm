import { Field, ObjectType } from '@nestjs/graphql';

import GraphQLJSON from 'graphql-type-json';

@ObjectType('CrmAnalyticsPayload')
export class CrmAnalyticsPayloadDTO {
  // Null when analytics is switched off.
  @Field(() => GraphQLJSON, { nullable: true })
  payload: unknown;
}
