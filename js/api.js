import { createMockBackend } from './mock-backend.js';
import { createPaBackend } from './pa-backend.js';

export function createClient({ backend, flowUrl, storage }) {
  const mode = backend === 'pa' ? 'pa' : 'mock';
  const impl = mode === 'pa' ? createPaBackend(flowUrl) : createMockBackend(storage);
  return {
    mode,
    call(body) {
      return impl.call(body);
    },
    reset() {
      if (typeof impl.reset === 'function') impl.reset();
    },
  };
}
