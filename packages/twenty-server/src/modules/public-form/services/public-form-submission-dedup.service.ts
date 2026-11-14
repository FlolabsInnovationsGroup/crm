import { Injectable, Logger } from '@nestjs/common';

import { isDefined } from 'twenty-shared/utils';

import { InjectCacheStorage } from 'src/engine/core-modules/cache-storage/decorators/cache-storage.decorator';
import { CacheStorageService } from 'src/engine/core-modules/cache-storage/services/cache-storage.service';
import { CacheStorageNamespace } from 'src/engine/core-modules/cache-storage/types/cache-storage-namespace.enum';

const CLIENT_SUBMISSION_ID_PATTERN = /^[A-Za-z0-9-]{16,64}$/;
const CLIENT_SUBMISSION_TTL_MS = 30 * 60 * 1000;
const PENDING_POLL_INTERVAL_MS = 500;
const PENDING_WAIT_MS = 20 * 1000;

type StoredSubmission = { submissionId?: string };

type SubmitOnceArgs<TResult> = {
  workspaceId: string;
  formId: string;
  clientSubmissionId: string | undefined;
  submit: () => Promise<TResult>;
};

const wait = (milliseconds: number) =>
  new Promise((resolve) => setTimeout(resolve, milliseconds));

// The form page retries once when the connection drops. If the first attempt
// reached us, the retry carries the same id and gets that attempt's outcome
// instead of a second person, submission and set of emails.
@Injectable()
export class PublicFormSubmissionDedupService {
  private readonly logger = new Logger(PublicFormSubmissionDedupService.name);

  constructor(
    @InjectCacheStorage(CacheStorageNamespace.ModuleForms)
    private readonly cacheStorage: CacheStorageService,
  ) {}

  async submitOnce<TResult extends { submissionId?: string }>(
    args: SubmitOnceArgs<TResult>,
  ): Promise<{ submissionId?: string }> {
    const { workspaceId, formId, clientSubmissionId, submit } = args;

    if (
      !isDefined(clientSubmissionId) ||
      !CLIENT_SUBMISSION_ID_PATTERN.test(clientSubmissionId)
    ) {
      return submit();
    }

    const key = `client-submission:${workspaceId}:${formId}:${clientSubmissionId}`;
    const isFirstAttempt =
      await this.cacheStorage.setIfAbsent<StoredSubmission>(
        key,
        {},
        CLIENT_SUBMISSION_TTL_MS,
      );

    if (!isFirstAttempt) {
      return this.waitForFirstAttempt(key, args);
    }

    let result: TResult;

    try {
      result = await submit();
    } catch (error) {
      await this.cacheStorage.del(key);
      throw error;
    }

    try {
      await this.cacheStorage.set<StoredSubmission>(
        key,
        { submissionId: result.submissionId },
        CLIENT_SUBMISSION_TTL_MS,
      );
    } catch (error) {
      this.logger.warn(`Could not store form submission ${key}: ${error}`);
    }

    return result;
  }

  // The first attempt may still be running. Answer with its submission once
  // it is stored, or submit afresh if it failed and released the key.
  private async waitForFirstAttempt<TResult extends { submissionId?: string }>(
    key: string,
    args: SubmitOnceArgs<TResult>,
  ): Promise<{ submissionId?: string }> {
    for (
      let waitedMs = 0;
      waitedMs <= PENDING_WAIT_MS;
      waitedMs += PENDING_POLL_INTERVAL_MS
    ) {
      const stored = await this.cacheStorage.get<StoredSubmission>(key);

      if (!isDefined(stored)) {
        return this.submitOnce(args);
      }

      if (isDefined(stored.submissionId)) {
        return { submissionId: stored.submissionId };
      }

      await wait(PENDING_POLL_INTERVAL_MS);
    }

    throw new Error(`Form submission ${key} is still being processed`);
  }
}
