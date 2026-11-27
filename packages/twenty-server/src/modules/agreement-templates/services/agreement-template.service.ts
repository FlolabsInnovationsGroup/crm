import { Injectable } from '@nestjs/common';

import { isDefined } from 'twenty-shared/utils';

import { type AgreementPreviewDTO } from 'src/modules/agreement-templates/dtos/agreement-preview.dto';
import {
  type AgreementPersonRecord,
  type AgreementTemplateRecord,
} from 'src/modules/agreement-templates/types/agreement-template-record.type';
import { fillAgreementTemplate } from 'src/modules/agreement-templates/utils/fill-agreement-template.util';
import { getAgreementValues } from 'src/modules/agreement-templates/utils/get-agreement-values.util';
import { WorkspaceOrmManager } from 'src/engine/twenty-orm/workspace-orm.manager';
import { buildSystemAuthContext } from 'src/engine/twenty-orm/utils/build-system-auth-context.util';

@Injectable()
export class AgreementTemplateService {
  constructor(private readonly workspaceOrmManager: WorkspaceOrmManager) {}

  // Null when the template or the person does not exist.
  async preview({
    workspaceId,
    templateId,
    personId,
    today = new Date(),
  }: {
    workspaceId: string;
    templateId: string;
    personId: string;
    today?: Date;
  }): Promise<AgreementPreviewDTO | null> {
    return this.workspaceOrmManager.executeInWorkspaceContext(async () => {
      const [template, person] = await Promise.all([
        this.workspaceOrmManager
          .getRepository<AgreementTemplateRecord>('agreementTemplate', {
            shouldBypassPermissionChecks: true,
          })
          .findOne({ where: { id: templateId } }),
        this.workspaceOrmManager
          .getRepository<AgreementPersonRecord>('person', {
            shouldBypassPermissionChecks: true,
          })
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
    }, buildSystemAuthContext(workspaceId));
  }
}
