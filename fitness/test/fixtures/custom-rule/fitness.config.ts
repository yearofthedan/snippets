import { defineConfig } from 'fitness';
import wt from './rules/noPortsThroughApplication.ts';

export default defineConfig({
  plugins: { wt },
  rules: { 'wt/no-ports-through-application': false },
  kinds: {
    domain: { match: 'src/domain/**' },
    application: { match: 'src/application/**', dependsOn: ['domain'] },
    ui: { match: 'src/ui/**', dependsOn: ['application', 'domain'], rules: { 'wt/no-ports-through-application': true } },
  },
});
