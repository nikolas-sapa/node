'use strict';
const common = require('../common');
const assert = require('assert');
const { AsyncLocalStorage } = require('async_hooks');

// Exiting an AsyncLocalStorage configured with a defaultValue should make
// getStore() return the defaultValue, not undefined.
{
  const defaultValue = { default: true };
  const als = new AsyncLocalStorage({ defaultValue });

  assert.strictEqual(als.getStore(), defaultValue);

  als.run('store', common.mustCall(() => {
    assert.strictEqual(als.getStore(), 'store');
    als.exit(common.mustCall(() => {
      assert.strictEqual(als.getStore(), defaultValue);
    }));
    assert.strictEqual(als.getStore(), 'store');
  }));

  assert.strictEqual(als.getStore(), defaultValue);
}

// An AsyncLocalStorage without a defaultValue should still get undefined.
{
  const als = new AsyncLocalStorage();

  als.run('store', common.mustCall(() => {
    als.exit(common.mustCall(() => {
      assert.strictEqual(als.getStore(), undefined);
    }));
    assert.strictEqual(als.getStore(), 'store');
  }));

  assert.strictEqual(als.getStore(), undefined);
}
