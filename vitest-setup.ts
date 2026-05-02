/**
 * Override broken / partial jsdom-localStorage bindings (some Node setups inject
 * `--localstorage-file` stubs without Storage methods).
 */
import "@testing-library/jest-dom/vitest";

function makeStorage(): Storage {
  const memory = new Map<string, string>();
  return {
    get length(): number {
      return memory.size;
    },
    clear(): void {
      memory.clear();
    },
    getItem(key: string): string | null {
      return memory.has(key) ? memory.get(key)! : null;
    },
    setItem(key: string, value: string): void {
      memory.set(key, value);
    },
    removeItem(key: string): void {
      memory.delete(key);
    },
    key(index: number): string | null {
      return [...memory.keys()][index] ?? null;
    },
  };
}

Object.defineProperty(globalThis, "localStorage", {
  configurable: true,
  value: makeStorage(),
  writable: false,
});
