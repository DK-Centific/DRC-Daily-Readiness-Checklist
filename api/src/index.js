import { app } from '@azure/functions';
import { corsHeaders, fail } from './normalize.js';

app.http('drc', {
  methods: ['POST', 'OPTIONS'],
  authLevel: 'anonymous',
  route: 'drc',
  handler: async (request) => {
    if (request.method === 'OPTIONS') {
      return { status: 204, headers: corsHeaders() };
    }
    return fail('VALIDATION', 'Not implemented');
  },
});
