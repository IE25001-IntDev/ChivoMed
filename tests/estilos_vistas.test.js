import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

// El DOM mínimo no aplica CSS: esta prueba fija la regla que hace que `hidden` oculte el host.
test('vistas.css: un host con hidden queda oculto aunque :host declare display', async () => {
    const css = await readFile(new URL('../src/resources/vistas.css', import.meta.url), 'utf8');
    assert.match(css, /:host\s*\{\s*display:\s*block;?\s*\}/);
    assert.match(css, /:host\(\[hidden\]\)\s*\{\s*display:\s*none\s*!important;?\s*\}/);
});
