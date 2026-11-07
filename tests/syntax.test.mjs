// Every app module must at least parse (a broken import line stops the whole app, not just one feature).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

const dir = new URL('../js/', import.meta.url);
for (const f of readdirSync(dir).filter((n) => n.endsWith('.js'))) {
  test(`js/${f} parses`, () => {
    const r = spawnSync(process.execPath, ['--input-type=module', '--check'], { input: readFileSync(new URL(f, dir)) });
    assert.equal(r.status, 0, String(r.stderr));
  });
}
