import { rowFromItem } from '../graph.js';
import { ok } from '../normalize.js';
import { mapKitCatalog } from '../shapes.js';

export async function listKits(deps) {
  const items = await deps.graph.listItems(deps.settings.lists.kits, {
    select: ['Title', 'Active', 'SortOrder', 'Notes'],
    top: 200,
    orderby: 'fields/SortOrder asc',
  });
  return ok(items
    .map(rowFromItem)
    .map(mapKitCatalog)
    .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name)));
}
