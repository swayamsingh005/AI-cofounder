import { defineConfig, globalIgnores } from 'eslint/config';
import nextVitals from 'eslint-config-next/core-web-vitals';
import nextTs from 'eslint-config-next/typescript';
export default defineConfig([
  ...nextVitals, ...nextTs,
  // CommonJS regression runners intentionally load the CommonJS test build.
  {files:['tests/*.cjs'],rules:{'@typescript-eslint/no-require-imports':'off'}},
  globalIgnores(['.next/**', '.v3-test-build/**', '.npm-cache/**', '.vercel/**', 'work/**']),
]);
