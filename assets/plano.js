"use strict";
// ============================================================================
// PLANO DA EMPRESA · o que o cliente vê depende do plano (NEXO SaaS, 18/11/2026).
// Lê public.nexo_situacao(empresa). Recurso fora do plano: a função NÃO aparece; no lugar fica
// o convite para ativar ("Disponível no plano X"). Teste acabado, vencida ou suspensa: faixa no topo.
// Sem assinatura (ou banco sem a Etapa 3) = tudo liberado, como era antes.
// Isto é a tela. A trava no banco (nexo.exigir_recurso nas funções pagas) vem numa etapa própria.
// Comum ao System e ao Prospect. Usa sb e esc de assets/base.js.
// ============================================================================

// 25/11/2026: os planos do Prospect não têm mais Marketing. Pesquisa com IA vem no Inicial; WhatsApp e SDR, no Profissional.
const PLANO_DE = { prospect: "Inicial", prospect_ia: "Inicial", prospect_sdr_whatsapp: "Profissional",
  marketing_instagram: "Profissional", marketing_google: "Profissional", suporte_ia: "Completo", automacoes: "Completo" };
const RECURSO_NOME = { prospect: "Vendas", prospect_ia: "Pesquisa automática com IA", prospect_sdr_whatsapp: "WhatsApp e SDR",
  marketing_instagram: "Marketing no Instagram", marketing_google: "Marketing no Google", suporte_ia: "Suporte com IA", automacoes: "Automações" };
const PL = { sits: {} };   // situação por empresa

async function planoCarregar(empresaId) {
  if (!empresaId || !sb) return null;
  try { const { data, error } = await sb.rpc("nexo_situacao", { p_empresa: empresaId }); PL.sits[empresaId] = error ? null : data; }
  catch { PL.sits[empresaId] = null; }
  return PL.sits[empresaId];
}

// true = pode mostrar. Sem situação conhecida, sem assinatura ou Master: libera.
function planoTem(recurso, empresaId) {
  const s = PL.sits[empresaId];
  if (!s || !s.tem_assinatura) return true;
  if (!["total", "aviso"].includes(s.acesso)) return false;
  return (s.recursos || []).includes(recurso);
}

const PL_CONTATO = "https://www.instagram.com/nexo.rm/";
// Onde ativar: a aba Meu plano do próprio produto (no Marketing, #plano; no Prospect, #/plano).
const PL_ATIVAR = () => typeof abrirAba === "function" ? "#plano" : "#/plano";
document.addEventListener("click", ev => {
  const a = ev.target.closest('a[href$="#plano"]');
  if (a && typeof abrirAba === "function") { ev.preventDefault(); abrirAba("plano"); }
});
function planoBloqueio(recurso, empresaId) {
  const s = PL.sits[empresaId] || {}, inativo = s.tem_assinatura && !["total", "aviso"].includes(s.acesso);
  const titulo = inativo ? (s.status === "teste_vencido" ? "Seu teste grátis acabou" : s.acesso === "bloqueado" ? "Assinatura cancelada" : "Assinatura inativa")
                         : `${RECURSO_NOME[recurso] || "Este recurso"} no plano ${PLANO_DE[recurso] || "superior"}`;
  const texto = inativo ? "Seus dados continuam guardados. Ative um plano para voltar a usar esta área."
                        : `Seu plano atual (${s.plano_nome || "—"}) não inclui esta função. Ative o plano ${PLANO_DE[recurso] || "superior"} e ela aparece aqui na hora.`;
  return `<div class="plano-trava"><div class="pt-icone" aria-hidden="true"><svg viewBox="0 0 24 24"><rect x="4" y="10" width="16" height="11" rx="2.5"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/></svg></div>
    <div class="pt-txt"><span class="pt-selo">${inativo ? "Plano" : `Disponível no plano ${esc(PLANO_DE[recurso] || "superior")}`}</span>
      <h2>${esc(titulo)}</h2><p>${esc(texto)}</p>
      <a class="btn prim pri" href="${PL_ATIVAR()}">Ver os planos e ativar</a></div></div>`;
}

// Dias de calendário (horário de Brasília) de hoje até a data: 0 = hoje, 1 = amanhã, negativo = já passou.
function planoDiasAte(iso) {
  if (!iso) return null;
  const dia = d => new Date(d.toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" }) + "T00:00:00Z");
  return Math.round((dia(new Date(iso)) - dia(new Date())) / 86400000);
}
const plDataCurta = iso => new Date(iso).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit" });

// Faixa no topo quando o plano pede atenção.
// Mensalidade (pedido do Ricardo, 19/11/2026): faixa VERMELHA com 2 dias, 1 dia e no dia do vencimento,
// e também depois de vencida. Teste grátis acabando: o mesmo aviso, no fim do teste.
function planoFaixa(empresaId, alvo) {
  document.querySelector(".plano-faixa")?.remove();
  const s = PL.sits[empresaId]; if (!s || !s.tem_assinatura || !alvo) return;
  let msg = "", tom = "warn", botao = "Ver os planos";
  const quando = d => d === 0 ? "vence hoje" : d === 1 ? "vence amanhã" : `vence em ${d} dias`;
  const dPago = s.status === "ativa" ? planoDiasAte(s.periodo_ate) : null;
  const dTeste = s.status === "teste" ? (s.dias_teste_restantes ?? planoDiasAte(s.teste_ate)) : null;
  if (dPago != null && dPago >= 0 && dPago <= 2) {
    msg = `Sua mensalidade do plano ${s.plano_nome} ${quando(dPago)} (${plDataCurta(s.periodo_ate)}). Pague para não perder o acesso.`;
    tom = "urgente"; botao = "Pagar agora";
  } else if (dTeste != null && dTeste >= 0 && dTeste <= 2) {
    msg = `Seu teste grátis do plano ${s.plano_nome} ${dTeste === 0 ? "termina hoje" : dTeste === 1 ? "termina amanhã" : `termina em ${dTeste} dias`}. Assine para continuar usando.`;
    tom = "urgente"; botao = "Assinar agora";
  } else if (s.status === "teste" && dTeste != null && dTeste <= 3)
    msg = `Teste grátis do plano ${s.plano_nome}: faltam ${pl(dTeste, "dia", "dias")}.`;
  else if (s.acesso === "aviso") {
    msg = `Sua mensalidade venceu${s.periodo_ate ? ` em ${plDataCurta(s.periodo_ate)}` : ""}. Pague agora para não perder o acesso.`;
    tom = "urgente"; botao = "Pagar agora";
  }
  else if (s.status === "teste_vencido") { msg = "Seu teste grátis acabou. Ative um plano para continuar usando."; tom = "urgente"; botao = "Assinar agora"; }
  else if (["leitura", "bloqueado"].includes(s.acesso)) { msg = "Sua assinatura está inativa. Ative um plano para voltar a usar."; tom = "urgente"; botao = "Ver os planos"; }
  if (!msg) return;
  alvo.insertAdjacentHTML("afterbegin", `<div class="plano-faixa ${tom}" role="alert"><span>${esc(msg)}</span><a href="${PL_ATIVAR()}">${esc(botao)}</a></div>`);
}
