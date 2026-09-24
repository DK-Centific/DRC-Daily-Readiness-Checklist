import { createMockBackend } from './mock-backend.js';
import { createPaBackend } from './pa-backend.js';
import { createRequestGate } from './requests.js';

export function createClient({ backend, flowUrl, storage, latencyMs = 0, debug = false } = {}) {
  const mode = backend === 'pa' ? 'pa' : 'mock';
  const impl = mode === 'pa'
    ? createPaBackend(flowUrl)
    : createMockBackend(storage, { latencyMs: mode === 'mock' ? latencyMs : 0 });
  const gate = createRequestGate({
    call: (body, options) => impl.call(body, options),
    debug,
  });
  return {
    mode,
    call(body, options) {
      return gate.request(body, options);
    },
    reset() {
      if (typeof impl.reset === 'function') impl.reset();
    },
  };
}
