'use strict';
try {
  new Function('return 82')();
  globalThis.__S082_DYNAMIC_CODE = 'allowed';
} catch {
  globalThis.__S082_DYNAMIC_CODE = 'blocked';
}
