export function normalizeEmail(raw) {
  const s = String(raw ?? '').trim().toLowerCase();
  if (!s) return '';
  if (s === 'admin-drc' || s === 'admin-drc@centific.com') return 'admin-drc@centific.com';
  return s;
}

export function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json',
  };
}

export function ok(data) {
  return { status: 200, headers: corsHeaders(), jsonBody: { ok: true, data } };
}

export function fail(code, error) {
  return {
    status: 200,
    headers: corsHeaders(),
    jsonBody: { ok: false, error: error || code, code },
  };
}
