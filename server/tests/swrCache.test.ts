import { createSwrCache } from '../src/infra/cache/swr';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe('swrCache', () => {
  test('concurrent misses share a single computation (single-flight)', async () => {
    const cache = createSwrCache(1000);
    let calls = 0;
    const compute = async () => {
      calls += 1;
      await sleep(30);
      return 'value';
    };
    const results = await Promise.all(Array.from({ length: 20 }, () => cache.get('k', compute)));
    expect(calls).toBe(1);
    expect(new Set(results)).toEqual(new Set(['value']));
  });

  test('expired values are served immediately while one refresh runs', async () => {
    const cache = createSwrCache(20);
    let n = 0;
    const compute = async () => {
      n += 1;
      await sleep(30);
      return n;
    };
    expect(await cache.get('k', compute)).toBe(1);
    await sleep(40);
    expect(await cache.get('k', compute)).toBe(1); // stale, returned without waiting
    await sleep(50);
    expect(await cache.get('k', compute)).toBe(2); // refreshed in the background
  });

  test('ttl <= 0 disables caching', async () => {
    const cache = createSwrCache(0);
    let n = 0;
    const compute = async () => ++n;
    expect(await cache.get('k', compute)).toBe(1);
    expect(await cache.get('k', compute)).toBe(2);
  });
});
