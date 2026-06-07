import test from 'node:test';
import assert from 'node:assert/strict';
import { OpaqueRoom } from '../dist/testing.js';

test('opaque room routes payloads without inspecting encrypted contents', () => {
  const room = new OpaqueRoom();
  assert.equal(room.connectConsumer('s1'), false);
  room.connectAuthority();
  assert.equal(room.connectConsumer('s1'), true);
  room.fromConsumer('s1', { type: 'ciphertext', body: 'secret-state-payload' });
  room.fromAuthority('s1', { type: 'ciphertext', body: 'secret-response' });
  assert.deepEqual(room.routed.map((item) => [item.to, item.sessionId]), [
    ['authority', 's1'],
    ['authority', 's1'],
    ['consumer', 's1'],
  ]);
  assert.equal(JSON.stringify(room.routed).includes('light.cucina'), false);
});
