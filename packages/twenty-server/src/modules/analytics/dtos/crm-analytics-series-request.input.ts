import { Field, InputType } from '@nestjs/graphql';

// Plain strings for the same reason as CrmAnalyticsFilterInput.
@InputType('CrmAnalyticsSeriesRequestInput')
export class CrmAnalyticsSeriesRequestInput {
  @Field(() => String)
  metric: string;

  @Field(() => String, { nullable: true })
  stageKey?: string | null;

  @Field(() => String)
  groupBy: string;
}
