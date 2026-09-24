import assert from 'node:assert/strict';
import { test } from 'node:test';
import { groupIdForTitle, groupTasks } from '../js/task-groups.js';

test('task titles land in the expected groups', () => {
  assert.equal(groupIdForTitle('Verify image quality and Live View before packing.'), 'camera');
  assert.equal(groupIdForTitle('Battery charging: Power Banks (Two per kit)'), 'power');
  assert.equal(groupIdForTitle('All power cables tested for functionality with their devices.'), 'cables');
  assert.equal(groupIdForTitle('eero wireless systems and kit Ethernet cables tested for functionality.'), 'network');
  assert.equal(groupIdForTitle('Carefully check and clean the calibration board.'), 'contents');
  assert.equal(groupIdForTitle('Record the room temperature'), 'other');
});

test('groups keep TaskOrder and skip empty groups', () => {
  const groups = groupTasks([
    { id: 3, title: 'All tripods and poles are in working condition.', order: 12 },
    { id: 1, title: 'Clean camera lenses.', order: 2 },
    { id: 2, title: 'Inspect camera bodies.', order: 1 },
    { id: 4, title: 'Inspect all cables for cuts.', order: 11 },
  ]);
  assert.deepEqual(groups.map((group) => group.label), ['Camera', 'Cables & mounts']);
  assert.deepEqual(groups[0].tasks.map((task) => task.id), [2, 1]);
  assert.deepEqual(groups[1].tasks.map((task) => task.id), [4, 3]);
});
