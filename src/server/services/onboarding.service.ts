import { createHash, randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import {
  OnboardingPlan,
  OnboardingReceiptStatus,
  OnboardingRequestStatus,
  Permission,
  Prisma,
  SchoolStatus,
  UserStatus
} from "@prisma/client";
import { env } from "@/server/config/env";
import { prisma } from "@/server/db/prisma";
import { AppError } from "@/server/http/errors";
import { extractPaymentDataFromText } from "@/server/services/extraction.service";
import { sendEmail } from "@/server/services/email.service";
import { sendTelegramTextMessageWithToken, type TelegramInboundMessage } from "@/server/services/telegram.service";
import { persistReceiptMedia } from "@/server/services/storage.service";
import { extractOnboardingReceiptText } from "@/server/services/ocr.service";
import { formatCurrencyFromCents } from "@/server/utils/money";
import { compactPhone } from "@/server/utils/strings";

const onboardingSetupAmountCents = 3_990_000;
const activationTokenTtlMs = 60 * 60 * 1000;

const permissionCatalog = [
  ["dashboard.read", "Ver dashboard financiero"],
  ["students.read", "Ver alumnos"],
  ["students.write", "Crear y editar alumnos"],
  ["charges.read", "Ver cargos"],
  ["charges.write", "Crear y editar cargos"],
  ["receipts.read", "Ver comprobantes"],
  ["reviews.read", "Ver revision manual"],
  ["reviews.resolve", "Resolver revision manual"],
  ["webhooks.manage", "Configurar canales y webhooks"],
  ["settings.manage", "Administrar configuracion del tenant"]
] as const;

const pendingOnboardingStatuses = [
  OnboardingRequestStatus.PENDING_PAYMENT,
  OnboardingRequestStatus.TELEGRAM_LINKED,
  OnboardingRequestStatus.RECEIPT_RECEIVED,
  OnboardingRequestStatus.UNDER_REVIEW,
  OnboardingRequestStatus.APPROVED_PENDING_ACTIVATION
] satisfies OnboardingRequestStatus[];

const onboardingTelegramChatStatuses = [
  OnboardingRequestStatus.PENDING_PAYMENT,
  OnboardingRequestStatus.TELEGRAM_LINKED,
  OnboardingRequestStatus.RECEIPT_RECEIVED,
  OnboardingRequestStatus.UNDER_REVIEW
] satisfies OnboardingRequestStatus[];

const closedOnboardingStatuses = new Set<OnboardingRequestStatus>([
  OnboardingRequestStatus.REJECTED,
  OnboardingRequestStatus.CANCELED,
  OnboardingRequestStatus.EXPIRED,
  OnboardingRequestStatus.ACTIVE
]);

function getOnboardingTelegramConfig() {
  const botToken = env.ONBOARDING_TELEGRAM_BOT_TOKEN || env.TELEGRAM_BOT_TOKEN;
  const botUsername = env.ONBOARDING_TELEGRAM_BOT_USERNAME || env.TELEGRAM_BOT_USERNAME;

  return {
    enabled: env.ONBOARDING_TELEGRAM_ENABLED || env.TELEGRAM_ENABLED,
    botToken,
    botUsername
  };
}

async function safeSendOnboardingTelegramMessage(chatId: string, text: string, botToken: string) {
  try {
    await sendTelegramTextMessageWithToken(chatId, text, botToken);
    return true;
  } catch (error) {
    console.error("[onboarding][telegram] failed to send message", {
      chatId,
      error: error instanceof Error ? error.message : "Unknown error"
    });
    return false;
  }
}

function buildOnboardingReceiptResultMessage(input: {
  publicCode: string;
  email: string;
  expectedAmountCents: number;
  detectedAmountCents: number | null;
  mediaFailure?: string | null;
  extractionFailure?: string | null;
}) {
  const expectedAmount = formatCurrencyFromCents(input.expectedAmountCents);

  if (input.detectedAmountCents === input.expectedAmountCents) {
    return `Leimos un monto de ${expectedAmount} para la solicitud ${input.publicCode}. Coincide con el valor esperado y tu comprobante ya quedo en revision. Te avisaremos por este chat y al correo ${input.email} cuando terminemos la validacion.`;
  }

  if (input.detectedAmountCents != null) {
    const detectedAmount = formatCurrencyFromCents(input.detectedAmountCents);
    return `Recibimos tu comprobante para la solicitud ${input.publicCode}. Detectamos un monto de ${detectedAmount}, pero el valor esperado es ${expectedAmount}. Ya lo dejamos en revision manual y te avisaremos por este chat y al correo ${input.email}. No necesitas reenviarlo por ahora.`;
  }

  if (input.mediaFailure || input.extractionFailure) {
    return `Recibimos tu archivo para la solicitud ${input.publicCode}, pero no pudimos leer el monto automaticamente. Ya lo dejamos en revision manual y te avisaremos por este chat y al correo ${input.email}. No necesitas reenviarlo por ahora.`;
  }

  return `Recibimos tu comprobante para la solicitud ${input.publicCode}. Ya quedo en revision y te avisaremos por este chat y al correo ${input.email} cuando terminemos la validacion.`;
}

function normalizeEmail(value: string) {
  return value.trim().toLowerCase();
}

function normalizeRequiredText(value: string, label: string) {
  const normalized = value.trim();
  if (!normalized) {
    throw new AppError(`Debes ingresar ${label}`);
  }

  return normalized;
}

function normalizeOptionalText(value: string | null | undefined) {
  const normalized = value?.trim();
  return normalized ? normalized : null;
}

function slugifyAcademyName(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}

function generateCode(prefix: string, bytes = 4) {
  return `${prefix}${randomBytes(bytes).toString("base64url").replace(/[^A-Za-z0-9]/g, "").slice(0, bytes + 2).toUpperCase()}`;
}

async function generateUniquePublicCode() {
  for (let attempt = 0; attempt < 10; attempt += 1) {
    const publicCode = generateCode("PG-");
    const existing = await prisma.onboardingRequest.findUnique({
      where: { publicCode },
      select: { id: true }
    });

    if (!existing) {
      return publicCode;
    }
  }

  throw new AppError("No pudimos generar un codigo de onboarding unico", 500);
}

async function generateUniqueStartToken() {
  for (let attempt = 0; attempt < 10; attempt += 1) {
    const telegramStartToken = randomBytes(10).toString("base64url");
    const existing = await prisma.onboardingRequest.findUnique({
      where: { telegramStartToken },
      select: { id: true }
    });

    if (!existing) {
      return telegramStartToken;
    }
  }

  throw new AppError("No pudimos generar un token de Telegram unico", 500);
}

async function generateUniqueSchoolSlug(baseSlug: string, tx: Prisma.TransactionClient) {
  const fallback = baseSlug || "academia";

  for (let attempt = 0; attempt < 20; attempt += 1) {
    const slug = attempt === 0 ? fallback : `${fallback}-${attempt + 1}`;
    const existing = await tx.school.findUnique({
      where: { slug },
      select: { id: true }
    });

    if (!existing) {
      return slug;
    }
  }

  throw new AppError("No pudimos generar un slug disponible para la academia", 409);
}

function buildTelegramDeepLink(startToken: string) {
  const telegramConfig = getOnboardingTelegramConfig();

  if (!telegramConfig.enabled || !telegramConfig.botUsername) {
    return null;
  }

  return `https://t.me/${telegramConfig.botUsername}?start=onb_${startToken}`;
}

function buildSetupInstructions(request: {
  publicCode: string;
  expectedAmountCents: number;
  academyName: string;
  telegramStartToken: string;
}) {
  const telegramLink = buildTelegramDeepLink(request.telegramStartToken);
  const paymentDestination = {
    bankName: env.ONBOARDING_PAYMENT_BANK_NAME,
    accountType: env.ONBOARDING_PAYMENT_ACCOUNT_TYPE,
    accountNumber: env.ONBOARDING_PAYMENT_ACCOUNT_NUMBER,
    holderName: env.ONBOARDING_PAYMENT_HOLDER_NAME,
    holderRut: env.ONBOARDING_PAYMENT_HOLDER_RUT || null,
    transferEmail: env.ONBOARDING_PAYMENT_EMAIL || null,
    configured:
      env.ONBOARDING_PAYMENT_BANK_NAME.length > 0 &&
      env.ONBOARDING_PAYMENT_ACCOUNT_TYPE.length > 0 &&
      env.ONBOARDING_PAYMENT_ACCOUNT_NUMBER.length > 0 &&
      env.ONBOARDING_PAYMENT_HOLDER_NAME.length > 0
  };

  return {
    amountCents: request.expectedAmountCents,
    amountLabel: new Intl.NumberFormat("es-CL", {
      style: "currency",
      currency: "CLP",
      maximumFractionDigits: 0
    }).format(request.expectedAmountCents / 100),
    referenceCode: request.publicCode,
    academyName: request.academyName,
    telegramLink,
    paymentDestination,
    steps: [
      "Transfiere el valor del Pre-calentamiento.",
      "Abre el bot de onboarding con el enlace entregado.",
      "Envianos el comprobante en ese mismo chat para dejar tu academia en revision."
    ]
  };
}

type OnboardingSetupInstructions = ReturnType<typeof buildSetupInstructions>;

async function sendOnboardingRequestEmail(input: {
  email: string;
  fullName: string;
  instructions: OnboardingSetupInstructions;
}) {
  const paymentDestination = input.instructions.paymentDestination;
  const paymentSummary = paymentDestination.configured
    ? [
        `Banco: ${paymentDestination.bankName}`,
        `Tipo de cuenta: ${paymentDestination.accountType}`,
        `Numero de cuenta: ${paymentDestination.accountNumber}`,
        `Titular: ${paymentDestination.holderName}`,
        paymentDestination.holderRut ? `RUT: ${paymentDestination.holderRut}` : null,
        paymentDestination.transferEmail ? `Correo transferencia: ${paymentDestination.transferEmail}` : null
      ]
        .filter(Boolean)
        .join("\n")
    : "Estamos configurando los datos de transferencia. Te contactaremos para completarlos.";

  const subject = `Acceso al bot de onboarding de ${input.instructions.academyName}`;
  const text = [
    `Hola ${input.fullName},`,
    "",
    `Recibimos tu solicitud para ${input.instructions.academyName}.`,
    `Codigo de referencia: ${input.instructions.referenceCode}`,
    `Monto del Pre-calentamiento: ${input.instructions.amountLabel}`,
    "",
    input.instructions.telegramLink
      ? `Ingresa al bot con este enlace: ${input.instructions.telegramLink}`
      : "El bot de onboarding no esta configurado en este momento. Conserva tu codigo y te ayudaremos a retomar el proceso.",
    "",
    "Datos de transferencia:",
    paymentSummary,
    "",
    "Si sales de la pagina, puedes volver a este correo para recuperar el acceso al bot."
  ].join("\n");

  const paymentHtml = paymentDestination.configured
    ? `
      <ul style="margin:0;padding-left:18px">
        <li><strong>Banco:</strong> ${paymentDestination.bankName}</li>
        <li><strong>Tipo de cuenta:</strong> ${paymentDestination.accountType}</li>
        <li><strong>Numero de cuenta:</strong> ${paymentDestination.accountNumber}</li>
        <li><strong>Titular:</strong> ${paymentDestination.holderName}</li>
        ${paymentDestination.holderRut ? `<li><strong>RUT:</strong> ${paymentDestination.holderRut}</li>` : ""}
        ${paymentDestination.transferEmail ? `<li><strong>Correo transferencia:</strong> ${paymentDestination.transferEmail}</li>` : ""}
      </ul>
    `
    : "<p>Estamos configurando los datos de transferencia. Te contactaremos para completarlos.</p>";

  const html = `
    <div style="font-family:Segoe UI,Arial,sans-serif;line-height:1.6;color:#1f2937">
      <p>Hola <strong>${input.fullName}</strong>,</p>
      <p>Recibimos tu solicitud para <strong>${input.instructions.academyName}</strong>.</p>
      <p>
        <strong>Codigo de referencia:</strong> ${input.instructions.referenceCode}<br />
        <strong>Monto del Pre-calentamiento:</strong> ${input.instructions.amountLabel}
      </p>
      ${
        input.instructions.telegramLink
          ? `
            <p>
              <a href="${input.instructions.telegramLink}" style="display:inline-block;padding:12px 18px;border-radius:10px;background:#2563eb;color:#ffffff;text-decoration:none;font-weight:700">
                Abrir bot de onboarding
              </a>
            </p>
            <p>Si sales de la pagina, puedes volver a este correo para recuperar el acceso al bot.</p>
          `
          : "<p>El bot de onboarding no esta configurado en este momento. Conserva tu codigo y te ayudaremos a retomar el proceso.</p>"
      }
      <p><strong>Datos de transferencia</strong></p>
      ${paymentHtml}
    </div>
  `;

  return sendEmail({
    to: input.email,
    subject,
    text,
    html
  });
}

function assertReviewSecret(secret: string | null) {
  if (!env.ONBOARDING_REVIEW_SECRET || secret !== env.ONBOARDING_REVIEW_SECRET) {
    throw new AppError("No autorizado para revisar onboarding", 403);
  }
}

async function assertOnboardingRequestCanBeCreated(email: string, phone: string) {
  const [existingUser, existingPending] = await prisma.$transaction([
    prisma.user.findUnique({
      where: { email },
      select: { id: true }
    }),
    prisma.onboardingRequest.findFirst({
      where: {
        OR: [{ email }, { phone }],
        status: {
          in: pendingOnboardingStatuses
        }
      },
      select: {
        publicCode: true,
        status: true
      },
      orderBy: { createdAt: "desc" }
    })
  ]);

  if (existingUser) {
    throw new AppError("Ya existe un usuario con ese correo. Si necesitas ayuda, contactanos.", 409);
  }

  if (existingPending) {
    throw new AppError(
      `Ya existe una solicitud activa para este contacto (${existingPending.publicCode}).`,
      409
    );
  }
}

async function ensurePermissions(tx: Prisma.TransactionClient) {
  const permissions: Permission[] = [];

  for (const [key, description] of permissionCatalog) {
    const permission = await tx.permission.upsert({
      where: { key },
      update: { description },
      create: { key, description }
    });

    permissions.push(permission);
  }

  return permissions;
}

async function ensureSchoolRoles(tx: Prisma.TransactionClient, schoolId: string, permissions: Permission[]) {
  const adminRole = await tx.role.upsert({
    where: {
      schoolId_key: {
        schoolId,
        key: "admin"
      }
    },
    update: {
      name: "Administrador",
      description: "Acceso completo al tenant",
      isSystem: true
    },
    create: {
      schoolId,
      name: "Administrador",
      key: "admin",
      description: "Acceso completo al tenant",
      isSystem: true
    }
  });

  await tx.rolePermission.deleteMany({
    where: { roleId: adminRole.id }
  });

  await tx.rolePermission.createMany({
    data: permissions.map((permission) => ({
      roleId: adminRole.id,
      permissionId: permission.id
    })),
    skipDuplicates: true
  });

  return adminRole;
}

function createTokenHash(rawToken: string) {
  return createHash("sha256").update(rawToken).digest("hex");
}

function createTemporaryPassword() {
  return randomBytes(18).toString("base64url");
}

async function createActivationToken(input: {
  tx: Prisma.TransactionClient;
  onboardingRequestId: string;
  userId: string;
}) {
  const rawToken = randomBytes(24).toString("base64url");
  const tokenHash = createTokenHash(rawToken);
  const expiresAt = new Date(Date.now() + activationTokenTtlMs);

  await input.tx.onboardingActivationToken.updateMany({
    where: {
      onboardingRequestId: input.onboardingRequestId,
      usedAt: null
    },
    data: {
      usedAt: new Date()
    }
  });

  await input.tx.onboardingActivationToken.create({
    data: {
      onboardingRequestId: input.onboardingRequestId,
      userId: input.userId,
      tokenHash,
      expiresAt
    }
  });

  return {
    rawToken,
    expiresAt
  };
}

async function sendActivationEmail(input: {
  email: string;
  fullName: string;
  academyName: string;
  publicCode: string;
  activationUrl: string;
  expiresAt: Date;
}) {
  const expiryLabel = new Intl.DateTimeFormat("es-CL", {
    dateStyle: "short",
    timeStyle: "short"
  }).format(input.expiresAt);
  const loginUrl = env.APP_URL;

  const subject = `Activa tu cuenta de ${input.academyName} en CobroFutbol`;
  const text = [
    `Hola ${input.fullName},`,
    "",
    `Tu academia ${input.academyName} ya fue aprobada y tu cuenta administradora esta lista para activarse.`,
    "",
    "Resumen de tu alta:",
    `- Academia: ${input.academyName}`,
    `- Correo de acceso: ${input.email}`,
    `- Codigo de referencia: ${input.publicCode}`,
    "",
    "Siguiente paso:",
    `1. Abre este enlace: ${input.activationUrl}`,
    "2. Define tu contrasena",
    `3. Entra al panel desde ${loginUrl}`,
    "",
    `Este enlace vence el ${expiryLabel}.`,
    "",
    `Si el boton no abre, copia y pega este enlace en tu navegador: ${input.activationUrl}`,
    "",
    "Si no solicitaste esta alta, ignora este mensaje."
  ].join("\n");

  const html = `
    <div style="font-family:Segoe UI,Arial,sans-serif;line-height:1.6;color:#1f2937">
      <p>Hola <strong>${input.fullName}</strong>,</p>
      <p>Tu academia <strong>${input.academyName}</strong> ya fue aprobada y tu cuenta administradora esta lista para activarse.</p>
      <div style="padding:16px 18px;border-radius:14px;background:#f8fafc;border:1px solid #e2e8f0;margin:20px 0">
        <p style="margin:0 0 8px 0"><strong>Resumen de tu alta</strong></p>
        <p style="margin:0"><strong>Academia:</strong> ${input.academyName}</p>
        <p style="margin:6px 0 0 0"><strong>Correo de acceso:</strong> ${input.email}</p>
        <p style="margin:6px 0 0 0"><strong>Codigo de referencia:</strong> ${input.publicCode}</p>
      </div>
      <p>
        <a href="${input.activationUrl}" style="display:inline-block;padding:12px 18px;border-radius:10px;background:#16a34a;color:#ffffff;text-decoration:none;font-weight:700">
          Definir contrasena y entrar
        </a>
      </p>
      <p style="margin:18px 0 8px 0"><strong>Siguiente paso</strong></p>
      <ol style="margin:0 0 18px 20px;padding:0">
        <li>Abre el boton de activacion.</li>
        <li>Define tu contrasena.</li>
        <li>Ingresa al panel desde <a href="${loginUrl}">${loginUrl}</a>.</li>
      </ol>
      <p>Este enlace vence el <strong>${expiryLabel}</strong>.</p>
      <p style="word-break:break-all"><strong>Enlace directo:</strong> <a href="${input.activationUrl}">${input.activationUrl}</a></p>
      <p>Si no solicitaste esta alta, ignora este mensaje.</p>
    </div>
  `;

  return sendEmail({
    to: input.email,
    subject,
    text,
    html
  });
}

function buildActivationTelegramMessage(input: {
  fullName: string;
  academyName: string;
  publicCode: string;
  activationUrl: string;
  expiresAt: Date;
}) {
  const expiryLabel = new Intl.DateTimeFormat("es-CL", {
    dateStyle: "short",
    timeStyle: "short"
  }).format(input.expiresAt);

  return [
    `Hola ${input.fullName}.`,
    `Tu academia ${input.academyName} ya fue aprobada.`,
    `Codigo de referencia: ${input.publicCode}.`,
    `Define tu contrasena aqui: ${input.activationUrl}`,
    `Este enlace vence el ${expiryLabel}.`
  ].join(" ");
}

export async function createOnboardingRequest(input: {
  fullName: string;
  academyName: string;
  email: string;
  phone: string;
  city?: string | null;
  notes?: string | null;
  plan: OnboardingPlan;
}) {
  const fullName = normalizeRequiredText(input.fullName, "tu nombre");
  const academyName = normalizeRequiredText(input.academyName, "el nombre de la academia");
  const email = normalizeEmail(input.email);
  const phone = compactPhone(normalizeRequiredText(input.phone, "tu WhatsApp o telefono"));

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new AppError("Ingresa un correo valido");
  }

  if (!/^\+?\d{8,15}$/.test(phone)) {
    throw new AppError("Ingresa un WhatsApp o telefono valido");
  }

  await assertOnboardingRequestCanBeCreated(email, phone);

  const [publicCode, telegramStartToken] = await Promise.all([
    generateUniquePublicCode(),
    generateUniqueStartToken()
  ]);

  const request = await prisma.onboardingRequest.create({
    data: {
      fullName,
      academyName,
      academySlug: slugifyAcademyName(academyName),
      email,
      phone,
      city: normalizeOptionalText(input.city),
      notes: normalizeOptionalText(input.notes),
      plan: input.plan,
      expectedAmountCents: onboardingSetupAmountCents,
      publicCode,
      telegramStartToken
    }
  });

  const instructions = buildSetupInstructions(request);
  let delivery: Awaited<ReturnType<typeof sendEmail>>;

  try {
    delivery = await sendOnboardingRequestEmail({
      email,
      fullName,
      instructions
    });
  } catch (error) {
    console.error("[onboarding] failed to send onboarding access email", {
      email,
      publicCode: request.publicCode,
      error
    });
    delivery = {
      delivered: false,
      mode: "manual"
    };
  }

  return {
    request,
    instructions,
    delivery
  };
}

function parseOnboardingStartToken(bodyText: string | undefined) {
  if (!bodyText) {
    return null;
  }

  const match = bodyText.match(/\/start\s+onb_([A-Za-z0-9_-]+)/i);
  return match?.[1] ?? null;
}

function hasOnboardingStartCommand(bodyText: string | undefined) {
  if (!bodyText) {
    return false;
  }

  return /\/start\b/i.test(bodyText);
}

function parseOnboardingPublicCode(bodyText: string | undefined) {
  if (!bodyText) {
    return null;
  }

  const match = bodyText.match(/\b(PG-[A-Z0-9]{4,})\b/i);
  return match?.[1]?.toUpperCase() ?? null;
}

async function findOnboardingRequestByChatId(chatId: string) {
  return prisma.onboardingRequest.findFirst({
    where: {
      telegramChatId: chatId,
      status: {
        in: onboardingTelegramChatStatuses
      }
    },
    orderBy: { createdAt: "desc" }
  });
}

async function findOnboardingRequestByPublicCode(publicCode: string) {
  return prisma.onboardingRequest.findFirst({
    where: {
      publicCode,
      status: {
        in: onboardingTelegramChatStatuses
      }
    },
    orderBy: { createdAt: "desc" }
  });
}

export async function shouldHandleOnboardingTelegramUpdate(message: TelegramInboundMessage) {
  const startToken = parseOnboardingStartToken(message.bodyText);
  if (startToken) {
    return true;
  }

  const publicCode = parseOnboardingPublicCode(message.bodyText);
  if (publicCode) {
    const request = await findOnboardingRequestByPublicCode(publicCode);
    if (request) {
      return true;
    }
  }

  if (hasOnboardingStartCommand(message.bodyText)) {
    return true;
  }

  const request = await findOnboardingRequestByChatId(message.externalChatId);
  return Boolean(request);
}

export async function handleOnboardingTelegramUpdate(message: TelegramInboundMessage) {
  const onboardingTelegram = getOnboardingTelegramConfig();
  if (!onboardingTelegram.botToken) {
    throw new AppError("Bot de Telegram para onboarding no configurado", 503);
  }

  const startToken = parseOnboardingStartToken(message.bodyText);
  const publicCode = parseOnboardingPublicCode(message.bodyText);

  if (startToken || publicCode || hasOnboardingStartCommand(message.bodyText)) {
    const request = startToken
      ? await prisma.onboardingRequest.findUnique({
          where: { telegramStartToken: startToken }
        })
      : publicCode
        ? await findOnboardingRequestByPublicCode(publicCode)
        : null;

    if (!request && hasOnboardingStartCommand(message.bodyText) && !publicCode) {
      await sendTelegramTextMessageWithToken(
        message.senderHandle,
        "Para vincular tu solicitud, vuelve a usar el boton de Telegram desde la pagina de alta o envianos aqui el codigo PG de tu solicitud.",
        onboardingTelegram.botToken
      );

      return {
        ignored: true,
        reason: "start sin token ni codigo"
      };
    }

    if (!request) {
      await sendTelegramTextMessageWithToken(
        message.senderHandle,
        publicCode
          ? `No encontramos una solicitud activa para el codigo ${publicCode}. Revisa el codigo o vuelve a la pagina de alta para generar uno nuevo.`
          : "No encontramos una solicitud activa para ese enlace. Vuelve a la pagina de alta y genera un nuevo acceso.",
        onboardingTelegram.botToken
      );

      return {
        ignored: true,
        reason: publicCode ? "codigo publico no encontrado" : "start token no encontrado"
      };
    }

    if (closedOnboardingStatuses.has(request.status)) {
      await sendTelegramTextMessageWithToken(
        message.senderHandle,
        "Esta solicitud ya no admite nuevos comprobantes. Si necesitas ayuda, responde al correo de activacion o crea una solicitud nueva.",
        onboardingTelegram.botToken
      );

      return {
        ignored: true,
        reason: "solicitud no disponible"
      };
    }

    await prisma.onboardingRequest.update({
      where: { id: request.id },
      data: {
        telegramChatId: message.externalChatId,
        telegramUserId: message.externalUserId,
        telegramUsername: message.senderUsername,
        status:
          request.status === OnboardingRequestStatus.PENDING_PAYMENT
            ? OnboardingRequestStatus.TELEGRAM_LINKED
            : request.status
      }
    });

    await sendTelegramTextMessageWithToken(
      message.senderHandle,
      `Perfecto. Ya vinculamos tu solicitud ${request.publicCode}. Ahora envianos aqui el comprobante del Pre-calentamiento para dejar la academia en revision.`,
      onboardingTelegram.botToken
    );

    return {
      linked: true,
      publicCode: request.publicCode
    };
  }

  if (message.attachments.length === 0) {
    return {
      ignored: true,
      reason: "mensaje sin adjuntos para onboarding"
    };
  }

  const request = await findOnboardingRequestByChatId(message.externalChatId);

  if (!request) {
    await sendTelegramTextMessageWithToken(
      message.senderHandle,
      "Antes de enviar el comprobante, abre el enlace de alta y vincula tu solicitud con el boton de Telegram.",
      onboardingTelegram.botToken
    );

    return {
      ignored: true,
      reason: "chat sin solicitud activa"
    };
  }

  const attachment = message.attachments[0]!;
  const receipt = await prisma.onboardingPaymentReceipt.create({
    data: {
      onboardingRequestId: request.id,
      externalMessageId: message.externalId,
      externalChatId: message.externalChatId,
      externalUserId: message.externalUserId,
      senderName: message.senderName,
      senderUsername: message.senderUsername,
      bodyText: message.bodyText,
      fileUrl: attachment.fileUrl,
      originalFileName: attachment.originalFileName,
      mimeType: attachment.mimeType,
      rawPayload: message.rawPayload as Prisma.InputJsonValue
    }
  });

  await prisma.onboardingRequest.update({
    where: { id: request.id },
    data: {
      status: OnboardingRequestStatus.RECEIPT_RECEIVED,
      telegramUserId: message.externalUserId,
      telegramUsername: message.senderUsername,
      telegramChatId: message.externalChatId
    }
  });

  await safeSendOnboardingTelegramMessage(
    message.senderHandle,
    `Recibimos tu comprobante para la solicitud ${request.publicCode}. Lo estamos revisando ahora y en breve te confirmaremos el siguiente paso por este mismo chat.`,
    onboardingTelegram.botToken
  );

  let storagePath: string | null = null;
  let mediaFailure: string | null = null;

  try {
    storagePath = await persistReceiptMedia(receipt.id, {
      fileUrl: attachment.fileUrl,
      mimeType: attachment.mimeType,
      originalFileName: attachment.originalFileName,
      telegramBotToken: onboardingTelegram.botToken
    });

    if (storagePath) {
      await prisma.onboardingPaymentReceipt.update({
        where: { id: receipt.id },
        data: {
          storagePath
        }
      });
    }
  } catch (error) {
    mediaFailure = error instanceof Error ? error.message : "No se pudo guardar el archivo";
    console.error("[onboarding][media] failed to persist receipt media", {
      receiptId: receipt.id,
      error: mediaFailure
    });
  }

  let ocrText = "";
  let ocrConfidence = 0.2;
  let extractionFailure: string | null = null;

  try {
    const ocr = await extractOnboardingReceiptText(
      receipt.id,
      storagePath || message.bodyText || attachment.originalFileName
        ? {
            storagePath: storagePath ?? null,
            mimeType: attachment.mimeType ?? null,
            originalFileName: attachment.originalFileName ?? null,
            rawPayload: message.rawPayload,
            bodyText: message.bodyText,
            previousExtractedText: null,
            previousExtractionConfidence: null
          }
        : undefined
    );

    ocrText = ocr.text;
    ocrConfidence = ocr.confidence;
  } catch (error) {
    extractionFailure = error instanceof Error ? error.message : "OCR no disponible";
    console.error("[onboarding][ocr] failed to extract receipt text", {
      receiptId: receipt.id,
      storagePath: storagePath ?? null,
      error: extractionFailure
    });
  }

  let extracted = extractPaymentDataFromText(ocrText);

  if (ocrText.length === 0 && attachment.originalFileName) {
    extracted = extractPaymentDataFromText(attachment.originalFileName);
  }

  await prisma.onboardingPaymentReceipt.update({
    where: { id: receipt.id },
    data: {
      extractedText: ocrText || undefined,
      extractedAmountCents: extracted.amountCents ?? undefined,
      extractionConfidence: Math.max(extracted.confidence, ocrConfidence),
      metadata:
        mediaFailure != null || extractionFailure != null
          ? ({
              mediaFailure,
              extractionFailure
            } satisfies Prisma.InputJsonValue)
          : undefined
    }
  });

  await safeSendOnboardingTelegramMessage(
    message.senderHandle,
    buildOnboardingReceiptResultMessage({
      publicCode: request.publicCode,
      email: request.email,
      expectedAmountCents: request.expectedAmountCents,
      detectedAmountCents: extracted.amountCents,
      mediaFailure,
      extractionFailure
    }),
    onboardingTelegram.botToken
  );

  return {
    receiptId: receipt.id,
    publicCode: request.publicCode
  };
}

export async function listOnboardingRequestsForReview(secret: string | null) {
  assertReviewSecret(secret);

  return prisma.onboardingRequest.findMany({
    include: {
      receipts: {
        orderBy: { createdAt: "desc" },
        take: 3
      }
    },
    orderBy: [{ status: "asc" }, { createdAt: "desc" }]
  });
}

export async function approveOnboardingRequest(input: {
  requestId: string;
  reviewSecret: string | null;
}) {
  assertReviewSecret(input.reviewSecret);

  const request = await prisma.onboardingRequest.findUnique({
    where: { id: input.requestId },
    include: {
      receipts: {
        orderBy: { createdAt: "desc" },
        take: 1
      }
    }
  });

  if (!request) {
    throw new AppError("Solicitud de onboarding no encontrada", 404);
  }

  if (request.receipts.length === 0) {
    throw new AppError("No hay comprobante para aprobar esta solicitud", 409);
  }

  if (request.status === OnboardingRequestStatus.ACTIVE) {
    throw new AppError("Esta solicitud ya esta activa", 409);
  }

  const latestReceipt = request.receipts[0]!;

  const result = await prisma.$transaction(async (tx) => {
    const existingUser = await tx.user.findUnique({
      where: { email: request.email },
      select: { id: true }
    });

    if (existingUser && existingUser.id !== request.createdUserId) {
      throw new AppError("Ya existe un usuario con este correo. Revisa la solicitud manualmente.", 409);
    }

    const schoolSlug = await generateUniqueSchoolSlug(
      request.academySlug || slugifyAcademyName(request.academyName),
      tx
    );

    const permissions = await ensurePermissions(tx);

    const school =
      request.schoolId
        ? await tx.school.update({
            where: { id: request.schoolId },
            data: {
              name: request.academyName,
              legalName: request.academyName,
              slug: schoolSlug,
              status: SchoolStatus.INACTIVE
            }
          })
        : await tx.school.create({
            data: {
              name: request.academyName,
              legalName: request.academyName,
              slug: schoolSlug,
              status: SchoolStatus.INACTIVE,
              locale: "es-CL",
              timezone: "America/Santiago",
              currency: "CLP"
            }
          });

    const adminRole = await ensureSchoolRoles(tx, school.id, permissions);
    const temporaryPassword = createTemporaryPassword();
    const passwordHash = await bcrypt.hash(temporaryPassword, 10);

    const user =
      request.createdUserId
        ? await tx.user.update({
            where: { id: request.createdUserId },
            data: {
              email: request.email,
              fullName: request.fullName,
              passwordHash,
              status: UserStatus.INVITED
            }
          })
        : await tx.user.create({
            data: {
              email: request.email,
              fullName: request.fullName,
              passwordHash,
              status: UserStatus.INVITED
            }
          });

    const membership = await tx.userSchoolMembership.upsert({
      where: {
        userId_schoolId: {
          userId: user.id,
          schoolId: school.id
        }
      },
      update: {
        isDefault: true
      },
      create: {
        userId: user.id,
        schoolId: school.id,
        isDefault: true
      }
    });

    await tx.membershipRole.upsert({
      where: {
        membershipId_roleId: {
          membershipId: membership.id,
          roleId: adminRole.id
        }
      },
      update: {},
      create: {
        membershipId: membership.id,
        roleId: adminRole.id
      }
    });

    const activationToken = await createActivationToken({
      tx,
      onboardingRequestId: request.id,
      userId: user.id
    });

    await tx.onboardingPaymentReceipt.update({
      where: { id: latestReceipt.id },
      data: {
        status: OnboardingReceiptStatus.APPROVED,
        reviewedAt: new Date()
      }
    });

    await tx.onboardingRequest.update({
      where: { id: request.id },
      data: {
        schoolId: school.id,
        createdUserId: user.id,
        status: OnboardingRequestStatus.APPROVED_PENDING_ACTIVATION,
        approvedAt: new Date(),
        rejectedAt: null,
        rejectionReason: null,
        expiresAt: activationToken.expiresAt
      }
    });

    return {
      school,
      user,
      activationToken
    };
  });

  const activationUrl = `${env.APP_URL}/activar?token=${encodeURIComponent(result.activationToken.rawToken)}`;
  let delivery: Awaited<ReturnType<typeof sendEmail>>;

  try {
    delivery = await sendActivationEmail({
      email: request.email,
      fullName: request.fullName,
      academyName: request.academyName,
      publicCode: request.publicCode,
      activationUrl,
      expiresAt: result.activationToken.expiresAt
    });
  } catch (error) {
    console.error("[onboarding] failed to send activation email", {
      email: request.email,
      publicCode: request.publicCode,
      error
    });
    delivery = {
      delivered: false,
      mode: "manual"
    };
  }

  const onboardingTelegram = getOnboardingTelegramConfig();
  const telegramDelivered =
    request.telegramChatId && onboardingTelegram.botToken
      ? await safeSendOnboardingTelegramMessage(
          request.telegramChatId,
          buildActivationTelegramMessage({
            fullName: request.fullName,
            academyName: request.academyName,
            publicCode: request.publicCode,
            activationUrl,
            expiresAt: result.activationToken.expiresAt
          }),
          onboardingTelegram.botToken
        )
      : false;

  return {
    requestId: request.id,
    publicCode: request.publicCode,
    academyName: request.academyName,
    activationUrl,
    activationExpiresAt: result.activationToken.expiresAt,
    delivery,
    telegramDelivery: {
      delivered: telegramDelivered,
      mode: telegramDelivered ? "telegram" : "manual"
    }
  };
}

export async function rejectOnboardingRequest(input: {
  requestId: string;
  reviewSecret: string | null;
  reason: string;
}) {
  assertReviewSecret(input.reviewSecret);

  const reason = normalizeRequiredText(input.reason, "el motivo del rechazo");
  const request = await prisma.onboardingRequest.findUnique({
    where: { id: input.requestId },
    include: {
      receipts: {
        orderBy: { createdAt: "desc" },
        take: 1
      }
    }
  });

  if (!request) {
    throw new AppError("Solicitud de onboarding no encontrada", 404);
  }

  await prisma.$transaction(async (tx) => {
    await tx.onboardingRequest.update({
      where: { id: input.requestId },
      data: {
        status: OnboardingRequestStatus.REJECTED,
        rejectedAt: new Date(),
        rejectionReason: reason
      }
    });

    const latestReceipt = request.receipts[0];

    if (latestReceipt) {
      await tx.onboardingPaymentReceipt.update({
        where: { id: latestReceipt.id },
        data: {
          status: OnboardingReceiptStatus.REJECTED,
          reviewedAt: new Date(),
          metadata: {
            reason
          }
        }
      });
    }
  });

  return {
    rejected: true,
    requestId: input.requestId
  };
}

export async function consumeActivationToken(input: { token: string; password: string }) {
  const rawToken = input.token.trim();
  const password = input.password.trim();

  if (rawToken.length < 20) {
    throw new AppError("El enlace de activacion no es valido", 400);
  }

  if (password.length < 10) {
    throw new AppError("La contrasena debe tener al menos 10 caracteres", 400);
  }

  const tokenHash = createTokenHash(rawToken);
  const activationToken = await prisma.onboardingActivationToken.findUnique({
    where: { tokenHash },
    include: {
      onboardingRequest: true,
      user: true
    }
  });

  if (!activationToken || activationToken.usedAt || activationToken.expiresAt.getTime() < Date.now()) {
    throw new AppError("El enlace de activacion expiro o ya fue usado", 400);
  }

  const passwordHash = await bcrypt.hash(password, 10);

  const request = await prisma.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: activationToken.userId },
      data: {
        passwordHash,
        status: UserStatus.ACTIVE
      }
    });

    if (activationToken.onboardingRequest.schoolId) {
      await tx.school.update({
        where: { id: activationToken.onboardingRequest.schoolId },
        data: {
          status: SchoolStatus.ACTIVE
        }
      });
    }

    await tx.onboardingActivationToken.update({
      where: { id: activationToken.id },
      data: {
        usedAt: new Date()
      }
    });

    await tx.onboardingRequest.update({
      where: { id: activationToken.onboardingRequestId },
      data: {
        status: OnboardingRequestStatus.ACTIVE,
        activatedAt: new Date()
      }
    });

    return tx.onboardingRequest.findUnique({
      where: { id: activationToken.onboardingRequestId }
    });
  });

  return request;
}

export async function getActivationSnapshot(token: string) {
  const tokenHash = createTokenHash(token.trim());
  const activationToken = await prisma.onboardingActivationToken.findUnique({
    where: { tokenHash },
    include: {
      onboardingRequest: true
    }
  });

  if (!activationToken || activationToken.usedAt || activationToken.expiresAt.getTime() < Date.now()) {
    return null;
  }

  return {
    academyName: activationToken.onboardingRequest.academyName,
    fullName: activationToken.onboardingRequest.fullName,
    expiresAt: activationToken.expiresAt
  };
}
