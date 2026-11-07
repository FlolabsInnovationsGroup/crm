'use strict';
// Runs the repo's real TypeScript without a server build: esbuild transforms each file
// on require, `src/...` maps to packages/twenty-server/src, and everything that needs
// Nest or a database (services, entities, guards, decorators) outside the analytics
// module becomes an inert stub. Pure files (utils, constants, types, enums) stay real,
// so all SQL and all naming rules come from the code under test.
const Module = require('node:module');
const fs = require('node:fs');
const path = require('node:path');

const { applyMutant } = require('../../mutation/apply-mutant.cjs');

const ANALYTICS_SRC = 'src/modules/analytics/';
const PURE_SRC =
  /(\/(utils?|constants?|types?|enums?)\/)|(\.(util|utils|constant|constants|const|type|types|enum)$)/;
const ALWAYS_STUBBED_PACKAGES = new Set(['@nestjs/typeorm']);

const makeStub = (label) => {
  const target = function stub() {};

  return new Proxy(target, {
    get(innerTarget, property) {
      if (property === '__esModule') return true;
      if (property === 'prototype') return innerTarget.prototype;
      if (property === Symbol.toPrimitive || property === 'toString') {
        return () => label;
      }
      if (property === 'name') return label;
      if (property === 'then' || typeof property === 'symbol') return undefined;

      return makeStub(`${label}.${String(property)}`);
    },
    // A stub call stands for a decorator factory. The decorator must return nothing,
    // or it would replace the class it decorates.
    apply: () => () => undefined,
    construct: () => ({}),
  });
};

const installLoader = (repoRoot) => {
  const serverRoot = path.join(repoRoot, 'packages', 'twenty-server');
  const repoRequire = Module.createRequire(path.join(repoRoot, 'package.json'));
  const esbuild = repoRequire('esbuild');

  const stubbedModules = new Set();
  const missingAnalyticsModules = new Set();
  const stubs = new Map();

  const fileExists = (request) =>
    fs.existsSync(path.join(serverRoot, `${request}.ts`));

  const getStub = (request) => {
    if (!stubs.has(request)) stubs.set(request, makeStub(request));

    return stubs.get(request);
  };

  Module._extensions['.ts'] = (module, filename) => {
    const source = applyMutant(fs.readFileSync(filename, 'utf8'), filename);
    const { code } = esbuild.transformSync(source, {
      loader: 'ts',
      format: 'cjs',
      target: 'node20',
      sourcefile: filename,
      sourcemap: 'inline',
      tsconfigRaw: {
        compilerOptions: {
          experimentalDecorators: true,
          useDefineForClassFields: false,
        },
      },
    });

    module._compile(code, filename);
  };

  const originalLoad = Module._load;

  Module._load = function load(request, parent, isMain) {
    if (ALWAYS_STUBBED_PACKAGES.has(request)) {
      stubbedModules.add(request);

      return getStub(request);
    }

    if (request.startsWith(ANALYTICS_SRC) && !fileExists(request)) {
      missingAnalyticsModules.add(request);

      return getStub(request);
    }

    if (
      request.startsWith('src/') &&
      !request.startsWith(ANALYTICS_SRC) &&
      !PURE_SRC.test(request)
    ) {
      stubbedModules.add(request);

      return getStub(request);
    }

    return originalLoad.call(this, request, parent, isMain);
  };

  const originalResolve = Module._resolveFilename;

  Module._resolveFilename = function resolve(request, ...rest) {
    return originalResolve.call(
      this,
      request.startsWith('src/') ? path.join(serverRoot, request) : request,
      ...rest,
    );
  };

  // For a section that runs on an altered config: module-level maps in the analytics
  // files are built at load, so they must load again. The config object itself stays.
  const purgeAnalyticsModules = () => {
    const configFile = path.join(serverRoot, `${ANALYTICS_SRC}constants/crm-analytics-config.constant.ts`);
    const analyticsRoot = path.join(serverRoot, ANALYTICS_SRC);

    for (const cachedPath of Object.keys(require.cache)) {
      if (cachedPath.startsWith(analyticsRoot) && cachedPath !== configFile) {
        delete require.cache[cachedPath];
      }
    }
  };

  return {
    repoRequire,
    purgeAnalyticsModules,
    stubbedModules,
    missingAnalyticsModules,
    fileExists,
    // Loads a repo file by its `src/...` path, so its own imports hit the rules above.
    real: (request) => require(path.join(serverRoot, request)),
    serverPath: (request) => path.join(serverRoot, `${request}.ts`),
  };
};

module.exports = { installLoader };
