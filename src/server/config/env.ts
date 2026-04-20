import { z } from "zod";

const isProduction = process.env.NODE_ENV === "production";
const localHostPattern = /(?:localhost|127\.0\.0\.1)/i;
const temporaryTunnelPattern = /(trycloudflare|ngrok|localtunnel)/i;

const booleanFlagSchema = z
  .preprocess((value) => {
    if (typeof value === "string") {
      return value.trim().toLowerCase();
    }

    return value;
  }, z.union([z.boolean(), z.enum(["1", "0", "true", "false", "yes", "no", "on", "off"])]))
  .transform((value) => {
    if (typeof value === "boolean") {
      return value;
    }

    return ["1", "true", "yes", "on"].includes(value);
  });

const envSchema = z.object({
  DATABASE_URL: isProduction
    ? z.string().min(1)
    : z.string().min(1).default("postgresql://postgres:postgres@localhost:5432/cobrofutbol?schema=public"),
  REDIS_URL: isProduction ? z.string().min(1) : z.string().min(1).default("redis://localhost:6379"),
  APP_URL: isProduction ? z.string().url() : z.string().url().default("http://localhost:3000"),
  JWT_SECRET: isProduction
    ? z.string().min(32)
    : z.string().min(16).default("replace-with-a-long-random-secret"),
  DEFAULT_TIMEZONE: z.string().default("America/Santiago"),
  UPLOAD_DIR: z.string().default("./storage"),
  OCR_LANG_PATH: z.string().default("./tessdata"),
  RECEIPT_WORKER_CONCURRENCY: z.coerce.number().int().min(1).default(4),
  OUTBOUND_WORKER_CONCURRENCY: z.coerce.number().int().min(1).default(4),
  AUTO_RECONCILIATION_THRESHOLD: z.coerce.number().default(0.86),
  MANUAL_REVIEW_THRESHOLD: z.coerce.number().default(0.72),
  WHATSAPP_VERIFY_TOKEN: isProduction ? z.string().min(1) : z.string().default("dev-whatsapp-token"),
  WHATSAPP_WEBHOOK_SECRET: z.string().default(""),
  WHATSAPP_REPLY_URL: z.string().default(""),
  TELEGRAM_ENABLED: booleanFlagSchema.default(false),
  TELEGRAM_BOT_TOKEN: z.string().default(""),
  TELEGRAM_BOT_USERNAME: z.string().default(""),
  TELEGRAM_WEBHOOK_URL: z.string().default(""),
  TELEGRAM_WEBHOOK_SECRET: z.string().default(""),
  ONBOARDING_REVIEW_SECRET: z.string().default(""),
  ONBOARDING_TELEGRAM_ENABLED: booleanFlagSchema.default(false),
  ONBOARDING_TELEGRAM_BOT_TOKEN: z.string().default(""),
  ONBOARDING_TELEGRAM_BOT_USERNAME: z.string().default(""),
  ONBOARDING_TELEGRAM_WEBHOOK_URL: z.string().default(""),
  ONBOARDING_TELEGRAM_WEBHOOK_SECRET: z.string().default(""),
  ONBOARDING_PAYMENT_BANK_NAME: z.string().default(""),
  ONBOARDING_PAYMENT_ACCOUNT_TYPE: z.string().default(""),
  ONBOARDING_PAYMENT_ACCOUNT_NUMBER: z.string().default(""),
  ONBOARDING_PAYMENT_HOLDER_NAME: z.string().default(""),
  ONBOARDING_PAYMENT_HOLDER_RUT: z.string().default(""),
  ONBOARDING_PAYMENT_EMAIL: z.string().default(""),
  EMAIL_FROM: z.string().default(""),
  RESEND_API_KEY: z.string().default("")
}).superRefine((env, ctx) => {
  if (!isProduction) {
    return;
  }

  if (localHostPattern.test(env.DATABASE_URL)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["DATABASE_URL"],
      message: "DATABASE_URL no puede apuntar a localhost en production"
    });
  }

  if (localHostPattern.test(env.REDIS_URL)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["REDIS_URL"],
      message: "REDIS_URL no puede apuntar a localhost en production"
    });
  }

  if (localHostPattern.test(env.APP_URL)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["APP_URL"],
      message: "APP_URL debe ser una URL publica en production"
    });
  }

  if (/^replace-/i.test(env.JWT_SECRET)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["JWT_SECRET"],
      message: "JWT_SECRET debe reemplazarse por un secreto real en production"
    });
  }

  if (/^(replace-|dev-)/i.test(env.WHATSAPP_VERIFY_TOKEN)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["WHATSAPP_VERIFY_TOKEN"],
      message: "WHATSAPP_VERIFY_TOKEN debe ser un valor real en production"
    });
  }

  if (env.TELEGRAM_ENABLED && env.TELEGRAM_BOT_TOKEN.length === 0) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["TELEGRAM_BOT_TOKEN"],
      message: "TELEGRAM_BOT_TOKEN es obligatorio cuando Telegram esta habilitado"
    });
  }

  if (env.TELEGRAM_ENABLED && env.TELEGRAM_WEBHOOK_URL.length === 0) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["TELEGRAM_WEBHOOK_URL"],
      message: "TELEGRAM_WEBHOOK_URL es obligatorio cuando Telegram esta habilitado"
    });
  }

  if (env.TELEGRAM_WEBHOOK_URL.length > 0 && temporaryTunnelPattern.test(env.TELEGRAM_WEBHOOK_URL)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["TELEGRAM_WEBHOOK_URL"],
      message: "TELEGRAM_WEBHOOK_URL no puede usar tuneles temporales en production"
    });
  }

  if (env.ONBOARDING_TELEGRAM_ENABLED && env.ONBOARDING_TELEGRAM_BOT_TOKEN.length === 0) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["ONBOARDING_TELEGRAM_BOT_TOKEN"],
      message: "ONBOARDING_TELEGRAM_BOT_TOKEN es obligatorio cuando el bot de onboarding esta habilitado"
    });
  }

  if (env.ONBOARDING_TELEGRAM_ENABLED && env.ONBOARDING_TELEGRAM_BOT_USERNAME.length === 0) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["ONBOARDING_TELEGRAM_BOT_USERNAME"],
      message: "ONBOARDING_TELEGRAM_BOT_USERNAME es obligatorio cuando el bot de onboarding esta habilitado"
    });
  }

  if (env.ONBOARDING_TELEGRAM_ENABLED && env.ONBOARDING_TELEGRAM_WEBHOOK_URL.length === 0) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["ONBOARDING_TELEGRAM_WEBHOOK_URL"],
      message: "ONBOARDING_TELEGRAM_WEBHOOK_URL es obligatorio cuando el bot de onboarding esta habilitado"
    });
  }

  if (
    env.ONBOARDING_TELEGRAM_WEBHOOK_URL.length > 0 &&
    temporaryTunnelPattern.test(env.ONBOARDING_TELEGRAM_WEBHOOK_URL)
  ) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["ONBOARDING_TELEGRAM_WEBHOOK_URL"],
      message: "ONBOARDING_TELEGRAM_WEBHOOK_URL no puede usar tuneles temporales en production"
    });
  }

  if (env.WHATSAPP_REPLY_URL.length > 0 && localHostPattern.test(env.WHATSAPP_REPLY_URL)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["WHATSAPP_REPLY_URL"],
      message: "WHATSAPP_REPLY_URL debe ser una URL accesible en production"
    });
  }
});

export const env = envSchema.parse({
  DATABASE_URL: process.env.DATABASE_URL,
  REDIS_URL: process.env.REDIS_URL,
  APP_URL: process.env.APP_URL,
  JWT_SECRET: process.env.JWT_SECRET,
  DEFAULT_TIMEZONE: process.env.DEFAULT_TIMEZONE,
  UPLOAD_DIR: process.env.UPLOAD_DIR,
  OCR_LANG_PATH: process.env.OCR_LANG_PATH,
  RECEIPT_WORKER_CONCURRENCY: process.env.RECEIPT_WORKER_CONCURRENCY,
  OUTBOUND_WORKER_CONCURRENCY: process.env.OUTBOUND_WORKER_CONCURRENCY,
  AUTO_RECONCILIATION_THRESHOLD: process.env.AUTO_RECONCILIATION_THRESHOLD,
  MANUAL_REVIEW_THRESHOLD: process.env.MANUAL_REVIEW_THRESHOLD,
  WHATSAPP_VERIFY_TOKEN: process.env.WHATSAPP_VERIFY_TOKEN,
  WHATSAPP_WEBHOOK_SECRET: process.env.WHATSAPP_WEBHOOK_SECRET,
  WHATSAPP_REPLY_URL: process.env.WHATSAPP_REPLY_URL,
  TELEGRAM_ENABLED: process.env.TELEGRAM_ENABLED,
  TELEGRAM_BOT_TOKEN: process.env.TELEGRAM_BOT_TOKEN,
  TELEGRAM_BOT_USERNAME: process.env.TELEGRAM_BOT_USERNAME,
  TELEGRAM_WEBHOOK_URL: process.env.TELEGRAM_WEBHOOK_URL,
  TELEGRAM_WEBHOOK_SECRET: process.env.TELEGRAM_WEBHOOK_SECRET,
  ONBOARDING_REVIEW_SECRET: process.env.ONBOARDING_REVIEW_SECRET,
  ONBOARDING_TELEGRAM_ENABLED: process.env.ONBOARDING_TELEGRAM_ENABLED,
  ONBOARDING_TELEGRAM_BOT_TOKEN: process.env.ONBOARDING_TELEGRAM_BOT_TOKEN,
  ONBOARDING_TELEGRAM_BOT_USERNAME: process.env.ONBOARDING_TELEGRAM_BOT_USERNAME,
  ONBOARDING_TELEGRAM_WEBHOOK_URL: process.env.ONBOARDING_TELEGRAM_WEBHOOK_URL,
  ONBOARDING_TELEGRAM_WEBHOOK_SECRET: process.env.ONBOARDING_TELEGRAM_WEBHOOK_SECRET,
  ONBOARDING_PAYMENT_BANK_NAME: process.env.ONBOARDING_PAYMENT_BANK_NAME,
  ONBOARDING_PAYMENT_ACCOUNT_TYPE: process.env.ONBOARDING_PAYMENT_ACCOUNT_TYPE,
  ONBOARDING_PAYMENT_ACCOUNT_NUMBER: process.env.ONBOARDING_PAYMENT_ACCOUNT_NUMBER,
  ONBOARDING_PAYMENT_HOLDER_NAME: process.env.ONBOARDING_PAYMENT_HOLDER_NAME,
  ONBOARDING_PAYMENT_HOLDER_RUT: process.env.ONBOARDING_PAYMENT_HOLDER_RUT,
  ONBOARDING_PAYMENT_EMAIL: process.env.ONBOARDING_PAYMENT_EMAIL,
  EMAIL_FROM: process.env.EMAIL_FROM,
  RESEND_API_KEY: process.env.RESEND_API_KEY
});
