// Runs the built CRM for the local seed-data run:
//   node crm.cjs server | worker | command <args>
// The seed writes two stage values the default config does not list. Adding them here, in
// memory, keeps them out of the product code and survives a rebuild. Local run only.
const path = require('node:path');

// Existing CRM code joins some stored paths with path.join and then rejects backslashes, so
// the demo seed fails on Windows. Production runs on Linux. For seed commands only, and only
// in memory, joined paths use forward slashes. It must run before any dist module loads.
if (process.argv[2] === 'command') {
  const join = path.join;

  path.join = (...parts) => {
    const joined = join(...parts);

    return path.isAbsolute(joined) ? joined : joined.split('\\').join('/');
  };
}

const SERVER_ROOT = path.resolve(__dirname, '..', '..', '..', 'analytics_tool', 'packages', 'twenty-server');
const SEED_CONFIG_ADDITIONS = [
  { stageKey: 'CONTACTED', rawValue: 'CONTACTED_REMINDER', isReminder: true },
  { stageKey: 'BEFORE_MEETING', rawValue: 'PRE_MEETING', isReminder: false },
];

process.chdir(SERVER_ROOT);
process.env.NODE_ENV = 'development';

const { CRM_ANALYTICS_CONFIG } = require(
  path.join(SERVER_ROOT, 'dist/modules/analytics/constants/crm-analytics-config.constant.js'),
);

for (const { stageKey, rawValue, isReminder } of SEED_CONFIG_ADDITIONS) {
  CRM_ANALYTICS_CONFIG.stages
    .find((stage) => stage.stageKey === stageKey)
    .rawValues.push({ rawValue, isReminder });
}

// Existing CRM code builds some file paths with path.join and then rejects backslashes, so
// it cannot seed on Windows. Production runs on Linux. Normalized here, in memory only.
const { FileStorageService } = require(
  path.join(SERVER_ROOT, 'dist/engine/core-modules/file-storage/services/file-storage.service.js'),
);
const validatePath = FileStorageService.prototype.validateAndBuildFileStoragePathOrThrow;

FileStorageService.prototype.validateAndBuildFileStoragePathOrThrow = function (params) {
  return validatePath.call(this, {
    ...params,
    resourcePath: params.resourcePath?.replace(/\\/g, '/'),
  });
};

const [mode, ...rest] = process.argv.slice(2);

if (mode === 'server') {
  require(path.join(SERVER_ROOT, 'dist/main.js'));
} else if (mode === 'worker') {
  require(path.join(SERVER_ROOT, 'dist/queue-worker/queue-worker.js'));
} else if (mode === 'command') {
  const entry = path.join(SERVER_ROOT, 'dist/command/command.js');

  process.argv = [process.argv[0], entry, ...rest];
  require(entry);
} else {
  console.error('Usage: node crm.cjs server | worker | command <args>');
  process.exit(1);
}
