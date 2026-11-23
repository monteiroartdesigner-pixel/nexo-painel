"use strict";
// ============================================================================
// CONVERSAS · aba do NEXO Prospect (F5 do plano, 24/11/2026).
// Mostra as conversas do SDR no WhatsApp: quem está aguardando uma pessoa, o resumo que a IA deixou, a transcrição
// (com as SUGESTÕES da IA que ainda não foram enviadas) e os botões Assumir no WhatsApp e Devolver para IA.
// Alerta de lead quente: número na aba, título da página, aviso na tela e som (que dá para silenciar).
// Usa S, rpc, esc, ic, toast, msgErro, copiarTexto, MODS, pintarNav, rotaAtual e render do Prospect (index.html).
// ============================================================================

const CV = { lista: [], filtro: "aguardando", aberta: null, msgs: [], timer: null, tela: null, carregou: false };
const cvAguardando = () => CV.lista.filter(c => c.estado_ia === "atendimento_humano" && c.nao_lida_humano).length;
const cvSomLigado = () => { try { return localStorage.getItem("prospect.cvSom") !== "0"; } catch { return true; } };
const cvPode = () => ["plataforma", "dono", "admin", "editor"].includes(S.papel);

const cvFone = t => { const d = String(t || "").replace(/\D/g, ""); return d.length === 13 ? `+${d.slice(0, 2)} ${d.slice(2, 4)} ${d.slice(4, 9)}-${d.slice(9)}` : d.length === 12 ? `+${d.slice(0, 2)} ${d.slice(2, 4)} ${d.slice(4, 8)}-${d.slice(8)}` : d ? "+" + d : ""; };
const cvNome = c => c.lead_nome || cvFone(c.telefone) || "Contato";
function cvQuando(iso) {
  if (!iso) return "";
  const d = new Date(iso), agora = new Date(), min = Math.round((agora - d) / 60000);
  if (min < 1) return "agora"; if (min < 60) return `há ${min} min`;
  const dia = x => x.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });
  const hora = d.toLocaleTimeString("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit" });
  return dia(d) === dia(agora) ? `hoje ${hora}` : `${d.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit" })} ${hora}`;
}
function cvEstado(c) {
  if (c.estado_ia === "atendimento_humano") return c.nao_lida_humano ? ["Aguardando você", "bad"] : ["Com você", "warn"];
  if (c.estado_ia === "ia_ativa") return ["IA atendendo", "ok"];
  if (c.estado_ia === "encerrada") return ["Encerrada", ""];
  return ["IA pausada", "info"];
}
const cvTemp = t => t === "quente" ? ["Quente", "bad"] : t === "morno" ? ["Morno", "warn"] : ["Frio", "info"];

// ---------------------------------------------------------------- dados, alerta e nav
async function cvCarregar() {
  try { CV.lista = await rpc("nexo_sdr_conversas", { p_agente: S.agente }) || []; CV.carregou = true; } catch { /* sem acesso ao SDR: a aba some sozinha */ }
}
function cvTitulo() { const n = cvAguardando(); return n ? `(${n}) ` : ""; }
const cvPintarTitulo = () => { document.title = cvTitulo() + document.title.replace(/^\(\d+\) /, ""); };
function cvAlerta(novos) {
  toast(novos === 1 ? "Um lead quente está aguardando você." : `${novos} leads quentes estão aguardando você.`);
  if (!cvSomLigado()) return;
  try {   // dois toques curtos; navegadores só deixam depois de o usuário ter clicado na página
    const A = window.AudioContext || window.webkitAudioContext; if (!A) return;
    const ctx = new A(), tom = (f, t0) => { const o = ctx.createOscillator(), g = ctx.createGain(); o.frequency.value = f; o.connect(g); g.connect(ctx.destination); g.gain.setValueAtTime(.12, ctx.currentTime + t0); g.gain.exponentialRampToValueAtTime(.0001, ctx.currentTime + t0 + .25); o.start(ctx.currentTime + t0); o.stop(ctx.currentTime + t0 + .26); };
    tom(880, 0); tom(1175, .28);
  } catch { /* sem som */ }
}
async function cvAtualizar() {
  const antes = cvAguardando(), rota = rotaAtual();
  await cvCarregar();
  const agora = cvAguardando();
  if (agora > antes) cvAlerta(agora - antes);
  pintarNav(); cvPintarTitulo();
  if (rota === "conversas" && CV.tela && document.body.contains(CV.tela)) cvDesenhar(CV.tela);
  else if (rota === "crm" && agora !== antes) render();
}
function cvIniciar() {
  if (CV.timer) return;
  cvCarregar().then(() => { pintarNav(); cvPintarTitulo(); if (rotaAtual() === "crm") render(); });
  CV.timer = setInterval(cvAtualizar, 30000);
}

// Selo no card do kanban (cardLead chama isto).
function cvDoLead(e) { return CV.lista.find(c => c.lead_id === e.id && c.estado_ia === "atendimento_humano"); }
function cvBadge(e) {
  const c = cvDoLead(e); if (!c) return "";
  return c.nao_lida_humano ? `<span class="badge bad cv-pulso" title="A IA passou esta conversa para você">${ic("wa")}Aguardando você</span>` : `<span class="badge warn" title="Conversa com você">Com você</span>`;
}

// ---------------------------------------------------------------- tela
const CV_ABAS = [["aguardando", "Aguardando você", c => c.estado_ia === "atendimento_humano" && c.nao_lida_humano], ["todas", "Todas", () => true],
  ["ia", "IA atendendo", c => c.estado_ia === "ia_ativa"], ["voce", "Com você", c => c.estado_ia === "atendimento_humano" && !c.nao_lida_humano], ["fim", "Encerradas", c => c.estado_ia === "encerrada"]];

async function cvTela(el) {
  CV.tela = el;
  el.innerHTML = `<div class="page-h"><div><h1>Conversas</h1><p>O que a IA está atendendo no WhatsApp e quem está esperando por você.</p></div></div>
    <div class="sk" style="height:46px"></div><div class="sk" style="height:300px;margin-top:12px"></div>`;
  await cvCarregar();
  if (!CV.carregou) { el.innerHTML = `<div class="page-h"><div><h1>Conversas</h1></div></div><div class="alert warn">${ic("alert")}<div>Seu login não tem acesso às conversas do SDR.</div></div>`; return; }
  if (!CV.lista.some(c => c.estado_ia === "atendimento_humano" && c.nao_lida_humano) && CV.filtro === "aguardando") CV.filtro = "todas";
  cvDesenhar(el);
}

function cvDesenhar(el) {
  const aba = CV_ABAS.find(a => a[0] === CV.filtro) || CV_ABAS[1], itens = CV.lista.filter(aba[2]);
  el.innerHTML = `<div class="cv">
    <div class="page-h"><div><h1>Conversas</h1><p>O que a IA está atendendo no WhatsApp e quem está esperando por você.</p></div>
      <label class="cv-som"><input type="checkbox" id="cvSom" ${cvSomLigado() ? "checked" : ""}> Som quando um lead esquentar</label></div>
    <div class="cv-abas" role="tablist">${CV_ABAS.map(([k, n, f]) => `<button type="button" role="tab" class="cv-aba${k === CV.filtro ? " on" : ""}" data-cv-aba="${k}">${n} <b>${CV.lista.filter(f).length}</b></button>`).join("")}</div>
    <div class="cv-grade">
      <div class="cv-lista">${itens.length ? itens.map(c => { const [en, ecl] = cvEstado(c), [tn, tcl] = cvTemp(c.temperatura);
        return `<button type="button" class="cv-item${CV.aberta === c.id ? " on" : ""}${c.nao_lida_humano && c.estado_ia === "atendimento_humano" ? " urgente" : ""}" data-cv-abrir="${esc(c.id)}">
          <div class="cv-topo"><b>${esc(cvNome(c))}</b><span class="muted peq">${esc(cvQuando(c.ultima_msg_em))}</span></div>
          <div class="cv-badges"><span class="badge ${ecl}">${en}</span><span class="badge ${tcl}">${tn}</span></div>
          <div class="cv-prev muted peq">${esc(c.ultima_msg || "")}</div></button>`; }).join("")
        : `<div class="cv-vazio muted">${CV.lista.length ? "Nenhuma conversa nesta aba." : "Ainda não chegou nenhuma conversa. Quando o SDR estiver ligado e o webhook recebendo, elas aparecem aqui."}</div>`}</div>
      <div class="cv-det" id="cvDet">${CV.aberta ? "" : `<div class="cv-vazio muted">Escolha uma conversa para ver o resumo e a transcrição.</div>`}</div>
    </div></div>`;
  el.querySelectorAll("[data-cv-aba]").forEach(b => b.onclick = () => { CV.filtro = b.dataset.cvAba; cvDesenhar(el); });
  el.querySelectorAll("[data-cv-abrir]").forEach(b => b.onclick = () => cvAbrir(b.dataset.cvAbrir));
  el.querySelector("#cvSom").onchange = e => { try { localStorage.setItem("prospect.cvSom", e.target.checked ? "1" : "0"); } catch {} };
  if (CV.aberta) cvDetalhe(CV.aberta, false);
}

async function cvAbrir(id) {
  CV.aberta = id;
  CV.tela.querySelectorAll(".cv-item").forEach(b => b.classList.toggle("on", b.dataset.cvAbrir === id));
  await cvDetalhe(id, true);
}

async function cvDetalhe(id, buscar) {
  const box = document.getElementById("cvDet"); if (!box) return;
  const c = CV.lista.find(x => x.id === id); if (!c) { box.innerHTML = ""; return; }
  if (buscar || CV.msgsDe !== id) {
    box.innerHTML = `<div class="sk" style="height:220px"></div>`;
    try { CV.msgs = await rpc("nexo_sdr_mensagens", { p_agente: S.agente, p_conversa: id }) || []; CV.msgsDe = id; }
    catch (e) { box.innerHTML = `<div class="alert warn">${ic("alert")}<div>${esc(msgErro(e))}</div></div>`; return; }
  }
  const [en, ecl] = cvEstado(c), [tn, tcl] = cvTemp(c.temperatura), pode = cvPode();
  const resumo = c.resumo_transbordo || c.dor_interesse || c.motivo_transbordo
    ? `<div class="cv-resumo"><b>Resumo da IA</b>${c.resumo_transbordo ? `<p>${esc(c.resumo_transbordo)}</p>` : ""}${c.dor_interesse ? `<p><span class="muted">Interesse:</span> ${esc(c.dor_interesse)}</p>` : ""}${c.motivo_transbordo ? `<p><span class="muted">Por que esquentou:</span> ${esc(c.motivo_transbordo)}</p>` : ""}</div>` : "";
  const balao = m => {
    const lead = m.autor === "lead", sug = m.status === "sugerida", rot = lead ? "Contato" : m.autor === "ia" ? "IA" : m.autor === "humano" ? "Você" : "Sistema";
    return `<div class="cv-msg ${lead ? "lead" : "nos"}${sug ? " sug" : ""}"><div class="cv-rot">${rot}${sug ? " · <b>Sugestão da IA, não enviada</b>" : ""}${m.status === "falhou" ? " · <b class=\"bad\">o envio falhou</b>" : ""} <span class="muted">${esc(cvQuando(m.criado_em))}</span></div>
      <div class="cv-txt">${esc(m.texto)}</div>${sug ? `<button type="button" class="btn sm" data-cv-copiar="${m.id}">${ic("copy")}Copiar sugestão</button>` : ""}</div>`;
  };
  box.innerHTML = `<div class="cv-cab"><div><h2>${esc(cvNome(c))}</h2><div class="muted peq">${esc(cvFone(c.telefone))}</div></div>
      <div class="cv-badges"><span class="badge ${ecl}">${en}</span><span class="badge ${tcl}">${tn}</span></div></div>
    ${resumo}
    <div class="cv-acoes">${pode && c.estado_ia !== "encerrada" ? `<button class="btn pri" type="button" id="cvAssumir">${ic("wa")}Assumir no WhatsApp</button>` : ""}
      ${pode && c.estado_ia === "atendimento_humano" ? `<button class="btn" type="button" id="cvDevolver">Devolver para IA</button>` : ""}
      ${c.estado_ia === "encerrada" ? `<span class="muted peq">O contato pediu para não receber mensagens.</span>` : ""}</div>
    <div class="cv-fio">${CV.msgs.length ? CV.msgs.map(balao).join("") : `<div class="muted peq">Sem mensagens.</div>`}</div>
    <p class="muted peq">Em modo sombra a IA não envia nada: copie a sugestão e responda pelo seu WhatsApp. "Assumir" pausa a IA nesta conversa.</p>`;
  box.querySelectorAll("[data-cv-copiar]").forEach(b => b.onclick = async () => { const m = CV.msgs.find(x => String(x.id) === b.dataset.cvCopiar); await copiarTexto(m?.texto || ""); toast("Sugestão copiada."); });
  const as = box.querySelector("#cvAssumir");
  if (as) as.onclick = async () => {
    try { const r = await rpc("nexo_sdr_assumir", { p_agente: S.agente, p_conversa: id }); await cvCarregar(); pintarNav(); cvPintarTitulo(); cvDesenhar(CV.tela); if (r?.link_whatsapp) window.open(r.link_whatsapp, "_blank", "noopener"); }
    catch (e) { toast(msgErro(e), true); }
  };
  const dv = box.querySelector("#cvDevolver");
  if (dv) dv.onclick = async () => {
    if (!confirm("Devolver esta conversa para a IA? Ela volta a responder o contato.")) return;
    try { await rpc("nexo_sdr_devolver_ia", { p_agente: S.agente, p_conversa: id }); toast("Conversa devolvida para a IA."); await cvCarregar(); pintarNav(); cvPintarTitulo(); cvDesenhar(CV.tela); }
    catch (e) { toast(msgErro(e), true); }
  };
}
