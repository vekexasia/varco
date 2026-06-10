import test from 'node:test';
import assert from 'node:assert/strict';

import { canonicalJson } from '../dist/encoding.js';

// Keep this fixture and expected string identical to tests/test_canonical_json.py.
const FIXTURE = {
  Name: 'Façade Dashboard',
  _internal: true,
  '0count': 3,
  name: 'demo',
  'entités': ['sensor.température', { Z: 1, a: 2, _x: null }],
  zone: { 'étage': '1º', emoji: '😀' },
};

const EXPECTED = '{"0count":3,"Name":"Fa\\u00e7ade Dashboard","_internal":true,"entit\\u00e9s":["sensor.temp\\u00e9rature",{"Z":1,"_x":null,"a":2}],"name":"demo","zone":{"emoji":"\\ud83d\\ude00","\\u00e9tage":"1\\u00ba"}}';

test('canonicalJson matches Python json.dumps(sort_keys=True) byte-for-byte', () => {
  assert.equal(canonicalJson(FIXTURE), EXPECTED);
});

test('canonicalJson sorts keys by codepoint, not locale', () => {
  assert.equal(canonicalJson({ a: 1, Z: 2, _x: 3, '0': 4 }), '{"0":4,"Z":2,"_x":3,"a":1}');
});
