import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';

import { isNonEmptyString } from '@sniptt/guards';
import {
  FieldMetadataType,
  type FieldMetadataDefaultOption,
} from 'twenty-shared/types';
import {
  isDefined,
  PUBLIC_FORM_OBJECT_NAME,
  PUBLIC_FORM_SUBMISSION_OBJECT_NAME,
} from 'twenty-shared/utils';
import { WorkspaceActivationStatus } from 'twenty-shared/workspace';
import { Repository } from 'typeorm';

import { WorkspaceEntity } from 'src/engine/core-modules/workspace/workspace.entity';
import { WorkspaceManyOrAllFlatEntityMapsCacheService } from 'src/engine/metadata-modules/flat-entity/services/workspace-many-or-all-flat-entity-maps-cache.service';
import { findFlatEntityByIdInFlatEntityMaps } from 'src/engine/metadata-modules/flat-entity/utils/find-flat-entity-by-id-in-flat-entity-maps.util';
import { type FlatFieldMetadata } from 'src/engine/metadata-modules/flat-field-metadata/types/flat-field-metadata.type';
import { buildFieldMapsFromFlatObjectMetadata } from 'src/engine/metadata-modules/flat-field-metadata/utils/build-field-maps-from-flat-object-metadata.util';
import { type FlatObjectMetadata } from 'src/engine/metadata-modules/flat-object-metadata/types/flat-object-metadata.type';
import { getObjectMetadataIdByName } from 'src/engine/metadata-modules/flat-object-metadata/utils/get-object-metadata-id-by-name.util';
import { computeObjectTargetTable } from 'src/engine/utils/compute-object-target-table.util';
import { computeTableName } from 'src/engine/utils/compute-table-name.util';
import { getWorkspaceSchemaName } from 'src/engine/workspace-datasource/utils/get-workspace-schema-name.util';
import {
  escapeIdentifier,
  escapeLiteral,
} from 'src/engine/workspace-manager/workspace-migration/utils/remove-sql-injection.util';
import { CRM_ANALYTICS_CONFIG } from 'src/modules/analytics/constants/crm-analytics-config.constant';
import {
  type CrmAnalyticsCrmState,
  type CrmAnalyticsFieldOption,
  type CrmAnalyticsFieldStatus,
  type CrmAnalyticsSqlRunner,
} from 'src/modules/analytics/types/crm-analytics-crm-state.type';

const PERSON_OBJECT_NAME = 'person';
const TIMELINE_ACTIVITY_OBJECT_NAME = 'timelineActivity';

const STAGE_FIELD_NAME = 'stage';
const POSITIONS_FIELD_NAME = 'positionsAppliedFor';
const SOURCE_FIELD_NAME = 'applicantSource';

// setup-forms.mjs creates objects and fields in separate calls, so a half-built
// object can exist. The submission relation reads each of these fields.
const FORM_SUBMISSION_REQUIRED_FIELDS: Record<string, FieldMetadataType> = {
  submittedAt: FieldMetadataType.DATE_TIME,
  form: FieldMetadataType.RELATION,
  person: FieldMetadataType.RELATION,
};
const CRM_FORM_REQUIRED_FIELDS: Record<string, FieldMetadataType> = {
  name: FieldMetadataType.TEXT,
};

const DISPLAY_NAMES_LIMIT = 100;

// Standard objects keep their name; custom ones get the `_` prefix. The build
// methods are synchronous and take only the state, so the names are fixed here and
// getCrmState reports a custom object as absent when its metadata disagrees.
const PERSON_TABLE_NAME = computeTableName(PERSON_OBJECT_NAME, false);
const TIMELINE_ACTIVITY_TABLE_NAME = computeTableName(
  TIMELINE_ACTIVITY_OBJECT_NAME,
  false,
);
const FORM_SUBMISSION_TABLE_NAME = computeTableName(
  PUBLIC_FORM_SUBMISSION_OBJECT_NAME,
  true,
);
const CRM_FORM_TABLE_NAME = computeTableName(PUBLIC_FORM_OBJECT_NAME, true);
const APPLICATION_TABLE_NAME = computeTableName(
  CRM_ANALYTICS_CONFIG.applicationObjectNameSingular,
  true,
);

const SINGLE_VALUE_FIELD_TYPES: FieldMetadataType[] = [
  FieldMetadataType.SELECT,
  FieldMetadataType.TEXT,
];
const MULTIPLE_VALUE_FIELD_TYPES: FieldMetadataType[] = [
  FieldMetadataType.MULTI_SELECT,
];

const computeFieldStatus = (
  flatField: FlatFieldMetadata | undefined,
  acceptedFieldTypes: FieldMetadataType[],
): CrmAnalyticsFieldStatus => {
  if (!isDefined(flatField)) {
    return 'MISSING';
  }

  return acceptedFieldTypes.includes(flatField.type) ? 'OK' : 'WRONG_TYPE';
};

const computeFieldOptions = (
  flatField: FlatFieldMetadata | undefined,
  fieldStatus: CrmAnalyticsFieldStatus,
): CrmAnalyticsFieldOption[] => {
  if (fieldStatus !== 'OK') {
    return [];
  }

  const options: FieldMetadataDefaultOption[] = flatField?.options ?? [];

  return options.map(({ value, label }) => ({ value, label }));
};

const buildQualifiedTableSql = (
  workspaceId: string,
  tableName: string,
): string =>
  `${escapeIdentifier(getWorkspaceSchemaName(workspaceId))}.${escapeIdentifier(tableName)}`;

const buildSingleValueColumnSql = (
  fieldStatus: CrmAnalyticsFieldStatus,
  fieldName: string,
): string =>
  fieldStatus === 'OK'
    ? `p.${escapeIdentifier(fieldName)}::text`
    : 'NULL::text';

@Injectable()
export class CrmAnalyticsFacadeService {
  constructor(
    @InjectRepository(WorkspaceEntity)
    private readonly workspaceRepository: Repository<WorkspaceEntity>,
    private readonly workspaceManyOrAllFlatEntityMapsCacheService: WorkspaceManyOrAllFlatEntityMapsCacheService,
  ) {}

  async listActiveWorkspaceIds(): Promise<string[]> {
    const workspaces = await this.workspaceRepository.find({
      where: { activationStatus: WorkspaceActivationStatus.ACTIVE },
      select: ['id'],
      order: { id: 'ASC' },
    });

    return workspaces.map((workspace) => workspace.id);
  }

  async getCrmState(workspaceId: string): Promise<CrmAnalyticsCrmState> {
    const { flatObjectMetadataMaps, flatFieldMetadataMaps } =
      await this.workspaceManyOrAllFlatEntityMapsCacheService.getOrRecomputeManyOrAllFlatEntityMaps(
        {
          workspaceId,
          flatMapsKeys: ['flatObjectMetadataMaps', 'flatFieldMetadataMaps'],
        },
      );

    const findFlatObject = (
      objectName: string,
    ): FlatObjectMetadata | undefined => {
      const objectMetadataId = getObjectMetadataIdByName({
        flatObjectMetadataMaps,
        objectName,
      });

      return isDefined(objectMetadataId)
        ? findFlatEntityByIdInFlatEntityMaps({
            flatEntityId: objectMetadataId,
            flatEntityMaps: flatObjectMetadataMaps,
          })
        : undefined;
    };

    const isCustomObjectUsable = (
      flatObject: FlatObjectMetadata | undefined,
      tableName: string,
      requiredFields: Record<string, FieldMetadataType>,
    ): boolean => {
      if (
        !isDefined(flatObject) ||
        computeObjectTargetTable(flatObject) !== tableName
      ) {
        return false;
      }

      const { fieldIdByName } = buildFieldMapsFromFlatObjectMetadata(
        flatFieldMetadataMaps,
        flatObject,
      );

      return Object.entries(requiredFields).every(([fieldName, fieldType]) => {
        const fieldMetadataId = fieldIdByName[fieldName];

        return (
          isDefined(fieldMetadataId) &&
          findFlatEntityByIdInFlatEntityMaps({
            flatEntityId: fieldMetadataId,
            flatEntityMaps: flatFieldMetadataMaps,
          })?.type === fieldType
        );
      });
    };

    const flatPerson = findFlatObject(PERSON_OBJECT_NAME);

    const findPersonField = (
      fieldName: string,
    ): FlatFieldMetadata | undefined => {
      if (!isDefined(flatPerson)) {
        return undefined;
      }

      const fieldMetadataId = buildFieldMapsFromFlatObjectMetadata(
        flatFieldMetadataMaps,
        flatPerson,
      ).fieldIdByName[fieldName];

      return isDefined(fieldMetadataId)
        ? findFlatEntityByIdInFlatEntityMaps({
            flatEntityId: fieldMetadataId,
            flatEntityMaps: flatFieldMetadataMaps,
          })
        : undefined;
    };

    const stageField = findPersonField(STAGE_FIELD_NAME);
    const positionsField = findPersonField(POSITIONS_FIELD_NAME);
    const sourceField = findPersonField(SOURCE_FIELD_NAME);

    const stageStatus = computeFieldStatus(
      stageField,
      SINGLE_VALUE_FIELD_TYPES,
    );
    const positionsStatus = computeFieldStatus(
      positionsField,
      MULTIPLE_VALUE_FIELD_TYPES,
    );
    const sourceStatus = computeFieldStatus(
      sourceField,
      SINGLE_VALUE_FIELD_TYPES,
    );

    return {
      workspaceId,
      stage: {
        status: stageStatus,
        // Same rule as the timeline writer: a projection cached before the flag existed still logs.
        isAuditLogged:
          stageStatus === 'OK' && stageField?.isAuditLogged !== false,
        options: computeFieldOptions(stageField, stageStatus),
      },
      positionsAppliedFor: {
        status: positionsStatus,
        options: computeFieldOptions(positionsField, positionsStatus),
      },
      applicantSource: {
        status: sourceStatus,
        options: computeFieldOptions(sourceField, sourceStatus),
      },
      hasFormSubmissionObject:
        isCustomObjectUsable(
          findFlatObject(PUBLIC_FORM_SUBMISSION_OBJECT_NAME),
          FORM_SUBMISSION_TABLE_NAME,
          FORM_SUBMISSION_REQUIRED_FIELDS,
        ) &&
        isCustomObjectUsable(
          findFlatObject(PUBLIC_FORM_OBJECT_NAME),
          CRM_FORM_TABLE_NAME,
          CRM_FORM_REQUIRED_FIELDS,
        ),
      hasApplicationObject: isCustomObjectUsable(
        findFlatObject(CRM_ANALYTICS_CONFIG.applicationObjectNameSingular),
        APPLICATION_TABLE_NAME,
        {},
      ),
    };
  }

  buildPersonRelationSql(state: CrmAnalyticsCrmState): string {
    // NULL and empty both mean no position, so readers only handle the empty array.
    const positionsSql =
      state.positionsAppliedFor.status === 'OK'
        ? `COALESCE(p.${escapeIdentifier(POSITIONS_FIELD_NAME)}::text[], '{}'::text[])`
        : `'{}'::text[]`;

    return `SELECT p.id AS person_id, p."createdAt" AS created_at, p."updatedAt" AS updated_at,
       ${buildSingleValueColumnSql(state.stage.status, STAGE_FIELD_NAME)} AS raw_stage, ${positionsSql} AS positions, ${buildSingleValueColumnSql(state.applicantSource.status, SOURCE_FIELD_NAME)} AS source
FROM ${buildQualifiedTableSql(state.workspaceId, PERSON_TABLE_NAME)} p WHERE p."deletedAt" IS NULL`;
  }

  // linkedRecordId IS NULL excludes linked rows such as an opportunity's own stage.
  buildStageChangeRelationSql({
    state,
    updatedSinceParameter,
    happenedSinceParameter,
  }: {
    state: CrmAnalyticsCrmState;
    updatedSinceParameter: string;
    happenedSinceParameter: string;
  }): string {
    return `SELECT t.id, t."targetPersonId" AS person_id,
       t.properties->'diff'->'stage'->>'before' AS from_stage,
       t.properties->'diff'->'stage'->>'after' AS to_stage,
       t."happensAt" AS happened_at, t."updatedAt" AS source_updated_at
FROM ${buildQualifiedTableSql(state.workspaceId, TIMELINE_ACTIVITY_TABLE_NAME)} t
WHERE t."updatedAt" >= ${updatedSinceParameter} AND t."happensAt" >= ${happenedSinceParameter}
  AND t."targetPersonId" IS NOT NULL AND t."linkedRecordId" IS NULL
  AND t.properties->'diff' ? 'stage'`;
  }

  buildApplicationSubmissionRelationSql(
    state: CrmAnalyticsCrmState,
  ): string | null {
    if (!state.hasFormSubmissionObject) {
      return null;
    }

    const formNamesSql =
      CRM_ANALYTICS_CONFIG.applicationFormNames.map(escapeLiteral).join(', ');

    // A left join, because an application with no linked person still counts.
    return `SELECT s.id, s."personId" AS person_id, s."submittedAt" AS submitted_at
FROM ${buildQualifiedTableSql(state.workspaceId, FORM_SUBMISSION_TABLE_NAME)} s JOIN ${buildQualifiedTableSql(state.workspaceId, CRM_FORM_TABLE_NAME)} f ON f.id = s."formId"
LEFT JOIN ${buildQualifiedTableSql(state.workspaceId, PERSON_TABLE_NAME)} p ON p.id = s."personId"
WHERE s."deletedAt" IS NULL AND f."deletedAt" IS NULL AND f.name IN (${formNamesSql})
  AND (s."personId" IS NULL OR p."deletedAt" IS NULL)`;
  }

  async hasApplicationForm({
    state,
    run,
  }: {
    state: CrmAnalyticsCrmState;
    run: CrmAnalyticsSqlRunner;
  }): Promise<boolean> {
    if (!state.hasFormSubmissionObject) {
      return false;
    }

    const formNamesSql =
      CRM_ANALYTICS_CONFIG.applicationFormNames.map(escapeLiteral).join(', ');

    const rows = await run(
      `SELECT EXISTS (SELECT 1 FROM ${buildQualifiedTableSql(state.workspaceId, CRM_FORM_TABLE_NAME)} f WHERE f."deletedAt" IS NULL AND f.name IN (${formNamesSql})) AS has_form`,
      [],
    );

    return rows[0]?.has_form === true;
  }

  async countImportedApplications({
    state,
    run,
  }: {
    state: CrmAnalyticsCrmState;
    run: CrmAnalyticsSqlRunner;
  }): Promise<number | null> {
    if (!state.hasApplicationObject) {
      return null;
    }

    const rows = await run(
      `SELECT count(*)::int AS total FROM ${buildQualifiedTableSql(state.workspaceId, APPLICATION_TABLE_NAME)} a WHERE a."deletedAt" IS NULL`,
      [],
    );

    return Number(rows[0]?.total ?? 0);
  }

  // Names are read live and never stored in the analytics tables.
  async getPersonDisplayNames({
    state,
    personIds,
    run,
  }: {
    state: CrmAnalyticsCrmState;
    personIds: string[];
    run: CrmAnalyticsSqlRunner;
  }): Promise<Map<string, string>> {
    const cappedPersonIds = personIds.slice(0, DISPLAY_NAMES_LIMIT);

    if (cappedPersonIds.length === 0) {
      return new Map();
    }

    const rows = await run(
      `SELECT p.id, p."nameFirstName" AS first_name, p."nameLastName" AS last_name
FROM ${buildQualifiedTableSql(state.workspaceId, PERSON_TABLE_NAME)} p
WHERE p."deletedAt" IS NULL AND p.id = ANY($1::uuid[])`,
      [cappedPersonIds],
    );

    return new Map(
      rows.map((row) => [
        String(row.id),
        [row.first_name, row.last_name].filter(isNonEmptyString).join(' '),
      ]),
    );
  }
}
