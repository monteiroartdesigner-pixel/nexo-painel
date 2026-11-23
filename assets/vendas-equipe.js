"use strict";
// ============================================================================
// VENDAS · "Quem trabalha nesta aba": as onças da equipe em cada tela do Vendas (pedido do Ricardo, 23/11/2026).
// Só mostra o que é verdade: cada fala sai dos dados que a própria tela já carregou (S.empresas, S.tarefas, S.oper,
// S.rodadas, st.leads). Sem dado, a onça diz o que faz, sem número inventado.
// Usa S, st, rotaAtual, esc, pl, quando e FUSO do Vendas (prospect/index.html).
// ============================================================================

const VQ_ONCA = {
  faro: { nome: "Faro", cargo: "Pesquisa e prospecção", img: "assets/equipe/faro-rosto.webp" },
  lupa: { nome: "Lupa", cargo: "Análise", img: "assets/equipe/lupa-rosto.webp" }
};
const vqHora = d => new Date(d).toLocaleTimeString("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit" });
const vqNum = (n, um, varios) => `${n} ${n === 1 ? um : varios}`;

// Última rodada que chegou e a próxima prevista (06:10, 12:10, 18:10, de segunda a sábado).
function vqRodada() {
  const rs = (typeof S !== "undefined" && S.rodadas && S.rodadas.rodadas) || [];
  const chegou = rs.find(r => r.estado === "gravada");
  if (chegou) return `A última rodada chegou às ${vqHora(chegou.gravado_em)}, com ${vqNum(chegou.empresas_novas || 0, "empresa nova", "empresas novas")}.`;
  const prox = typeof proximaRodadaProspect === "function" ? proximaRodadaProspect() : null;
  return prox ? `Próxima rodada às ${vqHora(prox.quando)}.` : "Pesquisa às 06:10, 12:10 e 18:10.";
}

// O que cada onça diz em cada aba. Devolve [{ id, fala }].
function vqConteudo(rota) {
  const emp = (typeof S !== "undefined" && S.empresas) || [], tar = (typeof S !== "undefined" && S.tarefas) || [];
  const dia = typeof hoje === "function" ? hoje() : new Date().toISOString().slice(0, 10);
  const comContato = emp.filter(e => e.whatsapp || e.email || e.instagram).length;
  const comNota = emp.filter(e => e.pontuacao != null).length, boas = emp.filter(e => (e.pontuacao || 0) >= 70).length;
  const pend = tar.filter(t => !t.feita), atras = pend.filter(t => t.vence_em < dia).length, deHoje = pend.filter(t => t.vence_em === dia).length;
  const o = (typeof S !== "undefined" && S.oper) || null, h = (o && o.hoje) || {};
  const leadsIg = (typeof st !== "undefined" && st.leads) || [];
  switch (rota) {
    case "inicio": return [
      { id: "faro", fala: vqRodada() },
      { id: "lupa", fala: emp.length ? `Dei nota para ${vqNum(comNota, "empresa", "empresas")}; ${vqNum(boas, "tem", "têm")} nota 70 ou mais.` : "Quando chegarem empresas, eu dou a nota e a análise de cada uma." }];
    case "crm": return [
      { id: "faro", fala: emp.length ? `Achei ${vqNum(emp.length, "empresa", "empresas")}; ${vqNum(comContato, "tem", "têm")} contato público para você falar.` : "Ainda não achei empresas. Ative uma busca e eu pesquiso na próxima rodada." },
      { id: "lupa", fala: emp.length ? `Dou a nota e a análise de cada uma: ${vqNum(boas, "está", "estão")} com nota 70 ou mais.` : "Dou a nota e a análise de cada empresa que a Faro acha." }];
    case "tarefas": return [
      { id: "faro", fala: pend.length ? `Organizo os retornos: ${vqNum(deHoje, "tarefa", "tarefas")} para hoje${atras ? ` e ${vqNum(atras, "atrasada", "atrasadas")}` : ""}.` : "Organizo os retornos dos clientes. Nenhuma tarefa pendente agora." }];
    case "campanhas": return [
      { id: "faro", fala: `${vqRodada()} ${o ? `Hoje: ${vqNum(h.rodadas || 0, "pesquisa", "pesquisas")} e ${vqNum(h.novas || 0, "empresa nova", "empresas novas")}.` : ""}`.trim() }];
    case "leads": return [
      { id: "faro", fala: leadsIg.length ? `Achei ${vqNum(leadsIg.length, "lead", "leads")} no Instagram. Você confirma, aborda e acompanha.` : "Procuro leads no Instagram e organizo o contato de cada um." }];
    default: return [];
  }
}

function vqMontar(rota) {
  const itens = vqConteudo(rota);
  if (!itens.length) return "";
  return `<aside class="vq" aria-label="Quem trabalha nesta aba"><span class="vq-tit">Quem trabalha aqui</span>
    ${itens.map(i => { const p = VQ_ONCA[i.id]; return `<div class="vq-onca"><img src="${p.img}" alt="" width="40" height="40" loading="lazy">
      <div><b>${esc(p.nome)}</b> <span class="muted peq">${esc(p.cargo)}</span><div class="peq">${esc(i.fala)}</div></div></div>`; }).join("")}</aside>`;
}

// Põe a faixa depois do título da aba. As telas se redesenham sozinhas (filtros, Kanban/Tabela): um observador recoloca.
let vqObs = null;
function vqColocar(el) {
  if (!el) return;
  const rota = typeof rotaAtual === "function" ? rotaAtual() : "";
  const velha = el.querySelector(":scope > .vq");
  const html = vqMontar(rota);
  if (!html) { velha?.remove(); return; }
  if (velha && velha.dataset.rota === rota && velha.dataset.pronto === "1") return;
  velha?.remove();
  const caixa = document.createElement("div"); caixa.innerHTML = html;
  const aside = caixa.firstElementChild; aside.dataset.rota = rota; aside.dataset.pronto = "1";
  const cab = el.querySelector(":scope > .page-h");
  cab ? cab.insertAdjacentElement("afterend", aside) : el.prepend(aside);
}
function vendasEquipe(el) {
  vqColocar(el);
  if (vqObs) vqObs.disconnect();
  vqObs = new MutationObserver(() => { vqObs.disconnect(); vqColocar(el); vqObs.observe(el, { childList: true }); });
  vqObs.observe(el, { childList: true });
}
