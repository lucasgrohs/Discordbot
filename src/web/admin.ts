import { Router, urlencoded, type Request, type Response, type NextFunction } from "express";
import { REST, Routes } from "discord.js";
import { config } from "../config.js";
import { listTexts, setText, TEXT_DEFS } from "../services/texts.js";
import { getCommandsJSON } from "../bot/router.js";
import { refreshAll } from "../bot/market/board.js";
import { dashboard } from "../services/stats.js";
import { listSettings, setSetting, SETTING_DEFS } from "../services/settings.js";

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

// Lista de referência dos comandos do bot (gerada a partir dos comandos registrados).
function commandsRef(): string {
  type Cmd = { name: string; description?: string; default_member_permissions?: string | null; options?: Opt[] };
  type Opt = { type: number; name: string; description?: string };
  const cmds = (getCommandsJSON() as Cmd[]).slice().sort((a, b) => a.name.localeCompare(b.name));
  return cmds
    .map((c) => {
      const admin = c.default_member_permissions ? ' <span class="badge">admin</span>' : "";
      const subs = (c.options ?? []).filter((o) => o.type === 1); // 1 = subcomando
      const head = `<b>/${esc(c.name)}</b>${admin} <span class="muted">${esc(c.description ?? "")}</span>`;
      if (!subs.length) return `<div class="cmd">${head}</div>`;
      const items = subs
        .map((s) => `<li><code>/${esc(c.name)} ${esc(s.name)}</code> — ${esc(s.description ?? "")}</li>`)
        .join("");
      return `<div class="cmd">${head}<ul>${items}</ul></div>`;
    })
    .join("");
}

function banner(q: Request["query"]): string {
  if (q.deployed) return `<div class="ok">✅ ${esc(String(q.deployed))} comando(s) registrado(s) no Discord.</div>`;
  if (q.settings) return `<div class="ok">✅ Configurações salvas.</div>`;
  if (q.saved)
    return `<div class="ok">✅ Salvo e aplicado! Painéis atualizados: ${esc(String(q.panels ?? 0))} · cards: ${esc(String(q.cards ?? 0))}.</div>`;
  return "";
}

function dashboardHtml(d: Awaited<ReturnType<typeof dashboard>>): string {
  const card = (label: string, val: number | string) => `<div class="stat"><div class="n">${val}</div><div class="l">${label}</div></div>`;
  const tr = (s: string) => d.trades[s] ?? 0;
  return `<div class="stats">
    ${card("Jogos ativos", `${d.gamesActive}/${d.games}`)}
    ${card("Anúncios venda", d.sell)}
    ${card("Anúncios compra", d.buy)}
    ${card("Negociando", tr("ACCEPTED") + tr("IN_PROGRESS") + tr("PENDING"))}
    ${card("Concluídas", tr("COMPLETED"))}
    ${card("Disputas", tr("DISPUTED"))}
    ${card("Avaliações", d.reviews)}
    ${card("VIPs ativos", d.vips)}
  </div>`;
}

function settingsHtml(): string {
  const groups = [...new Set(SETTING_DEFS.map((d) => d.group))];
  const body = groups
    .map((g) => {
      const items = listSettings()
        .filter((s) => s.group === g)
        .map(
          (s) =>
            `<div class="srow"><label for="${s.key}">${esc(s.label)} <span class="key">${s.key}</span></label>
             <input type="number" step="any" id="${s.key}" name="${s.key}" value="${s.value}"></div>`,
        )
        .join("");
      return `<div class="box"><b>${esc(g)}</b>${items}</div>`;
    })
    .join("");
  return `<form method="post" action="settings">${body}<button type="submit">Salvar configurações</button></form>`;
}

async function page(q: Request["query"]): Promise<string> {
  const d = await dashboard();
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
  .cmd{padding:8px 0;border-bottom:1px solid #3a3c42}
  .cmd ul{margin:6px 0 0;padding-left:18px}
  .cmd li{margin:2px 0;font-size:14px}
  code{background:#1e1f22;border:1px solid #444;border-radius:4px;padding:1px 5px;font-size:13px}
  .badge{background:#5865f2;color:#fff;font-size:11px;padding:1px 6px;border-radius:10px;vertical-align:middle}
  details summary{cursor:pointer;font-weight:bold;font-size:17px;margin-top:24px}
  .stats{display:flex;flex-wrap:wrap;gap:10px;margin:12px 0}
  .stat{background:#2b2d31;border-radius:8px;padding:12px 16px;min-width:110px;text-align:center}
  .stat .n{font-size:22px;font-weight:bold}.stat .l{font-size:12px;color:#aaa}
  .srow{margin:8px 0}.srow label{font-size:14px}.srow input{width:160px;background:#1e1f22;color:#eee;border:1px solid #444;border-radius:6px;padding:6px;font-size:14px}
</style></head>
<body>
  <h1>⚙️ StartzoneRMT — Painel</h1>
  ${banner(q)}

  <h2>📊 Visão geral</h2>
  ${dashboardHtml(d)}

  <details>
    <summary>⚙️ Configurações do bot</summary>
    <p class="muted">Ajuste o comportamento (pesos do ranking, bônus VIP, prazos). Vale imediatamente.</p>
    ${settingsHtml()}
  </details>

  <details>
    <summary>📖 Comandos do bot (referência)</summary>
    <p class="muted">Todos os comandos disponíveis. <span class="badge">admin</span> = só administradores.</p>
    <div class="box">${commandsRef()}</div>
    <form method="post" action="deploy-commands"><button class="alt" type="submit">↻ Re-registrar comandos</button></form>
  </details>

  <h2>💬 Mensagens do bot</h2>
  <p class="muted">Edite e salve — o bot aplica nas próximas mensagens E atualiza as já postadas (painel, cards, abertura do sorteio).</p>
  <form method="post" action="save">${cards}<button type="submit">Salvar e aplicar</button></form>
</body></html>`;
}

export const adminRouter = Router();
adminRouter.use(basicAuth);
adminRouter.get("/", async (req, res) => res.send(await page(req.query)));

adminRouter.post("/settings", urlencoded({ extended: false }), async (req, res) => {
  for (const def of SETTING_DEFS) {
    const raw = (req.body as Record<string, unknown>)[def.key];
    const n = Number(raw);
    if (typeof raw === "string" && Number.isFinite(n)) await setSetting(def.key, n);
  }
  res.redirect("./?settings=1");
});

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
