import process from 'node:process';
import { updateIndex } from './docs-tools.mjs';

const result = await updateIndex(process.cwd());
console.log(
  result.changed
    ? `Updated ${result.path}`
    : `Documentation index is already current: ${result.path}`,
);
