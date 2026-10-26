import { Injectable } from '@nestjs/common';

import { InjectCacheStorage } from 'src/engine/core-modules/cache-storage/decorators/cache-storage.decorator';
import { CacheStorageService } from 'src/engine/core-modules/cache-storage/services/cache-storage.service';
import { CacheStorageNamespace } from 'src/engine/core-modules/cache-storage/types/cache-storage-namespace.enum';
import { type PublicFormEventType } from 'src/modules/public-form/types/public-form-event-type.type';

const MAX_TRACKED_STEPS = 30;

// Counters live in Redis: cheap to bump on every page view, and losing them
// on a Redis wipe only resets analytics, never answers.
@Injectable()
export class PublicFormStatsService {
  constructor(
    @InjectCacheStorage(CacheStorageNamespace.ModuleForms)
    private readonly cacheStorage: CacheStorageService,
  ) {}

  private key(workspaceId: string, formId: string, counter: string) {
    return `stats:${workspaceId}:${formId}:${counter}`;
  }

  async recordEvent({
    workspaceId,
    formId,
    type,
    step,
  }: {
    workspaceId: string;
    formId: string;
    type: PublicFormEventType;
    step?: number;
  }) {
    if (type !== 'step') {
      await this.cacheStorage.incrBy(this.key(workspaceId, formId, type), 1);

      return;
    }

    if (
      step === undefined ||
      !Number.isInteger(step) ||
      step < 0 ||
      step >= MAX_TRACKED_STEPS
    ) {
      return;
    }

    await this.cacheStorage.incrBy(
      this.key(workspaceId, formId, `step:${step}`),
      1,
    );
  }

  async getStats(workspaceId: string, formId: string) {
    const read = async (counter: string) =>
      Number(
        (await this.cacheStorage.get<number | string>(
          this.key(workspaceId, formId, counter),
        )) ?? 0,
      ) || 0;

    const stepReaches = await Promise.all(
      Array.from({ length: MAX_TRACKED_STEPS }, (_, step) =>
        read(`step:${step}`),
      ),
    );
    const lastReachedStep = stepReaches.reduce(
      (last, count, index) => (count > 0 ? index : last),
      -1,
    );

    return {
      views: await read('view'),
      starts: await read('start'),
      stepReaches: stepReaches.slice(0, lastReachedStep + 1),
    };
  }
}
