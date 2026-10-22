export type EmailHistoryItem = {
  id: string;
  status: string;
  kind: 'AUTOMATIC' | 'MANUAL';
  createdAt: string;
  sentAt: string | null;
  notBefore: string | null;
  lastError: string | null;
};
export type ParticipantEmailSummary = {
  sentCount: number;
  lastSentAt: string | null;
  latest: EmailHistoryItem | null;
};
export const emailStatusLabels: Record<string, string> = {
  PENDING: 'En attente',
  SENDING: 'En cours d’envoi',
  SENT: 'Envoi confirmé par Mailgun',
  FAILED: 'Échec avant envoi',
  UNKNOWN: 'À vérifier',
  PAUSED: 'Suspendu',
  CANCELLED: 'Annulé',
};
export function emailDate(value: string | null | undefined) {
  if (!value) return 'Date non disponible';
  return new Intl.DateTimeFormat('fr-LU', {
    dateStyle: 'short',
    timeStyle: 'short',
    timeZone: 'Europe/Luxembourg',
  }).format(new Date(value));
}
