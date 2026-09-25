import { rowFromItem } from '../graph.js';
import { ok } from '../normalize.js';
import { mapAccessRow } from '../shapes.js';

export async function listAccess(deps) {
  const items = await deps.graph.listItems(deps.settings.lists.access, {
    select: ['Title', 'Email', 'FirstName', 'LastName', 'Role', 'Active'],
    top: 500,
  });
  return ok(items
    .map(rowFromItem)
    .map(mapAccessRow)
    .sort((a, b) => a.name.localeCompare(b.name) || a.email.localeCompare(b.email)));
}
