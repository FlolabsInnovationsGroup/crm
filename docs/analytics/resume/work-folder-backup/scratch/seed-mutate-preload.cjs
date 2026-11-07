// Sensitivity check only: changes the text of one product file in memory, never on disk.
const fs = require('node:fs');
const { file, from, to } = JSON.parse(process.env.SEED_MUTATION);
const original = fs.readFileSync;

fs.readFileSync = function patched(path, ...rest) {
  const content = original.call(this, path, ...rest);

  if (typeof path === 'string' && path.replace(/\\/g, '/').endsWith(file) && typeof content === 'string') {
    if (!content.includes(from)) {
      console.error(`MUTATION DID NOT APPLY: ${from}`);
      process.exit(9);
    }

    return content.replace(from, to);
  }

  return content;
};
