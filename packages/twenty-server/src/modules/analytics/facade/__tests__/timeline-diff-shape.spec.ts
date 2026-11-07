import { FieldMetadataType } from 'twenty-shared/types';

import { objectRecordChangedValues } from 'src/engine/core-modules/event-emitter/utils/object-record-changed-values';
import { type FlatEntityMaps } from 'src/engine/metadata-modules/flat-entity/types/flat-entity-maps.type';
import { getFlatFieldMetadataMock } from 'src/engine/metadata-modules/flat-field-metadata/__mocks__/get-flat-field-metadata.mock';
import { type FlatFieldMetadata } from 'src/engine/metadata-modules/flat-field-metadata/types/flat-field-metadata.type';
import { getFlatObjectMetadataMock } from 'src/engine/metadata-modules/flat-object-metadata/__mocks__/get-flat-object-metadata.mock';

const PERSON_ID = 'person-object-id';

const stageField = getFlatFieldMetadataMock({
  id: 'stage-field-id',
  universalIdentifier: 'stage-field-universal-identifier',
  objectMetadataId: PERSON_ID,
  name: 'stage',
  type: FieldMetadataType.SELECT,
});

const positionsField = getFlatFieldMetadataMock({
  id: 'positions-field-id',
  universalIdentifier: 'positions-field-universal-identifier',
  objectMetadataId: PERSON_ID,
  name: 'positionsAppliedFor',
  type: FieldMetadataType.MULTI_SELECT,
});

const flatPerson = getFlatObjectMetadataMock({
  id: PERSON_ID,
  universalIdentifier: 'person-object-universal-identifier',
  nameSingular: 'person',
  namePlural: 'people',
  fieldIds: [stageField.id, positionsField.id],
});

const flatFieldMetadataMaps: FlatEntityMaps<FlatFieldMetadata> = {
  byUniversalIdentifier: {
    [stageField.universalIdentifier]: stageField,
    [positionsField.universalIdentifier]: positionsField,
  },
  universalIdentifierById: {
    [stageField.id]: stageField.universalIdentifier,
    [positionsField.id]: positionsField.universalIdentifier,
  },
  universalIdentifiersByApplicationId: {},
};

// The analytics facade reads properties->'diff'->'stage'->>'before' and ->>'after'
// from timeline rows, so an upstream change to this shape must fail here first.
describe('timeline diff shape read by analytics', () => {
  it('yields before and after for a SELECT field', () => {
    expect(
      objectRecordChangedValues(
        { stage: 'NEW' },
        { stage: 'CONTACTED' },
        flatPerson,
        flatFieldMetadataMaps,
      ),
    ).toEqual({ stage: { before: 'NEW', after: 'CONTACTED' } });
  });

  it('yields arrays for a MULTI_SELECT field', () => {
    expect(
      objectRecordChangedValues(
        { positionsAppliedFor: ['FINANCE_INTERN'] },
        { positionsAppliedFor: ['FINANCE_INTERN', 'MARKETING_INTERN'] },
        flatPerson,
        flatFieldMetadataMaps,
      ),
    ).toEqual({
      positionsAppliedFor: {
        before: ['FINANCE_INTERN'],
        after: ['FINANCE_INTERN', 'MARKETING_INTERN'],
      },
    });
  });

  it('leaves unchanged fields and updatedAt out of the diff', () => {
    expect(
      objectRecordChangedValues(
        { stage: 'NEW', updatedAt: '2026-11-01T00:00:00.000Z' },
        { stage: 'NEW', updatedAt: '2026-11-02T00:00:00.000Z' },
        flatPerson,
        flatFieldMetadataMaps,
      ),
    ).toEqual({});
  });
});
