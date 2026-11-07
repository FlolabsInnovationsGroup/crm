// Runs the front dev server for the local seed-data run, on port 3001, without Nx.
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const WORKTREE = path.resolve(__dirname, '..', '..', '..', 'analytics_tool');
const vite = path.join(WORKTREE, 'node_modules', 'vite', 'bin', 'vite.js');

process.chdir(path.join(WORKTREE, 'packages', 'twenty-front'));
process.argv = [process.argv[0], vite, '--port', '3001'];

import(pathToFileURL(vite).href);
