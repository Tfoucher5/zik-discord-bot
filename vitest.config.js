import { defineConfig } from 'vitest/config';

// Un seul fork pour limiter l'empreinte mémoire (évite l'OOM observé sur Node 24).
export default defineConfig({
  test: {
    pool: 'forks',
    poolOptions: { forks: { singleFork: true } },
  },
});
