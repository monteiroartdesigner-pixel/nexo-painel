"use strict";
// ============================================================================
// MEU PLANO · aba do Marketing (pedido do Ricardo, 19/11/2026).
// Lê public.nexo_meu_plano(empresa). Com o pagamento ligado (InfiniteTag da NEXO cadastrada):
//   "Assinar e pagar" / "Pagar mensalidade" -> função nexo-pagamento cria o link da InfinitePay (Pix ou cartão)
//   e o cliente vai para o checkout. Na volta (?pagamento=volta&order_nsu&transaction_nsu&slug) o painel pede
//   a conferência; o aviso da InfinitePay também confere. O plano é liberado só depois de conferido na InfinitePay.
// Sem o pagamento ligado: "Quero este plano" vira pedido de troca (public.nexo_pedir_plano) e o Master confirma.
// Só dono ou admin paga ou pede. Usa rpc, esc, pl, aviso, msgErro, st, sb, SUPABASE_URL, SUPABASE_KEY e $.
// ============================================================================

const MP_STATUS = { teste: "Teste grátis", teste_vencido: "Teste acabou", ativa: "Ativo", vencida: "Vencido",
  suspensa: "Suspenso", cancelada: "Cancelado", vitalicia: "Vitalício" };
const mpReais = c => c == null ? "a combinar" : (c / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const mpData = iso => iso ? new Date(iso).toLocaleDateString("pt-BR", { timeZone: FUSO, day: "2-digit", month: "2-digit", year: "numeric" }) : "";
const mpMes = d => d ? new Date(`${d}T12:00:00Z`).toLocaleDateString("pt-BR", { month: "long", year: "numeric", timeZone: "UTC" }) : "";

// Chama a função do servidor com o login de quem está no painel.
async function mpServidor(corpo) {
  const { data } = await sb.auth.getSession();
  const r = await fetch(`${SUPABASE_URL}/functions/v1/nexo-pagamento`, {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: SUPABASE_KEY, Authorization: `Bearer ${data?.session?.access_token || SUPABASE_KEY}` },
    body: JSON.stringify(corpo),
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.mensagem || "Não deu para abrir o pagamento agora. Tente de novo.");
  return d;
}

// Volta do checkout da InfinitePay: confere o pagamento e abre a aba Meu plano. true = era uma volta.
async function mpRetornoPagamento() {
  const q = new URLSearchParams(location.search);
  if (q.get("pagamento") !== "volta") return false;
  history.replaceState(null, "", location.pathname);
  const pedido = q.get("order_nsu") || "", transacao = q.get("transaction_nsu") || "", slug = q.get("slug") || q.get("invoice_slug") || "";
  if (!pedido || !transacao || !slug) { setTimeout(() => aviso("Pagamento não concluído. Você pode tentar de novo em Meu plano."), 400); return true; }
  try {
    const r = await mpServidor({ acao: "conferir", order_nsu: pedido, transaction_nsu: transacao, slug });
    const ok = ["pago", "ja_pago"].includes(r.resultado);
    setTimeout(() => aviso(ok ? `Pagamento confirmado${r.pago_ate ? `: plano pago até ${mpData(r.pago_ate)}` : ""}. Obrigado!`
                                : "Recebemos a sua volta. Assim que a InfinitePay confirmar o pagamento, o plano é liberado aqui.", !ok && r.resultado !== "nao_pago"), 400);
    if (ok && st.empresaId) await planoCarregar(st.empresaId);
  } catch (e) { setTimeout(() => aviso(msgErro(e), true), 400); }
  return true;
}

async function meuPlano(el) {
  if (!st.empresaId) { el.innerHTML = `<div class="vazio">Escolha um agente de uma empresa para ver o plano.</div>`; return; }
  el.innerHTML = `<div class="vazio">Carregando o seu plano…</div>`;
  let d, faturas = [];
  try {
    d = await rpc("nexo_meu_plano", { p_empresa: st.empresaId });
    faturas = await rpc("nexo_minhas_faturas", { p_empresa: st.empresaId }).catch(() => []);
  } catch (e) {
    el.innerHTML = /nexo_meu_plano|does not exist|Could not find/i.test(e.message || "")
      ? `<div class="aviso">Os planos aparecem aqui depois da atualização do banco (migração 20261119140000_nexo_meu_plano.sql).</div>`
      : `<div class="aviso">${esc(msgErro(e))}</div>`;
    return;
  }
  const s = d.situacao || {}, planos = d.planos || [], pedido = planos.find(p => p.chave === s.plano_pedido);
  const pagar = !!d.pagamento_ligado && d.pode_pedir && s.status !== "vitalicia";
  // Mensalidade do plano atual: aparece no teste, quando venceu ou faltando 7 dias para vencer.
  const faltaPouco = s.status === "ativa" && s.periodo_ate && new Date(s.periodo_ate) - Date.now() < 7 * 86400000;
  const pagarAtual = pagar && (s.status !== "ativa" || faltaPouco);
  const sub = !s.tem_assinatura ? "Acesso liberado pela NEXO."
    : s.status === "vitalicia" ? "Acesso vitalício: sem mensalidade e sem data de vencimento."
    : s.status === "teste" ? `Teste grátis: ${s.dias_teste_restantes === 0 ? "termina hoje" : `faltam ${pl(s.dias_teste_restantes, "dia", "dias")}`}${s.teste_ate ? ` (até ${mpData(s.teste_ate)})` : ""}.`
    : s.status === "ativa" && s.periodo_ate ? `Pago até ${mpData(s.periodo_ate)}.`
    : s.status === "teste_vencido" ? "Seu teste grátis acabou. Escolha um plano abaixo para continuar."
    : s.status === "vencida" ? "Sua mensalidade venceu. Pague abaixo para continuar usando."
    : "";
  const botao = p => {
    const atual = s.plano === p.chave;
    if (pagar) return atual
      ? (pagarAtual ? `<button type="button" class="btn prim pri" data-mp-pagar="${esc(p.chave)}">Pagar mensalidade</button>` : `<span class="btn mp-selo" aria-disabled="true">Seu plano atual</span>`)
      : `<button type="button" class="btn prim pri" data-mp-pagar="${esc(p.chave)}">Assinar e pagar</button>`;
    if (atual) return `<span class="btn mp-selo" aria-disabled="true">Seu plano atual</span>`;
    if (s.plano_pedido === p.chave) return `<span class="btn mp-selo" aria-disabled="true">Troca pedida</span>`;
    return d.pode_pedir && s.status !== "vitalicia" ? `<button type="button" class="btn prim pri" data-mp-plano="${esc(p.chave)}">Quero este plano</button>` : "";
  };
  el.innerHTML = `
    <div class="card mp-atual">
      <div><span class="mp-eb">Seu plano</span>
        <h2>${esc(s.plano_nome || (s.tem_assinatura ? s.plano : "Liberado"))}</h2>
        <p class="muted" style="margin:4px 0 0">${esc(sub)}</p></div>
      <div class="mp-lado">${s.tem_assinatura ? `<span class="pill ${["teste", "ativa", "vitalicia"].includes(s.status) ? "ok" : "warn"}">${esc(MP_STATUS[s.status] || s.status)}</span>` : ""}
        ${s.tem_assinatura && s.status !== "vitalicia" && s.preco_centavos != null ? `<b class="mp-preco">${esc(mpReais(s.preco_centavos))}<span>/mês</span></b>` : ""}</div>
    </div>
    ${pedido && !pagar ? `<div class="aviso mp-pedido"><div><b>Troca pedida: plano ${esc(pedido.nome)}</b>
        <div class="peq">Pedido em ${esc(mpData(s.pedido_em))}. A NEXO confirma a troca e avisa você.</div></div>
        ${d.pode_pedir ? `<button class="btn" id="mpCancelar">Cancelar pedido</button>` : ""}</div>` : ""}
    <div class="card"><div class="linha entre"><h2 style="margin:0">Planos</h2>${d.pode_pedir ? "" : `<span class="muted peq">Só o dono ou um administrador pode ${d.pagamento_ligado ? "pagar" : "pedir a troca"}.</span>`}</div>
      <div class="ct-v-grade mp-grade">${planos.map(p => {
        const [valor] = mpReais(p.preco_centavos).split("/");
        return `<article class="ct-v-plano${s.plano === p.chave ? " mp-este" : ""}"><h3>${esc(p.nome)}</h3>
          <p class="ct-v-preco"><b>${esc(valor)}</b>${p.preco_centavos != null ? `<span>/mês</span>` : ""}</p>
          ${p.descricao ? `<p class="ct-v-desc">${esc(p.descricao)}</p>` : ""}
          ${botao(p)}
        </article>`; }).join("") || `<div class="vazio">Nenhum plano disponível agora.</div>`}</div>
      <p class="muted peq" style="margin:0">${d.pagamento_ligado
        ? "Pagamento por <b>Pix ou cartão</b> na InfinitePay, em página segura. Assim que o pagamento é confirmado, o plano é liberado aqui, sozinho, por 1 mês."
        : "Ao pedir a troca, a NEXO confirma e o plano novo vale na hora."}</p>
    </div>
    ${faturas.length ? `<div class="card"><h2 style="margin:0">Pagamentos</h2><div class="mp-faturas">${faturas.map(f => `<div class="mp-fat">
        <span><b>${esc(mpMes(f.competencia))}</b> <span class="muted peq">· ${esc(f.plano_nome || "")}</span></span>
        <span class="peq">${esc(mpReais(f.valor_centavos))}</span>
        <span class="pill ${f.status === "paga" ? "ok" : "warn"}">${f.status === "paga" ? `Pago ${f.meio === "pix" ? "no Pix" : "no cartão"} em ${esc(mpData(f.pago_em))}` : "Aguardando pagamento"}</span></div>`).join("")}</div></div>` : ""}`;

  el.querySelectorAll("[data-mp-pagar]").forEach(b => b.onclick = async () => {
    const p = planos.find(x => x.chave === b.dataset.mpPagar);
    b.disabled = true; const txt = b.textContent; b.textContent = "Abrindo o pagamento…";
    try { const r = await mpServidor({ acao: "pagar", empresa: st.empresaId, plano: p.chave }); location.href = r.link; }
    catch (e) { aviso(msgErro(e), true); b.disabled = false; b.textContent = txt; }
  });
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
