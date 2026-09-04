// Preload de tests (bunfig.toml [test]): shims mínimos para specs que
// tocan `window` sin necesitar jsdom (storage + redirect a /login).
const g = globalThis as unknown as Record<string, unknown>;
if (!g.window) g.window = globalThis;
const w = g.window as Record<string, unknown>;
if (!w.location) w.location = { href: '' };
