import { type CacheStorageService } from 'src/engine/core-modules/cache-storage/services/cache-storage.service';
import { PublicFormSubmissionDedupService } from 'src/modules/public-form/services/public-form-submission-dedup.service';

const createInMemoryCache = () => {
  const store = new Map<string, unknown>();

  return {
    store,
    cacheStorage: {
      setIfAbsent: jest.fn(async (key: string, value: unknown) => {
        if (store.has(key)) return false;
        store.set(key, value);

        return true;
      }),
      get: jest.fn(async (key: string) => store.get(key)),
      set: jest.fn(async (key: string, value: unknown) => {
        store.set(key, value);
      }),
      del: jest.fn(async (key: string) => {
        store.delete(key);
      }),
    } as unknown as CacheStorageService,
  };
};

const CLIENT_SUBMISSION_ID = '3f0c2b4e-8a51-4d1e-9a8b-0c6d1e2f3a4b';

describe('PublicFormSubmissionDedupService', () => {
  it('answers a retry with the first submission instead of submitting again', async () => {
    const { cacheStorage } = createInMemoryCache();
    const service = new PublicFormSubmissionDedupService(cacheStorage);
    const submit = jest
      .fn()
      .mockResolvedValue({ submissionId: 'submission-1' });
    const attempt = () =>
      service.submitOnce({
        workspaceId: 'workspace-1',
        formId: 'form-1',
        clientSubmissionId: CLIENT_SUBMISSION_ID,
        submit,
      });

    expect(await attempt()).toEqual({ submissionId: 'submission-1' });
    expect(await attempt()).toEqual({ submissionId: 'submission-1' });
    expect(submit).toHaveBeenCalledTimes(1);
  });

  it('lets the applicant try again after a failed submission', async () => {
    const { cacheStorage } = createInMemoryCache();
    const service = new PublicFormSubmissionDedupService(cacheStorage);
    const submit = jest
      .fn()
      .mockRejectedValueOnce(new Error('validation failed'))
      .mockResolvedValueOnce({ submissionId: 'submission-2' });
    const attempt = () =>
      service.submitOnce({
        workspaceId: 'workspace-1',
        formId: 'form-1',
        clientSubmissionId: CLIENT_SUBMISSION_ID,
        submit,
      });

    await expect(attempt()).rejects.toThrow('validation failed');
    expect(await attempt()).toEqual({ submissionId: 'submission-2' });
  });

  it('makes a retry wait for the first attempt that is still running', async () => {
    const { cacheStorage, store } = createInMemoryCache();
    const service = new PublicFormSubmissionDedupService(cacheStorage);
    const key = `client-submission:workspace-1:form-1:${CLIENT_SUBMISSION_ID}`;
    const submit = jest.fn();

    store.set(key, {});

    const result = service.submitOnce({
      workspaceId: 'workspace-1',
      formId: 'form-1',
      clientSubmissionId: CLIENT_SUBMISSION_ID,
      submit,
    });

    await jest.advanceTimersByTimeAsync(100);
    store.set(key, { submissionId: 'submission-4' });
    await jest.advanceTimersByTimeAsync(500);

    expect(await result).toEqual({ submissionId: 'submission-4' });
    expect(submit).not.toHaveBeenCalled();
  });

  it('submits the retry itself when the first attempt failed meanwhile', async () => {
    const { cacheStorage, store } = createInMemoryCache();
    const service = new PublicFormSubmissionDedupService(cacheStorage);
    const key = `client-submission:workspace-1:form-1:${CLIENT_SUBMISSION_ID}`;
    const submit = jest
      .fn()
      .mockResolvedValue({ submissionId: 'submission-5' });

    store.set(key, {});

    const result = service.submitOnce({
      workspaceId: 'workspace-1',
      formId: 'form-1',
      clientSubmissionId: CLIENT_SUBMISSION_ID,
      submit,
    });

    await jest.advanceTimersByTimeAsync(100);
    store.delete(key);
    await jest.advanceTimersByTimeAsync(500);

    expect(await result).toEqual({ submissionId: 'submission-5' });
    expect(submit).toHaveBeenCalledTimes(1);
  });

  it('keeps a stored submission when the cache write fails', async () => {
    const { cacheStorage } = createInMemoryCache();

    (cacheStorage.set as jest.Mock).mockRejectedValueOnce(new Error('down'));
    const service = new PublicFormSubmissionDedupService(cacheStorage);

    expect(
      await service.submitOnce({
        workspaceId: 'workspace-1',
        formId: 'form-1',
        clientSubmissionId: CLIENT_SUBMISSION_ID,
        submit: jest.fn().mockResolvedValue({ submissionId: 'submission-6' }),
      }),
    ).toEqual({ submissionId: 'submission-6' });
  });

  it('submits normally without a valid id', async () => {
    const { cacheStorage, store } = createInMemoryCache();
    const service = new PublicFormSubmissionDedupService(cacheStorage);
    const submit = jest
      .fn()
      .mockResolvedValue({ submissionId: 'submission-3' });

    await service.submitOnce({
      workspaceId: 'workspace-1',
      formId: 'form-1',
      clientSubmissionId: 'bad id!',
      submit,
    });

    expect(submit).toHaveBeenCalledTimes(1);
    expect(store.size).toBe(0);
  });
});
