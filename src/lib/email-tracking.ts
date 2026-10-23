export type EmailHistoryItem = {
  id: string;
  status: string;
  kind: 'AUTOMATIC' | 'MANUAL';
  createdAt: string;
  sentAt: string | null;
  notBefore: string | null;
  lastError: string | null;
  providerStatus?: string | null;
  providerUpdatedAt?: string | null;
  deliveredAt?: string | null;
  rejectedAt?: string | null;
};
export type ParticipantEmailSummary = {
  sentCount: number;
  lastSentAt: string | null;
  latest: EmailHistoryItem | null;
};
export const emailStatusLabels: Record<string, string> = {
  PENDING: 'En attente',
  SENDING: 'En cours d’envoi',
  SENT: 'Accepté par Mailgun',
  FAILED: 'Échec avant envoi',
  UNKNOWN: 'À vérifier',
  PAUSED: 'Suspendu',
  CANCELLED: 'Annulé',
};
export const deliveryStatusLabels: Record<string, string> = {
  ACCEPTED: 'Accepté par Mailgun',
  DELIVERED: 'Livré au serveur destinataire',
  DEFERRED: 'Livraison différée',
  REJECTED: 'Rejeté / non livré',
};
export function deliveryLabel(item: { status: string; providerStatus?: string | null }) {
  return (
    deliveryStatusLabels[item.providerStatus || ''] || emailStatusLabels[item.status] || item.status
  );
}
export function emailDate(value: string | null | undefined) {
  if (!value) return 'Date non disponible';
  return new Intl.DateTimeFormat('fr-LU', {
    dateStyle: 'short',
    timeStyle: 'short',
    timeZone: 'Europe/Luxembourg',
  }).format(new Date(value));
}
