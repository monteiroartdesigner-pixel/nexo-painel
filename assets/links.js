"use strict";
// ============================================================================
// MANDAR LINK OU CONTATO (do Ricardo, 17/11/2026: "eu mando o link e o robô faz o resto").
// Uma caixa só, usada no NEXO System (aba Leads) e no NEXO Prospect (Início).
// O link vai para a fila (nexo_mandar_link). Na rodada seguinte o robô abre o link, decide a marca
// (time ou liga: lead do NEXO Várzea; empresa: NEXO Prospect), analisa, escreve a mensagem e
// deixa em "Para abordar". O que não serve volta como "Descartado", com o motivo.
// Nada é enviado a ninguém: só aparece no painel para o Ricardo abordar.
//
// linksCaixa(el, ctx) · ctx = { rpc, agente, esc, avisar(txt, erro), msgErro, pode, quando, abrir(item) }
// ============================================================================

const LK = { cache: {}, abertos: false };
const LK_RODADAS = [[6, 10], [12, 10], [18, 10]];   // rotina do cérebro (todos os dias)

function lkProxima() {
  const agora = new Date(), sp = new Date(agora.toLocaleString("en-US", { timeZone: "America/Sao_Paulo" }));
  for (let d = 0; d < 2; d++) for (const [h, m] of LK_RODADAS) {
    const n = new Date(sp); n.setDate(n.getDate() + d); n.setHours(h, m, 0, 0);
    if (n > sp) return (d ? "amanhã às " : "hoje às ") + String(h).padStart(2, "0") + ":" + String(m).padStart(2, "0");
  }
  return "na próxima rodada";
}

// Separa o que foi colado: um link, @ ou telefone por linha (ou separados por espaço, quando são links).
function lkSeparar(txt) {
  return String(txt || "").split(/\n+/).flatMap(l => {
    const t = l.trim(); if (!t) return [];
    const urls = t.match(/https?:\/\/\S+/g);
    return urls && urls.length > 1 ? urls : [t];
  }).map(t => t.slice(0, 600)).filter((t, i, a) => t.length >= 3 && a.indexOf(t) === i).slice(0, 20);
}

async function linksCaixa(el, ctx) {
  if (!el) return;
  const { esc } = ctx, chave = ctx.agente;
  const pintar = () => {
    const lista = LK.cache[chave]?.itens || [];
    const fila = lista.filter(p => p.status === "na_fila").length;
    const mostrar = LK.abertos ? lista : lista.slice(0, 4);
    el.innerHTML = `
      <section class="lk">
        <div class="lk-h"><div><b>Mandar link ou contato</b>
          <div class="lk-sub">Cole o link do Instagram, site, Google Maps ou o telefone. A equipe abre, analisa e deixa pronto para abordar.</div></div>
          ${fila ? `<span class="lk-chip fila">${fila} na fila</span>` : ""}</div>
        <div class="lk-form">
          <textarea id="lkTxt" rows="2" maxlength="6000" placeholder="https://instagram.com/nome_do_perfil&#10;(um por linha, até 20 de uma vez)" ${ctx.pode ? "" : "disabled"} aria-label="Links ou contatos"></textarea>
          <input id="lkNota" type="text" maxlength="300" placeholder="Observação para a equipe (opcional): ex. vi no jogo de sábado" ${ctx.pode ? "" : "disabled"} aria-label="Observação">
          <button class="btn pri prim" id="lkMandar" ${ctx.pode ? "" : "disabled"}>Mandar para a equipe</button>
        </div>
        <div class="lk-dica">${ctx.pode ? `A equipe analisa <b>${lkProxima()}</b>. Nada é enviado a ninguém: o resultado aparece aqui e em "Para abordar".` : "Seu papel só permite ver."}</div>
        ${lista.length ? `<div class="lk-lista">${mostrar.map(p => lkItem(p, ctx)).join("")}</div>
          ${lista.length > 4 ? `<button class="lk-mais" id="lkMais">${LK.abertos ? "Mostrar menos" : `Ver os ${lista.length} links`}</button>` : ""}` : ""}
      </section>`;
    const btn = el.querySelector("#lkMandar"), txt = el.querySelector("#lkTxt");
    if (btn) btn.onclick = async () => {
      const itens = lkSeparar(txt.value), nota = el.querySelector("#lkNota").value.trim();
      if (!itens.length) { ctx.avisar("Cole pelo menos um link, @ ou telefone.", true); txt.focus(); return; }
      btn.disabled = true; btn.textContent = "Mandando…";
      let ok = 0; const erros = [];
      for (const t of itens) {
        try { await ctx.rpc("nexo_mandar_link", { p_agente: chave, p_texto: t, p_nota: nota || null }); ok++; }
        catch (e) { erros.push(lkErro(e, ctx)); }
      }
      if (ok) { txt.value = ""; el.querySelector("#lkNota").value = ""; }
      ctx.avisar(ok ? `${ok} ${ok === 1 ? "link mandado" : "links mandados"}. A equipe analisa ${lkProxima()}.${erros.length ? " " + erros[0] : ""}`
                    : erros[0] || "Não deu certo.", !ok);
      await carregar(true);
    };
    const mais = el.querySelector("#lkMais");
    if (mais) mais.onclick = () => { LK.abertos = !LK.abertos; pintar(); };
    el.querySelectorAll("[data-lk-cancelar]").forEach(b => b.onclick = async () => {
      b.disabled = true;
      try { await ctx.rpc("nexo_cancelar_link", { p_pedido: b.dataset.lkCancelar }); ctx.avisar("Link tirado da fila."); }
      catch (e) { ctx.avisar(lkErro(e, ctx), true); }
      await carregar(true);
    });
    el.querySelectorAll("[data-lk-abrir]").forEach(b => b.onclick = () => {
      const p = lista.find(x => x.id === b.dataset.lkAbrir); if (p && ctx.abrir) ctx.abrir(p);
    });
  };
  const carregar = async (forcar = false) => {
    const c = LK.cache[chave];
    if (!forcar && c && Date.now() - c.em < 30000) return pintar();
    try { LK.cache[chave] = { em: Date.now(), itens: await ctx.rpc("nexo_links", { p_agente: chave }) || [] }; pintar(); }
    catch (e) {
      const m = (e && e.message) || String(e);
      el.innerHTML = /nexo_links|does not exist|Could not find/i.test(m)
        ? `<section class="lk"><div class="lk-h"><b>Mandar link ou contato</b></div><div class="lk-dica">Esta caixa funciona depois da atualização do banco (migração <b>20261117100000_nexo_links.sql</b>).</div></section>`
        : "";
    }
  };
  pintar();   // desenha na hora com o que já tem; a lista chega logo depois
  await carregar();
}

function lkErro(e, ctx) {
  const m = (e && e.message) || String(e);
  const k = m.match(/pedido_invalido:\s*(.*)$/);
  return k ? k[1].charAt(0).toUpperCase() + k[1].slice(1) + "." : ctx.msgErro ? ctx.msgErro(e) : m;
}

function lkItem(p, ctx) {
  const { esc } = ctx, marca = p.destino === "prospect" ? "Vendas" : "NEXO Várzea";
  const curto = String(p.texto || "").replace(/^https?:\/\/(www\.)?/, "").replace(/\/$/, "");
  const linha2 = {
    na_fila: `Na fila · a equipe analisa ${lkProxima()}`,
    pronto: `${p.destino === "prospect" ? "Virou empresa em" : "Virou lead do"} <b>${marca}</b>${p.resultado_nome ? ": " + esc(p.resultado_nome) : ""}`,
    descartado: `Descartado: ${esc(p.observacao || "não serve para nenhuma das marcas")}`,
    cancelado: "Cancelado",
  }[p.status] || esc(p.status);
  const chip = { na_fila: ["fila", "Na fila"], pronto: ["ok", "Pronto"], descartado: ["fora", "Descartado"], cancelado: ["", "Cancelado"] }[p.status] || ["", p.status];
  return `<div class="lk-it">
    <span class="lk-chip ${chip[0]}">${chip[1]}</span>
    <div class="lk-tx"><div class="lk-link" title="${esc(p.texto)}">${esc(curto)}</div>
      <div class="lk-res">${linha2}${p.status === "pronto" && p.observacao ? ` <span class="lk-obs">· ${esc(p.observacao)}</span>` : ""}</div>
      ${p.nota ? `<div class="lk-obs">Sua observação: ${esc(p.nota)}</div>` : ""}</div>
    ${p.status === "na_fila" && ctx.pode ? `<button class="btn peq" data-lk-cancelar="${esc(p.id)}">Cancelar</button>` : ""}
    ${p.status === "pronto" && p.resultado_id ? `<button class="btn peq pri prim" data-lk-abrir="${esc(p.id)}">Abrir</button>` : ""}
  </div>`;
}
