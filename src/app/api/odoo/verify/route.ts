import { z } from 'zod';
import { api, ApiError, requireAdmin, readJson, rateLimit } from '@/lib/security';
import { inspectOdoo, OdooError } from '@/lib/odoo-client';
import { getOdooConfig, sessionOdooConfig } from '@/lib/odoo-config';
import { isOdooUrl } from '@/lib/odoo-url';
export const maxDuration = 30;
const inputSchema = z.union([
  z
    .object({
      url: z.string().trim().max(2048).refine(isOdooUrl, 'Lien de questionnaire Odoo invalide.'),
    })
    .strict(),
  z.object({ sessionId: z.string().min(3).max(50) }).strict(),
]);
export const POST = api(async (request) => {
  const admin = await requireAdmin(request);
  await rateLimit(`odoo-verify:${admin.id}`, 12, 300);
  const input = inputSchema.parse(await readJson(request));
  const config =
    'url' in input
      ? sessionOdooConfig('VERIFICATION', input.url)
      : await getOdooConfig(input.sessionId);
  if (!config) throw new ApiError(400, 'Aucun lien Odoo actif pour cette session.');
  try {
    return Response.json({
      ok: true,
      ...(await inspectOdoo(config)),
      message: 'Lien accessible et questionnaire compatible. Aucune évaluation envoyée.',
    });
  } catch (error) {
    if (error instanceof OdooError) throw new ApiError(400, error.message);
    throw error;
  }
});
