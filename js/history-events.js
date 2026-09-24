/** Turn claim rows into a newest-first claimed / unclaimed log. */

function text(value) {
  return value == null ? '' : String(value).trim();
}

function pick(row, camel, pascal) {
  if (!row) return '';
  if (row[camel] != null && text(row[camel])) return text(row[camel]);
  if (row[pascal] != null && text(row[pascal])) return text(row[pascal]);
  return '';
}

export function unclaimActor(row) {
  return {
    name: pick(row, 'checkedOutByName', 'CheckedOutByName') || text(row?.userName),
    email: pick(row, 'checkedOutByEmail', 'CheckedOutByEmail') || text(row?.userEmail),
  };
}

export function historyEvents(rows) {
  const events = [];
  for (const row of rows || []) {
    events.push({
      id: `${row.id}-claimed`,
      kind: 'claimed',
      at: row.checkInAt,
      kitName: row.kitName,
      claimDate: row.claimDate,
      name: text(row.userName),
      email: text(row.userEmail),
      tasksCompleted: row.tasksCompleted,
      tasksTotal: row.tasksTotal,
    });
    if (row.checkOutAt || row.status === 'CheckedOut') {
      const actor = unclaimActor(row);
      events.push({
        id: `${row.id}-unclaimed`,
        kind: 'unclaimed',
        at: row.checkOutAt,
        kitName: row.kitName,
        claimDate: row.claimDate,
        name: actor.name,
        email: actor.email,
        tasksCompleted: row.tasksCompleted,
        tasksTotal: row.tasksTotal,
      });
    }
  }
  events.sort((a, b) => {
    const byTime = String(b.at || '').localeCompare(String(a.at || ''));
    if (byTime !== 0) return byTime;
    if (a.kind === b.kind) return 0;
    return a.kind === 'unclaimed' ? -1 : 1;
  });
  return events;
}
