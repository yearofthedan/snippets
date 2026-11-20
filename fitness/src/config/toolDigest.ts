import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

/** The running fitness's own code: src/ from a checkout, dist/ from a build. */
const sourceDir = fileURLToPath(new URL('../', import.meta.url));
const code = /(?<!\.test)\.(ts|js)$/;

/**
 * A digest of what decides a commit's findings besides the project and its config: fitness's own code and the
 * TypeScript it analyzes with. A linked checkout that edits a built-in rule gets a new digest without a new version.
 */
export const toolDigest = (): string => {
  const digest = createHash('sha256').update(createRequire(import.meta.url)('typescript/package.json').version);
  const files = readdirSync(sourceDir, { recursive: true, encoding: 'utf8' }).filter((file) => code.test(file)).sort();
  for (const file of files) digest.update(file).update(readFileSync(join(sourceDir, file)));
  return digest.digest('hex').slice(0, 16);
};
