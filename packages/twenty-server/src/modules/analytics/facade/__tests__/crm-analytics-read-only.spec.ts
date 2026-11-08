import { readdirSync, readFileSync } from 'fs';
import { join, resolve } from 'path';

const ANALYTICS_ROOT = resolve(__dirname, '../..');
const FACADE_PATH = resolve(
  ANALYTICS_ROOT,
  'facade/crm-analytics-facade.service.ts',
);

const listSourceFiles = (directory: string): string[] =>
  readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = join(directory, entry.name);

    if (entry.isDirectory()) {
      return entry.name === '__tests__' ? [] : listSourceFiles(entryPath);
    }

    return entry.name.endsWith('.ts') ? [entryPath] : [];
  });

describe('analytics read-only rules', () => {
  const sourceFiles = listSourceFiles(ANALYTICS_ROOT);

  it('finds the facade while walking the analytics folder', () => {
    expect(sourceFiles).toContain(FACADE_PATH);
  });

  it('lets only the facade use getWorkspaceSchemaName', () => {
    const filesUsingWorkspaceSchema = sourceFiles.filter((filePath) =>
      readFileSync(filePath, 'utf8').includes('getWorkspaceSchemaName'),
    );

    expect(filesUsingWorkspaceSchema).toEqual([FACADE_PATH]);
  });

  it('has no write call in the facade', () => {
    expect(readFileSync(FACADE_PATH, 'utf8')).not.toMatch(
      /\.(?:insert|update|delete|save)\(/,
    );
  });
});
