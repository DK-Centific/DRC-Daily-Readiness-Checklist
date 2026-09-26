import { createMockBackend } from './mock-backend.js';
import { createPaBackend } from './pa-backend.js';
import { coerceCompletedTaskIds, normalizeCheckoutData, normalizeHistoryRows, normalizeKitClaims } from './flow-shape.js?v=25';
import { createRequestGate } from './requests.js';

function presentResult(body, result) {
  if (!result?.ok || result.data == null) return result;
  if (body?.action === 'getHistory' && Array.isArray(result.data)) {
    return { ...result, data: normalizeHistoryRows(result.data) };
  }
  if (body?.action === 'checkOut' && result.data && typeof result.data === 'object' && !Array.isArray(result.data)) {
    return { ...result, data: normalizeCheckoutData(result.data) };
  }
  if (body?.action === 'getKits' && Array.isArray(result.data)) {
    return { ...result, data: normalizeKitClaims(result.data) };
  }
  if (body?.action === 'updateTasks' && result.data && typeof result.data === 'object' && !Array.isArray(result.data)) {
    const ids = coerceCompletedTaskIds(result.data.completedTaskIds);
    if (!Array.isArray(ids) || ids === result.data.completedTaskIds) return result;
    return { ...result, data: { ...result.data, completedTaskIds: ids } };
  }
  return result;
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
