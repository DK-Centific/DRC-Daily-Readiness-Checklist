import { corsHeaders, fail, normalizeEmail } from './normalize.js';

export const WRITE_ACTIONS = ['checkIn', 'updateTasks', 'checkOut', 'upsertAccess', 'upsertKit', 'resetDay'];
const WRITES = new Set(WRITE_ACTIONS);
const ADMIN_WRITES = new Set(['upsertAccess', 'upsertKit', 'resetDay']);
const TIMEOUT_MS = 60_000;

export function isWriteAction(action) {
  return WRITES.has(action);
}

export function isAdminWrite(action) {
  return ADMIN_WRITES.has(action);
}

export async function proxyWrite({ url, body, fetchImpl = globalThis.fetch, timeoutMs = TIMEOUT_MS } = {}) {
  const action = String(body?.action || '');
  const actor = normalizeEmail(body?.actor || body?.email);
  const started = Date.now();
  if (!url) {
    logProxy({ action, actor, ms: 0, ok: false, code: 'BACKEND' });
    return fail('BACKEND', 'Upstream unavailable');
  }
  try {
    const response = await fetchImpl(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
    });
    const text = await response.text();
    let parsed = null;
    if (text) {
      try {
        parsed = JSON.parse(text);
      } catch {
        parsed = null;
      }
    }
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      logProxy({ action, actor, ms: Date.now() - started, ok: false, code: 'BACKEND' });
      return fail('BACKEND', 'Upstream unavailable');
    }
    const code = typeof parsed.code === 'string' ? parsed.code : '';
    logProxy({
      action,
      actor,
      ms: Date.now() - started,
      ok: parsed.ok === true,
      code: code || String(response.status),
    });
    return {
      status: response.status,
      headers: corsHeaders(),
      jsonBody: parsed,
    };
  } catch {
    logProxy({ action, actor, ms: Date.now() - started, ok: false, code: 'BACKEND' });
    return fail('BACKEND', 'Upstream unavailable');
  }
}

function logProxy(entry) {
  console.log(JSON.stringify({
    action: entry.action,
    actor: entry.actor || '',
    ms: entry.ms,
    ok: Boolean(entry.ok),
    code: entry.code || '',
  }));
}
