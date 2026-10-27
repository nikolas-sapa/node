'use strict';
require('../common');
const assert = require('node:assert');
const { test } = require('node:test');

test('mock.method restores original method when methodName is a symbol', (t) => {
  const symbolMethod = Symbol('symbolMethod');
  const obj = {
    [symbolMethod](a, b) {
      return a + b;
    },
  };

  const fn = t.mock.method(obj, symbolMethod, (a, b) => a * b);
  assert.strictEqual(obj[symbolMethod](2, 3), 6);
  assert.strictEqual(fn.mock.calls.length, 1);
  assert.deepStrictEqual(fn.mock.calls[0].arguments, [2, 3]);
  assert.strictEqual(fn.mock.calls[0].result, 6);

  fn.mock.restore();
  assert.strictEqual(obj[symbolMethod](2, 3), 5);
  assert.strictEqual(fn.mock.calls.length, 1);
});

test('mock.method with symbol method restored via t.mock.restoreAll', (t) => {
  const symbolMethod = Symbol('symbolMethod2');
  const obj = {
    [symbolMethod]() {
      return 'original';
    },
  };

  t.mock.method(obj, symbolMethod, () => 'mocked');
  assert.strictEqual(obj[symbolMethod](), 'mocked');

  t.mock.restoreAll();
  assert.strictEqual(obj[symbolMethod](), 'original');
});

test('mock.property restores original accessor descriptor without crashing', (t) => {
  let inner = 42;
  const obj = {
    get prop() {
      return inner;
    },
    set prop(val) {
      inner = val;
    },
  };

  const prop = t.mock.property(obj, 'prop', 100);
  assert.strictEqual(obj.prop, 100);

  // In the buggy implementation, restore() throws:
  // TypeError: Invalid property descriptor. Cannot both specify accessors and a value or writable attribute
  prop.mock.restore();
  assert.strictEqual(obj.prop, 42);

  const descriptor = Object.getOwnPropertyDescriptor(obj, 'prop');
  assert.strictEqual(typeof descriptor.get, 'function');
  assert.strictEqual(typeof descriptor.set, 'function');
  assert.strictEqual(descriptor.value, undefined);
  assert.strictEqual(descriptor.writable, undefined);

  // Ensure setter still works
  obj.prop = 99;
  assert.strictEqual(obj.prop, 99);
});

test('mock.property with getter-only accessor restores without crashing', (t) => {
  const obj = {
    get readonly() {
      return 'read-only-value';
    },
  };

  const prop = t.mock.property(obj, 'readonly', 'mocked-value');
  assert.strictEqual(obj.readonly, 'mocked-value');

  prop.mock.restore();
  assert.strictEqual(obj.readonly, 'read-only-value');

  const descriptor = Object.getOwnPropertyDescriptor(obj, 'readonly');
  assert.strictEqual(typeof descriptor.get, 'function');
  assert.strictEqual(descriptor.set, undefined);
  assert.strictEqual(descriptor.value, undefined);
  assert.strictEqual(descriptor.writable, undefined);
});
