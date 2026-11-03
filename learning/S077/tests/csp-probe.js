'use strict';

try {
  new Function('return 77')();
  globalThis.__S077_DYNAMIC_EVALUATION = 'allowed';
} catch {
  globalThis.__S077_DYNAMIC_EVALUATION = 'blocked';
}
