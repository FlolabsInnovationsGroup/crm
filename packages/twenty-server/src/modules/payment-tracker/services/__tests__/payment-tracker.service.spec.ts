import { Test } from '@nestjs/testing';

import { WorkspaceOrmManager } from 'src/engine/twenty-orm/workspace-orm.manager';
import { PaymentTrackerService } from 'src/modules/payment-tracker/services/payment-tracker.service';
import { type RecordedPayment } from 'src/modules/payment-tracker/types/recorded-payment.type';

const PAYMENT: RecordedPayment = {
  stripePaymentIntentId: 'pi_1',
  amountMicros: 100_000_000,
  refundedAmountMicros: 0,
  currencyCode: 'USD',
  paidAt: new Date('2026-11-20T10:00:00Z'),
  status: 'SUCCEEDED',
  payerEmail: 'jane@example.com',
  stripeCustomerId: 'cus_1',
  description: null,
};

describe('PaymentTrackerService', () => {
  const paymentRepository = {
    findOne: jest.fn(),
    find: jest.fn(),
    insert: jest.fn(),
    update: jest.fn(),
  };
  const personQueryBuilder = {
    where: jest.fn(),
    orWhere: jest.fn(),
    andWhere: jest.fn(),
    withDeleted: jest.fn(),
    orderBy: jest.fn(),
    getMany: jest.fn(),
  };
  const personRepository = {
    createQueryBuilder: jest.fn(() => personQueryBuilder),
    find: jest.fn(),
    update: jest.fn(),
  };
  const workspaceOrmManager = {
    executeInWorkspaceContext: jest.fn((callback: () => unknown) => callback()),
    getRepository: jest.fn((name: string) =>
      name === 'person' ? personRepository : paymentRepository,
    ),
  };

  let service: PaymentTrackerService;

  beforeEach(async () => {
    jest.clearAllMocks();

    for (const method of [
      'where',
      'orWhere',
      'andWhere',
      'withDeleted',
      'orderBy',
    ] as const) {
      personQueryBuilder[method].mockReturnValue(personQueryBuilder);
    }

    const module = await Test.createTestingModule({
      providers: [
        PaymentTrackerService,
        { provide: WorkspaceOrmManager, useValue: workspaceOrmManager },
      ],
    }).compile();

    service = module.get(PaymentTrackerService);
  });

  it('links a new payment to the live person with the payer email', async () => {
    paymentRepository.findOne.mockResolvedValue(null);
    personQueryBuilder.getMany.mockResolvedValue([
      { id: 'deleted-person', deletedAt: '2026-01-01' },
      { id: 'live-person', deletedAt: null },
    ]);

    const result = await service.recordPayment('workspace-id', PAYMENT);

    expect(result).toEqual({ isNew: true, personId: 'live-person' });
    expect(paymentRepository.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        personId: 'live-person',
        stripePaymentIntentId: 'pi_1',
        amount: { amountMicros: 100_000_000, currencyCode: 'USD' },
      }),
    );
  });

  it('keeps the person someone linked by hand', async () => {
    paymentRepository.findOne.mockResolvedValue({
      id: 'payment-id',
      personId: 'linked-by-hand',
      deletedAt: null,
    });

    await service.recordPayment('workspace-id', PAYMENT);

    expect(personQueryBuilder.getMany).not.toHaveBeenCalled();
    expect(paymentRepository.update).toHaveBeenCalledWith(
      'payment-id',
      expect.objectContaining({ personId: 'linked-by-hand' }),
    );
  });

  it('does not bring back a payment someone deleted', async () => {
    paymentRepository.findOne.mockResolvedValue({
      id: 'payment-id',
      personId: 'person',
      deletedAt: '2026-11-21',
    });

    await service.recordPayment('workspace-id', PAYMENT);

    expect(paymentRepository.update).not.toHaveBeenCalled();
    expect(paymentRepository.insert).not.toHaveBeenCalled();
  });

  it('clears paid and remaining for a person left with no payments', async () => {
    personRepository.find.mockResolvedValue([
      { id: 'person', paymentPlan: 'CUSTOM', paymentAgreedAmount: null },
    ]);
    paymentRepository.find.mockResolvedValue([]);

    await service.recalculatePeopleInWorkspace('workspace-id', ['person']);

    expect(personRepository.find).toHaveBeenCalledWith({
      where: { id: expect.anything() },
    });
    expect(personRepository.update).toHaveBeenCalledWith(
      'person',
      expect.objectContaining({
        paymentStatus: 'NOT_PAID',
        paymentPaidAmount: { amountMicros: null, currencyCode: '' },
        paymentRemainingAmount: { amountMicros: null, currencyCode: '' },
        paymentInstallmentCount: 0,
      }),
    );
  });

  it('works out the remaining amount of a custom plan', async () => {
    personRepository.find.mockResolvedValue([
      {
        id: 'person',
        paymentPlan: 'CUSTOM',
        paymentAgreedAmount: { amountMicros: 300_000_000, currencyCode: 'USD' },
      },
    ]);
    paymentRepository.find.mockResolvedValue([
      {
        personId: 'person',
        paidAt: '2026-11-20T10:00:00Z',
        amount: { amountMicros: 100_000_000, currencyCode: 'USD' },
        refundedAmount: { amountMicros: 0, currencyCode: 'USD' },
      },
    ]);

    await service.recalculatePeopleInWorkspace('workspace-id', ['person']);

    expect(personRepository.update).toHaveBeenCalledWith(
      'person',
      expect.objectContaining({
        paymentStatus: 'PAYING_INSTALLMENTS',
        paymentPaidAmount: { amountMicros: 100_000_000, currencyCode: 'USD' },
        paymentRemainingAmount: {
          amountMicros: 200_000_000,
          currencyCode: 'USD',
        },
      }),
    );
  });
});
