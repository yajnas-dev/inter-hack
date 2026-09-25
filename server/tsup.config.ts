import { defineConfig } from 'tsup';

// Bundles the server (and the shared workspace package) into dist/ for `node dist/cluster.js`.
export default defineConfig({
  entry: {
    cluster: 'src/cluster.ts',
    migrate: 'src/migrations/run.ts',
    'seed-admin': 'src/utils/seedAdmin.ts',
    'seed-demo': 'src/scripts/seedDemo.ts'
  },
  format: ['cjs'],
  target: 'node20',
  platform: 'node',
  sourcemap: true,
  clean: true,
  noExternal: ['@jobportal/shared']
});
