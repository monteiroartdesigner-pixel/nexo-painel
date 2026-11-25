"use strict";
/* Fila "Para enviar": a mensagem que a equipe escreveu para cada contato, com um toque para abrir o WhatsApp (pedido do Ricardo, 25/11/2026).
   O painel NÃO envia: quem toca em enviar no WhatsApp é a pessoa, uma conversa de cada vez.
   Usa S, rpc, esc, ic, $, $$, hoje, msgDe, duvidaDe, mudarStatus, abrirFicha, copiarTexto, toast, pintarNav e rotaAtual do index.html. */

/* Sugestão da NEXO, não é um número do WhatsApp: acima disso por dia a tela avisa. */
const FILA_SUGESTAO_DIA = 10;
const FILA = { abertas: new Set() };   /* contatos em que o WhatsApp foi aberto e falta dizer se a mensagem saiu */

const filaFone = v => { const d = String(v || "").replace(/\D/g, ""); return d.length === 10 || d.length === 11 ? "55" + d : d; };
function filaLista() {
  return (S.empresas || [])
    .filter(e => ["qualificado", "abordar"].includes(e.status) && filaFone(e.whatsapp).length >= 12 && msgDe(e.campanhas || []) && !duvidaDe(e))
    .sort((a, b) => (b.pontuacao || 0) - (a.pontuacao || 0) || String(a.nome).localeCompare(String(b.nome)));
}

/* Quantas a pessoa disse que enviou hoje, neste aparelho (só para o aviso de ritmo). */
const filaChave = () => `prospect.enviadas.${S.empresaId}`;
function filaEnviadasHoje() {
  try { const v = JSON.parse(localStorage.getItem(filaChave()) || "{}"); return v.dia === hoje() ? Number(v.n) || 0 : 0; } catch { return 0; }
}
function filaContar() { try { localStorage.setItem(filaChave(), JSON.stringify({ dia: hoje(), n: filaEnviadasHoje() + 1 })); } catch { /* sem armazenamento: só não conta */ } }

function filaCartao(e, i) {
  const msg = msgDe(e.campanhas || []), aberta = FILA.abertas.has(e.id);
  const url = `https://wa.me/${filaFone(e.whatsapp)}?text=${encodeURIComponent(msg)}`;
  const acoes = aberta
    ? `<div class="fila-conf" role="group" aria-label="A mensagem saiu?"><b>Enviou a mensagem?</b>
         <button type="button" class="btn pri" data-fila-sim="${esc(e.id)}">Sim, enviei</button>
         <button type="button" class="btn" data-fila-nao="${esc(e.id)}">Não enviei</button></div>`
    : `<a class="btn pri fila-enviar" data-fila-abrir="${esc(e.id)}" target="_blank" rel="noopener" href="${hrefSeguro(url)}">${ic("wa")}Enviar no WhatsApp</a>
       <button type="button" class="btn" data-fila-ficha="${esc(e.id)}">Ver ficha</button>`;
  return `<article class="card fila-card${i === 0 ? " fila-primeira" : ""}" data-fila="${esc(e.id)}">
    <div class="fila-topo"><div class="grow"><h2>${esc(e.nome)}</h2>
      <div class="peq muted">${esc([e.segmento, e.cidade].filter(Boolean).join(" · "))}</div></div>
      ${e.pontuacao != null ? `<span class="badge${e.pontuacao >= 70 ? " ok" : ""}" title="Nota da análise">${esc(e.pontuacao)}</span>` : ""}</div>
    <div class="msg fila-msg">${esc(msg)}</div>
    <div class="fila-acoes">${acoes}</div></article>`;
}

function vEnviar(el) {
  const l = filaLista(), n = filaEnviadasHoje();
  el.innerHTML = `
    <div class="page-h"><div><h1>Para enviar</h1><p>Mensagens prontas. Você revisa e envia, uma de cada vez. O painel não envia nada sozinho.</p></div>
      <span class="badge fila-hoje">${n === 1 ? "1 enviada hoje" : `${n} enviadas hoje`}</span></div>
    ${n >= FILA_SUGESTAO_DIA ? `<div class="alert warn">${ic("alert")}<div><b>Por hoje já está bom.</b> Você marcou ${n} envios. Muitas mensagens seguidas para quem não conhece você podem bloquear o número, principalmente se ele for novo.</div></div>` : ""}
    ${l.length ? `<p class="muted peq" style="margin:0">${l.length === 1 ? "1 mensagem pronta" : `${l.length} mensagens prontas`}. Confira que o WhatsApp que abrir é o do número da empresa. Se a pessoa pedir para parar, não insista.</p>
      <div class="fila-lista">${l.map(filaCartao).join("")}</div>`
      : `<div class="card"><div class="empty"><h2>Nenhuma mensagem para enviar agora</h2><p class="muted" style="margin:0;max-width:440px">Entram aqui os contatos com WhatsApp e mensagem pronta que ainda não foram abordados. As buscas ativas rodam nos horários escolhidos: 06:10, 12:10 e 18:10.</p><a class="btn" href="#/campanhas">Ver as buscas</a></div></div>`}`;
  const redesenhar = () => { if (rotaAtual() === "enviar") vEnviar(el); pintarNav(); };
  $$("[data-fila-abrir]", el).forEach(a => a.addEventListener("click", () => {
    const e = S.empresas.find(x => x.id === a.dataset.filaAbrir);
    copiarTexto(msgDe(e?.campanhas || []));   /* se o WhatsApp abrir sem o texto, é só colar */
    FILA.abertas.add(a.dataset.filaAbrir);
    setTimeout(redesenhar, 400);   /* o link abre primeiro; depois o cartão pergunta se a mensagem saiu */
  }));
  $$("[data-fila-nao]", el).forEach(b => b.onclick = () => { FILA.abertas.delete(b.dataset.filaNao); redesenhar(); });
  $$("[data-fila-sim]", el).forEach(b => b.onclick = async () => {
    const id = b.dataset.filaSim, e = S.empresas.find(x => x.id === id);
    b.disabled = true;
    await mudarStatus(id, "abordado", true);
    if (e && e.status === "abordado") { filaContar(); FILA.abertas.delete(id); toast(`${e.nome}: marcado como Abordado.`); }
    redesenhar();
  });
  $$("[data-fila-ficha]", el).forEach(b => b.onclick = () => abrirFicha(b.dataset.filaFicha));
}
