// Flags: --no-warnings --expose-internals

'use strict';

require('../common');
const assert = require('assert');
const test = require('node:test');
const { Writable } = require('stream');
const { ReadableStream } = require('stream/web');

// Ensure the local lib/ version of adapters is used if running with an unbuilt node binary.
let { newWritableStreamFromStreamWritable } = require('internal/webstreams/adapters');
if (!newWritableStreamFromStreamWritable.toString().includes('writeResult')) {
  const fs = require('fs');
  const path = require('path');
  const vm = require('vm');
  const { Module } = require('internal/modules/cjs/loader');
  const { internalBinding, primordials } = require('internal/test/binding');

  const code = fs.readFileSync(
    path.join(__dirname, '../../lib/internal/webstreams/adapters.js'),
    'utf8',
  );
  const fn = vm.compileFunction(code, [
    'exports',
    'require',
    'module',
    'process',
    'internalBinding',
    'primordials',
  ]);
  const mod = { exports: {} };
  fn(mod.exports, require, mod, process, internalBinding, primordials);
  newWritableStreamFromStreamWritable = mod.exports.newWritableStreamFromStreamWritable;
  Module._cache['internal/webstreams/adapters'] = { loaded: true, exports: mod.exports };
  Writable.toWeb = function(streamWritable) {
    return newWritableStreamFromStreamWritable(streamWritable);
  };
}

test('underlying stream with backpressure does not drop chunk on web write', async () => {
  const received = [];

  const writable = new Writable({
    highWaterMark: 1,
    write(chunk, encoding, callback) {
      received.push(chunk.toString());
      setImmediate(callback);
    },
  });

  const writableStream = Writable.toWeb(writable);
  const writer = writableStream.getWriter();

  // Initial write directly on streamWritable causes backpressure.
  const writeRet = writable.write('first');
  assert.strictEqual(writeRet, false);
  assert.strictEqual(writable.writableNeedDrain, true);

  // Write via web stream writer while writableNeedDrain is true.
  // Before the fix, this write was skipped due to short-circuiting in
  // `streamWritable.writableNeedDrain || !streamWritable.write(chunk)`.
  await writer.write('second');

  assert.strictEqual(received.length, 2);
  assert.strictEqual(received[0], 'first');
  assert.strictEqual(received[1], 'second');
  await writer.close();
});

test('multiple consecutive writes through writer under backpressure preserve all chunks', async () => {
  const received = [];

  const writable = new Writable({
    highWaterMark: 1,
    write(chunk, encoding, callback) {
      received.push(chunk.toString());
      setImmediate(callback);
    },
  });

  const writableStream = Writable.toWeb(writable);
  const writer = writableStream.getWriter();

  await Promise.all([
    writer.write('chunk-1'),
    writer.write('chunk-2'),
    writer.write('chunk-3'),
  ]);

  assert.deepStrictEqual(received, ['chunk-1', 'chunk-2', 'chunk-3']);
  await writer.close();
});

test('ReadableStream.pipeTo under backpressure delivers all chunks without loss', async () => {
  const received = [];
  const writable = new Writable({
    highWaterMark: 1,
    write(chunk, encoding, callback) {
      received.push(chunk.toString());
      setImmediate(callback);
    },
  });

  const sourceChunks = ['pipe-1', 'pipe-2', 'pipe-3', 'pipe-4'];
  const readable = new ReadableStream({
    start(controller) {
      for (const item of sourceChunks) {
        controller.enqueue(item);
      }
      controller.close();
    },
  });

  const writableStream = Writable.toWeb(writable);
  await readable.pipeTo(writableStream);
  assert.deepStrictEqual(received, sourceChunks);
});

test('synchronous drain emission during write() does not hang or drop chunks', async () => {
  const received = [];
  const writable = new Writable({
    write(chunk, encoding, callback) {
      received.push(chunk.toString());
      callback();
    },
  });

  // Force synchronous 'drain' emission during write()
  writable.write = function(chunk) {
    received.push(chunk.toString());
    this.emit('drain');
    return false;
  };

  const writableStream = Writable.toWeb(writable);
  const writer = writableStream.getWriter();

  await writer.write('sync-drain-1');
  await writer.write('sync-drain-2');

  assert.deepStrictEqual(received, ['sync-drain-1', 'sync-drain-2']);
});

test('object mode preserves objects under backpressure', async () => {
  const received = [];

  const writable = new Writable({
    objectMode: true,
    highWaterMark: 1,
    write(chunk, encoding, callback) {
      received.push(chunk);
      setImmediate(callback);
    },
  });

  const writableStream = Writable.toWeb(writable);
  const writer = writableStream.getWriter();

  const writeRet = writable.write({ id: 1 });
  assert.strictEqual(writeRet, false);
  assert.strictEqual(writable.writableNeedDrain, true);

  await writer.write({ id: 2 });

  assert.deepStrictEqual(received, [{ id: 1 }, { id: 2 }]);
  await writer.close();
});

test('write error under backpressure rejects writer promise', async () => {
  const expectedError = new Error('write failure');

  const writable = new Writable({
    highWaterMark: 1,
    write(chunk, encoding, callback) {
      if (chunk.toString() === 'bad') {
        setImmediate(() => callback(expectedError));
        return;
      }
      setImmediate(callback);
    },
  });

  const writableStream = Writable.toWeb(writable);
  const writer = writableStream.getWriter();

  const writeRet = writable.write('first');
  assert.strictEqual(writeRet, false);
  assert.strictEqual(writable.writableNeedDrain, true);

  await assert.rejects(writer.write('bad'), (err) => {
    assert.strictEqual(err, expectedError);
    return true;
  });
});
