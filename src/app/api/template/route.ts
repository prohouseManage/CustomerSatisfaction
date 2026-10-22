import { api, requireAdmin } from '@/lib/security';
import { excelResponse } from '@/lib/excel';
export const GET = api(async (request) => {
  await requireAdmin(request);
  return excelResponse(
    [
      {
        name: 'Participants',
        rows: [
          { Nom: 'Dupont', Prénom: 'Jean', Email: 'jean@example.com' },
          { Nom: 'Martin', Prénom: 'Marie', Email: 'marie@example.com' },
        ],
      },
    ],
    'modele-participants',
  );
});
