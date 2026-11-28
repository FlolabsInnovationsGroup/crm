import { Field, ObjectType } from '@nestjs/graphql';

import { UUIDScalarType } from 'src/engine/api/graphql/workspace-schema-builder/graphql-types/scalars';
import { ApplicantEmailHistoryParticipantDTO } from 'src/engine/core-modules/messaging/dtos/applicant-email-history-participant.dto';

export type ApplicantEmailHistoryDirection = 'INCOMING' | 'OUTGOING';

@ObjectType('ApplicantEmailHistoryMessage')
export class ApplicantEmailHistoryMessageDTO {
  @Field(() => UUIDScalarType)
  id: string;

  @Field(() => UUIDScalarType)
  messageThreadId: string;

  @Field(() => String, { nullable: true })
  subject: string | null;

  @Field(() => String, { nullable: true })
  text: string | null;

  @Field(() => Date, { nullable: true })
  receivedAt: Date | null;

  @Field(() => String, { nullable: true })
  headerMessageId: string | null;

  // Relative to the workspace's mailboxes.
  @Field(() => String)
  direction: ApplicantEmailHistoryDirection;

  @Field(() => Boolean)
  isFromApplicant: boolean;

  @Field(() => ApplicantEmailHistoryParticipantDTO, { nullable: true })
  sender: ApplicantEmailHistoryParticipantDTO | null;

  @Field(() => [ApplicantEmailHistoryParticipantDTO])
  recipients: ApplicantEmailHistoryParticipantDTO[];
}
