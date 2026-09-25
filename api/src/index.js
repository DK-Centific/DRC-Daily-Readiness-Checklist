import { app } from '@azure/functions';
import { createGraphClient, loadSettings } from './graph.js';
import { handleHttp } from './router.js';

const settings = loadSettings();
const graph = createGraphClient({ settings });

app.http('drc', {
  methods: ['POST', 'OPTIONS'],
  authLevel: 'anonymous',
  route: 'drc',
  handler: (request) => handleHttp(request, { settings, graph }),
});
