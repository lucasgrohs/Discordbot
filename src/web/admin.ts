import { Router, urlencoded, type Request, type Response, type NextFunction } from "express";
import { config } from "../config.js";
import { listTexts, setText, TEXT_DEFS } from "../services/texts.js";

// Basic Auth: usuário qualquer, senha = WEB_ADMIN_TOKEN.
function basicAuth(req: Request, res: Response, next: NextFunction): void {
  const token = config.web.adminToken;
  if (!token) {
    res.status(503).send("Painel desligado. Defina WEB_ADMIN_TOKEN.");
    return;
  }
  const m = (req.header("authorization") || "").match(/^Basic (.+)$/);
  const pass = m ? Buffer.from(m[1], "base64").toString().split(":").slice(1).join(":") : "";
  if (pass !== token) {
    res.set("WWW-Authenticate", 'Basic realm="StartzoneRMT Admin"').status(401).send("Autenticação necessária.");
    return;
  }
  next();
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

function page(saved: boolean): string {
  const cards = listTexts()
    .map(
      (t) => `
    <div class="card">
      <label><b>${esc(t.label)}</b> <span class="key">${t.key}</span></label>
      ${t.placeholders.length ? `<div class="ph">placeholders: ${t.placeholders.map(esc).join("  ")}</div>` : ""}
      <textarea name="${t.key}" rows="6">${esc(t.value)}</textarea>
    </div>`,
    )
    .join("");
  return `<!doctype html><html lang="pt-br"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>StartzoneRMT — Painel</title>
<style>
  body{font-family:system-ui,Segoe UI,sans-serif;background:#1e1f22;color:#eee;max-width:840px;margin:24px auto;padding:0 16px}
  h1{font-size:22px}
  .card{background:#2b2d31;border-radius:8px;padding:14px;margin:14px 0}
  label{display:block;margin-bottom:6px}
  textarea{width:100%;background:#1e1f22;color:#eee;border:1px solid #444;border-radius:6px;padding:8px;font-family:inherit;font-size:14px;box-sizing:border-box}
  .key{color:#888;font-size:12px}
  .ph{color:#f1c40f;font-size:12px;margin:4px 0}
  button{background:#5865f2;color:#fff;border:0;padding:11px 22px;border-radius:6px;font-size:15px;cursor:pointer}
  .ok{background:#2b9348;padding:10px 14px;border-radius:6px;margin-bottom:12px}
</style></head>
<body>
  <h1>💬 Mensagens do bot</h1>
  ${saved ? '<div class="ok">✅ Salvo! As mudanças valem nas próximas mensagens.</div>' : ""}
  <form method="post" action="save">${cards}<button type="submit">Salvar</button></form>
</body></html>`;
}

export const adminRouter = Router();
adminRouter.use(basicAuth);
adminRouter.get("/", (req, res) => res.send(page(req.query.saved === "1")));
adminRouter.post("/save", urlencoded({ extended: false }), async (req, res) => {
  for (const def of TEXT_DEFS) {
    const v = (req.body as Record<string, unknown>)[def.key];
    if (typeof v === "string") await setText(def.key, v);
  }
  res.redirect("./?saved=1");
});
