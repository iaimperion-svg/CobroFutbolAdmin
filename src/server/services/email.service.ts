import { env } from "@/server/config/env";

type OutboundEmail = {
  to: string;
  subject: string;
  text: string;
  html?: string;
};

export async function sendEmail(message: OutboundEmail) {
  if (!env.RESEND_API_KEY || !env.EMAIL_FROM) {
    console.info("[email] delivery skipped because provider is not configured", {
      to: message.to,
      subject: message.subject
    });

    return {
      delivered: false as const,
      mode: "manual" as const
    };
  }

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      authorization: `Bearer ${env.RESEND_API_KEY}`,
      "content-type": "application/json"
    },
    body: JSON.stringify({
      from: env.EMAIL_FROM,
      to: [message.to],
      subject: message.subject,
      text: message.text,
      html: message.html
    })
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`No se pudo enviar el correo de onboarding: ${response.status} ${body}`);
  }

  return {
    delivered: true as const,
    mode: "email" as const
  };
}
