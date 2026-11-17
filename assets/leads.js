"use strict";
// ============================================================================
// LEADS · tela simples: o que fazer agora, uma ação por lead e a ficha ao lado.
// Usa os mesmos dados (nexo_leads) e a mesma gravação (nexo_mudar_lead) de antes.
// Desde 18/11/2026 mora no NEXO Prospect (módulo "Leads Instagram"), que passou a ser o único lugar de leads.
// Usa do Prospect: st (agente, leads, aba), rpc, aviso, msgErro, podeEditar e quando; esc e $/$$ vêm de base.js.
// ============================================================================

const ST_LEAD = { novo: "Novo", qualificado: "Qualificado", abordar: "Abordar", abordado: "Abordado", conversando: "Conversando", teste: "Em teste", cliente: "Cliente", perdido: "Perdido", nao_contatar: "Não contatar" };

const LD_ABAS = [
  ["confirmar", "Para confirmar", "A equipe ficou em dúvida sobre o tipo destes leads. Responda e ela escreve a mensagem certa na próxima rodada."],
  ["abordar", "Para abordar", "Leads com mensagem pronta, esperando o primeiro contato."],
  ["retorno", "Retornos de hoje", "Quem já foi abordado e está na hora de um novo contato."],
  ["conversa", "Em conversa", "Quem respondeu, está conversando ou testando."],
  ["todos", "Todos", "Todos os leads, com busca e filtro."],
];
const LD_ETAPAS = [["abordado", "Abordei"], ["conversando", "Respondeu"], ["teste", "Em teste"], ["cliente", "Virou cliente"]];
const LD_FIM = [["perdido", "Perdido"], ["nao_contatar", "Não contatar"]];
let ldEstado = { aba: null, q: "", s: "", mostrar: 30 }, ldCategorias = null;

const ldHoje = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
const ldDia = v => v ? String(v).slice(0, 10) : "";
const ldDuvida = l => !!(l.classificacao && l.classificacao.pergunta && !l.classificacao.resposta);
const ldGrupo = l => {
  if (["novo", "qualificado", "abordar"].includes(l.status) && ldDuvida(l)) return "confirmar";
  if (["novo", "qualificado", "abordar"].includes(l.status)) return "abordar";
  if (["conversando", "teste"].includes(l.status)) return "conversa";
  if (l.status === "abordado" && l.proxima_acao_em && ldDia(l.proxima_acao_em) <= ldHoje()) return "retorno";
  return "outros";
};
const ldNota = n => n == null ? ["–", "b"] : n >= 70 ? [n, "a"] : n >= 45 ? [n, "m"] : [n, "b"];
const ldIniciais = s => (String(s || "?").replace(/[^\p{L}\p{N} ]/gu, "").trim().split(/\s+/).slice(0, 2).map(p => p[0]).join("") || "?").toUpperCase();
const ldWa = l => String(l.whatsapp || "").replace(/\D/g, "");
// Aceita "@perfil", "perfil" ou o link inteiro do perfil.
const ldIg = l => String(l.instagram || "").trim().replace(/^https?:\/\/(www\.)?instagram\.com\//i, "").replace(/^@/, "").split(/[/?#]/)[0];
const ldLugar = l => [l.cidade, l.uf].filter(Boolean).join("/");

function ldLista() {
  const q = ldEstado.q.toLowerCase();
  return st.leads.filter(l => (ldEstado.aba === "todos" ? (!ldEstado.s || l.status === ldEstado.s) : ldGrupo(l) === ldEstado.aba)
    && (!q || [l.nome, l.cidade, l.modalidade, l.tipo, l.instagram].join(" ").toLowerCase().includes(q)))
    .sort((a, b) => ldEstado.aba === "retorno" ? (ldDia(a.proxima_acao_em) < ldDia(b.proxima_acao_em) ? -1 : 1)
      : ldEstado.aba === "abordar" && !!a.mensagem_sugerida !== !!b.mensagem_sugerida ? (a.mensagem_sugerida ? -1 : 1)
      : (b.nota ?? -1) - (a.nota ?? -1));
}

function leadsTela(el) {
  const cont = Object.fromEntries(LD_ABAS.map(([k]) => [k, k === "todos" ? st.leads.length : st.leads.filter(l => ldGrupo(l) === k).length]));
  if (!ldEstado.aba) ldEstado.aba = cont.confirmar ? "confirmar" : "abordar";
  if (ldCategorias === null) { ldCategorias = []; rpc("nexo_categorias_lead", { p_agente: st.agente }).then(c => { ldCategorias = c || []; if (st.aba === "leads") leadsTela(el); }).catch(() => {}); }
  const propostas = (ldCategorias || []).filter(c => c.status === "proposta");
  el.innerHTML = `
    <div class="ld">
      ${propostas.length ? `<section class="ld-props"><b>A equipe propôs ${propostas.length === 1 ? "uma categoria nova" : propostas.length + " categorias novas"}</b>
        <span class="muted peq">Aprovando, ela passa a valer para os próximos leads.</span>
        ${propostas.map(c => `<div class="ld-prop" data-slug="${esc(c.slug)}"><div style="min-width:0"><b>${esc(c.nome)}</b>
          <div class="muted peq">${esc(c.descricao || "")}${c.exemplo ? ` · ex.: ${esc(c.exemplo)}` : ""}</div></div>
          <select data-prod aria-label="Produto"><option value="varzea" ${c.produto === "varzea" ? "selected" : ""}>NEXO VÁRZEA</option><option value="sport" ${c.produto === "sport" ? "selected" : ""}>NEXO SPORT</option></select>
          <button class="btn sim peq" data-cat="1" ${podeEditar() ? "" : "disabled"}>Aprovar</button><button class="btn nao peq" data-cat="0" ${podeEditar() ? "" : "disabled"}>Recusar</button></div>`).join("")}</section>` : ""}
      <div class="ld-passos">
        <div><b>1</b> Abra o lead</div><div><b>2</b> Envie a mensagem pelo seu WhatsApp ou Instagram</div><div><b>3</b> Marque "Abordei"</div>
      </div>
      <nav class="ld-abas" role="tablist">${LD_ABAS.map(([k, n]) => `<button role="tab" data-ab="${k}" aria-selected="${ldEstado.aba === k}">${n}<span>${cont[k]}</span></button>`).join("")}</nav>
      <p class="muted peq ld-explica">${esc(LD_ABAS.find(a => a[0] === ldEstado.aba)[2])}</p>
      <div class="ld-busca">
        <input type="text" id="ldq" placeholder="Buscar por nome, cidade ou modalidade" value="${esc(ldEstado.q)}" aria-label="Buscar lead">
        ${ldEstado.aba === "todos" ? `<select id="lds" aria-label="Filtrar por etapa"><option value="">Todas as etapas</option>${Object.entries(ST_LEAD).map(([k, v]) => `<option value="${k}" ${ldEstado.s === k ? "selected" : ""}>${v}</option>`).join("")}</select>` : ""}
      </div>
      <div class="ld-lista" id="ldLista"></div>
    </div>`;
  $$("[data-ab]", el).forEach(b => b.onclick = () => { ldEstado.aba = b.dataset.ab; ldEstado.mostrar = 30; leadsTela(el); });
  $$(".ld-prop [data-cat]", el).forEach(b => b.onclick = async () => {
    const box = b.closest(".ld-prop"), slug = box.dataset.slug, aprovar = b.dataset.cat === "1";
    $$("button", box).forEach(x => x.disabled = true);
    try { await rpc("nexo_decidir_categoria", { p_agente: st.agente, p_slug: slug, p_aprovar: aprovar, p_produto: $("[data-prod]", box).value });
      ldCategorias = ldCategorias.map(c => c.slug === slug ? { ...c, status: aprovar ? "aprovada" : "recusada" } : c);
      aviso(aprovar ? "Categoria aprovada." : "Categoria recusada."); leadsTela(el); }
    catch (e) { $$("button", box).forEach(x => x.disabled = false); aviso(msgErro(e), true); }
  });
  $("#ldq", el).oninput = e => { ldEstado.q = e.target.value; ldEstado.mostrar = 30; ldPintar(el); };
  const s = $("#lds", el); if (s) s.onchange = e => { ldEstado.s = e.target.value; ldPintar(el); };
  ldPintar(el);
  // "Mandar link ou contato" fica só no NEXO Prospect (Ricardo, 17/11/2026); o lead de time que vier de lá aparece aqui.
}

function ldPintar(el) {
  const it = ldLista(), box = $("#ldLista", el);
  if (!it.length) {
    box.innerHTML = `<div class="vazio">${ldEstado.q ? "Nada com essa busca." : { confirmar: "Nenhuma dúvida pendente. A equipe classificou todos os leads.", abordar: "Nenhum lead esperando abordagem. O Faro traz novos na próxima rodada.", retorno: "Nenhum retorno para hoje.", conversa: "Ninguém em conversa agora.", todos: "Nenhum lead ainda." }[ldEstado.aba]}</div>`;
    return;
  }
  const acao = l => ldGrupo(l) === "abordar" && !l.mensagem_sugerida ? "Ver o próximo passo" : ({ abordar: "Abordar", retorno: "Fazer retorno", conversa: "Continuar" }[ldGrupo(l)] || "Abrir");
  if (ldEstado.aba === "confirmar") { ldPintarDuvidas(el, box, it); return; }
  box.innerHTML = it.slice(0, ldEstado.mostrar).map(l => { const [n, c] = ldNota(l.nota); return `
    <div class="ld-item" data-id="${l.id}" role="button" tabindex="0">
      <span class="ld-av">${esc(ldIniciais(l.nome))}</span>
      <div class="ld-txt"><b>${esc(l.nome)}</b>
        <span>${esc([l.tipo, l.modalidade, ldLugar(l)].filter(Boolean).join(" · "))}</span>
        ${(ldEstado.aba === "retorno" || (ldGrupo(l) === "abordar" && !l.mensagem_sugerida)) && l.proxima_acao ? `<span class="ld-prox">${esc(l.proxima_acao)}</span>` : ""}</div>
      <span class="ld-contatos">${ldGrupo(l) === "abordar" && !l.mensagem_sugerida ? `<i class="sem" title="O robô não escreveu mensagem para este lead">sem mensagem</i>` : ""}${ldWa(l) ? `<i title="Tem WhatsApp">WA</i>` : ""}${ldIg(l) ? `<i title="Tem Instagram">IG</i>` : ""}${!ldWa(l) && !ldIg(l) ? `<i class="sem" title="Sem contato público">sem contato</i>` : ""}</span>
      <span class="ld-nota ${c}" title="Nota do lead (0 a 100)">${n}</span>
      <span class="ld-st">${esc(ST_LEAD[l.status] || l.status)}</span>
      <button class="btn ld-acao" type="button">${acao(l)}</button>
    </div>`; }).join("") + (it.length > ldEstado.mostrar ? `<button class="btn" id="ldMais" style="align-self:center">Mostrar mais (${it.length - ldEstado.mostrar})</button>` : "");
  $$(".ld-item", box).forEach(r => { const abrir = () => ldFicha(st.leads.find(x => String(x.id) === r.dataset.id), el);
    r.onclick = abrir; r.onkeydown = ev => { if (ev.key === "Enter") abrir(); }; });
  const m = $("#ldMais", box); if (m) m.onclick = () => { ldEstado.mostrar += 30; ldPintar(el); };
}

function ldPintarDuvidas(el, box, it) {
  const pode = podeEditar();
  box.innerHTML = it.slice(0, ldEstado.mostrar).map(l => { const c = l.classificacao || {}; return `
    <div class="ld-duvida" data-id="${l.id}">
      <div class="linha entre" style="flex-wrap:nowrap;align-items:flex-start">
        <div class="linha" style="flex-wrap:nowrap;min-width:0"><span class="ld-av">${esc(ldIniciais(l.nome))}</span>
          <div class="ld-txt"><b>${esc(l.nome)}</b><span>${esc([l.tipo, l.modalidade, ldLugar(l)].filter(Boolean).join(" · "))}</span></div></div>
        ${urlSegura(l.fonte_url) ? `<a class="peq" href="${hrefSeguro(l.fonte_url)}" target="_blank" rel="noopener">Ver a fonte</a>` : ""}</div>
      <div class="ld-pergunta"><img src="assets/equipe/faro-rosto.webp" alt=""><div><b>${esc(c.pergunta || "Que tipo de contato é este?")}</b>
        ${(c.sinais || []).length ? `<div class="muted peq">O que vi: ${esc(c.sinais.join(" · "))}</div>` : ""}
        ${c.categoria_sugerida ? `<div class="muted peq">Sugeri uma categoria nova: <b>${esc(c.categoria_sugerida.replace(/_/g, " "))}</b></div>` : ""}</div></div>
      <div class="linha">${(c.opcoes || []).map(o => `<button class="btn" data-resp="${esc(o)}" ${pode ? "" : "disabled"}>${esc(o)}</button>`).join("")}
        <input type="text" data-outro placeholder="Outra resposta…" maxlength="120" ${pode ? "" : "disabled"} style="flex:1 1 180px">
        <button class="btn prim" data-enviar ${pode ? "" : "disabled"}>Responder</button></div>
    </div>`; }).join("") + (it.length > ldEstado.mostrar ? `<button class="btn" id="ldMais" style="align-self:center">Mostrar mais (${it.length - ldEstado.mostrar})</button>` : "");
  const responder = async (card, resp) => {
    resp = String(resp || "").trim(); if (!resp) { aviso("Escolha uma opção ou escreva a resposta.", true); return; }
    const l = st.leads.find(x => String(x.id) === card.dataset.id);
    $$("button,input", card).forEach(x => x.disabled = true);
    try { const r = await rpc("nexo_confirmar_lead", { p_lead: l.id, p_resposta: resp });
      l.classificacao = { ...(l.classificacao || {}), resposta: resp }; if (r && r.categoria) l.categoria = r.categoria;
      aviso("Respondido. A equipe escreve a mensagem certa na próxima rodada."); leadsTela(el); }
    catch (e) { $$("button,input", card).forEach(x => x.disabled = false); aviso(msgErro(e), true); }
  };
  $$(".ld-duvida", box).forEach(card => {
    $$("[data-resp]", card).forEach(b => b.onclick = () => responder(card, b.dataset.resp));
    $("[data-enviar]", card).onclick = () => responder(card, $("[data-outro]", card).value);
    $("[data-outro]", card).onkeydown = ev => { if (ev.key === "Enter") responder(card, ev.target.value); };
  });
  const m = $("#ldMais", box); if (m) m.onclick = () => { ldEstado.mostrar += 30; ldPintar(el); };
}

async function ldMudar(l, status, el, fundo) {
  try {
    await rpc("nexo_mudar_lead", { p_lead: l.id, p_status: status, p_nota: null });
    l.status = status; aviso(`${l.nome}: ${ST_LEAD[status] || status}.`);
    fundo?.remove(); leadsTela(el);
  } catch (e) { aviso(msgErro(e), true); }
}

function ldFicha(l, el) {
  if (!l) return;
  document.querySelector(".ld-fundo")?.remove();
  const pode = podeEditar(), wa = ldWa(l), ig = ldIg(l), msg = l.mensagem_sugerida || "", [n, c] = ldNota(l.nota);
  const fundo = document.createElement("div"); fundo.className = "ld-fundo";
  fundo.innerHTML = `<aside class="ld-ficha" role="dialog" aria-modal="true" aria-label="${esc(l.nome)}">
    <div class="linha entre" style="flex-wrap:nowrap;align-items:flex-start">
      <div class="linha" style="flex-wrap:nowrap"><span class="ld-av grande">${esc(ldIniciais(l.nome))}</span>
        <div><h2 style="margin:0">${esc(l.nome)}</h2><div class="muted peq">${esc([l.tipo, l.modalidade, ldLugar(l)].filter(Boolean).join(" · "))}</div></div></div>
      <button class="btn" data-fechar aria-label="Fechar">✕</button></div>

    <div class="ld-bloco"><div class="linha entre"><b>Nota do lead</b><span class="ld-nota ${c}">${n}</span></div>
      ${l.motivo_nota ? `<div class="muted peq">${esc(l.motivo_nota)}</div>` : ""}
      ${l.categoria || (l.classificacao && l.classificacao.resposta) ? `<div class="peq">Tipo: <b>${esc((l.categoria || l.classificacao.resposta).replace(/_/g, " "))}</b>${l.classificacao && l.classificacao.confianca ? ` · certeza ${esc({ alta: "alta", media: "média", baixa: "baixa" }[l.classificacao.confianca] || l.classificacao.confianca)}` : ""}</div>` : ""}
      ${l.classificacao && (l.classificacao.sinais || []).length ? `<div class="muted peq">O que a equipe viu: ${esc(l.classificacao.sinais.join(" · "))}</div>` : ""}
      <div class="peq">Etapa atual: <b>${esc(ST_LEAD[l.status] || l.status)}</b>${l.abordado_em ? ` · abordado em ${esc(quando(l.abordado_em))}` : ""}</div>
      ${l.proxima_acao ? `<div class="peq">Próximo passo: <b>${esc(l.proxima_acao)}</b>${l.proxima_acao_em ? ` · ${esc(ldDia(l.proxima_acao_em).split("-").reverse().join("/"))}` : ""}</div>` : ""}</div>

    <div class="ld-bloco"><b>1. Mensagem pronta</b>
      ${msg ? `<div class="ld-msg">${esc(msg)}</div>` : `${l.proxima_acao && !(l.classificacao && l.classificacao.resposta) ? `<div class="ld-passo"><b>Próximo passo sugerido pelo Faro:</b> ${esc(l.proxima_acao)}</div>` : ""}<div class="muted peq">${l.classificacao && l.classificacao.resposta ? `Você respondeu "${esc(l.classificacao.resposta)}". A equipe escreve a mensagem certa na próxima rodada.` : "Este lead ainda não tem mensagem pronta. Escreva uma curta, citando o que você viu."}</div>`}
      <div class="linha">
        ${wa ? `<a class="btn prim" data-wa-copia target="_blank" rel="noopener" href="https://wa.me/${esc(wa)}${msg ? "?text=" + encodeURIComponent(msg) : ""}">Abrir WhatsApp com a mensagem</a>` : ""}
        ${ig ? `<button class="btn ${wa ? "" : "prim"}" data-ig>${msg ? "Copiar e abrir o perfil" : "Abrir o perfil"}</button>` : ""}
        ${msg ? `<button class="btn" data-copiar>Copiar mensagem</button>` : ""}
      </div>
      ${msg && ig ? `<div class="muted peq">No Instagram o texto não entra sozinho: no perfil, toque em Mensagem e cole (Ctrl+V; no celular, segure e toque em Colar).</div>` : ""}
      ${!wa && !ig ? `<div class="aviso">Sem contato público. ${urlSegura(l.fonte_url) ? "Veja a fonte abaixo para achar um canal." : ""}</div>` : ""}
      ${l.contato_publico && !wa && !ig ? `<div class="peq">Contato informado: ${esc(l.contato_publico)}</div>` : ""}</div>

    <div class="ld-bloco"><b>2. Em que pé está?</b>
      <div class="ld-etapas">${LD_ETAPAS.map(([k, t]) => `<button class="ld-etapa ${l.status === k ? "atual" : ""}" data-st="${k}" ${pode ? "" : "disabled"}>${t}</button>`).join("")}</div>
      <div class="linha">${LD_FIM.map(([k, t]) => `<button class="btn nao peq" data-st="${k}" ${pode ? "" : "disabled"}>${t}</button>`).join("")}
        ${["perdido", "nao_contatar", "cliente"].includes(l.status) ? `<button class="btn peq" data-st="novo" ${pode ? "" : "disabled"}>Voltar para "Novo"</button>` : ""}</div>
      ${pode ? "" : `<div class="muted peq">Seu papel só permite ver.</div>`}</div>

    <div class="ld-bloco"><b>Contatos e fonte</b>
      <div class="linha peq">
        ${ig ? `<a href="https://instagram.com/${esc(ig)}" target="_blank" rel="noopener">@${esc(ig)}</a>` : ""}
        ${wa ? `<a href="https://wa.me/${esc(wa)}" target="_blank" rel="noopener">WhatsApp ${esc(l.whatsapp)}</a>` : ""}
        ${urlSegura(l.fonte_url) ? `<a href="${hrefSeguro(l.fonte_url)}" target="_blank" rel="noopener">Onde o Faro achou</a>` : ""}
      </div></div>
  </aside>`;
  const fechar = () => { fundo.remove(); document.removeEventListener("keydown", tecla); };
  const tecla = ev => { if (ev.key === "Escape") fechar(); };
  fundo.onclick = ev => { if (ev.target === fundo) fechar(); };
  fundo.querySelector("[data-fechar]").onclick = fechar;
  // Copia com a API do navegador e, se ela falhar (celular, permissão), pelo método antigo.
  const copiarTexto = async texto => {
    try { await navigator.clipboard.writeText(texto); return true; } catch {}
    const t = document.createElement("textarea"); t.value = texto; t.setAttribute("readonly", ""); t.style.cssText = "position:fixed;top:-1000px;opacity:0";
    document.body.appendChild(t); t.select(); t.setSelectionRange(0, texto.length);
    let ok = false; try { ok = document.execCommand("copy"); } catch {} t.remove(); return ok;
  };
  const marcar = (botao, ok) => { if (!botao) return; const antes = botao.dataset.rotulo || botao.textContent; botao.dataset.rotulo = antes;
    botao.textContent = ok ? "✓ Copiada" : "Não copiou"; botao.classList.toggle("ld-copiado", ok); setTimeout(() => { botao.textContent = antes; botao.classList.remove("ld-copiado"); }, 2500); };
  const copiar = async botao => {
    const ok = await copiarTexto(msg); marcar(botao, ok);
    if (ok) aviso("Mensagem copiada. Cole na conversa (Ctrl+V no computador; no celular, segure e toque em Colar).");
    else { aviso("O navegador bloqueou a cópia: selecione o texto da mensagem e copie.", true); const m = fundo.querySelector(".ld-msg"); if (m) { const r = document.createRange(); r.selectNodeContents(m); const sel = getSelection(); sel.removeAllRanges(); sel.addRange(r); } }
    return ok;
  };
  fundo.querySelector("[data-copiar]")?.addEventListener("click", ev => copiar(ev.currentTarget));
  // WhatsApp: o texto já vai preenchido no link, e fica copiado também (se o app abrir sem o texto, é só colar).
  fundo.querySelector("[data-wa-copia]")?.addEventListener("click", () => { if (msg) copiar(null); });
  // Instagram: abre o perfil (o link ig.me não abre no computador). O Instagram não aceita texto pronto: a mensagem vai copiada.
  fundo.querySelector("[data-ig]")?.addEventListener("click", ev => {
    const janela = window.open(`https://www.instagram.com/${encodeURIComponent(ig)}/`, "_blank");   // abre já no clique, para o navegador não bloquear
    if (janela) janela.opener = null;
    if (msg) copiar(ev.currentTarget);
  });
  fundo.querySelectorAll("[data-st]").forEach(b => b.onclick = () => ldMudar(l, b.dataset.st, el, fundo));
  document.addEventListener("keydown", tecla);
  document.body.appendChild(fundo);
  fundo.querySelector("[data-fechar]").focus();
}
