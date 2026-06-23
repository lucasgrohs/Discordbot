import { Router, urlencoded, type Request, type Response, type NextFunction } from "express";
import { REST, Routes } from "discord.js";
import { config } from "../config.js";
import { listTexts, setText, TEXT_DEFS } from "../services/texts.js";
import { getCommandsJSON } from "../bot/router.js";
import { refreshAll } from "../bot/market/board.js";

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

function banner(q: Request["query"]): string {
  if (q.deployed) return `<div class="ok">✅ ${esc(String(q.deployed))} comando(s) registrado(s) no Discord.</div>`;
  if (q.saved)
    return `<div class="ok">✅ Salvo e aplicado! Painéis atualizados: ${esc(String(q.panels ?? 0))} · cards: ${esc(String(q.cards ?? 0))}.</div>`;
  return "";
}

function page(q: Request["query"]): string {
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
  h1{font-size:22px} h2{font-size:17px;margin-top:28px}
  .card{background:#2b2d31;border-radius:8px;padding:14px;margin:14px 0}
  label{display:block;margin-bottom:6px}
  textarea{width:100%;background:#1e1f22;color:#eee;border:1px solid #444;border-radius:6px;padding:8px;font-family:inherit;font-size:14px;box-sizing:border-box}
  .key{color:#888;font-size:12px}
  .ph{color:#f1c40f;font-size:12px;margin:4px 0}
  button{background:#5865f2;color:#fff;border:0;padding:11px 22px;border-radius:6px;font-size:15px;cursor:pointer}
  button.alt{background:#4f545c}
  .ok{background:#2b9348;padding:10px 14px;border-radius:6px;margin-bottom:12px}
  .box{background:#2b2d31;border-radius:8px;padding:14px;margin:12px 0}
  .muted{color:#aaa;font-size:13px}
</style></head>
<body>
  <h1>⚙️ StartzoneRMT — Painel</h1>
  ${banner(q)}

  <div class="box">
    <b>Comandos do Discord</b>
    <p class="muted">Registra/atualiza os slash commands do bot neste servidor. Rode após adicionar comandos novos ou se algum sumir.</p>
    <form method="post" action="deploy-commands"><button class="alt" type="submit">Registrar comandos no Discord</button></form>
  </div>

  <h2>💬 Mensagens do bot</h2>
  <p class="muted">Edite e salve — o bot aplica nas próximas mensagens E atualiza as já postadas (painel, cards, abertura do sorteio).</p>
  <form method="post" action="save">${cards}<button type="submit">Salvar e aplicar</button></form>
</body></html>`;
}

export const adminRouter = Router();
adminRouter.use(basicAuth);
adminRouter.get("/", (req, res) => res.send(page(req.query)));

adminRouter.post("/save", urlencoded({ extended: false }), async (req, res) => {
  for (const def of TEXT_DEFS) {
    const v = (req.body as Record<string, unknown>)[def.key];
    if (typeof v === "string") await setText(def.key, v);
  }
  const r = await refreshAll();
  res.redirect(`./?saved=1&panels=${r.panels}&cards=${r.cards}`);
});

adminRouter.post("/deploy-commands", async (_req, res) => {
  const rest = new REST().setToken(config.discord.token);
  const body = getCommandsJSON();
  if (config.discord.guildId) {
    await rest.put(Routes.applicationGuildCommands(config.discord.clientId, config.discord.guildId), { body });
  } else {
    await rest.put(Routes.applicationCommands(config.discord.clientId), { body });
  }
  res.redirect(`./?deployed=${body.length}`);
});
