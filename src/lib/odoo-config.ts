import { Prisma } from '@prisma/client';
import { db } from './db';
import { decryptToken, encryptToken, hashToken } from './crypto';
import { odooConfig, type OdooConfig } from './odoo-client';
import { normalizeOdooUrl } from './odoo-url';

export function sessionOdooConfig(sessionId: string, url: string): OdooConfig {
  const normalized = normalizeOdooUrl(url);
  return {
    sourceSessionId: sessionId,
    targetSessionId: sessionId,
    url: normalized,
    sessionName: '',
    trainer: '',
    fingerprint: hashToken(JSON.stringify(['session-odoo-v1', sessionId, normalized])),
  };
}
export async function getOdooConfig(sessionId: string, client: Prisma.TransactionClient = db) {
  const stored = await client.odooConnection.findUnique({ where: { sessionId } });
  if (stored)
    return stored.enabled ? sessionOdooConfig(sessionId, decryptToken(stored.urlEncrypted)) : null;
  const legacy = odooConfig();
  return legacy?.sourceSessionId === sessionId ? legacy : null;
}
export async function saveOdooConnection(
  tx: Prisma.TransactionClient,
  sessionId: string,
  url: string | undefined,
  enabled: boolean | undefined,
) {
  if (url === undefined && enabled === undefined) return;
  const stored = await tx.odooConnection.findUnique({ where: { sessionId } });
  const previous = stored
    ? decryptToken(stored.urlEncrypted)
    : odooConfig()?.sourceSessionId === sessionId
      ? odooConfig()!.url
      : '';
  const chosen = url === undefined ? previous : url;
  // Keep a disabled row to override any legacy environment configuration for this session.
  const normalized = chosen ? normalizeOdooUrl(chosen) : '';
  const active = !!normalized && (enabled ?? stored?.enabled ?? true);
  await tx.odooConnection.upsert({
    where: { sessionId },
    create: { sessionId, urlEncrypted: encryptToken(normalized), enabled: active },
    update: { urlEncrypted: encryptToken(normalized), enabled: active },
  });
}
