import { isAdmin, resolveActor } from './auth.js';
import { rowFromItem } from './graph.js';
import { corsHeaders, fail, normalizeEmail, ok } from './normalize.js';
import { getHistory } from './actions/getHistory.js';
import { getKits } from './actions/getKits.js';
import { getTasks } from './actions/getTasks.js';
import { listAccess } from './actions/listAccess.js';
import { listKits } from './actions/listKits.js';
import { login } from './actions/login.js';

const NO_ACCESS = "You don't have access. Ask a DRC admin.";
const FORBIDDEN = 'Admin access is required.';

const NATIVE = new Set(['login', 'getTasks', 'getKits', 'listKits', 'getHistory', 'listAccess']);
const ADMIN_ONLY = new Set(['listAccess']);

export async function handleHttp(request, deps) {
  if (request.method === 'OPTIONS') {
    return { status: 204, headers: corsHeaders() };
  }
  let body;
  try {
    body = await request.json();
  } catch {
    return fail('VALIDATION', 'Request body must be JSON');
  }
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return fail('VALIDATION', 'Request body must be a JSON object');
  }
  const started = Date.now();
  const response = await route(body, deps);
  logOutcome({
    action: body.action,
    actor: normalizeEmail(body.actor || body.email),
    ok: response.jsonBody?.ok === true,
    code: response.jsonBody?.ok ? '' : response.jsonBody?.code,
    ms: Date.now() - started,
  });
  return response;
}

export async function route(body, deps) {
  const action = String(body?.action ?? '').trim();
  if (!action) return fail('VALIDATION', 'action is required');
  if (!NATIVE.has(action)) return fail('VALIDATION', 'Unknown action');
  try {
    return await dispatch(action, body, deps);
  } catch {
    return fail('BACKEND', 'SharePoint read failed');
  }
}

async function dispatch(action, body, deps) {
  const rawActor = action === 'login' ? body.email : body.actor;
  const rows = await loadAccessRows(deps);
  const actor = resolveActor(rows, rawActor);
  if (!actor) return fail('NO_ACCESS', NO_ACCESS);
  if (ADMIN_ONLY.has(action) && !isAdmin(actor)) return fail('FORBIDDEN', FORBIDDEN);
  if (action === 'login') return ok(login(actor));
  if (action === 'getTasks') return ok(await getTasks(deps));
  if (action === 'getKits') return getKits(deps, body);
  if (action === 'listKits') return listKits(deps);
  if (action === 'getHistory') return getHistory(deps, body);
  if (action === 'listAccess') return listAccess(deps);
  return fail('VALIDATION', 'Unknown action');
}

async function loadAccessRows(deps) {
  if (Array.isArray(deps.accessRows)) return deps.accessRows;
  const items = await deps.graph.listItems(deps.settings.lists.access, {
    filter: 'fields/Active ne false',
    select: ['Title', 'Email', 'FirstName', 'LastName', 'Role', 'Active'],
    top: 500,
  });
  return items.map(rowFromItem);
}

function logOutcome(entry) {
  console.log(JSON.stringify({
    action: String(entry.action || ''),
    actor: entry.actor || '',
    ms: entry.ms,
    ok: Boolean(entry.ok),
    code: entry.code || '',
  }));
}
