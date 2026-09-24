import { createMockBackend } from './mock-backend.js';
import { createPaBackend } from './pa-backend.js';
import { normalizeHistoryRows } from './flow-shape.js';
import { createRequestGate } from './requests.js';

function presentResult(body, result) {
  if (body?.action !== 'getHistory' || !result?.ok || !Array.isArray(result.data)) return result;
  return { ...result, data: normalizeHistoryRows(result.data) };
}

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
      return gate.request(body, options).then((result) => presentResult(body, result));
    },
    reset() {
      if (typeof impl.reset === 'function') impl.reset();
    },
  };
}
