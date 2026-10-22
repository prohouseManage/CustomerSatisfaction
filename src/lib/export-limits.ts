import { ApiError } from './security';
export const MAX_EXPORT_BYTES = 4_000_000;
export { PDF_PARTICIPANTS_PER_FILE } from './export-policy';
export function assertExportBytes(bytes: number) {
  if (bytes > MAX_EXPORT_BYTES)
    throw new ApiError(
      413,
      'Le fichier dépasse 4 Mo. Réduisez la période ou sélectionnez une session pour cet export.',
    );
}
