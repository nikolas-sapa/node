'use strict';

const common = require('../common');
const assert = require('assert');
const { EventEmitter, on } = require('events');

// Calling return() on the async iterator must finish it even when
// events are still buffered. Subsequent next() calls must resolve
// to { done: true, value: undefined } instead of draining the buffer.
async function returnWithBufferedEvents() {
  const ee = new EventEmitter();
  const iter = on(ee, 'foo');

  ee.emit('foo', 'a');
  ee.emit('foo', 'b');

  await iter.return();

  assert.deepStrictEqual(await iter.next(), { done: true, value: undefined });
  assert.deepStrictEqual(await iter.next(), { done: true, value: undefined });
}

// Closing the iterator must resume an emitter that was paused by the
// watermark controller, otherwise it stays paused forever.
async function closeResumesPausedEmitter() {
  const ee = new EventEmitter();
  let resumed = false;
  ee.pause = common.mustCall();
  ee.resume = common.mustCall(() => {
    resumed = true;
  });

  const iter = on(ee, 'foo', { highWaterMark: 1 });

  ee.emit('foo', 'a');
  ee.emit('foo', 'b'); // Exceeds highWaterMark, pauses the emitter.

  await iter.return();
  assert.strictEqual(resumed, true);
}

async function main() {
  await returnWithBufferedEvents();
  await closeResumesPausedEmitter();
}

main().then(common.mustCall());
