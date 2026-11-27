import { Injectable } from '@nestjs/common';

import { isNonEmptyString } from '@sniptt/guards';
import { type ActorMetadata, FieldActorSource } from 'twenty-shared/types';
import { isDefined } from 'twenty-shared/utils';

import { WorkspaceOrmManager } from 'src/engine/twenty-orm/workspace-orm.manager';
import { buildSystemAuthContext } from 'src/engine/twenty-orm/utils/build-system-auth-context.util';
import { addPersonEmailFiltersToQueryBuilder } from 'src/modules/match-participant/utils/add-person-email-filters-to-query-builder';
import { type RecordManualReviewAnswerInput } from 'src/modules/manual-review-answers/dtos/record-manual-review-answer.input';
import { type ManualReviewAnswerRecord } from 'src/modules/manual-review-answers/types/manual-review-answer-record.type';
import { toManualReviewAnswerName } from 'src/modules/manual-review-answers/utils/to-manual-review-answer-name.util';

const toTrimmedOrNull = (value: string | null | undefined) =>
  isNonEmptyString(value?.trim()) ? value.trim() : null;

// One row per Needs review card, keyed by the review email's thread, so
// pressing Done after replying from the card updates the same row.
@Injectable()
export class ManualReviewAnswerService {
  constructor(private readonly workspaceOrmManager: WorkspaceOrmManager) {}

  async recordAnswer({
    workspaceId,
    answeredBy,
    input,
  }: {
    workspaceId: string;
    answeredBy: { workspaceMemberId: string; name: string };
    input: RecordManualReviewAnswerInput;
  }): Promise<void> {
    await this.workspaceOrmManager.executeInWorkspaceContext(async () => {
      const answerRepository =
        this.workspaceOrmManager.getRepository<ManualReviewAnswerRecord>(
          'manualReviewAnswer',
          { shouldBypassPermissionChecks: true },
        );

      const existing = await answerRepository.findOne({
        where: { reviewThreadId: input.reviewThreadId },
        withDeleted: true,
      });

      // Someone deleted this row on purpose; Done or Undo must not bring it back.
      if (isDefined(existing?.deletedAt)) {
        return;
      }

      const answer = toTrimmedOrNull(input.answer);
      const actor: ActorMetadata = {
        source: FieldActorSource.MANUAL,
        workspaceMemberId: answeredBy.workspaceMemberId,
        name: answeredBy.name,
        context: {},
      };

      const templateName = toTrimmedOrNull(input.templateName);
      // The text sent from the card is the answer; a later Done only fills
      // an answer that is still missing.
      const shouldWriteAnswer =
        isDefined(answer) &&
        (input.source === 'REPLY_FROM_CARD' ||
          !isNonEmptyString(existing?.answer));

      const values = {
        name: toManualReviewAnswerName(input.question),
        question: input.question.trim(),
        applicantEmail: input.applicantEmail.trim().toLowerCase(),
        category: toTrimmedOrNull(input.category),
        updatedBy: actor,
        ...(isDefined(templateName) ? { templateName } : {}),
        ...(shouldWriteAnswer
          ? {
              answer,
              answeredAt: new Date().toISOString(),
              source: input.source,
            }
          : {}),
        personId:
          existing?.personId ??
          (await this.findPersonIdByEmail(input.applicantEmail)),
      };

      if (isDefined(existing)) {
        await answerRepository.update(existing.id, values);

        return;
      }

      try {
        await answerRepository.insert({
          source: input.source,
          ...values,
          reviewThreadId: input.reviewThreadId,
          createdBy: actor,
        });
      } catch (error) {
        // A teammate or a quick Done may have saved the same card first.
        const savedMeanwhile = await answerRepository.findOne({
          where: { reviewThreadId: input.reviewThreadId },
        });

        if (!isDefined(savedMeanwhile)) {
          throw error;
        }

        await answerRepository.update(savedMeanwhile.id, values);
      }
    }, buildSystemAuthContext(workspaceId));
  }

  // Same matching as the payment tracker: any of the person's emails, and the
  // oldest person when several share it.
  private async findPersonIdByEmail(email: string): Promise<string | null> {
    const normalizedEmail = email.trim().toLowerCase();

    if (!isNonEmptyString(normalizedEmail)) {
      return null;
    }

    const personRepository = this.workspaceOrmManager.getRepository('person', {
      shouldBypassPermissionChecks: true,
    });

    const matchingPeople = (await addPersonEmailFiltersToQueryBuilder({
      queryBuilder: personRepository.createQueryBuilder('person'),
      emails: [normalizedEmail],
    })
      .orderBy('person.createdAt', 'ASC')
      .getMany()) as { id: string; deletedAt: string | Date | null }[];

    return (
      matchingPeople.find((person) => !isDefined(person.deletedAt))?.id ?? null
    );
  }
}
