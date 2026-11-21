"use strict";
// ============================================================================
// MARKETING · auditoria de 21/11/2026 (aprovada pelo Ricardo).
// - Marca de cada peça (Várzea, Sport, @nexo.rm, Prospect) no cartão e no pedido.
// - Recusar pede o motivo com 1 clique: é o que a equipe lê para não repetir.
// - Histórico de recusadas e com falha (nexo_conteudos_historico).
// - Redes conectadas no Início, com a última sincronização e o teste real (master).
// Usa st, rpc, esc, aviso, msgErro, quando, sb, SUPABASE_URL e SUPABASE_KEY do painel.
// ============================================================================

const MK_MARCAS = { varzea: "NEXO VÁRZEA", sport: "NEXO SPORT", nexo_rm: "@nexo.rm", prospect: "NEXO Prospect" };
const mkMarca = m => m && MK_MARCAS[m] ? `<span class="pill mk-marca mk-${esc(m)}">${esc(MK_MARCAS[m])}</span>` : "";
const MK_MOTIVOS = [
  ["assunto repetido", "Assunto repetido"],
  ["fora da marca", "Fora da marca"],
  ["arte ruim", "Arte ou visual"],
  ["texto fraco", "Texto ou gancho"],
  ["passou a data", "Data passou"],
  ["não é o momento", "Não é o momento"]
];

// Recusar: o motivo vira regra para a equipe (o cérebro lê "motivo_recusa" no histórico).
function mkRecusar(pauta) {
  return new Promise(resolve => {
    const d = document.createElement("dialog");
    d.className = "mk-dialogo";
    d.innerHTML = `<form method="dialog">
      <h2 style="margin:0">Recusar esta peça?</h2>
      <p class="muted peq" style="margin:4px 0 0">${esc(pauta || "")}</p>
      <fieldset class="mk-motivos"><legend class="peq"><b>Por quê?</b> A equipe lê isso e não repete.</legend>
        ${MK_MOTIVOS.map(([v, t], i) => `<label><input type="radio" name="mkm" value="${esc(v)}" ${i ? "" : "checked"}> ${esc(t)}</label>`).join("")}
      </fieldset>
      <label class="campo">Detalhe (opcional)<input name="mkd" maxlength="200" placeholder="Ex.: já falamos do juiz esta semana"></label>
      <div class="acoes"><button class="btn" value="cancelar" type="submit">Voltar</button><button class="btn nao" value="ok" type="submit">Recusar</button></div>
    </form>`;
    document.body.appendChild(d);
    d.addEventListener("close", () => {
      const f = d.querySelector("form");
      const motivo = [f.mkm.value, f.mkd.value.trim()].filter(Boolean).join(": ");
      resolve(d.returnValue === "ok" ? motivo : null);
      d.remove();
    });
    d.showModal();
  });
}

// Aba "Recusadas e falhas" do Aprovar. Sem a migração 20261121100000, explica em vez de quebrar.
async function mkHistorico() {
  try { return { itens: await rpc("nexo_conteudos_historico", { p_agente: st.agente }) || [] }; }
  catch (e) {
    const m = (e && e.message) || "";
    return { erro: /nexo_conteudos_historico|Could not find|does not exist/i.test(m)
      ? "O histórico precisa da atualização do banco (migração 20261121100000_nexo_marketing_confiavel.sql)." : msgErro(e) };
  }
}
function mkHistoricoHtml(h) {
  if (h.erro) return `<div class="aviso">${esc(h.erro)}</div>`;
  if (!h.itens.length) return `<div class="vazio">Nenhuma peça recusada ou com falha nos últimos 60 dias.</div>`;
  return `<p class="muted peq">Últimos 60 dias. A equipe lê estes motivos antes de criar peças novas, para não repetir.</p>` +
    h.itens.map(c => {
      const recusada = c.status === "cancelado";
      const motivo = String(c.motivo || "").replace(/^recusado no painel:\s*/i, "").trim();
      return `<article class="card mk-hist">
        <div class="linha entre"><h3 style="margin:0">${esc(c.pauta)}</h3><span class="pill ${recusada ? "muted" : "bad"}">${recusada ? "recusada" : "falhou"}</span></div>
        <div class="linha muted peq">${mkMarca(c.marca)}<span class="mono">${esc(c.formato)}</span><span>· ${esc(quando(c.atualizado_em))}</span>${!recusada && c.tentativas ? `<span>· ${c.tentativas} tentativas</span>` : ""}</div>
        <div class="peq ${recusada ? "" : "bad"}">${recusada ? (motivo ? "Motivo: " + esc(motivo) : "<span class=\"muted\">Sem motivo escrito</span>") : esc(motivo || "Erro sem detalhe")}</div>
      </article>`;
    }).join("");
}

// Início: redes conectadas com o estado real (o teste é de verdade, só leitura na Meta).
const MK_REDES = ["instagram", "facebook_pagina", "google"];
async function mkRedesHtml() {
  let it = st.resumo?.integracoes || [];
  try { it = await rpc("nexo_integracoes", { p_agente: st.agente }) || it; } catch { /* usa o resumo */ }
  const redes = it.filter(x => MK_REDES.includes(x.tipo));
  const estado = x => x.status === "conectado" && x.ultimo_teste_ok === false ? ["com erro", "bad"]
    : x.status === "conectado" ? ["conectada", "ok"] : x.status === "revogado" ? ["expirada", "bad"]
    : x.status === "erro" ? ["com erro", "bad"] : x.status === "pendente" ? ["pendente", "warn"] : ["desconectada", "muted"];
  const ultima = redes.map(x => x.ultimo_teste_em).filter(Boolean).sort().pop();
  return `<div class="card mk-redes">
    <div class="linha entre"><h2 style="margin:0">Redes conectadas</h2>
      <div class="linha">${st.ctx?.plataforma ? `<button class="btn peq" data-mk-testar>Testar conexão agora</button>` : ""}<button class="btn peq" data-mk-atualizar>Atualizar</button></div></div>
    ${redes.length ? redes.map(x => { const [rot, cls] = estado(x); const app = (x.checagem?.passos || []).find(p => p.chave === "app_meta"); return `
      <div class="mk-rede"><b>${esc(NOME_INT[x.tipo] || x.tipo)}</b><span class="peq">${esc(x.conta || "–")}</span><span class="pill ${cls}">${rot}</span>
        <span class="muted peq">${x.ultimo_teste_em ? "testada " + esc(quando(x.ultimo_teste_em)) : "ainda não testada"}${app?.detalhe ? " · " + esc(app.detalhe.replace(/^token válido no app NEXO Agente\s*/, "token ").replace(/[()]/g, "")) : ""}</span>
        ${x.ultimo_erro ? `<span class="bad peq">${esc(x.ultimo_erro)}</span>` : ""}</div>`; }).join("")
      : `<div class="muted peq">Nenhuma rede conectada. Conecte em <b>Integrações</b>.</div>`}
    <div class="muted peq">Última sincronização: ${ultima ? esc(quando(ultima)) : "–"} · o agente testa sozinho a cada rodada.</div>
  </div>`;
}
function mkRedesLigar(el, recarregar) {
  const at = $("[data-mk-atualizar]", el);
  if (at) at.onclick = async () => { at.disabled = true; await recarregar(); };
  const te = $("[data-mk-testar]", el);
  if (te) te.onclick = async () => {
    te.disabled = true;
    try {
      const sessao = (await sb.auth.getSession()).data.session;
      if (!sessao) throw new Error("Entre de novo no painel.");
      const r = await fetch(`${SUPABASE_URL}/functions/v1/nexo-rodada`, { method: "POST",
        headers: { Authorization: "Bearer " + sessao.access_token, apikey: SUPABASE_KEY, "Content-Type": "application/json" },
        body: JSON.stringify({ acao: "testar" }) });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.erro || "Não deu para pedir o teste agora.");
      aviso(d.disparado ? "Teste pedido. Em uns 2 minutos clique em Atualizar para ver o resultado." : `Já tem um teste começando (${d.motivo}).`);
    } catch (e) { aviso(e.message || "Falhou.", true); }
    finally { te.disabled = false; }
  };
}

// Pedir peça: a marca escolhida vai junto (sem a migração, o pedido sai sem ela e a equipe decide pelo tema).
function mkMarcaSelect(pode) {
  return `<label class="campo" style="flex:0 1 220px">Marca<select id="idMarca" ${pode ? "" : "disabled"}>
    <option value="">A equipe decide pelo tema</option>${Object.entries(MK_MARCAS).map(([v, t]) => `<option value="${v}">${esc(t)}</option>`).join("")}</select></label>`;
}
async function mkMarcarPedido(id, marca) {
  if (!id || !marca) return true;
  try { await rpc("nexo_marcar_pedido", { p_pedido: id, p_marca: marca }); return true; }
  catch (e) { aviso("O pedido foi feito, mas a marca não entrou (a equipe decide pelo tema): " + msgErro(e), true); return false; }
}
