import { config } from "../config.js";

export interface WooviCharge {
  correlationID: string;
  identifier: string;
  status: string;
  value: number; // cents
  brCode: string; // PIX copia e cola
  qrCodeImage: string; // URL of QR image
  paymentLinkUrl: string;
}

// Create a PIX charge. `valueBrl` is in reais (e.g. 1580.00).
export async function createPixCharge(params: {
  correlationId: string;
  valueBrl: number;
  comment: string;
}): Promise<WooviCharge> {
  if (!config.woovi.appId) {
    throw new Error("WOOVI_APP_ID não configurado (.env).");
  }

  const res = await fetch(`${config.woovi.baseUrl}/charge`, {
    method: "POST",
    headers: {
      Authorization: config.woovi.appId,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      correlationID: params.correlationId,
      value: Math.round(params.valueBrl * 100),
      comment: params.comment.slice(0, 140),
      expiresIn: config.woovi.expiresIn,
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Woovi createCharge falhou (${res.status}): ${text}`);
  }

  const json = (await res.json()) as { charge: WooviCharge };
  return json.charge;
}
