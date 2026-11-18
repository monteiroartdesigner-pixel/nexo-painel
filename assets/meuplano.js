"use strict";
// ============================================================================
// MEU PLANO · aba do Marketing (pedido do Ricardo, 19/11/2026: "o cliente tenha a opção de
// visualizar os planos, se ele quer fazer a troca ou não").
// Lê public.nexo_meu_plano(empresa) e pede troca com public.nexo_pedir_plano (só dono ou admin).
// O pedido não troca o plano sozinho: o Master confirma. Com a InfinitePay, o pedido vira pagamento.
// Usa rpc, esc, pl, aviso, msgErro, st e $ do painel (index.html e base.js).
// ============================================================================

const MP_STATUS = { teste: "Teste grátis", teste_vencido: "Teste acabou", ativa: "Ativo", vencida: "Vencido",
  suspensa: "Suspenso", cancelada: "Cancelado", vitalicia: "Vitalício" };
const mpReais = c => c == null ? "a combinar" : (c / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const mpData = iso => iso ? new Date(iso).toLocaleDateString("pt-BR", { timeZone: FUSO, day: "2-digit", month: "2-digit", year: "numeric" }) : "";

async function meuPlano(el) {
  if (!st.empresaId) { el.innerHTML = `<div class="vazio">Escolha um agente de uma empresa para ver o plano.</div>`; return; }
  el.innerHTML = `<div class="vazio">Carregando o seu plano…</div>`;
  let d;
  try { d = await rpc("nexo_meu_plano", { p_empresa: st.empresaId }); }
  catch (e) {
    el.innerHTML = /nexo_meu_plano|does not exist|Could not find/i.test(e.message || "")
      ? `<div class="aviso">Os planos aparecem aqui depois da atualização do banco (migração 20261119140000_nexo_meu_plano.sql).</div>`
      : `<div class="aviso">${esc(msgErro(e))}</div>`;
    return;
  }
  const s = d.situacao || {}, planos = d.planos || [], pedido = planos.find(p => p.chave === s.plano_pedido);
  const sub = !s.tem_assinatura ? "Acesso liberado pela NEXO."
    : s.status === "vitalicia" ? "Acesso vitalício: sem mensalidade e sem data de vencimento."
    : s.status === "teste" ? `Teste grátis: ${s.dias_teste_restantes === 0 ? "termina hoje" : `faltam ${pl(s.dias_teste_restantes, "dia", "dias")}`}${s.teste_ate ? ` (até ${mpData(s.teste_ate)})` : ""}.`
    : s.status === "ativa" && s.periodo_ate ? `Pago até ${mpData(s.periodo_ate)}.`
    : s.status === "teste_vencido" ? "Seu teste grátis acabou. Escolha um plano abaixo para continuar."
    : s.status === "vencida" ? "Sua mensalidade venceu. Fale com a NEXO para regularizar."
    : "";
  el.innerHTML = `
    <div class="card mp-atual">
      <div><span class="mp-eb">Seu plano</span>
        <h2>${esc(s.plano_nome || (s.tem_assinatura ? s.plano : "Liberado"))}</h2>
        <p class="muted" style="margin:4px 0 0">${esc(sub)}</p></div>
      <div class="mp-lado">${s.tem_assinatura ? `<span class="pill ${["teste", "ativa", "vitalicia"].includes(s.status) ? "ok" : "warn"}">${esc(MP_STATUS[s.status] || s.status)}</span>` : ""}
        ${s.tem_assinatura && s.status !== "vitalicia" && s.preco_centavos != null ? `<b class="mp-preco">${esc(mpReais(s.preco_centavos))}<span>/mês</span></b>` : ""}</div>
    </div>
    ${pedido ? `<div class="aviso mp-pedido"><div><b>Troca pedida: plano ${esc(pedido.nome)}</b>
        <div class="peq">Pedido em ${esc(mpData(s.pedido_em))}. A NEXO confirma a troca e avisa você.</div></div>
        ${d.pode_pedir ? `<button class="btn" id="mpCancelar">Cancelar pedido</button>` : ""}</div>` : ""}
    <div class="card"><div class="linha entre"><h2 style="margin:0">Planos</h2>${d.pode_pedir ? "" : `<span class="muted peq">Só o dono ou um administrador pode pedir a troca.</span>`}</div>
      <div class="ct-v-grade mp-grade">${planos.map(p => {
        const atual = s.plano === p.chave, pedidoEste = s.plano_pedido === p.chave;
        const [valor, mes] = mpReais(p.preco_centavos).split("/");
        return `<article class="ct-v-plano${atual ? " mp-este" : ""}"><h3>${esc(p.nome)}</h3>
          <p class="ct-v-preco"><b>${esc(valor)}</b>${p.preco_centavos != null ? `<span>/mês</span>` : ""}</p>
          ${p.descricao ? `<p class="ct-v-desc">${esc(p.descricao)}</p>` : ""}
          ${atual ? `<span class="btn mp-selo" aria-disabled="true">Seu plano atual</span>`
            : pedidoEste ? `<span class="btn mp-selo" aria-disabled="true">Troca pedida</span>`
            : d.pode_pedir && s.status !== "vitalicia" ? `<button type="button" class="btn prim pri" data-mp-plano="${esc(p.chave)}">Quero este plano</button>` : ""}
        </article>`; }).join("") || `<div class="vazio">Nenhum plano disponível agora.</div>`}</div>
      <p class="muted peq" style="margin:0">Ao pedir a troca, a NEXO confirma e o plano novo vale na hora. O pagamento por Pix ou cartão chega em breve aqui mesmo.</p>
    </div>`;
  el.querySelectorAll("[data-mp-plano]").forEach(b => b.onclick = async () => {
    const p = planos.find(x => x.chave === b.dataset.mpPlano);
    if (!confirm(`Pedir a troca para o plano ${p.nome} (${mpReais(p.preco_centavos)} por mês)? A NEXO confirma e avisa você.`)) return;
    b.disabled = true;
    try { await rpc("nexo_pedir_plano", { p_empresa: st.empresaId, p_plano: p.chave }); aviso(`Pedido enviado: plano ${p.nome}.`); meuPlano(el); }
    catch (e) { aviso(msgErro(e), true); b.disabled = false; }
  });
  const bc = $("#mpCancelar", el);
  if (bc) bc.onclick = async () => {
    bc.disabled = true;
    try { await rpc("nexo_pedir_plano", { p_empresa: st.empresaId, p_plano: null }); aviso("Pedido de troca cancelado."); meuPlano(el); }
    catch (e) { aviso(msgErro(e), true); bc.disabled = false; }
  };
}
