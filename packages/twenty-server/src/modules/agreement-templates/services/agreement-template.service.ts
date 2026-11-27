import { Injectable } from '@nestjs/common';

import { isDefined } from 'twenty-shared/utils';

import { type AgreementPreviewDTO } from 'src/modules/agreement-templates/dtos/agreement-preview.dto';
import {
  type AgreementPersonRecord,
  type AgreementTemplateRecord,
} from 'src/modules/agreement-templates/types/agreement-template-record.type';
import { fillAgreementTemplate } from 'src/modules/agreement-templates/utils/fill-agreement-template.util';
import { getAgreementValues } from 'src/modules/agreement-templates/utils/get-agreement-values.util';
import { type WorkspaceAuthContext } from 'src/engine/core-modules/auth/types/workspace-auth-context.type';
import { WorkspaceOrmManager } from 'src/engine/twenty-orm/workspace-orm.manager';

@Injectable()
export class AgreementTemplateService {
  constructor(private readonly workspaceOrmManager: WorkspaceOrmManager) {}

  // Reads with the caller's own permissions. Null when the template or the
  // person does not exist or is not visible to them.
  async preview({
    authContext,
    templateId,
    personId,
    today = new Date(),
  }: {
    authContext: WorkspaceAuthContext;
    templateId: string;
    personId: string;
    today?: Date;
  }): Promise<AgreementPreviewDTO | null> {
    return this.workspaceOrmManager.executeInWorkspaceContext(async () => {
      const [template, person] = await Promise.all([
        this.workspaceOrmManager
          .getRepositoryWithContextPermissions<AgreementTemplateRecord>(
            'agreementTemplate',
          )
          .findOne({ where: { id: templateId } }),
        this.workspaceOrmManager
          .getRepositoryWithContextPermissions<AgreementPersonRecord>('person')
          .findOne({ where: { id: personId } }),
      ]);

      if (!isDefined(template) || !isDefined(person)) {
        return null;
      }

      return {
        templateName: template.name,
        ...fillAgreementTemplate(
          template.body?.markdown ?? '',
          getAgreementValues(person, today),
        ),
      };
    }, authContext);
  }
}
