export type EmailSenderInput = {
  to: string;
  name: string;
  subject: string;
  body: string;
  accessToken: string;
  gmailEmail: string;
};

export type EmailSenderResult = {
  success: boolean;
  from?: string;
  error?: string;
};

function buildRawEmail(
  from: string,
  to: string,
  name: string,
  subject: string,
  body: string
): string {
  const message = [
    `From: ${from}`,
    `To: ${name} <${to}>`,
    `Subject: ${subject}`,
    `Content-Type: text/plain; charset=utf-8`,
    `MIME-Version: 1.0`,
    ``,
    body,
  ].join("\r\n");

  return Buffer.from(message)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

export async function runEmailSender(input: EmailSenderInput): Promise<EmailSenderResult> {
  const raw = buildRawEmail(
    input.gmailEmail,
    input.to,
    input.name,
    input.subject,
    input.body
  );

  const res = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${input.accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ raw }),
  });

  if (!res.ok) {
    const err = (await res.json()) as { error?: { message?: string } };
    return { success: false, error: err.error?.message ?? "Failed to send email" };
  }

  return { success: true, from: input.gmailEmail };
}
