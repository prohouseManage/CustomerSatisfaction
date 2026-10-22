import { Prisma } from '@prisma/client';
import { hash } from 'bcryptjs';
import { db } from './db';
import { ApiError } from './security';
import { generateToken, hashToken, encryptToken, decryptToken, baseUrl } from './crypto';
import { emailServiceStatus } from './emails';
import { sendSmtpEmail, EmailSendError, type OutgoingEmail } from './email-smtp';
import { collaborationEmail } from './collaboration-email';
import {
  invitationSchema,
  memberUpdateSchema,
  acceptInvitationSchema,
  INVITATION_DAYS,
} from './staff-policy';

const memberSelect = {
  id: true,
  name: true,
  email: true,
  role: true,
  enabled: true,
  createdAt: true,
} as const;
const invitationSelect = {
  id: true,
  email: true,
  name: true,
  role: true,
  createdAt: true,
  expiresAt: true,
  acceptedAt: true,
  revokedAt: true,
  deliveryStatus: true,
  sentAt: true,
  updatedAt: true,
} as const;
async function collaborationLock(tx: Prisma.TransactionClient) {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(724290117::bigint)`;
}
async function assertAdministrator(tx: Prisma.TransactionClient, actorId: string) {
  const actor = await tx.admin.findUnique({ where: { id: actorId } });
  if (!actor?.enabled || actor.role !== 'ADMIN')
    throw new ApiError(403, 'Administrateur actif requis.');
}
function invitationIsValid(
  invitation: {
    acceptedAt: Date | null;
    revokedAt: Date | null;
    expiresAt: Date;
    inviter: { role: string; enabled: boolean };
  } | null,
) {
  return (
    invitation &&
    !invitation.acceptedAt &&
    !invitation.revokedAt &&
    invitation.expiresAt > new Date() &&
    invitation.inviter.enabled &&
    invitation.inviter.role === 'ADMIN'
  );
}
export async function collaborationOverview(page = 1) {
  const [members, total, invitations] = await Promise.all([
    db.admin.findMany({
      select: memberSelect,
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      take: 50,
      skip: (page - 1) * 50,
    }),
    db.admin.count(),
    db.staffInvitation.findMany({
      where: { acceptedAt: null },
      select: invitationSelect,
      orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
      take: 50,
    }),
  ]);
  return { members, total, page, pageSize: 50, invitations, service: emailServiceStatus() };
}
export async function createStaffInvitation(actorId: string, value: unknown, ipHash: string) {
  const input = invitationSchema.parse(value);
  if (!emailServiceStatus().ready)
    throw new ApiError(
      503,
      'Configurez le service d’e-mail et une adresse publique HTTPS pour envoyer une invitation.',
    );
  const token = generateToken();
  return db.$transaction(async (tx) => {
    await collaborationLock(tx);
    await assertAdministrator(tx, actorId);
    if (await tx.admin.findUnique({ where: { email: input.email } }))
      throw new ApiError(
        409,
        'Ce collaborateur possède déjà un compte. Modifiez ses accès dans la liste.',
      );
    const existing = await tx.staffInvitation.findUnique({ where: { email: input.email } });
    if (existing && !existing.revokedAt && !existing.acceptedAt && existing.expiresAt > new Date())
      throw new ApiError(
        409,
        'Une invitation est déjà en cours. Utilisez « Renvoyer » ou révoquez-la.',
      );
    const data = {
      ...input,
      inviterId: actorId,
      tokenHash: hashToken(token),
      tokenEncrypted: encryptToken(token),
      expiresAt: new Date(Date.now() + INVITATION_DAYS * 86400000),
      acceptedAt: null,
      revokedAt: null,
      deliveryStatus: 'PENDING',
      sentAt: null,
    };
    const invitation = await tx.staffInvitation.upsert({
      where: { email: input.email },
      create: data,
      update: data,
      select: invitationSelect,
    });
    await tx.auditLog.create({
      data: { action: 'COLLABORATOR_INVITED', actorId, resourceId: invitation.id, ipHash },
    });
    return invitation;
  });
}
export async function resendStaffInvitation(actorId: string, id: string, ipHash: string) {
  if (!emailServiceStatus().ready) throw new ApiError(503, 'Le service d’e-mail n’est pas prêt.');
  const token = generateToken();
  return db.$transaction(async (tx) => {
    await collaborationLock(tx);
    await assertAdministrator(tx, actorId);
    const previous = await tx.staffInvitation.findUnique({ where: { id } });
    if (!previous || previous.acceptedAt || previous.revokedAt)
      throw new ApiError(409, 'Cette invitation ne peut plus être renvoyée.');
    if (Date.now() - previous.updatedAt.getTime() < 60000)
      throw new ApiError(429, 'Patientez une minute avant de renvoyer cette invitation.');
    if (await tx.admin.findUnique({ where: { email: previous.email } }))
      throw new ApiError(409, 'Ce compte existe déjà.');
    const invitation = await tx.staffInvitation.update({
      where: { id },
      data: {
        tokenHash: hashToken(token),
        tokenEncrypted: encryptToken(token),
        inviterId: actorId,
        expiresAt: new Date(Date.now() + INVITATION_DAYS * 86400000),
        deliveryStatus: 'PENDING',
        sentAt: null,
      },
      select: invitationSelect,
    });
    await tx.auditLog.create({
      data: { action: 'COLLABORATOR_INVITATION_RESENT', actorId, resourceId: id, ipHash },
    });
    return invitation;
  });
}
export async function revokeStaffInvitation(actorId: string, id: string, ipHash: string) {
  await db.$transaction(async (tx) => {
    await collaborationLock(tx);
    await assertAdministrator(tx, actorId);
    const result = await tx.staffInvitation.updateMany({
      where: { id, acceptedAt: null, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    if (!result.count) throw new ApiError(409, 'Cette invitation n’est plus active.');
    await tx.auditLog.create({
      data: { action: 'COLLABORATOR_INVITATION_REVOKED', actorId, resourceId: id, ipHash },
    });
  });
}
export async function deliverStaffInvitation(
  id: string,
  transport: (message: OutgoingEmail) => Promise<void> = sendSmtpEmail,
) {
  if (!emailServiceStatus().ready) return;
  const invitation = await db.staffInvitation.findUnique({
    where: { id },
    include: { inviter: true },
  });
  if (!invitationIsValid(invitation) || !invitation) return;
  const claimed = await db.staffInvitation.updateMany({
    where: {
      id,
      tokenHash: invitation.tokenHash,
      deliveryStatus: 'PENDING',
      acceptedAt: null,
      revokedAt: null,
      expiresAt: { gt: new Date() },
      inviter: { role: 'ADMIN', enabled: true },
    },
    data: { deliveryStatus: 'SENDING' },
  });
  if (!claimed.count) return;
  try {
    const token = decryptToken(invitation.tokenEncrypted);
    const message = collaborationEmail({
      name: invitation.name,
      role: invitation.role,
      expiresAt: invitation.expiresAt,
      url: `${baseUrl()}/invitation#token=${token}`,
    });
    await transport({
      ...message,
      to: invitation.email,
      deliveryId: `invite-${id}-${invitation.tokenHash.slice(0, 12)}`,
    });
    await db.staffInvitation.updateMany({
      where: { id, tokenHash: invitation.tokenHash, deliveryStatus: 'SENDING' },
      data: { deliveryStatus: 'SENT', sentAt: new Date() },
    });
  } catch (error) {
    await db.staffInvitation.updateMany({
      where: { id, tokenHash: invitation.tokenHash, deliveryStatus: 'SENDING' },
      data: {
        deliveryStatus: error instanceof EmailSendError && !error.uncertain ? 'FAILED' : 'UNKNOWN',
      },
    });
  }
}
export async function previewStaffInvitation(token: string) {
  const invitation = await db.staffInvitation.findUnique({
    where: { tokenHash: hashToken(token) },
    include: { inviter: true },
  });
  if (!invitationIsValid(invitation) || !invitation)
    throw new ApiError(
      410,
      'Cette invitation est expirée, révoquée ou déjà utilisée. Demandez une nouvelle invitation à votre administrateur.',
    );
  return {
    email: invitation.email,
    name: invitation.name,
    role: invitation.role,
    expiresAt: invitation.expiresAt,
  };
}
export async function acceptStaffInvitation(value: unknown, ipHash: string) {
  const input = acceptInvitationSchema.parse(value);
  // Reject invalid/expired links before the expensive password hash, then recheck under the lock.
  await previewStaffInvitation(input.token);
  const passwordHash = await hash(input.password, 12);
  return db.$transaction(async (tx) => {
    await collaborationLock(tx);
    const invitation = await tx.staffInvitation.findUnique({
      where: { tokenHash: hashToken(input.token) },
      include: { inviter: true },
    });
    if (!invitationIsValid(invitation) || !invitation)
      throw new ApiError(410, 'Cette invitation n’est plus valide.');
    if (await tx.admin.findUnique({ where: { email: invitation.email } }))
      throw new ApiError(
        409,
        'Ce compte existe déjà. Connectez-vous ou contactez votre administrateur.',
      );
    const member = await tx.admin.create({
      data: { email: invitation.email, name: input.name, passwordHash, role: invitation.role },
      select: memberSelect,
    });
    await tx.staffInvitation.update({
      where: { id: invitation.id },
      data: { acceptedAt: new Date() },
    });
    await tx.auditLog.create({
      data: {
        action: 'COLLABORATOR_JOINED',
        actorId: member.id,
        resourceId: invitation.id,
        ipHash,
      },
    });
    return member;
  });
}
export async function updateStaffMember(
  actorId: string,
  id: string,
  value: unknown,
  ipHash: string,
) {
  const input = memberUpdateSchema.parse(value);
  return db.$transaction(async (tx) => {
    await collaborationLock(tx);
    await assertAdministrator(tx, actorId);
    const target = await tx.admin.findUnique({ where: { id } });
    if (!target) throw new ApiError(404, 'Collaborateur introuvable.');
    if (id === actorId)
      throw new ApiError(409, 'Vous ne pouvez pas modifier vos propres droits depuis cet écran.');
    const role = input.role ?? target.role;
    const enabled = input.enabled ?? target.enabled;
    if (
      target.enabled &&
      target.role === 'ADMIN' &&
      (!enabled || role !== 'ADMIN') &&
      (await tx.admin.count({ where: { role: 'ADMIN', enabled: true } })) <= 1
    )
      throw new ApiError(409, 'Conservez au moins un administrateur actif.');
    const changed = target.role !== role || target.enabled !== enabled;
    if (target.role === 'ADMIN' && (!enabled || role !== 'ADMIN')) {
      await tx.staffInvitation.updateMany({
        where: { inviterId: id, acceptedAt: null, revokedAt: null },
        data: { revokedAt: new Date() },
      });
    }
    const member = await tx.admin.update({
      where: { id },
      data: { role, enabled, ...(changed ? { sessionVersion: { increment: 1 } } : {}) },
      select: memberSelect,
    });
    if (changed)
      await tx.auditLog.create({
        data: { action: 'COLLABORATOR_ACCESS_UPDATED', actorId, resourceId: id, ipHash },
      });
    return member;
  });
}
