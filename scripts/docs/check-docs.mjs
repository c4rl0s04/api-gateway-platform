import process from 'node:process';
import { validateVault } from './docs-tools.mjs';

const result = await validateVault(process.cwd());

for (const warning of result.warnings) {
  console.warn(`WARN ${warning.file}: ${warning.message}`);
}
for (const error of result.errors) {
  console.error(`ERROR ${error.file}: ${error.message}`);
}

if (result.errors.length > 0) {
  console.error(`Documentation check failed with ${result.errors.length} error(s).`);
  process.exitCode = 1;
} else {
  console.log(
    `Documentation check passed for ${result.notes.length} notes`
    + ` with ${result.warnings.length} warning(s).`,
  );
}
