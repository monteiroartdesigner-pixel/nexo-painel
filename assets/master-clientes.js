"use strict";
// ============================================================================
// MASTER DE CLIENTES, dentro do Prospect (pedido do Ricardo, 25/11/2026).
// Lista e ficha: logins, plano, vencimento, situação, bloquear, liberar e pagamento por fora.
// Embaixo da lista: envio automático da IA no WhatsApp, liberado empresa por empresa.
// Só para quem está em nexo.plataforma_admins. O banco confere de novo em cada função
// public.nexo_master_* (nexo.exigir_plataforma): a tela sozinha não libera nada.
// Usa rpc, sb, esc, toast, msgErro, abrirModal, fecharModal, fecharGaveta, confirmar, ic, $ e $$ (index.html e base.js),
// planoDiasAte (plano.js), ctTextoConvite e ctVolta (conta.js). Planos e número do suporte continuam no Marketing.
// ============================================================================

const MC = { dados: null, ind: null, planos: [], envios: null, filtro: "todos", busca: "", aberto: null, host: null };

const mcData = iso => iso ? new Date(iso).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", year: "numeric" }) : "";
const mcDataHora = iso => iso ? new Date(iso).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit" }) : "nunca entrou";
const mcReais = c => c == null ? "a combinar" : (c / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const mcDiaCampo = d => d.toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
const mcFimDoDia = v => v ? new Date(`${v}T23:59:00-03:00`).toISOString() : null;
const mcDias = n => n === 1 ? "1 dia" : `${n} dias`;
const mcPapel = { dono: "Dono", admin: "Administrador", editor: "Editor", leitor: "Leitor", vendedora: "Vendedora (só prospecção)" };
// WhatsApp do cadastro: com DDD ganha o 55; número incompleto fica sem link (devolve "").
const mcZap = v => { const d = String(v || "").replace(/\D/g, ""); const n = d.length === 10 || d.length === 11 ? "55" + d : d; return /^55\d{10,11}$/.test(n) ? n : ""; };
const mcFone = n => `(${n.slice(2, 4)}) ${n.slice(4, -4)}-${n.slice(-4)}`;
const mcZapLink = n => `<a class="mc-zap" data-mc-zap target="_blank" rel="noopener" href="https://wa.me/${n}" title="Abrir conversa no WhatsApp">${ic("wa")}${mcFone(n)}</a>`;

// Os erros do Master vêm escritos em português depois de "pedido_invalido:".
function mcErro(e) {
  const m = String(e?.message || e);
  const i = m.indexOf("pedido_invalido:");
  if (i >= 0) { const t = m.slice(i + 16).trim(); return t.charAt(0).toUpperCase() + t.slice(1) + "."; }
  if (/data_vencida/.test(m)) return "A data de antes já passou. Informe até quando liberar.";
  return msgErro(e);
}

// A situação de um cliente, em palavras. chave é a do filtro.
function mcSituacao(c) {
  const s = c.situacao || {};
  const r = (chave, texto, cor, vence = "—", detalhe = "") => ({ chave, texto, cor, vence, detalhe });
  if (c.status === "excluida") return r("excluido", "Excluído", "bad", "—", c.excluida_em ? `excluído em ${mcData(c.excluida_em)}` : "");
  if (!s.tem_assinatura) return r("sem_plano", "Sem plano", "warn", "—", "sem plano, entra sem limite");
  const fim = s.status_gravado === "teste" ? s.teste_ate : s.periodo_ate;
  if (s.status_gravado === "suspensa" || s.status === "cancelada")
    return r("bloqueado", "Bloqueado", "bad", s.era_vitalicio ? "não vence" : mcData(s.periodo_ate || s.teste_ate) || "—",
             s.bloqueado_em ? `bloqueado em ${mcData(s.bloqueado_em)}${s.era_vitalicio ? " (é vitalício)" : ""}` : "sem acesso");
  if (s.status === "vitalicia") return r("vitalicio", "Vitalício", "info", "não vence");
  if (s.status === "vencida" || s.status === "teste_vencido") {
    const venceu = s.status === "teste_vencido" ? s.teste_ate : s.periodo_ate;
    const atraso = venceu ? Math.max(0, -planoDiasAte(venceu)) : null;
    const texto = atraso == null ? "Atrasado" : atraso === 0 ? "Venceu hoje" : `Atrasado há ${mcDias(atraso)}`;
    const trava = venceu ? new Date(new Date(venceu).getTime() + (s.carencia_dias || 0) * 86400000).toISOString() : null;
    const detalhe = s.acesso === "aviso" ? `na carência até ${mcData(trava)}`
      : s.status === "teste_vencido" ? "teste acabou: travado" : "travado";
    return r("atrasado", texto, "bad", mcData(venceu) || "—", detalhe);
  }
  const dias = fim ? planoDiasAte(fim) : null;
  if (dias != null && dias <= 7)
    return r("vence", dias <= 0 ? "Vence hoje" : dias === 1 ? "Vence amanhã" : `Vence em ${mcDias(dias)}`, "warn", mcData(fim), s.status === "teste" ? "teste grátis" : "");
  if (s.status === "teste") return r("teste", "Em teste", "pri", mcData(fim) || "—");
  return r("em_dia", "Em dia", "ok", mcData(fim) || "sem data");
}

const mcPreco = c => {
  const s = c.situacao || {};
  if (!s.tem_assinatura) return "";
  if (s.status === "vitalicia" || s.era_vitalicio) return "sem cobrança";
  if (s.status_gravado === "teste") return "teste grátis";
  return s.preco_centavos != null && s.preco_centavos > 0 ? `${mcReais(s.preco_centavos)}/mês` : "sem preço";
};
const mcLogin = c => {
  const l = (c.logins || [])[0], conv = c.convites || [];
  if (l) { const mais = c.logins.length - 1; return { email: l.email, extra: mais > 0 ? `+${mais} ${mais === 1 ? "login" : "logins"}` : "", ultimo: mcDataHora(c.logins.map(x => x.ultimo_login).filter(Boolean).sort().pop()) }; }
  if (conv[0]) return { email: conv[0].email, extra: "convite: ainda não criou a conta", ultimo: "nunca entrou" };
  return { email: "sem login", extra: "", ultimo: "—" };
};

const MC_FILTROS = [["todos", "Todos", false], ["em_dia", "Em dia", false], ["vence", "Vence em breve", false], ["atrasado", "Atrasados", false],
  ["bloqueado", "Bloqueados", false], ["vitalicio", "Vitalícios", false], ["teste", "Em teste", true], ["sem_plano", "Sem plano", true], ["excluido", "Excluídos", true]];
// "Excluídos" só aparece no próprio filtro. O terceiro campo = o filtro só aparece quando tem alguém.
const mcNoFiltro = (k, sit) => k === "excluido" ? sit.chave === "excluido" : sit.chave !== "excluido" && (k === "todos" || sit.chave === k);
const mcSimples = t => String(t || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
function mcFiltrados() {
  const q = mcSimples(MC.busca.trim());
  return MC.dados.filter(c => mcNoFiltro(MC.filtro, mcSituacao(c)) &&
    (!q || mcSimples([c.nome, ...(c.logins || []).map(l => l.email), ...(c.convites || []).map(x => x.email)].join(" ")).includes(q)));
}

async function mcCarregar() {
  const [dados, ind, planos, envios] = await Promise.all([rpc("nexo_master_clientes"),
    rpc("nexo_master_indicadores").catch(() => null), rpc("nexo_master_planos").catch(() => []),
    // Sem a atualização do banco a seção não aparece; outro erro é mostrado, para não parecer que ninguém está liberado.
    rpc("nexo_master_sdr_envios").catch(e => /does not exist|Could not find/i.test(e.message || "") ? null : { erro: mcErro(e) })]);
  MC.dados = dados || []; MC.ind = ind; MC.planos = planos || []; MC.envios = envios;
}
// Depois de uma ação: busca de novo, redesenha a lista e a ficha aberta.
async function mcAtualizar() {
  await mcCarregar();
  if (MC.host?.isConnected) mcDesenhar();
  if (MC.aberto && $("#drawer").classList.contains("on")) mcFicha(MC.aberto);
}

async function vMaster(el) {
  MC.host = el;
  if (!S.master) { el.innerHTML = `<div class="card"><div class="empty"><h2>Só para o administrador da NEXO</h2></div></div>`; return; }
  el.innerHTML = `<div class="sk" style="height:34px;width:200px"></div><div class="sk" style="height:300px"></div>`;
  try { await mcCarregar(); }
  catch (e) {
    el.innerHTML = /nexo_master_clientes|does not exist|Could not find/i.test(e.message || "")
      ? `<div class="alert warn">${ic("alert")}<div>Falta a atualização do banco (migração 20261127700000_nexo_master_clientes.sql).</div></div>`
      : `<div class="alert warn">${ic("alert")}<div>${esc(mcErro(e))}</div></div>`;
    return;
  }
  if (rotaAtual() === "master") mcDesenhar();
}

function mcDesenhar() {
  const el = MC.host, sits = MC.dados.map(mcSituacao), n = k => sits.filter(s => mcNoFiltro(k, s)).length;
  const kpi = (rot, val, sub) => `<div class="card kpi"><span class="lbl">${rot}</span><span class="kpi-n">${esc(val)}</span><span class="sub">${sub}</span></div>`;
  el.innerHTML = `
    <div class="page-h"><div><h1>Master</h1><p>Seus clientes: logins, planos, vencimentos e acesso.</p></div>
      <div class="row"><a class="btn" href="marketing.html#master" title="Preços dos planos e WhatsApp do suporte">Planos e suporte</a><button class="btn" id="mcRecarregar">Atualizar</button><button class="btn pri" id="mcNovo">Novo cliente</button></div></div>
    <div class="grid g-kpi mc-kpi">
      ${kpi("Clientes", n("todos"), "sem contar os excluídos")}${kpi("Vencem em 7 dias", n("vence"), "mensalidade ou teste")}
      ${kpi("Atrasados", n("atrasado"), "vale cobrar")}${kpi("Bloqueados", n("bloqueado"), "sem acesso")}
      ${kpi("Receita mensal", mcReais(MC.ind?.receita_mensal_centavos ?? 0), "assinaturas ativas")}</div>
    <div class="card mc-card">
      <div class="row between mc-topo"><div class="chips" role="group" aria-label="Filtrar clientes">${MC_FILTROS.filter(([k, , some]) => !some || n(k) || MC.filtro === k)
        .map(([k, nome]) => `<button type="button" class="chip" data-mc-filtro="${k}" aria-pressed="${MC.filtro === k}">${nome} <b>${n(k)}</b></button>`).join("")}</div>
        <input class="input mc-busca" id="mcBusca" type="search" placeholder="Buscar por nome ou e-mail" aria-label="Buscar por nome ou e-mail" value="${esc(MC.busca)}"></div>
      <div id="mcLista"></div></div>
    <div id="mcEnvios"></div>`;
  $("#mcRecarregar").onclick = ev => { ev.target.disabled = true; mcAtualizar().then(() => toast("Lista atualizada.")).catch(e => { ev.target.disabled = false; toast(mcErro(e), true); }); };
  $("#mcNovo").onclick = mcNovoCliente;
  $("#mcBusca").oninput = ev => { MC.busca = ev.target.value; mcLista(); };
  $$("[data-mc-filtro]", el).forEach(b => b.onclick = () => { MC.filtro = b.dataset.mcFiltro; mcDesenhar(); });
  mcLista();
  mcEnvios();
}

// ---------------------------------------------------------------- envio automático da IA (WhatsApp e SDR)
// Duas travas no sistema: a chave geral da função e esta, por empresa. Sem a liberação, no modo Autônomo a IA só sugere.
function mcEnvios() {
  const el = $("#mcEnvios"), lista = MC.envios;
  if (lista?.erro) { el.innerHTML = `<div class="alert warn">${ic("alert")}<div>Não consegui ver o envio da IA: ${esc(lista.erro)}</div></div>`; return; }
  if (!lista?.length) { el.innerHTML = ""; return; }
  el.innerHTML = `<section class="card mc-card" aria-labelledby="mcEnviosH"><div><h2 id="mcEnviosH">Envio automático da IA no WhatsApp</h2>
      <p class="muted peq">Só envia mensagem sozinha a empresa que você liberar aqui. Trocar o número desfaz a liberação.</p></div>
    ${lista.map(e => {
      const modo = !e.ativo ? "Desligado" : e.modo === "autonomo" ? "Autônomo" : "Sombra";
      const numero = !e.numero ? "Falta o número" : e.provedor === "ycloud" ? `Número ${e.numero}` : `ID do número ${e.numero}`;
      const selo = e.excluida ? `<span class="badge bad">Excluído</span>` : e.envio_liberado ? `<span class="badge ok">Liberado</span>` : `<span class="badge warn">Não liberado</span>`;
      const botao = e.envio_liberado ? `<button type="button" class="btn sm danger" data-mc-envio="${esc(e.empresa_id)}">Bloquear envio</button>`
        : e.numero && !e.excluida ? `<button type="button" class="btn sm pri" data-mc-envio="${esc(e.empresa_id)}">Liberar envio</button>` : "";
      return `<div class="mc-envio" data-mc-envio-linha="${esc(e.empresa_id)}">
        <div class="grow"><b>${esc(e.nome)}</b><div class="muted peq">${esc(`${modo} · ${numero}`)}</div></div>
        <div class="row">${selo}${botao}</div></div>`; }).join("")}</section>`;
  $$("[data-mc-envio]", el).forEach(b => b.onclick = () => mcEnvio(lista.find(e => e.empresa_id === b.dataset.mcEnvio)));
}

function mcEnvio(e) {
  const liberar = !e.envio_liberado;
  confirmar(liberar ? `Liberar o envio de ${e.nome}?` : `Bloquear o envio de ${e.nome}?`, liberar
      ? `Confira o ${e.provedor === "ycloud" ? "número" : "ID do número"}: <b>${esc(e.numero)}</b>.<br><br>Com o SDR ligado no modo <b>Autônomo</b>, a IA passa a enviar <b>mensagens de verdade</b> para quem escrever.`
      : "A IA deixa de enviar mensagens por esta empresa. No modo Autônomo, as respostas ficam só como sugestão. As conversas e a configuração ficam como estão.",
    async () => {
      // se o banco recusar (por exemplo, o número mudou), a lista já volta atualizada por trás do aviso
      try { await mcRpc("nexo_master_sdr_envio", { p_empresa: e.empresa_id, p_liberado: liberar, p_numero: e.numero }); }
      catch (x) { await mcAtualizar().catch(() => {}); throw x; }
      toast(liberar ? `Envio liberado para ${e.nome}.` : `Envio bloqueado para ${e.nome}.`); await mcAtualizar();
    }, liberar ? "Liberar envio" : "Bloquear envio", !liberar);
}

function mcLista() {
  const lista = mcFiltrados(), el = $("#mcLista");
  if (!lista.length) { el.innerHTML = `<div class="empty"><h2>${MC.busca ? "Ninguém com essa busca" : "Nenhum cliente neste filtro"}</h2></div>`; return; }
  el.innerHTML = `<div class="table-wrap"><table class="mc-tabela"><thead><tr><th>Cliente</th><th>E-mail do login</th><th>Plano</th><th>Vence em</th><th>Situação</th><th>Último login</th><th><span class="sr">Ações</span></th></tr></thead><tbody>${lista.map(c => {
    const sit = mcSituacao(c), login = mcLogin(c), s = c.situacao || {};
    const acao = sit.chave === "excluido" ? `<button type="button" class="btn sm" data-mc-restaurar="${esc(c.id)}">Restaurar</button>`
      : sit.chave === "sem_plano" ? ""
      : sit.chave === "bloqueado" ? `<button type="button" class="btn sm pri mc-acao" data-mc-liberar="${esc(c.id)}">Liberar</button>`
      : `<button type="button" class="btn sm danger mc-acao" data-mc-bloquear="${esc(c.id)}">Bloquear</button>`;
    return `<tr data-mc-abrir="${esc(c.id)}">
      <td class="mc-nome"><b>${esc(c.nome)}</b><div class="peq">${mcZap(c.whatsapp) ? mcZapLink(mcZap(c.whatsapp)) : `<span class="muted">sem WhatsApp</span>`}</div></td>
      <td data-r="E-mail"><span class="mc-email">${esc(login.email)}</span>${login.extra ? `<div class="muted peq">${esc(login.extra)}</div>` : ""}</td>
      <td data-r="Plano">${esc(s.tem_assinatura ? s.plano_nome || s.plano : "—")}<div class="muted peq">${esc(mcPreco(c))}</div></td>
      <td data-r="Vence em" class="tnum">${esc(sit.vence)}</td>
      <td data-r="Situação"><span class="badge ${sit.cor}">${esc(sit.texto)}</span>${sit.detalhe ? `<div class="muted peq">${esc(sit.detalhe)}</div>` : ""}</td>
      <td data-r="Último login" class="muted peq">${esc(login.ultimo)}</td>
      <td class="mc-acoes"><button type="button" class="btn sm" data-mc-ficha="${esc(c.id)}">Abrir ficha</button>${acao}</td></tr>`; }).join("")}</tbody></table></div>`;
  $$("[data-mc-abrir]", el).forEach(tr => tr.onclick = ev => { if (!ev.target.closest("button,a")) mcFicha(tr.dataset.mcAbrir); });
  $$("[data-mc-ficha]", el).forEach(b => b.onclick = () => mcFicha(b.dataset.mcFicha));
  $$("[data-mc-bloquear]", el).forEach(b => b.onclick = () => mcBloquear(mcCliente(b.dataset.mcBloquear)));
  $$("[data-mc-liberar]", el).forEach(b => b.onclick = () => mcLiberar(mcCliente(b.dataset.mcLiberar)));
  $$("[data-mc-restaurar]", el).forEach(b => b.onclick = () => mcRestaurar(mcCliente(b.dataset.mcRestaurar)));
}
const mcCliente = id => MC.dados.find(c => c.id === id);

// ---------------------------------------------------------------- ficha
function mcFicha(id) {
  const c = mcCliente(id), d = $("#drawer");
  if (!c) { fecharGaveta(); return; }
  MC.aberto = id;
  const sit = mcSituacao(c), s = c.situacao || {}, excluido = sit.chave === "excluido", semPlano = !s.tem_assinatura;
  const vitalicio = s.status === "vitalicia" || s.era_vitalicio;
  const campo = (rot, val) => `<div><div class="muted peq">${rot}</div><b>${esc(val)}</b></div>`;
  const botao = (acao, rot, cls = "") => `<button type="button" class="btn sm ${cls}" data-mc="${acao}">${rot}</button>`;
  const zap = mcZap(c.whatsapp);
  const contato = `<section><h3>Contato</h3><div class="mc-login mc-contato">
      <div class="grow">${c.responsavel ? `<div class="muted peq">${esc(c.responsavel)}</div>` : ""}${zap ? `<b class="tnum">${mcFone(zap)}</b>`
        : c.whatsapp ? `<b class="tnum">${esc(c.whatsapp)}</b><div class="muted peq">Número incompleto: confira o DDD.</div>` : `<span class="muted">Sem WhatsApp no cadastro.</span>`}</div>
      <div class="row">${zap ? `<a class="btn sm pri" data-mc-zap target="_blank" rel="noopener" href="https://wa.me/${zap}">${ic("wa")}Abrir WhatsApp</a>${botao("copiarfone", "Copiar número")}` : ""}
        ${excluido ? "" : botao("fone", c.whatsapp ? "Trocar número" : "Adicionar WhatsApp")}</div></div></section>`;
  const emTeste = s.status === "teste", ativaEmDia = s.status === "ativa";
  const acoesPlano = excluido ? "" : [
    !semPlano && !vitalicio ? botao("pagamento", "Registrar pagamento", "pri") : "",
    sit.chave === "atrasado" ? botao("liberar", "Dar mais prazo") : "",
    ativaEmDia || emTeste ? botao("data", "Mudar data") : "",
    botao("plano", semPlano ? "Escolher plano" : "Trocar plano", semPlano ? "pri" : "")].join("");
  const rotVence = vitalicio ? "Vencimento" : sit.chave === "atrasado" ? "Venceu em" : emTeste ? "Teste até" : "Vence em";
  const logins = (c.logins || []).map(l => `<div class="mc-login">
      <div class="grow"><b class="mc-email">${esc(l.email)}</b><div class="muted peq">${esc([l.nome, mcPapel[l.papel] || l.papel].filter(Boolean).join(" · "))} · último login: ${esc(mcDataHora(l.ultimo_login))}</div></div>
      ${excluido ? "" : `<div class="row"><button type="button" class="btn sm" data-mc-senha="${esc(l.email)}">Mandar nova senha</button>
        ${l.papel === "dono" ? `<span class="muted peq" title="O dono não pode ser retirado. Para barrar, bloqueie o cliente.">é o dono</span>` : `<button type="button" class="btn sm danger" data-mc-tirar="${esc(l.user_id)}" data-email="${esc(l.email)}">Tirar acesso</button>`}</div>`}</div>`).join("")
    + (c.convites || []).map(v => { const t = ctTextoConvite(v.email, c.nome); return `<div class="mc-login">
      <div class="grow"><b class="mc-email">${esc(v.email)}</b><div class="muted peq">${esc(mcPapel[v.papel] || v.papel)} · convite: ainda não criou a conta. O sistema não manda e-mail: envie o convite.</div></div>
      <div class="row"><button type="button" class="btn sm" data-mc-copiar="${esc(v.email)}">Copiar convite</button><a class="btn sm" target="_blank" rel="noopener" href="https://wa.me/?text=${encodeURIComponent(t.texto)}">WhatsApp</a>
        <button type="button" class="btn sm danger" data-mc-cancelar="${esc(v.id)}">Cancelar convite</button></div></div>`; }).join("");
  const faturas = (c.faturas || []).map(f => `<tr><td class="tnum">${esc(mcData(f.pago_em || f.criado_em))}</td><td>${esc(mcReais(f.valor_centavos))}${f.meses === 12 ? " · anual" : ""}</td>
      <td><span class="badge ${f.status === "paga" ? "ok" : "warn"}">${f.status === "paga" ? (f.meio === "por_fora" ? "Pago por fora" : f.meio === "pix" ? "Pago no Pix" : "Pago no cartão") : "Em aberto"}</span></td></tr>`).join("");
  const avisos = [
    !excluido && !c.tem_vendas ? "Esta empresa não tem a área de Vendas." : "",
    !excluido && c.status !== "ativa" ? `A busca automática está parada: a empresa está marcada como "${c.status}".` : "",
    s.liberado ? "Liberado: tem todas as funções, sem limites, seja qual for o plano." : "",
    s.plano_pedido ? `Pediu o plano ${MC.planos.find(p => p.chave === s.plano_pedido)?.nome || s.plano_pedido} em ${mcData(s.pedido_em)}.` : ""].filter(Boolean);
  d.setAttribute("aria-label", `Ficha de ${c.nome}`); d.setAttribute("aria-hidden", "false");
  d.innerHTML = `<div class="drawer-h"><div class="grow"><h2>${esc(c.nome)}</h2>
        <div class="muted peq">${esc(`cliente desde ${mcData(c.criado_em)}`)}</div></div>
      <span class="badge ${sit.cor}">${esc(sit.texto)}</span><button type="button" class="btn sm icon" data-mc="fechar" aria-label="Fechar">✕</button></div>
    <div class="drawer-b">
      ${avisos.map(a => `<div class="alert">${ic("alert")}<div>${esc(a)}</div></div>`).join("")}
      ${contato}
      <section><h3>Mensalidade</h3><div class="mc-bloco"><div class="mc-tres">
          ${campo("Plano", semPlano ? "Sem plano" : `${s.plano_nome || s.plano} · ${mcPreco(c)}`)}${campo(rotVence, sit.vence)}${campo("Situação", sit.detalhe || sit.texto)}</div>
        ${acoesPlano ? `<div class="row">${acoesPlano}</div>` : ""}</div></section>
      <section><h3>Logins</h3>${logins || `<p class="muted peq">Nenhum login. Sem login ninguém entra.</p>`}
        ${excluido ? "" : botao("login", "Adicionar login")}</section>
      <section><h3>Pagamentos</h3>${faturas ? `<div class="table-wrap"><table class="mc-pag"><tbody>${faturas}</tbody></table></div>` : `<p class="muted peq">Nenhum pagamento ainda.</p>`}</section>
      <div class="row between mc-pe"><div class="row">
          ${excluido ? botao("restaurar", "Restaurar cliente", "pri") : `${semPlano ? "" : sit.chave === "bloqueado" ? botao("liberar", "Liberar cliente", "pri") : botao("bloquear", "Bloquear cliente", "danger")}${botao("excluir", "Excluir", "ghost")}`}</div>
        ${excluido || !c.tem_vendas ? "" : botao("ver", "Ver o painel deste cliente")}</div>
    </div>`;
  d.classList.add("on"); $("#overlay").classList.add("on");
  const acoes = { fechar: () => { MC.aberto = null; fecharGaveta(); }, bloquear: () => mcBloquear(c), liberar: () => mcLiberar(c), pagamento: () => mcPagamento(c),
    data: () => mcMudarData(c), plano: () => mcTrocarPlano(c), login: () => mcNovoLogin(c), excluir: () => mcExcluir(c), restaurar: () => mcRestaurar(c),
    fone: () => mcTrocarFone(c),
    copiarfone: () => navigator.clipboard.writeText(mcFone(zap)).then(() => toast("Número copiado.")).catch(() => toast("O navegador bloqueou a cópia.", true)),
    ver: () => { try { sessionStorage.setItem("vendas.empresa", c.id); } catch {} location.hash = "#/inicio"; location.reload(); } };
  $$("[data-mc]", d).forEach(b => b.onclick = () => acoes[b.dataset.mc]());
  $$("[data-mc-senha]", d).forEach(b => b.onclick = () => mcNovaSenha(b.dataset.mcSenha));
  $$("[data-mc-tirar]", d).forEach(b => b.onclick = () => confirmar("Tirar acesso", `<b>${esc(b.dataset.email)}</b> deixa de entrar em ${esc(c.nome)}. A conta de login continua existindo.`,
    async () => { await mcRpc("nexo_remover_acesso", { p_empresa: c.id, p_user: b.dataset.mcTirar, p_convite: null }); toast("Acesso retirado."); await mcAtualizar(); }, "Tirar acesso", true));
  $$("[data-mc-cancelar]", d).forEach(b => b.onclick = () => confirmar("Cancelar convite", "A pessoa não vai mais ganhar acesso ao criar a conta.",
    async () => { await mcRpc("nexo_remover_acesso", { p_empresa: c.id, p_user: null, p_convite: b.dataset.mcCancelar }); toast("Convite cancelado."); await mcAtualizar(); }, "Cancelar convite", true));
  $$("[data-mc-copiar]", d).forEach(b => b.onclick = () => mcCopiar(ctTextoConvite(b.dataset.mcCopiar, c.nome).texto));
}

// ---------------------------------------------------------------- ações
// Erro vira texto em português antes de chegar na janela de confirmação.
async function mcRpc(fn, args) {
  try { return await rpc(fn, args); } catch (e) { const x = new Error(mcErro(e)); x.original = String(e.message || e); throw x; }
}
async function mcCopiar(texto) {
  try { await navigator.clipboard.writeText(texto); toast("Convite copiado. Cole no WhatsApp ou no e-mail."); }
  catch { toast("O navegador bloqueou a cópia. Use o botão WhatsApp.", true); }
}
// Janela com formulário. aoSalvar lança erro para a janela continuar aberta com o aviso.
function mcJanela(titulo, corpo, rotulo, aoSalvar, perigo = false) {
  abrirModal(`<form id="mcForm" novalidate><div class="modal-h"><h2>${esc(titulo)}</h2></div><div class="modal-b">${corpo}<p class="mc-erro" role="alert"></p></div>
    <div class="modal-f"><button type="button" class="btn ghost" data-fechar>Cancelar</button><button type="submit" class="btn ${perigo ? "danger" : "pri"}">${esc(rotulo)}</button></div></form>`, m => {
    const f = $("#mcForm", m), b = f.querySelector("[type=submit]");
    f.onsubmit = async ev => {
      ev.preventDefault(); if (b.disabled) return; b.disabled = true; $(".mc-erro", f).textContent = "";
      try { const depois = await aoSalvar(f); fecharModal(); if (typeof depois === "function") depois(); }
      catch (e) { b.disabled = false; $(".mc-erro", f).textContent = e.original ? e.message : mcErro(e); }
    };
  });
}
const mcCampo = (rot, html, dica = "") => `<label class="field"><span>${rot}</span>${html}${dica ? `<small>${dica}</small>` : ""}</label>`;

// Grava só o WhatsApp: a função do banco mantém o resto do cadastro como está.
function mcTrocarFone(c) {
  mcJanela(`WhatsApp · ${c.nome}`, mcCampo("DDD + número", `<input class="input" name="whatsapp" inputmode="tel" maxlength="20" autocomplete="off" value="${esc(mcZap(c.whatsapp) ? mcFone(mcZap(c.whatsapp)) : c.whatsapp || "")}" placeholder="(45) 99999-0000">`,
      "É o contato de quem contratou, para você chamar quando precisar. Em branco tira o número."), "Salvar número", async f => {
    const txt = f.elements.whatsapp.value.trim();
    if (txt && !mcZap(txt)) throw new Error("pedido_invalido: informe o DDD e o número completo");
    await mcRpc("nexo_master_salvar_empresa", { p_id: c.id, p_dados: { whatsapp: mcZap(txt) } });
    toast(txt ? "Número salvo." : "Número retirado."); await mcAtualizar();
  });
}

function mcBloquear(c) {
  const vit = c.situacao?.status === "vitalicia";
  confirmar(`Bloquear ${c.nome}?`, `O cliente passa a ver a tela de bloqueio e a aba <b>Meu plano</b>, e a busca automática para. Os dados ficam guardados.<br><br>${vit
      ? "Como é <b>vitalício</b>, ele não vê botão de pagar: só você libera." : "Se ele pagar pela InfinitePay, o acesso volta sozinho."}`,
    async () => { await mcRpc("nexo_master_bloquear", { p_empresa: c.id }); toast(`${c.nome} foi bloqueado.`); await mcAtualizar(); }, "Bloquear", true);
}

function mcPedirData(c, titulo, texto) {
  const padrao = new Date(Date.now() + 30 * 86400000);
  mcJanela(titulo, `<p class="t2" style="margin:0">${texto}</p>
    ${mcCampo("Liberar até", `<input class="input" type="date" name="ate" required min="${mcDiaCampo(new Date())}" value="${mcDiaCampo(padrao)}">`, "Vale até o fim desse dia.")}`,
    "Liberar", async f => {
      if (!f.elements.ate.value) throw new Error("pedido_invalido: informe a data");
      await mcRpc("nexo_master_liberar", { p_empresa: c.id, p_ate: mcFimDoDia(f.elements.ate.value) });
      toast(`${c.nome} liberado até ${mcData(mcFimDoDia(f.elements.ate.value))}.`); await mcAtualizar();
    });
}
function mcLiberar(c) {
  if (mcSituacao(c).chave === "atrasado") return mcPedirData(c, `Dar mais prazo a ${c.nome}`, "Escolha até quando o acesso fica liberado. Nenhum pagamento é anotado.");
  confirmar(`Liberar ${c.nome}?`, "Volta o plano, a situação e a data de antes do bloqueio.", async () => {
    try { await mcRpc("nexo_master_liberar", { p_empresa: c.id, p_ate: null }); toast(`${c.nome} foi liberado.`); await mcAtualizar(); }
    catch (e) {
      if (!/data_vencida/.test(e.original || "")) throw e;
      setTimeout(() => mcPedirData(c, `Liberar ${c.nome}`, "A data de antes já passou. Escolha até quando o acesso fica liberado."), 0);
    }
  }, "Liberar");
}

function mcPagamento(c) {
  const s = c.situacao, p = MC.planos.find(x => x.chave === s.plano) || {};
  const valor = m => { const v = m === 12 ? (p.preco_anual_centavos ?? (p.preco_centavos ?? 0) * 12) : (p.preco_centavos ?? s.preco_centavos ?? 0); return (v / 100).toFixed(2).replace(".", ","); };
  mcJanela(`Registrar pagamento · ${c.nome}`, `<p class="t2" style="margin:0">Para quem pagou <b>por fora</b>. Só anota: não cobra nem movimenta dinheiro.</p>
    <fieldset class="mc-opcoes"><legend>Período pago</legend><label><input type="radio" name="meses" value="1" checked> 1 mês</label><label><input type="radio" name="meses" value="12"> 1 ano</label></fieldset>
    ${mcCampo("Valor recebido (R$)", `<input class="input" name="valor" inputmode="decimal" required value="${valor(1)}">`)}
    <p class="muted peq" style="margin:0">Soma à data paga que ainda vale. Se já venceu, conta a partir de hoje.</p>`, "Registrar pagamento", async f => {
      const txt = f.elements.valor.value.trim().replace(/[R$\s]/g, "").replace(/\./g, "").replace(",", ".");
      if (txt === "" || !(Number(txt) >= 0)) throw new Error("pedido_invalido: confira o valor, por exemplo 800,00");
      const r = await mcRpc("nexo_master_registrar_pagamento", { p_empresa: c.id, p_meses: Number(f.elements.meses.value), p_valor_centavos: Math.round(Number(txt) * 100) });
      toast(r?.pago_ate ? `Anotado. Pago até ${mcData(r.pago_ate)}.` : "Pagamento anotado."); await mcAtualizar();
    });
  $$("#mcForm [name=meses]").forEach(r => r.onchange = () => { $("#mcForm [name=valor]").value = valor(Number(r.value)); });
}

function mcMudarData(c) {
  const s = c.situacao, teste = s.status === "teste", atual = teste ? s.teste_ate : s.periodo_ate;
  mcJanela(`Mudar data · ${c.nome}`, mcCampo(teste ? "Teste grátis até" : "Pago até",
      `<input class="input" type="date" name="ate" required min="${mcDiaCampo(new Date())}" value="${atual ? mcDiaCampo(new Date(atual)) : ""}">`, "Vale até o fim desse dia. Nenhum pagamento é anotado."),
    "Salvar data", async f => {
      const v = f.elements.ate.value;
      if (!v || v < mcDiaCampo(new Date())) throw new Error("pedido_invalido: escolha uma data de hoje em diante");
      await mcRpc("nexo_master_salvar_assinatura", { p_empresa: c.id, p_dados: { [teste ? "teste_ate" : "periodo_ate"]: mcFimDoDia(v) } });
      toast("Data salva."); await mcAtualizar();
    });
}

function mcTrocarPlano(c) {
  const s = c.situacao || {}, bloqueado = mcSituacao(c).chave === "bloqueado", sem = !s.tem_assinatura;
  const planos = MC.planos.filter(p => p.ativo || p.chave === s.plano);
  const opcoes = sem ? [["teste", "Teste grátis (os dias do plano)"], ["vitalicia", "Vitalício: sem cobrança e sem vencimento"], ["ate", "Pago até uma data"]]
    : [["manter", "Manter como está"], ...(s.status === "vitalicia" ? [] : [["vitalicia", "Vitalício: sem cobrança e sem vencimento"]]), ["ate", s.status === "vitalicia" ? "Voltar a cobrar: pago até uma data" : "Pago até uma data"]];
  mcJanela(`${sem ? "Escolher plano" : "Trocar plano"} · ${c.nome}`, `
    ${mcCampo("Plano", `<select class="select" name="plano">${planos.map(p => `<option value="${esc(p.chave)}" ${p.chave === (s.plano_pedido || s.plano || "inicial") ? "selected" : ""}>${esc(p.nome)} · ${esc(p.chave === "interno" ? "cortesia" : `${mcReais(p.preco_centavos)}/mês`)}</option>`).join("")}</select>`)}
    <label class="mc-marca"><input type="checkbox" name="liberado" ${s.liberado ? "checked" : ""}> <span>Liberar tudo: todas as funções, sem limites, seja qual for o plano</span></label>
    ${bloqueado ? `<p class="muted peq" style="margin:0">Este cliente está bloqueado: trocar o plano não libera o acesso.</p>`
      : `${mcCampo("Cobrança", `<select class="select" name="cobranca">${opcoes.map(([v, n]) => `<option value="${v}">${n}</option>`).join("")}</select>`)}
         <label class="field oculto" id="mcAte"><span>Pago até</span><input class="input" type="date" name="ate" min="${mcDiaCampo(new Date())}"></label>`}`,
    "Salvar plano", async f => {
      const dados = { plano: f.elements.plano.value, liberado: f.elements.liberado.checked }, cob = f.elements.cobranca?.value;
      if (cob === "vitalicia") { dados.status = "vitalicia"; dados.liberado = true; }
      else if (cob === "teste") dados.status = "teste";
      else if (cob === "ate") {
        const v = f.elements.ate.value;
        if (!v || v < mcDiaCampo(new Date())) throw new Error("pedido_invalido: escolha uma data de hoje em diante");
        dados.status = "ativa"; dados.periodo_ate = mcFimDoDia(v);
      }
      await mcRpc("nexo_master_salvar_assinatura", { p_empresa: c.id, p_dados: dados });
      toast("Plano salvo."); await mcAtualizar();
    });
  const sel = $("#mcForm [name=cobranca]");
  if (sel) { const ver = () => $("#mcAte").classList.toggle("oculto", sel.value !== "ate"); sel.onchange = ver; ver(); }
}

function mcNovoLogin(c) {
  mcJanela(`Adicionar login · ${c.nome}`, `
    ${mcCampo("E-mail", `<input class="input" type="email" name="email" required placeholder="nome@empresa.com">`)}
    ${mcCampo("Papel", `<select class="select" name="papel"><option value="admin">Administrador (pode pagar e convidar)</option><option value="editor">Editor (trabalha no dia a dia)</option><option value="leitor">Leitor (só vê)</option></select>`)}`,
    "Adicionar", async f => {
      const email = f.elements.email.value.trim();
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new Error("pedido_invalido: confira o e-mail");
      let r;
      try { r = await rpc("nexo_convidar", { p_empresa: c.id, p_email: email, p_papel: f.elements.papel.value }); }
      catch (e) { throw new Error(/ja_e_membro/.test(e.message) ? "pedido_invalido: essa pessoa já é login deste cliente" : e.message); }
      await mcAtualizar();
      if (r?.situacao === "convite") return () => mcMostrarConvite(email, c.nome);
      toast("Pronto: essa pessoa já tem acesso.");
    });
}
function mcMostrarConvite(email, nome, aoFechar) {
  const t = ctTextoConvite(email, nome);
  abrirModal(`<div class="modal-h"><h2>Agora envie o convite</h2></div><div class="modal-b"><p class="t2" style="margin:0"><b>${esc(email)}</b> ainda não tem conta. O sistema <b>não manda e-mail</b>: envie esta mensagem.</p>
      <div class="msg peq">${esc(t.texto)}</div></div>
    <div class="modal-f"><button type="button" class="btn ghost" id="mcDepois">Fechar</button><a class="btn" target="_blank" rel="noopener" href="https://wa.me/?text=${encodeURIComponent(t.texto)}">WhatsApp</a><button type="button" class="btn pri" id="mcCopiaConvite">Copiar mensagem</button></div>`, m => {
    $("#mcCopiaConvite", m).onclick = () => mcCopiar(t.texto);
    $("#mcDepois", m).onclick = () => { fecharModal(); aoFechar && aoFechar(); };
  });
}

function mcNovoCliente() {
  const planos = MC.planos.filter(p => p.ativo && p.chave !== "interno");
  mcJanela("Novo cliente", `
    ${mcCampo("Nome do cliente ou da empresa", `<input class="input" name="nome" required maxlength="120" autocomplete="off">`)}
    ${mcCampo("E-mail do login", `<input class="input" type="email" name="email" required autocomplete="off">`, "Entra como Administrador.")}
    ${mcCampo("Plano", `<select class="select" name="plano" required><option value="">Escolha o plano</option>${planos.map(p => `<option value="${esc(p.chave)}">${esc(p.nome)} · ${esc(mcReais(p.preco_centavos))}/mês</option>`).join("")}</select>`)}
    ${mcCampo("Começa como", `<select class="select" name="inicio"><option value="teste">Teste grátis (os dias do plano)</option><option value="vitalicia">Vitalício: sem cobrança e sem vencimento</option></select>`)}
    ${mcCampo("WhatsApp (se quiser)", `<input class="input" name="whatsapp" inputmode="tel" maxlength="20">`)}`,
    "Criar cliente", async f => {
      const d = Object.fromEntries(["nome", "email", "plano", "inicio", "whatsapp"].map(k => [k, f.elements[k].value.trim()]));
      if (d.nome.length < 2) throw new Error("pedido_invalido: informe o nome do cliente");
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(d.email)) throw new Error("pedido_invalido: confira o e-mail");
      if (!d.plano) throw new Error("pedido_invalido: escolha o plano");
      const r = await mcRpc("nexo_master_novo_cliente", { p_dados: d });
      MC.filtro = "todos"; MC.busca = ""; await mcAtualizar();
      if (r?.login === "convite") return () => mcMostrarConvite(d.email.toLowerCase(), d.nome, () => mcFicha(r.empresa));
      toast("Cliente criado. Esse e-mail já tem conta e já entra.");
      return () => mcFicha(r.empresa);
    });
}

function mcNovaSenha(email) {
  confirmar("Mandar nova senha", `Vai um <b>e-mail para ${esc(email)}</b> com o link para criar uma senha nova.`, async () => {
    const { error } = await sb.auth.resetPasswordForEmail(email, { redirectTo: ctVolta() });
    if (error) throw new Error(/rate limit/i.test(error.message) ? "pedido_invalido: muitos e-mails seguidos, espere alguns minutos" : error.message);
    toast("E-mail enviado.");
  }, "Mandar e-mail");
}

function mcExcluir(c) {
  mcJanela(`Excluir ${c.nome}`, `<div class="alert warn">${ic("alert")}<div>Todos os logins deste cliente perdem o acesso, a busca para e a cobrança é cancelada. Os dados ficam guardados e dá para <b>restaurar</b> pelo filtro "Excluídos".</div></div>
    ${mcCampo(`Para confirmar, digite o nome: <b>${esc(c.nome)}</b>`, `<input class="input" name="nome" autocomplete="off" required>`)}`, "Excluir cliente", async f => {
      const nome = f.elements.nome.value.trim();
      if (nome !== c.nome.trim()) throw new Error("pedido_invalido: o nome não confere");
      await mcRpc("nexo_master_excluir_cliente", { p_empresa: c.id, p_confirmacao: nome });
      toast(`${c.nome} foi excluído.`); MC.aberto = null; fecharGaveta(); await mcAtualizar();
    }, true);
}
function mcRestaurar(c) {
  confirmar(`Restaurar ${c.nome}?`, "Os logins voltam a entrar com o mesmo papel, a busca volta e o plano volta ao que era.",
    async () => { await mcRpc("nexo_master_restaurar_cliente", { p_empresa: c.id }); toast(`${c.nome} foi restaurado.`); await mcAtualizar(); }, "Restaurar");
}
