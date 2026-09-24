/** Power Automate router client. The flow enforces the same rules as the mock. */

export function createPaBackend(flowUrl) {
  const url = String(flowUrl || '').trim();
  return {
    async call(body, options = {}) {
      if (!url) {
        return {
          ok: false,
          error: 'Power Automate mode is on, but no flow URL is set. Add config.local.json with the flow address.',
          code: 'NO_FLOW_URL',
        };
      }
      let response;
      try {
        response = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
          signal: options.signal,
        });
      } catch (error) {
        if (error?.name === 'AbortError') {
          return { ok: false, error: 'Cancelled.', code: 'ABORTED' };
        }
        return {
          ok: false,
          error: 'Could not reach the checklist service. Check the flow URL and your connection.',
          code: 'NETWORK',
        };
      }
      let payload;
      try {
        payload = await response.json();
      } catch {
        return {
          ok: false,
          error: `The checklist service returned an unexpected response (${response.status}).`,
          code: 'BAD_RESPONSE',
        };
      }
      if (!payload || typeof payload.ok !== 'boolean') {
        return {
          ok: false,
          error: 'The checklist service returned an unexpected response.',
          code: 'BAD_RESPONSE',
        };
      }
      if (!response.ok && payload.ok) {
        return {
          ok: false,
          error: payload.error || `The checklist service returned status ${response.status}.`,
          code: payload.code || 'HTTP',
        };
      }
      return payload;
    },
  };
}
