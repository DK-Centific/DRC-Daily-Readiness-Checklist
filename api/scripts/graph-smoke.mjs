/**
 * Reads one DRC_Access row through Graph to confirm app settings.
 * Prints a count and field names only. Does not print tokens, secrets, or row values.
 *
 * Usage (from api/):
 *   node scripts/graph-smoke.mjs
 */
import { createGraphClient, fieldsOf, loadSettings } from '../src/graph.js';

const settings = loadSettings(process.env);
const missing = [];
if (!process.env.SP_SITE_ID) missing.push('SP_SITE_ID');
const usingSecret = Boolean(settings.tenantId && settings.clientId && settings.clientSecret);
if (!usingSecret && process.env.GRAPH_USE_MANAGED_IDENTITY !== '1') {
  for (const name of ['GRAPH_TENANT_ID', 'GRAPH_CLIENT_ID', 'GRAPH_CLIENT_SECRET']) {
    if (!process.env[name]) missing.push(name);
  }
}

if (missing.length) {
  console.error(`Missing app settings: ${missing.join(', ')}`);
  console.error('Set GRAPH_USE_MANAGED_IDENTITY=1 to use the Function managed identity instead of a client secret.');
  process.exit(1);
}

const client = createGraphClient({ settings });
try {
  const items = await client.listItems(settings.lists.access, {
    select: ['Title', 'Email', 'Role', 'Active'],
    top: 1,
  });
  const names = items[0] ? Object.keys(fieldsOf(items[0])).sort().join(', ') : '(none)';
  console.log(`DRC_Access top 1: ${items.length} item(s); field names: ${names}`);
} catch (err) {
  console.error(`Graph smoke failed (${err.status || err.code || 'error'})`);
  process.exit(1);
}
