import { Test } from '@nestjs/testing';

import { WorkspaceOrmManager } from 'src/engine/twenty-orm/workspace-orm.manager';
import { type RecordManualReviewAnswerInput } from 'src/modules/manual-review-answers/dtos/record-manual-review-answer.input';
import { ManualReviewAnswerService } from 'src/modules/manual-review-answers/services/manual-review-answer.service';

const getMany = jest.fn();

jest.mock(
  'src/modules/match-participant/utils/add-person-email-filters-to-query-builder',
  () => ({
    addPersonEmailFiltersToQueryBuilder: () => ({
      orderBy: () => ({ getMany }),
    }),
  }),
);

const REVIEW_THREAD_ID = '6c784d2f-f69f-4b49-8ad4-e84b2a8c9ac4';

const input = (
  overrides: Partial<RecordManualReviewAnswerInput> = {},
): RecordManualReviewAnswerInput => ({
  reviewThreadId: REVIEW_THREAD_ID,
  applicantEmail: ' Ada@Example.com ',
  question: 'Is the internship paid?\nAnd when does it start?',
  answer: 'Hi Ada, it is unpaid and starts on Monday.',
  category: 'question',
  templateName: 'Paid or unpaid',
  source: 'REPLY_FROM_CARD',
  ...overrides,
});

const answeredBy = { workspaceMemberId: 'member-id', name: 'Nago Ijoma' };

describe('ManualReviewAnswerService', () => {
  const answerRepository = {
    findOne: jest.fn(),
    insert: jest.fn(),
    update: jest.fn(),
  };
  const workspaceOrmManager = {
    executeInWorkspaceContext: jest.fn((callback: () => unknown) => callback()),
    getRepository: jest.fn((name: string) =>
      name === 'manualReviewAnswer'
        ? answerRepository
        : { createQueryBuilder: jest.fn() },
    ),
  };

  let service: ManualReviewAnswerService;

  beforeEach(async () => {
    jest.clearAllMocks();
    getMany.mockResolvedValue([{ id: 'ada', deletedAt: null }]);

    const module = await Test.createTestingModule({
      providers: [
        ManualReviewAnswerService,
        { provide: WorkspaceOrmManager, useValue: workspaceOrmManager },
      ],
    }).compile();

    service = module.get(ManualReviewAnswerService);
  });

  it('saves the question and the answer for the person, by who answered', async () => {
    answerRepository.findOne.mockResolvedValue(null);

    await service.recordAnswer({
      workspaceId: 'workspace-id',
      answeredBy,
      input: input(),
    });

    expect(answerRepository.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        reviewThreadId: REVIEW_THREAD_ID,
        name: 'Is the internship paid? And when does it start?',
        question: 'Is the internship paid?\nAnd when does it start?',
        answer: 'Hi Ada, it is unpaid and starts on Monday.',
        applicantEmail: 'ada@example.com',
        templateName: 'Paid or unpaid',
        source: 'REPLY_FROM_CARD',
        personId: 'ada',
        createdBy: expect.objectContaining({
          workspaceMemberId: 'member-id',
          name: 'Nago Ijoma',
        }),
      }),
    );
  });

  it('keeps the answer sent from the card when Done is pressed later', async () => {
    answerRepository.findOne.mockResolvedValue({
      id: 'existing',
      reviewThreadId: REVIEW_THREAD_ID,
      answer: 'Hi Ada, it is unpaid.',
      personId: 'linked-by-hand',
      deletedAt: null,
    });

    await service.recordAnswer({
      workspaceId: 'workspace-id',
      answeredBy,
      input: input({ answer: null, source: 'MARKED_DONE' }),
    });

    const [, values] = answerRepository.update.mock.calls[0];

    expect(values).not.toHaveProperty('answer');
    expect(values).toEqual(
      expect.objectContaining({
        personId: 'linked-by-hand',
        source: 'MARKED_DONE',
      }),
    );
    expect(getMany).not.toHaveBeenCalled();
  });

  it('does not bring back a row someone deleted', async () => {
    answerRepository.findOne.mockResolvedValue({
      id: 'existing',
      reviewThreadId: REVIEW_THREAD_ID,
      answer: null,
      personId: null,
      deletedAt: new Date('2026-11-27T00:00:00Z'),
    });

    await service.recordAnswer({
      workspaceId: 'workspace-id',
      answeredBy,
      input: input(),
    });

    expect(answerRepository.insert).not.toHaveBeenCalled();
    expect(answerRepository.update).not.toHaveBeenCalled();
  });
});
