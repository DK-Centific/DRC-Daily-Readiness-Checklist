import { addDays } from './time.js';

export const TASKS_TTL_MS = 10 * 60 * 1000;
export const TASKS_CACHE_KEY = 'drc.tasks.v1';
export const HISTORY_WINDOW_DAYS = 14;
export const TASK_SAVE_WAIT_MS = 600;

export function defaultHistoryRange(today) {
  return {
    from: addDays(today, -(HISTORY_WINDOW_DAYS - 1)),
    to: today,
  };
}

export function readTaskCache(storage, now = Date.now()) {
  if (!storage) return null;
  try {
    const raw = JSON.parse(storage.getItem(TASKS_CACHE_KEY) || 'null');
    if (!raw || !Array.isArray(raw.tasks) || typeof raw.at !== 'number') return null;
    return { tasks: raw.tasks, at: raw.at, fresh: now - raw.at < TASKS_TTL_MS };
  } catch {
    return null;
  }
}

export function writeTaskCache(storage, tasks, now = Date.now()) {
  if (!storage) return;
  try {
    storage.setItem(TASKS_CACHE_KEY, JSON.stringify({ at: now, tasks }));
  } catch {
    /* session storage can be blocked */
  }
}

export function stableKey(body) {
  const action = body?.action || '';
  const actor = body?.actor || '';
  const params = { ...body };
  delete params.action;
  delete params.actor;
  const keys = Object.keys(params).filter((key) => params[key] !== undefined).sort();
  const stable = keys.map((key) => `${key}:${JSON.stringify(params[key])}`).join('&');
  return `${action}|${actor}|${stable}`;
}

export function createRequestGate({ call, debug = false, log = console.info, now = () => performance.now() }) {
  const inflight = new Map();
  const lanes = new Map();

  function request(body, { lane } = {}) {
    const key = stableKey(body);
    const existing = inflight.get(key);
    if (existing) return existing.promise;

    if (lane) {
      const previous = lanes.get(lane);
      if (previous && previous !== key) {
        inflight.get(previous)?.controller.abort();
        inflight.delete(previous);
      }
      lanes.set(lane, key);
    }

    const controller = new AbortController();
    const started = now();
    let pending;
    try {
      pending = call(body, { signal: controller.signal });
    } catch (error) {
      pending = Promise.reject(error);
    }
    const promise = Promise.resolve(pending)
      .then((result) => {
        if (debug) log(`${body.action} ${Math.round(now() - started)}ms`);
        return result;
      })
      .catch((error) => {
        if (error?.name === 'AbortError') {
          return { ok: false, error: 'Cancelled.', code: 'ABORTED' };
        }
        throw error;
      })
      .finally(() => {
        if (inflight.get(key)?.promise === promise) inflight.delete(key);
        if (lane && lanes.get(lane) === key) lanes.delete(lane);
      });
    inflight.set(key, { promise, controller });
    return promise;
  }

  return { request };
}

export function createDebouncedFlush(wait, flush) {
  let timer = null;
  function schedule() {
    clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      flush();
    }, wait);
  }
  function cancel() {
    clearTimeout(timer);
    timer = null;
  }
  return { schedule, cancel };
}
