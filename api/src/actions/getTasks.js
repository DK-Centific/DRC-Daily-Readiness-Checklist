import { rowFromItem } from '../graph.js';
import { isTaskRowVisible, mapTask } from '../shapes.js';

export async function getTasks(deps) {
  const items = await deps.graph.listItems(deps.settings.lists.tasks, {
    filter: 'fields/Active ne false',
    select: ['Title', 'TaskOrder', 'Active'],
    top: 200,
    orderby: 'fields/TaskOrder asc',
  });
  return items
    .map(rowFromItem)
    .filter(isTaskRowVisible)
    .map(mapTask)
    .sort((a, b) => a.order - b.order || a.id - b.id);
}
