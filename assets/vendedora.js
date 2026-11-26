"use strict";
// ============================================================================
// A tela da VENDEDORA no Rodízio (pedido do Ricardo, 26/11/2026): só prospecção, só os contatos dela.
// Este login não chama nenhuma função das outras telas: só public.nexo_vendedora_* (e o banco recusa o resto).
// Usa S, MODS, rpc, esc, ic, $, $$, toast, msgErro, abrirModal, fecharModal, confirmar, copiarTexto, dataBR, hoje, hrefSeguro, urlSegura, perfilIg,
// pintarNav, render e rotaAtual do index.html. O painel não envia nada: quem toca em enviar no WhatsApp é ela.
// ============================================================================

const VD = { dados: null, filtro: "abordar" };
const VD_SIT = { abordado: "Abordado", respondeu: "Respondeu", cliente: "Virou cliente", nao_contatar: "Não contatar" };
const VD_FILTROS = [["abordar", "A abordar"], ["abordado", "Abordadas"], ["respondeu", "Responderam"], ["encerradas", "Encerradas"]];
const vdGrupo = s => ["novo", "qualificado", "abordar"].includes(s) ? "abordar" : s === "abordado" ? "abordado" : ["cliente", "perdido", "nao_contatar"].includes(s) ? "encerradas" : "respondeu";
const vdSelo = s => ({ abordar: ["pri", "A abordar"], abordado: ["ok", "Abordado"], respondeu: ["warn", "Respondeu"], encerradas: ["", s === "cliente" ? "Cliente" : s === "nao_contatar" ? "Não contatar" : "Encerrado"] })[vdGrupo(s)];

function vdErro(e) {
  const m = String(e?.message || e);
  if (/rodizio_desligado/.test(m)) return "O rodízio está desligado agora. Fale com quem cuida da conta na sua empresa.";
  if (/assinatura_inativa/.test(m)) return "O acesso da empresa está parado. Fale com quem cuida da conta na sua empresa.";
  if (/sem_permissao/.test(m)) return "Este contato não está mais com você. Atualize a tela.";
  const i = m.indexOf("pedido_invalido:");
  if (i >= 0) { const t = m.slice(i + 16).trim(); return t.charAt(0).toUpperCase() + t.slice(1) + "."; }
  return msgErro(e);
}

async function vendedoraAbrir() {
  S.vendedora = true;
  MODS.splice(0, MODS.length, ["meus", "Meus contatos", "crm", "Contatos"], ["ajuda", "Ajuda", "help"]);
  // cores e logo são de quem administra: o logo fica, sem abrir a janela, e o botão de cores sai
  $$(".ap-rapido").forEach(b => b.remove());
  $$("[data-marca]").forEach(b => { b.disabled = true; b.title = ""; b.setAttribute("aria-label", "NEXO Prospect"); $(".lapis", b)?.remove(); });
  window.addEventListener("focus", () => { if (S.vendedora && rotaAtual() === "meus" && !$("#modal.on")) vdAtualizar(); });
  pintarNav(); render();
}

function vendedoraRender(el) {
  const r = rotaAtual();
  document.title = `${r === "ajuda" ? "Ajuda" : "Meus contatos"} · NEXO Prospect`;
  if (r === "ajuda") { el.innerHTML = vdAjuda(); return; }
  el.innerHTML = `<div class="page-h"><div><h1>Meus contatos</h1></div></div><div class="sk" style="height:200px"></div>`;
  vdAtualizar();
}
async function vdAtualizar() {
  const el = $("#main");
  try { VD.dados = await rpc("nexo_vendedora_inicio"); }
  catch (e) { VD.dados = null; el.innerHTML = `<div class="card"><div class="empty"><h2>Sem contatos para mostrar</h2><p class="muted" style="margin:0;max-width:440px">${esc(vdErro(e))}</p></div></div>`; return; }
  if (rotaAtual() === "meus") vdDesenhar();
}

function vdDesenhar() {
  const el = $("#main"), d = VD.dados, todos = d.contatos || [], n = k => todos.filter(c => vdGrupo(c.status) === k).length;
  const lista = todos.filter(c => vdGrupo(c.status) === VD.filtro)
    .sort((a, b) => (a.retorno || "9999") < (b.retorno || "9999") ? -1 : (a.retorno || "9999") > (b.retorno || "9999") ? 1 : 0);
  el.innerHTML = `<div class="page-h"><div><h1>Meus contatos</h1><p>Olá, ${esc(d.nome)}. ${todos.length === 1 ? "Você tem 1 empresa" : `Você tem ${todos.length} empresas`}, ${n("abordar")} para abordar.</p></div>
      <button type="button" class="btn" id="vdRecarregar">Atualizar</button></div>
    ${d.pausada ? `<div class="alert warn">${ic("alert")}<div>Você está <b>pausada</b>: não recebe empresas novas por enquanto. As suas continuam aqui.</div></div>` : ""}
    <div class="chips" role="group" aria-label="Filtrar">${VD_FILTROS.map(([k, nome]) => `<button type="button" class="chip" data-vd-filtro="${k}" aria-pressed="${VD.filtro === k}">${nome} <b>${n(k)}</b></button>`).join("")}</div>
    ${lista.length ? `<div class="vd-lista">${lista.map(vdCartao).join("")}</div>`
      : `<div class="card"><div class="empty"><h2>${VD.filtro === "abordar" ? "Nada para abordar agora" : "Nada aqui ainda"}</h2><p class="muted" style="margin:0">Empresas novas aparecem sozinhas quando chega a sua vez.</p></div></div>`}`;
  $("#vdRecarregar").onclick = ev => { ev.target.disabled = true; vdAtualizar(); };
  $$("[data-vd-filtro]", el).forEach(b => b.onclick = () => { VD.filtro = b.dataset.vdFiltro; vdDesenhar(); });
  const achar = id => VD.dados.contatos.find(c => c.id === id);
  $$("[data-vd-wa]", el).forEach(a => a.addEventListener("click", () => { const c = achar(a.dataset.vdWa); if (c?.mensagem) copiarTexto(c.mensagem); }));
  $$("[data-vd-abordado]", el).forEach(b => b.onclick = () => vdMudar(achar(b.dataset.vdAbordado), "abordado", b));
  $$("[data-vd-sit]", el).forEach(s => s.onchange = () => {
    const c = achar(s.dataset.vdSit), novo = s.value; if (!novo) return; s.value = "";
    if (novo === "nao_contatar") return confirmar("Não contatar?", `${esc(c.nome)} sai da sua lista de abordagem e não é mais chamada.`, async () => { await vdMudar(c, novo); }, "Não contatar", true);
    vdMudar(c, novo);
  });
  $$("[data-vd-anotar]", el).forEach(b => b.onclick = () => vdAnotar(achar(b.dataset.vdAnotar)));
}

function vdCartao(c) {
  const [cor, rot] = vdSelo(c.status), fone = String(c.whatsapp || "").replace(/\D/g, ""), grupo = vdGrupo(c.status);
  const wa = fone.length >= 12 && c.status !== "nao_contatar"
    ? `<a class="btn pri" data-vd-wa="${esc(c.id)}" target="_blank" rel="noopener" href="${hrefSeguro(`https://wa.me/${fone}${c.mensagem ? "?text=" + encodeURIComponent(c.mensagem) : ""}`)}">${ic("wa")}Abrir WhatsApp</a>` : "";
  const outros = [c.instagram ? `<a class="btn" target="_blank" rel="noopener" href="${esc(perfilIg(c.instagram))}">${ic("ig")}Instagram</a>` : "",
    urlSegura(c.site) ? `<a class="btn" target="_blank" rel="noopener" href="${hrefSeguro(c.site)}">${ic("web")}Site</a>` : ""].join("");
  return `<article class="card vd-card" data-vd="${esc(c.id)}">
    <div class="vd-topo"><div class="grow"><h2>${esc(c.nome)}</h2><div class="peq muted">${esc([c.segmento, c.cidade, c.estado].filter(Boolean).join(" · "))}</div></div><span class="badge ${cor}">${rot}</span></div>
    ${c.retorno ? `<div><span class="badge ${c.retorno < hoje() ? "bad" : c.retorno === hoje() ? "warn" : "info"}">${ic("cal")}${c.retorno === hoje() ? "Retornar hoje" : `Retornar ${dataBR(c.retorno)}`}</span></div>` : ""}
    ${c.mensagem ? `<div class="msg vd-msg">${esc(c.mensagem)}</div>` : c.oportunidade ? `<div class="peq t2">${esc(c.oportunidade)}</div>` : ""}
    ${fone.length >= 12 ? "" : `<div class="peq muted">Sem WhatsApp salvo: use o Instagram ou o site.</div>`}
    <div class="vd-acoes">${wa}${outros}${grupo === "abordar" ? `<button type="button" class="btn" data-vd-abordado="${esc(c.id)}">Marcar como abordado</button>` : ""}
      <button type="button" class="btn ghost" data-vd-anotar="${esc(c.id)}">Anotar</button>
      <select class="select vd-sit" data-vd-sit="${esc(c.id)}" aria-label="Mudar situação de ${esc(c.nome)}"><option value="">Mudar situação…</option>${Object.entries(VD_SIT).map(([k, nome]) => `<option value="${k}">${nome}</option>`).join("")}</select></div>
    ${(c.anotacoes || []).length ? `<details class="vd-notas"><summary>${c.anotacoes.length === 1 ? "1 anotação" : `${c.anotacoes.length} anotações`}</summary>${c.anotacoes.map(a => `<p class="peq"><span class="muted">${dataBR(String(a.em).slice(0, 10))}</span> ${esc(a.texto)}</p>`).join("")}</details>` : ""}
  </article>`;
}

async function vdMudar(c, status, botao) {
  if (botao) botao.disabled = true;
  try { await rpc("nexo_vendedora_mudar", { p_lead: c.id, p_status: status, p_nota: null }); toast(`${c.nome}: ${VD_SIT[status]}.`); await vdAtualizar(); }
  catch (e) { if (botao) botao.disabled = false; toast(vdErro(e), true); }
}
function vdAnotar(c) {
  abrirModal(`<form id="vdForm" novalidate><div class="modal-h"><h2>Anotar · ${esc(c.nome)}</h2></div><div class="modal-b">
      <label class="field"><span>Anotação</span><textarea class="textarea" name="texto" rows="3" maxlength="1000"></textarea></label>
      <label class="field"><span>Retornar no dia (se combinou)</span><input class="input" type="date" name="retorno" min="${hoje()}"></label><p class="rod-erro" role="alert"></p></div>
    <div class="modal-f"><button type="button" class="btn ghost" data-fechar>Cancelar</button><button type="submit" class="btn pri">Salvar</button></div></form>`, m => {
    const f = $("#vdForm", m), b = f.querySelector("[type=submit]");
    f.onsubmit = async ev => {
      ev.preventDefault(); if (b.disabled) return;
      const texto = f.elements.texto.value.trim(), retorno = f.elements.retorno.value || null;
      if (!texto && !retorno) { $(".rod-erro", f).textContent = "Escreva a anotação ou escolha o dia do retorno."; return; }
      b.disabled = true;
      try { await rpc("nexo_vendedora_anotar", { p_lead: c.id, p_texto: texto, p_retorno: retorno }); fecharModal(); toast("Anotado."); await vdAtualizar(); }
      catch (e) { b.disabled = false; $(".rod-erro", f).textContent = vdErro(e); }
    };
  });
}

function vdAjuda() {
  return `<div class="page-h"><div><h1>Ajuda</h1><p>Como usar os seus contatos.</p></div></div>
    <div class="card"><ol class="vd-ajuda"><li>Em <b>Meus contatos</b> ficam as empresas que caíram para você.</li>
      <li>Toque em <b>Abrir WhatsApp</b>. A mensagem já vai escrita: leia, ajuste se quiser e envie. O sistema não envia nada sozinho.</li>
      <li>Depois de enviar, toque em <b>Marcar como abordado</b>.</li>
      <li>Combinou de falar depois? Toque em <b>Anotar</b> e escolha o dia do retorno.</li>
      <li>Se a pessoa pedir para não ser chamada, escolha <b>Não contatar</b>.</li></ol>
      <p class="muted peq">Dúvida sobre o seu acesso? Fale com quem cuida da conta na sua empresa.</p></div>`;
}
