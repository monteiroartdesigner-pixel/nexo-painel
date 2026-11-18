"use strict";
// ============================================================================
// BASE comum do NEXO System e do NEXO Prospect (carregar logo depois do supabase-js).
// Antes cada página tinha a sua cópia destas linhas; agora uma correção vale para as duas.
//
// Chave pública (publishable) do projeto: feita para ficar no navegador. Quem protege os dados
// são as funções nexo_* no banco, que conferem o login e o papel de quem chama. Nenhum segredo aqui.
// ============================================================================
const SUPABASE_URL = "https://rtjcvvjmmljizkjnztlb.supabase.co";
const SUPABASE_KEY = "sb_publishable_wInsjqMkI_MVpK8zJFbfeg_A-SPDB6y";
const sb = window.supabase ? window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: true, autoRefreshToken: true } }) : null;
const FUSO = "America/Sao_Paulo";

const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];

// Texto vindo do banco ou da internet → seguro para pôr dentro do HTML.
function esc(v) { return String(v ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])); }

// Link vindo de fora (site de lead, fonte da pesquisa, post) → só http:// ou https://.
// Qualquer outra coisa (javascript:, data:, vbscript:, texto solto) vira "" e o botão não aparece.
function urlSegura(v) {
  const s = String(v ?? "").trim();
  if (!/^https?:\/\//i.test(s)) return "";
  try { const u = new URL(s); return (u.protocol === "http:" || u.protocol === "https:") ? u.href : ""; }
  catch { return ""; }
}
// Atalho para o atributo: href="${hrefSeguro(x)}" já escapado ("#" quando o link não presta).
// Plural certo: pl(1, "peça", "peças") -> "1 peça"; pl(3, ...) -> "3 peças".
const pl = (n, um, varios) => `${n} ${Number(n) === 1 ? um : varios}`;
const hrefSeguro = v => esc(urlSegura(v) || "#");
