/** Read deploy config as data. Never execute it. */

export function parseLocalConfig(text) {
  const source = String(text ?? '').replace(/^\uFEFF/, '').trim();
  const data = JSON.parse(source);
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    throw new Error('config.local.json must be a JSON object');
  }
  const config = {};
  if (Object.prototype.hasOwnProperty.call(data, 'backend')) {
    if (data.backend !== 'mock' && data.backend !== 'pa') {
      throw new Error('backend must be mock or pa');
    }
    config.backend = data.backend;
  }
  if (Object.prototype.hasOwnProperty.call(data, 'FLOW_URL')) {
    if (typeof data.FLOW_URL !== 'string') throw new Error('FLOW_URL must be a string');
    config.FLOW_URL = data.FLOW_URL.trim();
  }
  return config;
}

function stripLeadingLineComments(text) {
  return String(text ?? '')
    .replace(/^\uFEFF/, '')
    .split('\n')
    .filter((line) => !/^\s*\/\//.test(line))
    .join('\n')
    .trim();
}

/** Old config.local.js files are read as text. Code in the file is rejected. */
export function parseLegacyConfigJs(text) {
  const source = stripLeadingLineComments(text);
  if (!/^window\.DRC_CONFIG\s*=\s*\{[\s\S]*\}\s*;?$/.test(source)) {
    throw new Error('config.local.js must be a plain window.DRC_CONFIG assignment');
  }
  if (/[()`]|=>|\bfunction\b|\beval\s*\(|\bnew\s+Function\b/.test(source)) {
    throw new Error('config.local.js must not contain code');
  }
  const backendMatch = source.match(/backend\s*:\s*(['"])(mock|pa)\1/);
  const flowMatch = source.match(/FLOW_URL\s*:\s*("(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*')/);
  if (!backendMatch || !flowMatch) {
    throw new Error('config.local.js is missing backend or FLOW_URL');
  }
  const raw = flowMatch[1];
  const flowUrl = raw.startsWith('"')
    ? JSON.parse(raw)
    : raw.slice(1, -1).replace(/\\'/g, "'").replace(/\\\\/g, '\\');
  if (typeof flowUrl !== 'string') throw new Error('FLOW_URL must be a string');
  return { backend: backendMatch[2], FLOW_URL: flowUrl.trim() };
}

/** Connected builds stay on pa unless both debug flags are present. */
export function resolveBackend(builtBackend, searchParams) {
  const params = searchParams instanceof URLSearchParams
    ? searchParams
    : new URLSearchParams(searchParams || '');
  const built = builtBackend === 'pa' ? 'pa' : 'mock';
  const override = params.get('backend');
  if (override !== 'mock' && override !== 'pa') return built;
  if (built === 'pa') {
    const debugGate = params.get('debug') === '1' && params.get('backendOverride') === '1';
    if (!debugGate) return 'pa';
  }
  return override;
}

export function mergeRuntimeConfig({ built = {}, fileConfig = null, searchParams } = {}) {
  const params = searchParams instanceof URLSearchParams
    ? searchParams
    : new URLSearchParams(searchParams || '');
  let backend = built.backend === 'pa' ? 'pa' : 'mock';
  let flowUrl = String(built.FLOW_URL ?? '').trim();
  if (fileConfig && typeof fileConfig === 'object') {
    if (fileConfig.backend === 'pa' || fileConfig.backend === 'mock') backend = fileConfig.backend;
    if (typeof fileConfig.FLOW_URL === 'string') flowUrl = fileConfig.FLOW_URL.trim();
  }
  const latency = Number(params.get('latency'));
  return {
    backend: resolveBackend(backend, params),
    FLOW_URL: flowUrl,
    latencyMs: Number.isFinite(latency) && latency > 0 ? latency : 0,
    debug: params.get('debug') === '1',
  };
}
