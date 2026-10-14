import test from 'node:test';
import assert from 'node:assert/strict';
import { iconFor, protocolIconTypes } from '../src/icons.js';

test('exports a colorful accessible icon for every protocol', () => {
  for (const type of protocolIconTypes) {
    const svg = iconFor(type);
    assert.match(svg, /^<svg /);
    assert.match(svg, /aria-hidden="true"/);
    assert.match(svg, /stroke="#[0-9a-f]+"/i);
  }
});

test('unknown protocol uses the shell fallback icon', () => {
  assert.equal(iconFor('unknown'), iconFor('Shell'));
});
