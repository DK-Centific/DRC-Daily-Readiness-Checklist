/**
 * How checklist titles are grouped. Edit this list only.
 * The first group whose keyword appears in the title wins.
 * SharePoint has no category column, so this stays in the page.
 */
export const TASK_GROUP_DEFS = [
  {
    id: 'camera',
    label: 'Camera',
    keywords: ['camera', 'lens', 'live view', 'image quality', 'mounted securely'],
  },
  {
    id: 'network',
    label: 'Network',
    keywords: ['eero', 'ethernet', 'speed test'],
  },
  {
    id: 'cables',
    label: 'Cables & mounts',
    keywords: ['cable', 'mount', 'tripod', 'pole', 'connector'],
  },
  {
    id: 'contents',
    label: 'Kit contents',
    keywords: ['accessor', 'labeled', 'checklist', 'calibration'],
  },
  {
    id: 'power',
    label: 'Power & batteries',
    keywords: ['battery', 'charging', 'power bank', 'walkie', 'headlamp', 'flashlight'],
  },
];

export const OTHER_GROUP = { id: 'other', label: 'Other' };

/** Short lines under a few long titles. Match is a lowercase snippet of the title. */
export const TASK_HINTS = [
  { match: 'visually inspect rechargeable', hint: 'Look for swelling, corrosion, or case damage before packing' },
  { match: 'speed test', hint: 'Connect a laptop to the eero and run a speed test' },
];

export function groupIdForTitle(title) {
  const text = String(title || '').toLowerCase();
  for (const group of TASK_GROUP_DEFS) {
    if (group.keywords.some((word) => text.includes(word))) return group.id;
  }
  return OTHER_GROUP.id;
}

export function taskHint(title) {
  const text = String(title || '').toLowerCase();
  const found = TASK_HINTS.find((row) => text.includes(row.match));
  return found ? found.hint : '';
}

/** Groups keep the map order. Tasks inside a group keep TaskOrder. Empty groups are omitted. */
export function groupTasks(tasks) {
  const buckets = new Map(TASK_GROUP_DEFS.map((group) => [group.id, []]));
  buckets.set(OTHER_GROUP.id, []);
  const sorted = [...(tasks || [])].sort((a, b) => {
    const order = (a.order ?? 0) - (b.order ?? 0);
    if (order !== 0) return order;
    return (a.id ?? 0) - (b.id ?? 0);
  });
  for (const task of sorted) {
    buckets.get(groupIdForTitle(task.title)).push(task);
  }
  const groups = TASK_GROUP_DEFS
    .map((group) => ({ id: group.id, label: group.label, tasks: buckets.get(group.id) }))
    .filter((group) => group.tasks.length);
  const other = buckets.get(OTHER_GROUP.id);
  if (other.length) groups.push({ id: OTHER_GROUP.id, label: OTHER_GROUP.label, tasks: other });
  return groups;
}
