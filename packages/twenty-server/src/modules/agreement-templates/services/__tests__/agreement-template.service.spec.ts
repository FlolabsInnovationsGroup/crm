import { Test } from '@nestjs/testing';

import { type WorkspaceAuthContext } from 'src/engine/core-modules/auth/types/workspace-auth-context.type';
import { AgreementTemplateService } from 'src/modules/agreement-templates/services/agreement-template.service';
import { WorkspaceOrmManager } from 'src/engine/twenty-orm/workspace-orm.manager';

const AUTH_CONTEXT = { type: 'user' } as unknown as WorkspaceAuthContext;

describe('AgreementTemplateService', () => {
  const templateRepository = { findOne: jest.fn() };
  const personRepository = { findOne: jest.fn() };
  const repositories: Record<string, unknown> = {
    agreementTemplate: templateRepository,
    person: personRepository,
  };
  const workspaceOrmManager = {
    executeInWorkspaceContext: jest.fn((callback: () => unknown) => callback()),
    getRepositoryWithContextPermissions: jest.fn(
      (name: string) => repositories[name],
    ),
  };

  let service: AgreementTemplateService;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module = await Test.createTestingModule({
      providers: [
        AgreementTemplateService,
        { provide: WorkspaceOrmManager, useValue: workspaceOrmManager },
      ],
    }).compile();

    service = module.get(AgreementTemplateService);
  });

  it('fills the template text for the person', async () => {
    templateRepository.findOne.mockResolvedValue({
      id: 'template-id',
      name: 'Full One-Time Payment',
      body: { markdown: 'Signed by {{fullName}} on {{date}}.' },
      isActive: true,
    });
    personRepository.findOne.mockResolvedValue({
      id: 'person-id',
      name: { firstName: 'Ada', lastName: 'Lovelace' },
      emails: null,
      city: null,
      state: null,
      country: null,
      candidateLocation: null,
      paymentPlan: null,
      paymentAgreedAmount: null,
    });

    expect(
      await service.preview({
        authContext: AUTH_CONTEXT,
        templateId: 'template-id',
        personId: 'person-id',
        today: new Date('2026-11-27T10:00:00Z'),
      }),
    ).toEqual({
      templateName: 'Full One-Time Payment',
      text: 'Signed by Ada Lovelace on 27 November 2026.',
      missingPlaceholders: [],
    });
  });

  it('reads with the caller permissions', async () => {
    templateRepository.findOne.mockResolvedValue(null);
    personRepository.findOne.mockResolvedValue(null);

    await service.preview({
      authContext: AUTH_CONTEXT,
      templateId: 'template-id',
      personId: 'person-id',
    });

    expect(workspaceOrmManager.executeInWorkspaceContext).toHaveBeenCalledWith(
      expect.any(Function),
      AUTH_CONTEXT,
    );
  });

  it('returns nothing when the person does not exist', async () => {
    templateRepository.findOne.mockResolvedValue({ id: 'template-id' });
    personRepository.findOne.mockResolvedValue(null);

    expect(
      await service.preview({
        authContext: AUTH_CONTEXT,
        templateId: 'template-id',
        personId: 'missing',
      }),
    ).toBeNull();
  });
});
