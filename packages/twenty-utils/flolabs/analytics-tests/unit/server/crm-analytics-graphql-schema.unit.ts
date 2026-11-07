// A duplicate GraphQL type name stops the server, the worker and the schema build. This is
// the fast half of contract P12: boot/boot-checks.mjs is the real boot.
import { NestFactory } from '@nestjs/core';
import {
  GraphQLSchemaBuilderModule,
  GraphQLSchemaFactory,
} from '@nestjs/graphql';

import { parse, validate, validateSchema, type GraphQLSchema } from 'graphql';
import fs from 'node:fs';
import path from 'node:path';

import { CrmAnalyticsResolver } from 'src/modules/analytics/resolvers/crm-analytics.resolver';

import { ANALYTICS_QUERIES } from '../../blackbox/lib/api-client.cjs';

const SERVER_SOURCE_ROOT = path.resolve(
  __dirname,
  '../../../../../twenty-server/src',
);
const ANALYTICS_FOLDER = path.join('modules', 'analytics');

// Both exist already, which is why every analytics name carries the CrmAnalytics prefix.
const EXISTING_NAMES_NEARBY = ['UsageAnalytics'];

const listSourceFiles = (folder: string): string[] =>
  fs.readdirSync(folder, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = path.join(folder, entry.name);

    if (entry.isDirectory()) {
      return entry.name === '__tests__' ? [] : listSourceFiles(entryPath);
    }

    return /\.ts$/.test(entry.name) && !/\.(spec|test)\.ts$/.test(entry.name)
      ? [entryPath]
      : [];
  });

const GRAPHQL_NAME_PATTERNS = [
  /@(?:ObjectType|InputType|InterfaceType)\(\s*['"]([A-Za-z0-9_]+)['"]/g,
  /registerEnumType\([^,]+,\s*\{\s*name:\s*['"]([A-Za-z0-9_]+)['"]/g,
  /@(?:ObjectType|InputType|InterfaceType|ArgsType)\([^)]*\)\s*(?:@[^\n]+\s*)*export class ([A-Za-z0-9_]+)/g,
];
const OPERATION_NAME_PATTERN =
  /@(?:Query|Mutation)\([\s\S]{0,400}?async ([A-Za-z0-9_]+)\s*\(/g;

const collectNames = (patterns: RegExp[], source: string) =>
  patterns.flatMap((pattern) =>
    [...source.matchAll(pattern)].map((match) => match[1]),
  );

describe('analytics GraphQL names', () => {
  const namesOutsideAnalytics = new Set<string>();
  const operationsOutsideAnalytics = new Set<string>();

  beforeAll(() => {
    for (const file of listSourceFiles(SERVER_SOURCE_ROOT)) {
      if (file.includes(ANALYTICS_FOLDER)) {
        continue;
      }

      const source = fs.readFileSync(file, 'utf8');

      for (const name of collectNames(GRAPHQL_NAME_PATTERNS, source)) {
        namesOutsideAnalytics.add(name);
      }

      for (const name of collectNames([OPERATION_NAME_PATTERN], source)) {
        operationsOutsideAnalytics.add(name);
      }
    }
  });

  it('the scan really reads the CRM names, so an empty result cannot pass it', () => {
    expect(namesOutsideAnalytics.size).toBeGreaterThan(100);
    expect(operationsOutsideAnalytics.size).toBeGreaterThan(50);

    for (const name of EXISTING_NAMES_NEARBY) {
      expect(namesOutsideAnalytics.has(name)).toBe(true);
    }
  });

  describe('the schema built from the real resolver', () => {
    let schema: GraphQLSchema;

    beforeAll(async () => {
      const application = await NestFactory.createApplicationContext(
        GraphQLSchemaBuilderModule,
        { logger: false },
      );

      try {
        schema = await application
          .get(GraphQLSchemaFactory)
          .create([CrmAnalyticsResolver]);
      } finally {
        await application.close();
      }
    });

    it('is valid', () => {
      expect(validateSchema(schema)).toEqual([]);
    });

    it('has the seven section 7 queries, and no CRM operation holds one of their names', () => {
      const queryNames = Object.keys(schema.getQueryType()?.getFields() ?? {});

      expect(queryNames.sort()).toEqual(
        Object.values(ANALYTICS_QUERIES)
          .map(({ field }) => field)
          .sort(),
      );
      expect(queryNames.filter((name) => operationsOutsideAnalytics.has(name))).toEqual([]);
    });

    it('adds no mutation', () => {
      expect(schema.getMutationType()).toBeUndefined();
    });

    it('adds types only with the CrmAnalytics prefix, and none clashes with the CRM', () => {
      const addedNames = Object.keys(schema.getTypeMap()).filter(
        (name) =>
          !name.startsWith('__') &&
          !['Query', 'String', 'Boolean', 'JSON'].includes(name),
      );

      expect(addedNames.sort()).toEqual([
        'CrmAnalyticsFilterInput',
        'CrmAnalyticsPayload',
      ]);
      expect(addedNames.filter((name) => namesOutsideAnalytics.has(name))).toEqual([]);
    });

    it('accepts every query the page and the black-box tests send', () => {
      for (const { field, query } of Object.values(ANALYTICS_QUERIES)) {
        expect(`${field}: ${validate(schema, parse(query)).map(String)}`).toBe(
          `${field}: `,
        );
      }
    });
  });
});
