import { rowFromItem } from '../graph.js';
import { fail, ok } from '../normalize.js';
import { joinKits } from '../shapes.js';

const DATE = /^\d{4}-\d{2}-\d{2}$/;

export async function getKits(deps, body) {
  const date = String(body?.date ?? '').trim();
  if (!DATE.test(date)) return fail('VALIDATION', 'Choose a valid date.');
  const [kits, claims] = await Promise.all([
    deps.graph.listItems(deps.settings.lists.kits, {
      filter: 'fields/Active ne false',
      select: ['Title', 'Active', 'SortOrder'],
      top: 200,
      orderby: 'fields/SortOrder asc',
    }),
    deps.graph.listItems(deps.settings.lists.log, {
      filter: `fields/ClaimDate eq '${date}' and fields/Status eq 'Claimed'`,
      select: ['UserEmail', 'UserName', 'KitID', 'CheckInAt', 'Status', 'CompletedTaskIDs'],
      top: 100,
    }),
  ]);
  return ok(joinKits(kits.map(rowFromItem), claims.map(rowFromItem)));
}
