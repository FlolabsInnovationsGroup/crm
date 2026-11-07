'use strict';
// Builds CRM workspaces for the proof. Field metadata is written here once; the column
// names, Postgres types, enum names and the flat metadata maps all come from it through
// the CRM's real generateColumnDefinitions, so no column shape is typed by hand.
const OBJECT_REQUESTS = {
  generateColumnDefinitions:
    'src/engine/workspace-manager/workspace-migration/workspace-migration-runner/utils/generate-column-definitions.util',
  computePostgresEnumName:
    'src/engine/workspace-manager/workspace-migration/utils/compute-postgres-enum-name.util',
  getWorkspaceSchemaName:
    'src/engine/workspace-datasource/utils/get-workspace-schema-name.util',
  objectRecordDiffMerge:
    'src/engine/core-modules/event-emitter/utils/object-record-diff-merge',
  config: 'src/modules/analytics/constants/crm-analytics-config.constant',
};

const quoteIdentifier = (identifier) => `"${identifier.replace(/"/g, '""')}"`;
const quoteLiteral = (value) => `'${String(value).replace(/'/g, "''")}'`;

// Values the config does not know, to exercise the Unmapped paths.
const UNMAPPED_STAGE = 'LEGACY_TEST';
const UNMAPPED_POSITION = 'LEGACY_POSITION';
const SOURCE_VALUES = ['LINKEDIN', 'REFERRAL', 'WEBSITE', 'UNIVERSITY'];

const createCrmFactory = ({ loader, standardApplicationId, FieldMetadataType, RelationType }) => {
  const { generateColumnDefinitions } = loader.real(OBJECT_REQUESTS.generateColumnDefinitions);
  const { computePostgresEnumName } = loader.real(OBJECT_REQUESTS.computePostgresEnumName);
  const { getWorkspaceSchemaName } = loader.real(OBJECT_REQUESTS.getWorkspaceSchemaName);
  const { objectRecordDiffMerge } = loader.real(OBJECT_REQUESTS.objectRecordDiffMerge);
  const { CRM_ANALYTICS_CONFIG } = loader.real(OBJECT_REQUESTS.config);

  const stageValues = [
    ...CRM_ANALYTICS_CONFIG.stages.flatMap((stage) =>
      stage.rawValues.map(({ rawValue }) => rawValue),
    ),
    UNMAPPED_STAGE,
  ];
  const positionValues = [
    ...CRM_ANALYTICS_CONFIG.tracks.flatMap((track) => track.positions),
    UNMAPPED_POSITION,
  ];

  const buildOptions = (values) =>
    values.map((value, position) => ({ id: value, value, label: value, position, color: 'gray' }));

  const buildObject = ({ nameSingular, isStandard, fields }) => {
    const objectId = `${nameSingular}-object-id`;

    const flatFields = fields.map((field) => ({
      id: `${nameSingular}-${field.name}-id`,
      universalIdentifier: `${nameSingular}-${field.name}-uid`,
      objectMetadataId: objectId,
      isNullable: true,
      isAuditLogged: true,
      defaultValue: null,
      options: null,
      settings: null,
      ...field,
    }));

    return {
      flatObject: {
        id: objectId,
        universalIdentifier: `${nameSingular}-uid`,
        nameSingular,
        namePlural: `${nameSingular}Plural`,
        fieldIds: flatFields.map((field) => field.id),
        applicationUniversalIdentifier: isStandard
          ? standardApplicationId
          : 'custom-application-uid',
      },
      flatFields,
    };
  };

  const baseFields = () => [
    { name: 'id', type: FieldMetadataType.UUID, isNullable: false, defaultValue: 'uuid' },
    { name: 'createdAt', type: FieldMetadataType.DATE_TIME, isNullable: false, defaultValue: 'now' },
    { name: 'updatedAt', type: FieldMetadataType.DATE_TIME, isNullable: false, defaultValue: 'now' },
    { name: 'deletedAt', type: FieldMetadataType.DATE_TIME },
    { name: 'position', type: FieldMetadataType.POSITION },
  ];

  const manyToOne = (name) => ({
    name,
    type: FieldMetadataType.RELATION,
    settings: { relationType: RelationType.MANY_TO_ONE },
  });

  // personFields: 'FULL', 'NONE', 'WRONG_TYPE' or 'TEXT'. Application fields are the
  // ones setup-forms.mjs creates; a custom object also gets a nullable TEXT name.
  const buildObjects = ({ personFields, forms, withApplication, extraStageValues }) => {
    const applicantFieldsByKind = {
      FULL: [
        {
          name: 'stage',
          type: FieldMetadataType.SELECT,
          options: buildOptions([...new Set([...stageValues, ...extraStageValues])]),
        },
        {
          name: 'positionsAppliedFor',
          type: FieldMetadataType.MULTI_SELECT,
          options: buildOptions(positionValues),
        },
        {
          name: 'applicantSource',
          type: FieldMetadataType.SELECT,
          options: buildOptions(SOURCE_VALUES),
        },
      ],
      NONE: [],
      WRONG_TYPE: [
        { name: 'stage', type: FieldMetadataType.BOOLEAN },
        { name: 'positionsAppliedFor', type: FieldMetadataType.TEXT },
        { name: 'applicantSource', type: FieldMetadataType.NUMBER },
      ],
      TEXT: [
        { name: 'stage', type: FieldMetadataType.TEXT },
        { name: 'applicantSource', type: FieldMetadataType.TEXT },
      ],
    };

    const objects = [
      buildObject({
        nameSingular: 'person',
        isStandard: true,
        fields: [
          ...baseFields(),
          {
            name: 'name',
            type: FieldMetadataType.FULL_NAME,
            defaultValue: { firstName: "''", lastName: "''" },
          },
          { name: 'jobTitle', type: FieldMetadataType.TEXT, defaultValue: "''" },
          ...applicantFieldsByKind[personFields],
        ],
      }),
      buildObject({
        nameSingular: 'timelineActivity',
        isStandard: true,
        fields: [
          ...baseFields(),
          { name: 'happensAt', type: FieldMetadataType.DATE_TIME, isNullable: false, defaultValue: 'now' },
          { name: 'timelineActivityTypeId', type: FieldMetadataType.UUID },
          { name: 'timelineActivityTypeSnapshot', type: FieldMetadataType.RAW_JSON },
          { name: 'properties', type: FieldMetadataType.RAW_JSON },
          { name: 'linkedRecordCachedName', type: FieldMetadataType.TEXT },
          { name: 'linkedRecordId', type: FieldMetadataType.UUID },
          { name: 'linkedObjectMetadataId', type: FieldMetadataType.UUID },
          manyToOne('workspaceMember'),
          manyToOne('targetPerson'),
          manyToOne('targetOpportunity'),
        ],
      }),
    ];

    if (forms === 'FULL' || forms === 'HALF_BUILT') {
      objects.push(
        buildObject({
          nameSingular: 'crmForm',
          isStandard: false,
          fields: [
            ...baseFields(),
            { name: 'name', type: FieldMetadataType.TEXT },
            {
              name: 'status',
              type: FieldMetadataType.SELECT,
              options: buildOptions(['DRAFT', 'PUBLISHED']),
              defaultValue: "'DRAFT'",
            },
            { name: 'definition', type: FieldMetadataType.RAW_JSON },
          ],
        }),
        buildObject({
          nameSingular: 'formSubmission',
          isStandard: false,
          fields: [
            ...baseFields(),
            { name: 'name', type: FieldMetadataType.TEXT },
            { name: 'answers', type: FieldMetadataType.RAW_JSON },
            { name: 'sourceUrl', type: FieldMetadataType.TEXT },
            ...(forms === 'FULL'
              ? [
                  { name: 'submittedAt', type: FieldMetadataType.DATE_TIME },
                  manyToOne('form'),
                  manyToOne('person'),
                ]
              : []),
          ],
        }),
      );
    }

    if (withApplication) {
      objects.push(
        buildObject({
          nameSingular: 'application',
          isStandard: false,
          fields: [...baseFields(), { name: 'name', type: FieldMetadataType.TEXT }],
        }),
      );
    }

    return objects;
  };

  const buildFlatMaps = (objects) => {
    const flatObjectMetadataMaps = {
      byUniversalIdentifier: {},
      universalIdentifierById: {},
      universalIdentifiersByApplicationId: {},
    };
    const flatFieldMetadataMaps = {
      byUniversalIdentifier: {},
      universalIdentifierById: {},
      universalIdentifiersByApplicationId: {},
    };

    for (const { flatObject, flatFields } of objects) {
      flatObjectMetadataMaps.byUniversalIdentifier[flatObject.universalIdentifier] = flatObject;
      flatObjectMetadataMaps.universalIdentifierById[flatObject.id] = flatObject.universalIdentifier;

      for (const flatField of flatFields) {
        flatFieldMetadataMaps.byUniversalIdentifier[flatField.universalIdentifier] = flatField;
        flatFieldMetadataMaps.universalIdentifierById[flatField.id] = flatField.universalIdentifier;
      }
    }

    return { flatObjectMetadataMaps, flatFieldMetadataMaps };
  };

  const buildColumnSql = (definition) =>
    [
      quoteIdentifier(definition.name),
      definition.isArray ? `${definition.type}[]` : definition.type,
      definition.isNullable ? '' : 'NOT NULL',
      definition.default && definition.default !== 'NULL' ? `DEFAULT ${definition.default}` : '',
      definition.isPrimary ? 'PRIMARY KEY' : '',
    ]
      .filter(Boolean)
      .join(' ');

  const createWorkspace = async ({
    query,
    workspaceId,
    personFields = 'FULL',
    forms = 'FULL',
    withApplication = false,
    extraStageValues = [],
  }) => {
    const schemaName = getWorkspaceSchemaName(workspaceId);
    const objects = buildObjects({ personFields, forms, withApplication, extraStageValues });
    const statements = [`CREATE SCHEMA ${quoteIdentifier(schemaName)}`];

    for (const { flatObject, flatFields } of objects) {
      for (const flatField of flatFields) {
        if (
          flatField.type === FieldMetadataType.SELECT ||
          flatField.type === FieldMetadataType.MULTI_SELECT
        ) {
          const enumName = computePostgresEnumName({
            tableName: flatObject.applicationUniversalIdentifier === standardApplicationId
              ? flatObject.nameSingular
              : `_${flatObject.nameSingular}`,
            columnName: flatField.name,
          });

          statements.push(
            `CREATE TYPE ${quoteIdentifier(schemaName)}.${quoteIdentifier(enumName)} AS ENUM (${flatField.options
              .map(({ value }) => quoteLiteral(value))
              .join(', ')})`,
          );
        }
      }

      const columnsSql = flatFields
        .flatMap((flatFieldMetadata) =>
          generateColumnDefinitions({
            flatFieldMetadata,
            flatObjectMetadata: flatObject,
            workspaceId,
          }),
        )
        .map(buildColumnSql)
        .join(',\n  ');
      const tableName =
        flatObject.applicationUniversalIdentifier === standardApplicationId
          ? flatObject.nameSingular
          : `_${flatObject.nameSingular}`;

      statements.push(
        `CREATE TABLE ${quoteIdentifier(schemaName)}.${quoteIdentifier(tableName)} (\n  ${columnsSql}\n)`,
      );
    }

    for (const statement of statements) {
      await query(statement);
    }

    return {
      workspaceId,
      schemaName,
      personFields,
      flatMaps: buildFlatMaps(objects),
      vars: new Map(),
      table: (tableName) => `${quoteIdentifier(schemaName)}.${quoteIdentifier(tableName)}`,
    };
  };

  return {
    createWorkspace,
    objectRecordDiffMerge,
    stageValues,
    positionValues,
    getWorkspaceSchemaName,
    UNMAPPED_STAGE,
    UNMAPPED_POSITION,
  };
};

// Writes test rows straight into the CRM tables, which is what the CRM's own writes
// would leave behind. Nothing here reads analytics or holds analytics SQL.
const createFixtures = ({ query, workspace, objectRecordDiffMerge }) => {
  const personTable = workspace.table('person');
  const timelineTable = workspace.table('timelineActivity');
  const positionsEnum = `${quoteIdentifier(workspace.schemaName)}.${quoteIdentifier('person_positionsAppliedFor_enum')}`;

  const insertPerson = async ({
    firstName = 'Test',
    lastName = 'Person',
    stage = null,
    positions = null,
    source = null,
    createdAt,
    updatedAt,
    deletedAt = null,
  }) => {
    const rows = await query(
      `INSERT INTO ${personTable}
         ("nameFirstName", "nameLastName", stage, "positionsAppliedFor", "applicantSource", "createdAt", "updatedAt", "deletedAt")
       VALUES ($1, $2, $3, $4::text[]::${positionsEnum}[], $5, $6, $7, $8)
       RETURNING id`,
      [firstName, lastName, stage, positions, source, createdAt, updatedAt ?? createdAt, deletedAt],
    );

    return rows[0].id;
  };

  const insertStageChange = async ({
    personId,
    before,
    after,
    happensAt,
    updatedAt,
    linkedRecordId = null,
    extraDiff = {},
  }) => {
    const rows = await query(
      `INSERT INTO ${timelineTable}
         ("targetPersonId", "linkedRecordId", properties, "happensAt", "createdAt", "updatedAt")
       VALUES ($1, $2, $3::jsonb, $4, $4, $5)
       RETURNING id`,
      [
        personId,
        linkedRecordId,
        JSON.stringify({ diff: { stage: { before, after }, ...extraDiff } }),
        happensAt,
        updatedAt ?? happensAt,
      ],
    );

    return rows[0].id;
  };

  const insertTimelineRow = async ({ personId, properties, happensAt, updatedAt, linkedRecordId = null }) => {
    const rows = await query(
      `INSERT INTO ${timelineTable}
         ("targetPersonId", "linkedRecordId", properties, "happensAt", "createdAt", "updatedAt")
       VALUES ($1, $2, $3::jsonb, $4, $4, $5)
       RETURNING id`,
      [
        personId,
        linkedRecordId,
        properties === null ? null : JSON.stringify(properties),
        happensAt,
        updatedAt ?? happensAt,
      ],
    );

    return rows[0].id;
  };

  // What upsertTimelineActivities does to a recent row: the real diff merge writes the
  // same row, and updatedAt moves while happensAt stays.
  const mergeStageChange = async ({ rowId, after, updatedAt }) => {
    const [row] = await query(`SELECT properties FROM ${timelineTable} WHERE id = $1`, [rowId]);
    const merged = objectRecordDiffMerge(row.properties, {
      diff: { stage: { before: row.properties.diff.stage.after, after } },
    });

    await query(`UPDATE ${timelineTable} SET properties = $2::jsonb, "updatedAt" = $3 WHERE id = $1`, [
      rowId,
      JSON.stringify(merged),
      updatedAt,
    ]);
  };

  const setPersonStage = async ({ personId, stage, updatedAt }) => {
    await query(`UPDATE ${personTable} SET stage = $2, "updatedAt" = $3 WHERE id = $1`, [
      personId,
      stage,
      updatedAt,
    ]);
  };

  const softDeletePerson = async ({ personId, deletedAt }) => {
    await query(`UPDATE ${personTable} SET "deletedAt" = $2 WHERE id = $1`, [personId, deletedAt]);
  };

  const insertForm = async ({ name }) => {
    const rows = await query(
      `INSERT INTO ${workspace.table('_crmForm')} (name, status) VALUES ($1, 'PUBLISHED') RETURNING id`,
      [name],
    );

    return rows[0].id;
  };

  const insertSubmission = async ({ formId, personId, submittedAt, deletedAt = null }) => {
    const rows = await query(
      `INSERT INTO ${workspace.table('_formSubmission')} ("formId", "personId", "submittedAt", "deletedAt")
       VALUES ($1, $2, $3, $4) RETURNING id`,
      [formId, personId, submittedAt, deletedAt],
    );

    return rows[0].id;
  };

  return {
    insertPerson,
    insertStageChange,
    insertTimelineRow,
    mergeStageChange,
    setPersonStage,
    softDeletePerson,
    insertForm,
    insertSubmission,
  };
};

module.exports = { createCrmFactory, createFixtures, UNMAPPED_STAGE, UNMAPPED_POSITION };
