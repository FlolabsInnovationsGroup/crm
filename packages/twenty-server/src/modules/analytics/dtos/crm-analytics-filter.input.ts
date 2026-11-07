import { Field, InputType } from '@nestjs/graphql';

// Plain strings, not GraphQL enums, so no enum type is registered at boot.
// parse-crm-analytics-filter.util.ts validates every value.
@InputType('CrmAnalyticsFilterInput')
export class CrmAnalyticsFilterInput {
  @Field(() => String, { nullable: true })
  dateFrom?: string | null;

  @Field(() => String, { nullable: true })
  dateTo?: string | null;

  @Field(() => String, { nullable: true })
  trackKey?: string | null;

  @Field(() => String, { nullable: true })
  programKey?: string | null;

  @Field(() => String, { nullable: true })
  sourceKey?: string | null;

  @Field(() => String, { nullable: true })
  status?: string | null;

  @Field(() => String, { nullable: true })
  period?: string | null;
}
