import { readFileSync } from 'fs';
import { resolve } from 'path';

import { isDefined } from 'twenty-shared/utils';

import { CRM_ANALYTICS_CONFIG } from 'src/modules/analytics/constants/crm-analytics-config.constant';

const INTERNSHIP_FORM_PATH = resolve(
  __dirname,
  '../../../../../../twenty-utils/flolabs/forms/internship-application.json',
);

type InternshipForm = {
  fields: { id: string; options?: { value: string }[] }[];
};

describe('CRM_ANALYTICS_CONFIG', () => {
  const { stages, tracks } = CRM_ANALYTICS_CONFIG;

  const rankedStages = stages
    .filter((stage) => isDefined(stage.rank))
    .sort((first, second) => (first.rank ?? 0) - (second.rank ?? 0));

  const lastRankedStage = rankedStages[rankedStages.length - 1];

  it('numbers the funnel ranks without gaps from 0', () => {
    expect(rankedStages.map((stage) => stage.rank)).toEqual(
      rankedStages.map((_stage, index) => index),
    );
  });

  it('only ranks main stages, and ranks all of them', () => {
    expect(rankedStages.map((stage) => stage.stageKey)).toEqual(
      stages
        .filter((stage) => stage.kind === 'MAIN')
        .map((stage) => stage.stageKey),
    );
  });

  it('enters the funnel at NEW', () => {
    expect(rankedStages[0].stageKey).toBe('NEW');
  });

  it('has one success stage, last in the funnel', () => {
    const successStages = stages.filter((stage) => stage.isSuccess);

    expect(successStages).toEqual([lastRankedStage]);
    expect(lastRankedStage.stageKey).toBe('SIGNED');
  });

  it('gives stage keys and raw values no duplicates', () => {
    const stageKeys = stages.map((stage) => stage.stageKey);
    const rawValues = stages.flatMap((stage) =>
      stage.rawValues.map(({ rawValue }) => rawValue),
    );

    expect(new Set(stageKeys).size).toBe(stageKeys.length);
    expect(new Set(rawValues).size).toBe(rawValues.length);
  });

  it('maps every stage to at least one raw value', () => {
    for (const stage of stages) {
      expect(stage.rawValues.length).toBeGreaterThan(0);
    }
  });

  it('counts Signed Paid and Signed Non paid as one stage', () => {
    expect(lastRankedStage.rawValues.map(({ rawValue }) => rawValue)).toEqual([
      'SIGNED_PAID',
      'SIGNED_NON_PAID',
    ]);
  });

  it('labels stages with their key in sentence case', () => {
    for (const { stageKey, label } of stages) {
      const words = stageKey.replace(/_/g, ' ').toLowerCase();

      expect(label).toBe(`${words.charAt(0).toUpperCase()}${words.slice(1)}`);
    }
  });

  it('sets the stuck limit on every main stage except success', () => {
    for (const { kind, isSuccess, limitDays } of stages) {
      expect(limitDays).toBe(kind === 'MAIN' && !isSuccess ? 14 : null);
    }
  });

  it('sets the step window on every ranked stage except the last', () => {
    for (const stage of stages) {
      const hasNextStep = isDefined(stage.rank) && stage !== lastRankedStage;

      expect(stage.windowDays).toBe(hasNextStep ? 14 : null);
    }
  });

  it('assigns 39 positions once each to 5 tracks', () => {
    const positions = tracks.flatMap((track) => track.positions);

    expect(tracks).toHaveLength(5);
    expect(positions).toHaveLength(39);
    expect(new Set(positions).size).toBe(39);
  });

  it('uses the position values of the internship form', () => {
    const internshipForm = JSON.parse(
      readFileSync(INTERNSHIP_FORM_PATH, 'utf8'),
    ) as InternshipForm;
    const formPositions = (
      internshipForm.fields.find((field) => field.id === 'positions')?.options ??
      []
    ).map(({ value }) => value);

    expect(tracks.flatMap((track) => track.positions).sort()).toEqual(
      formPositions.sort(),
    );
  });

  it('starts tracking at a valid instant', () => {
    expect(new Date(CRM_ANALYTICS_CONFIG.trackingStartAt).toISOString()).toBe(
      CRM_ANALYTICS_CONFIG.trackingStartAt,
    );
  });
});
