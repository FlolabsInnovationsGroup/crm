import { readFileSync } from 'fs';
import { resolve } from 'path';

const SERVER_TYPES_PATH = resolve(__dirname, '../analytics-api.type.ts');
const FRONT_TYPES_PATH = resolve(
  __dirname,
  '../../../../../../twenty-front/src/modules/crm-analytics/types/AnalyticsApi.ts',
);

const readNormalized = (path: string): string =>
  readFileSync(path, 'utf8').replace(/\r\n/g, '\n');

describe('analytics API types', () => {
  it('has no imports, so both sides can hold the same text', () => {
    expect(readNormalized(SERVER_TYPES_PATH)).not.toMatch(/^import\b/m);
  });

  it('is identical on the server and the front', () => {
    expect(readNormalized(FRONT_TYPES_PATH)).toBe(
      readNormalized(SERVER_TYPES_PATH),
    );
  });
});
