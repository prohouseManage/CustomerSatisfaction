import { api, requireAdmin, ApiError } from '@/lib/security';
import schema from '../../../../../docs/powerautomate/schema-declencheur.json';
import example from '../../../../../docs/powerautomate/exemple-reponse.json';
export const GET = api(async (request) => {
  await requireAdmin(request);
  const format = new URL(request.url).searchParams.get('format') || 'schema';
  if (!['schema', 'example'].includes(format))
    throw new ApiError(400, 'Formats acceptés : schema, example.');
  return new Response(JSON.stringify(format === 'schema' ? schema : example, null, 2), {
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Disposition': `attachment; filename="powerautomate-${format}.json"`,
      'Cache-Control': 'no-store',
    },
  });
});
