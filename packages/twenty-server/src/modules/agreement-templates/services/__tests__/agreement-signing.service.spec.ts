import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';

import { type WorkspaceAuthContext } from 'src/engine/core-modules/auth/types/workspace-auth-context.type';
import { FilesFieldService } from 'src/engine/core-modules/file/files-field/services/files-field.service';
import { SendEmailTool } from 'src/engine/core-modules/tool/tools/email-tool/send-email-tool';
import { TwentyConfigService } from 'src/engine/core-modules/twenty-config/twenty-config.service';
import { ConnectedAccountEntity } from 'src/engine/metadata-modules/connected-account/entities/connected-account.entity';
import { WorkspaceOrmManager } from 'src/engine/twenty-orm/workspace-orm.manager';
import {
  AgreementSigningError,
  AgreementSigningService,
} from 'src/modules/agreement-templates/services/agreement-signing.service';
import { DocumensoApiService } from 'src/modules/agreement-templates/services/documenso-api.service';
import { type DocumensoEnvelope } from 'src/modules/agreement-templates/types/documenso-envelope.type';

jest.mock(
  'src/modules/agreement-templates/utils/render-agreement-pdf.util',
  () => ({
    renderAgreementPdf: jest.fn(async ({ title }: { title: string }) => ({
      pdf: Buffer.from(`%PDF ${title}`),
      signaturePage: 2,
    })),
  }),
);

const WORKSPACE_ID = '20202020-0000-4000-8000-000000000001';
const USER_CONTEXT = {
  type: 'user',
  workspace: { id: WORKSPACE_ID },
  workspaceMemberId: 'member-id',
  workspaceMember: { name: { firstName: 'Mo', lastName: 'Ops' } },
} as unknown as WorkspaceAuthContext;

const PERSON = {
  id: 'person-id',
  name: { firstName: 'Ada', lastName: 'Lovelace' },
  emails: { primaryEmail: 'Ada@Example.com' },
  city: 'London',
  state: null,
  country: 'UK',
  candidateLocation: null,
  paymentPlan: 'FULL_ONE_TIME',
  paymentAgreedAmount: null,
};

const TEMPLATE = {
  id: 'template-id',
  name: 'Internship agreement',
  body: { markdown: 'Between FloLabs and {{fullName}} of {{address}}.' },
  isActive: true,
};

const REQUEST = {
  id: 'request-id',
  name: 'Internship agreement: Ada Lovelace',
  personId: 'person-id',
  status: 'SENT',
  documents: 'Internship agreement',
  documensoEnvelopeId: 'envelope_1',
  sentAt: '2026-11-27T10:00:00.000Z',
  applicantSignedAt: null,
  countersignerEmailedAt: null,
  completedAt: null,
  signedFilesSavedAt: null,
};

const envelope = (
  overrides: Partial<DocumensoEnvelope> = {},
  applicantStatus: 'NOT_SIGNED' | 'SIGNED' = 'SIGNED',
): DocumensoEnvelope => ({
  id: 'envelope_1',
  externalId: 'request-id',
  status: 'PENDING',
  completedAt: null,
  recipients: [
    {
      id: 1,
      email: 'ada@example.com',
      name: 'Ada Lovelace',
      token: 'applicant-token',
      signingOrder: 1,
      signingStatus: applicantStatus,
      signedAt:
        applicantStatus === 'SIGNED' ? '2026-11-28T09:00:00.000Z' : null,
    },
    {
      id: 2,
      email: 'john@flolabs.test',
      name: 'John',
      token: 'john-token',
      signingOrder: 2,
      signingStatus: 'NOT_SIGNED',
      signedAt: null,
    },
  ],
  envelopeItems: [
    { id: 'item_1', title: 'Internship agreement.pdf', order: 1 },
  ],
  ...overrides,
});

describe('AgreementSigningService', () => {
  const templateRepository = { find: jest.fn() };
  const personRepository = { findOne: jest.fn() };
  const requestRepository = {
    insert: jest.fn(),
    findOne: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  };
  const attachmentRepository = { insert: jest.fn() };
  const repositories: Record<string, unknown> = {
    agreementTemplate: templateRepository,
    person: personRepository,
    agreementRequest: requestRepository,
    attachment: attachmentRepository,
  };
  const workspaceOrmManager = {
    executeInWorkspaceContext: jest.fn((callback: () => unknown) => callback()),
    getRepositoryWithContextPermissions: jest.fn(
      (name: string) => repositories[name],
    ),
    getRepository: jest.fn((name: string) => repositories[name]),
  };
  const documensoApiService = {
    createEnvelope: jest.fn(),
    distribute: jest.fn(),
    getEnvelope: jest.fn(),
    deleteEnvelope: jest.fn(),
    downloadSignedItem: jest.fn(),
    downloadCertificate: jest.fn(),
  };
  const sendEmailTool = { execute: jest.fn() };
  const filesFieldService = { uploadFile: jest.fn() };
  const connectedAccountRepository = { findOne: jest.fn() };

  let service: AgreementSigningService;
  const originalEnv = process.env;

  beforeEach(async () => {
    jest.clearAllMocks();
    process.env = {
      ...originalEnv,
      FLOLABS_WORKSPACE_ID: WORKSPACE_ID,
      FLOLABS_DOCUMENSO_API_TOKEN: 'api_test',
      FLOLABS_AGREEMENT_COUNTERSIGNER_EMAIL: 'John@FloLabs.test',
      FLOLABS_AGREEMENT_COUNTERSIGNER_NAME: 'John',
    };

    connectedAccountRepository.findOne.mockResolvedValue({ id: 'hr-account' });
    sendEmailTool.execute.mockResolvedValue({ success: true, message: 'ok' });
    requestRepository.update.mockResolvedValue({ affected: 1 });
    personRepository.findOne.mockResolvedValue(PERSON);

    const module = await Test.createTestingModule({
      providers: [
        AgreementSigningService,
        { provide: WorkspaceOrmManager, useValue: workspaceOrmManager },
        { provide: DocumensoApiService, useValue: documensoApiService },
        { provide: SendEmailTool, useValue: sendEmailTool },
        { provide: FilesFieldService, useValue: filesFieldService },
        {
          provide: TwentyConfigService,
          useValue: { get: () => 'https://crm.test' },
        },
        {
          provide: getRepositoryToken(ConnectedAccountEntity),
          useValue: connectedAccountRepository,
        },
      ],
    }).compile();

    service = module.get(AgreementSigningService);
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  describe('sendAgreement', () => {
    it('sends the intern a link and waits for FloLabs to sign second', async () => {
      templateRepository.find.mockResolvedValue([TEMPLATE]);
      documensoApiService.createEnvelope.mockResolvedValue('envelope_1');
      documensoApiService.distribute.mockResolvedValue([
        { email: 'ada@example.com', signingUrl: 'https://sign.test/sign/abc' },
        {
          email: 'john@flolabs.test',
          signingUrl: 'https://sign.test/sign/def',
        },
      ]);

      const result = await service.sendAgreement({
        authContext: USER_CONTEXT,
        workspaceId: WORKSPACE_ID,
        personId: 'person-id',
        templateIds: ['template-id'],
      });

      const [, created] = documensoApiService.createEnvelope.mock.calls[0];

      expect(created.externalId).toBe(result.agreementRequestId);
      expect(
        created.recipients.map(
          ({
            email,
            signingOrder,
          }: {
            email: string;
            signingOrder: number;
          }) => [email, signingOrder],
        ),
      ).toEqual([
        ['Ada@Example.com', 1],
        ['john@flolabs.test', 2],
      ]);
      expect(created.recipients[0].fields[0]).toMatchObject({
        type: 'SIGNATURE',
        page: 2,
        identifier: 0,
      });
      expect(requestRepository.update).toHaveBeenCalledWith(
        result.agreementRequestId,
        expect.objectContaining({ documensoEnvelopeId: 'envelope_1' }),
      );

      const [email] = sendEmailTool.execute.mock.calls[0];

      expect(email.recipients.to).toBe('Ada@Example.com');
      expect(email.connectedAccountId).toBe('hr-account');
      expect(email.body).toContain('https://sign.test/sign/abc');
      expect(email.body).not.toContain('sign/def');
      expect(result).toMatchObject({ emailSent: true, emailError: null });
    });

    it('refuses a template with placeholders the person cannot fill', async () => {
      templateRepository.find.mockResolvedValue([
        { ...TEMPLATE, body: { markdown: 'Fee: {{agreedAmount}}' } },
      ]);

      await expect(
        service.sendAgreement({
          authContext: USER_CONTEXT,
          workspaceId: WORKSPACE_ID,
          personId: 'person-id',
          templateIds: ['template-id'],
        }),
      ).rejects.toThrow('{{agreedAmount}}');
      expect(requestRepository.insert).not.toHaveBeenCalled();
      expect(documensoApiService.createEnvelope).not.toHaveBeenCalled();
    });

    it('removes the envelope and the request when Documenso fails', async () => {
      templateRepository.find.mockResolvedValue([TEMPLATE]);
      documensoApiService.createEnvelope.mockResolvedValue('envelope_1');
      documensoApiService.distribute.mockRejectedValue(new Error('down'));
      documensoApiService.deleteEnvelope.mockResolvedValue(undefined);
      requestRepository.delete.mockResolvedValue(undefined);

      await expect(
        service.sendAgreement({
          authContext: USER_CONTEXT,
          workspaceId: WORKSPACE_ID,
          personId: 'person-id',
          templateIds: ['template-id'],
        }),
      ).rejects.toThrow('down');
      expect(documensoApiService.deleteEnvelope).toHaveBeenCalledWith(
        expect.anything(),
        'envelope_1',
      );
      expect(requestRepository.delete).toHaveBeenCalled();
      expect(sendEmailTool.execute).not.toHaveBeenCalled();
    });

    it('is refused in another workspace', async () => {
      await expect(
        service.sendAgreement({
          authContext: USER_CONTEXT,
          workspaceId: 'another-workspace',
          personId: 'person-id',
          templateIds: ['template-id'],
        }),
      ).rejects.toBeInstanceOf(AgreementSigningError);
    });
  });

  describe('syncEnvelope', () => {
    it('emails the FloLabs signer once the intern has signed', async () => {
      requestRepository.findOne.mockResolvedValue(REQUEST);
      documensoApiService.getEnvelope.mockResolvedValue(envelope());

      await service.syncEnvelope('envelope_1');

      expect(requestRepository.update).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'request-id' }),
        expect.objectContaining({ status: 'APPLICANT_SIGNED' }),
      );

      const [email] = sendEmailTool.execute.mock.calls[0];

      expect(email.recipients.to).toBe('john@flolabs.test');
      expect(email.body).toContain(
        'https://sign.flolabsinnovations.com/sign/john-token',
      );
    });

    it('does not email again when another call already claimed it', async () => {
      requestRepository.findOne.mockResolvedValue(REQUEST);
      requestRepository.update.mockResolvedValueOnce({ affected: 0 });
      documensoApiService.getEnvelope.mockResolvedValue(envelope());

      await service.syncEnvelope('envelope_1');

      expect(sendEmailTool.execute).not.toHaveBeenCalled();
    });

    it('attaches the signed files and the certificate when complete', async () => {
      requestRepository.findOne.mockResolvedValue({
        ...REQUEST,
        countersignerEmailedAt: '2026-11-28T09:01:00.000Z',
      });
      documensoApiService.getEnvelope.mockResolvedValue(
        envelope({
          status: 'COMPLETED',
          completedAt: '2026-11-29T10:00:00.000Z',
        }),
      );
      documensoApiService.downloadSignedItem.mockResolvedValue(
        Buffer.from('%PDF signed'),
      );
      documensoApiService.downloadCertificate.mockResolvedValue(
        Buffer.from('%PDF certificate'),
      );
      filesFieldService.uploadFile
        .mockResolvedValueOnce({ id: '20202020-0000-4000-8000-0000000000a1' })
        .mockResolvedValueOnce({ id: '20202020-0000-4000-8000-0000000000a2' });

      await service.syncEnvelope('envelope_1');

      expect(
        attachmentRepository.insert.mock.calls.map(([attachment]) => [
          attachment.name,
          attachment.targetPersonId,
        ]),
      ).toEqual([
        ['Signed - Internship agreement.pdf', 'person-id'],
        ['Signing certificate.pdf', 'person-id'],
      ]);
      expect(requestRepository.update).toHaveBeenCalledWith(
        'request-id',
        expect.objectContaining({
          status: 'COMPLETED',
          completedAt: '2026-11-29T10:00:00.000Z',
        }),
      );

      const [email] = sendEmailTool.execute.mock.calls[0];

      expect(email.recipients.to).toBe('ada@example.com');
      expect(email.files).toHaveLength(2);
    });

    it('releases the claim when saving the files fails', async () => {
      requestRepository.findOne.mockResolvedValue({
        ...REQUEST,
        countersignerEmailedAt: '2026-11-28T09:01:00.000Z',
      });
      documensoApiService.getEnvelope.mockResolvedValue(
        envelope({ status: 'COMPLETED' }),
      );
      documensoApiService.downloadSignedItem.mockRejectedValue(
        new Error('500'),
      );
      documensoApiService.downloadCertificate.mockResolvedValue(
        Buffer.from(''),
      );

      await expect(service.syncEnvelope('envelope_1')).rejects.toThrow('500');
      expect(requestRepository.update).toHaveBeenLastCalledWith('request-id', {
        signedFilesSavedAt: null,
      });
    });

    it('ignores an envelope that belongs to another request', async () => {
      requestRepository.findOne.mockResolvedValue(REQUEST);
      documensoApiService.getEnvelope.mockResolvedValue(
        envelope({ externalId: 'someone-else' }),
      );

      await expect(service.syncEnvelope('envelope_1')).rejects.toThrow(
        'does not belong',
      );
      expect(requestRepository.update).not.toHaveBeenCalled();
    });
  });
});
