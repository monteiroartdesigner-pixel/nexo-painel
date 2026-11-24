"use strict";
// ============================================================================
// MASTER · administração da plataforma NEXO (Etapa 4 do NEXO SaaS, 18/11/2026).
// Só aparece para quem está em nexo.plataforma_admins (st.ctx.plataforma). O banco confere de novo
// em cada função public.nexo_master_* (nexo.exigir_plataforma): a tela sozinha não libera nada.
// Usa rpc, esc, aviso, msgErro, ERROS, $ e $$ do painel (index.html e base.js).
// ============================================================================

// Mensagens de erro do Master (entram na lista do painel na primeira abertura: ERROS é criado depois deste arquivo).
const M_ERROS = {
  whatsapp_invalido: "Use DDD + número, ex.: 41 99846-0993.",
  empresa_invalida: "Informe o nome e o endereço curto (letras minúsculas, números e hífen).",
  plano_invalido: "Escolha um plano que existe.",
  chave_invalida: "A chave do plano usa só letras minúsculas, números e _.",
  recursos_invalidos: "Os recursos do plano não estão no formato certo.",
  limites_invalidos: "Os limites do plano não estão no formato certo.",
  empresas_slug_key: "Já existe uma empresa com esse endereço curto.",
};

const M_RECURSOS = [
  ["prospect", "Vendas", "Clientes, buscas, tarefas e mandar link"],
  ["prospect_ia", "Pesquisa com IA", "A equipe pesquisa e qualifica sozinha"],
  ["prospect_sdr_whatsapp", "WhatsApp e SDR", "Atendimento por IA no WhatsApp, com passagem para uma pessoa"],
  ["marketing_instagram", "Marketing Instagram", "Pedir peça, aprovação e agenda de posts"],
  ["marketing_google", "Marketing Google", "Perfil da empresa no Google"],
  ["suporte_ia", "Suporte com IA", "Chat que responde pela Base da marca"],
  ["automacoes", "Automações", "Rotinas automáticas da equipe"],
];
const M_LIMITES = [["usuarios", "Usuários"], ["campanhas_ativas", "Buscas ativas"], ["empresas_mes", "Empresas pesquisadas por mês"], ["pesquisas_mes", "Pesquisas com IA por mês"]];
const M_ACESSO = { total: ["Liberado", "ok"], aviso: ["Vencida, em carência", "warn"], leitura: ["Só leitura", "bad"], bloqueado: ["Bloqueado", "bad"] };
const M_STATUS = { teste: "Teste grátis", teste_vencido: "Teste acabou", ativa: "Ativa", vencida: "Vencida", suspensa: "Suspensa", cancelada: "Cancelada", vitalicia: "Vitalício" };
// Filtros da lista de empresas: quem paga, quem testa, quem é vitalício, quem não paga e quem pediu troca.
const M_FILTROS = [["todas", "Todas", () => true], ["pagando", "Pagando", s => s.status === "ativa"], ["teste", "Em teste", s => s.status === "teste"],
  ["vitalicia", "Vitalício", s => s.status === "vitalicia"], ["sem_pagar", "Sem pagar", s => ["teste_vencido", "vencida", "suspensa", "cancelada"].includes(s.status)],
  ["pedidos", "Pediram troca", s => !!s.plano_pedido], ["excluidas", "Excluídas", () => true]];
// Excluída (18/11/2026) só aparece no filtro "Excluídas"; nos outros, não.
const mNoFiltro = (k, e) => k === "excluidas" ? e.status === "excluida"
  : e.status !== "excluida" && (M_FILTROS.find(x => x[0] === k) || M_FILTROS[0])[2](e.situacao || {});
const M_CASA = ["nexo-varzea", "nexo-inteligencia"];
const M_ORIGEM = { interna: "Da casa", master: "Criada por você", cadastro: "Cadastro público" };
const mst = { ind: null, empresas: [], planos: [], usuarios: null, filtro: "todas", carregado: false };

const reais = c => c == null ? "a definir" : (c / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const dataCurta = iso => iso ? new Date(iso).toLocaleDateString("pt-BR", { timeZone: FUSO, day: "2-digit", month: "2-digit", year: "numeric" }) : "";
const paraData = iso => iso ? new Date(iso).toLocaleDateString("en-CA", { timeZone: FUSO }) : "";
const deData = v => v ? new Date(`${v}T23:59:00-03:00`).toISOString() : null;

async function mCarregar() {
  const [ind, emp, pl] = await Promise.all([rpc("nexo_master_indicadores"), rpc("nexo_master_empresas"), rpc("nexo_master_planos")]);
  // Suporte: sem a migração 20261119090000 a função não existe e o cartão avisa (o resto do Master segue).
  const sup = await rpc("nexo_suporte").catch(() => null);
  // Usuários: sem a migração 20261119140000 a função não existe e o cartão avisa.
  const us = await rpc("nexo_master_usuarios").catch(() => null);
  Object.assign(mst, { ind, empresas: emp || [], planos: pl || [], suporte: sup, usuarios: us, carregado: true });
}

async function master(el) {
  Object.assign(ERROS, M_ERROS);
  if (!st.ctx?.plataforma) { el.innerHTML = `<div class="vazio">Esta área é só do administrador da plataforma.</div>`; return; }
  if (!mst.carregado) {
    el.innerHTML = `<div class="vazio">Carregando a plataforma…</div>`;
    try { await mCarregar(); }
    catch (e) {
      el.innerHTML = /nexo_master_|function .* does not exist|Could not find/i.test(e.message || "")
        ? `<div class="aviso">As funções do Master ainda não estão no banco. Aplique a migração da Etapa 3 no Supabase.</div>`
        : `<div class="aviso">${esc(msgErro(e))}</div>`;
      return;
    }
  }
  const i = mst.ind || {}, porSt = i.assinaturas_por_status || {};
  el.innerHTML = `
    <div class="m-topo"><div></div>
      <div class="linha"><button class="btn nao" id="mEmergencia" title="Faz a busca agora para a casa e para todos os clientes, fora dos 3 horários">Busca de emergência</button>
        <button class="btn" id="mRecarregar">Atualizar</button><button class="btn prim" id="mNova">Nova empresa</button></div></div>
    <div class="grade kpis m-kpis">
      ${mKpi("Empresas", i.empresas ?? 0, `${(i.empresas_por_origem || {}).interna || 0} da casa`)}
      ${mKpi("Assinaturas ativas", porSt.ativa || 0, "pagando ou cortesia")}
      ${mKpi("Em teste grátis", porSt.teste || 0, `${i.testes_acabando || 0} acabando em 2 dias`)}
      ${mKpi("Receita mensal", reais(i.receita_mensal_centavos || 0), "assinaturas ativas, sem o Interno")}
      ${mKpi("Faturas em aberto", reais(i.faturas_abertas_centavos || 0), "cobrança automática em breve")}
      ${mKpi("Usuários", i.usuarios ?? 0, "com acesso a alguma empresa")}
      ${mKpi("Vitalícios", porSt.vitalicia || 0, "acesso sem cobrança")}
      ${mKpi("Pediram troca", mst.empresas.filter(e => e.situacao?.plano_pedido).length, "esperando você confirmar")}
    </div>
    <div class="card"><div class="linha entre"><h2>Empresas</h2><span class="muted peq">${mst.empresas.length}</span></div>
      <div class="m-filtros" role="group" aria-label="Filtrar empresas">${M_FILTROS.map(([k, n]) => `<button type="button" class="m-filtro" data-m-filtro="${k}" aria-pressed="${mst.filtro === k}">${esc(n)} <b>${mst.empresas.filter(e => mNoFiltro(k, e)).length}</b></button>`).join("")}</div>
      <div class="m-lista">${mst.empresas.filter(e => mNoFiltro(mst.filtro, e)).map(mLinhaEmpresa).join("") || `<div class="vazio">Nenhuma empresa neste filtro.</div>`}</div></div>
    ${mCartaoUsuarios(mst.usuarios)}
    ${mCartaoSuporte(mst.suporte)}
    <div class="card"><div class="linha entre"><h2>Planos</h2><div class="linha"><span class="muted peq">preço vazio = a definir</span><button class="btn" id="mNovoPlano">Novo plano</button></div></div>
      <p class="muted peq" style="margin:0">Os limites são de exemplo. Ajuste e salve: vale na hora para todas as empresas do plano. Limite vazio = sem limite.</p>
      <div class="m-planos">${mst.planos.map(mCartaoPlano).join("")}</div></div>`;
  $("#mRecarregar").onclick = async () => { mst.carregado = false; master(el); };
  $("#mEmergencia").onclick = ev => mBuscaEmergencia(ev.currentTarget);
  $("#mNova").onclick = () => mEditarEmpresa(null);
  $("#mNovoPlano").onclick = mNovoPlano;
  const bs = $("#mSuporte"); if (bs) bs.onclick = mEditarSuporte;
  el.querySelectorAll("[data-m-editar]").forEach(b => b.onclick = () => mEditarEmpresa(mst.empresas.find(e => e.id === b.dataset.mEditar)));
  el.querySelectorAll("[data-m-equipe]").forEach(b => b.onclick = () => abrirEquipe(b.dataset.mEquipe, mst.empresas.find(e => e.id === b.dataset.mEquipe)?.nome));
  el.querySelectorAll("[data-m-plano]").forEach(b => b.onclick = () => mEditarAssinatura(mst.empresas.find(e => e.id === b.dataset.mPlano)));
  el.querySelectorAll("[data-m-filtro]").forEach(b => b.onclick = () => { mst.filtro = b.dataset.mFiltro; master(el); });
  el.querySelectorAll("[data-m-excluir]").forEach(b => b.onclick = () => mExcluirCliente(mst.empresas.find(e => e.id === b.dataset.mExcluir)));
  el.querySelectorAll("[data-m-excluir-us]").forEach(b => b.onclick = () => mExcluirUsuario((mst.usuarios || []).find(u => u.id === b.dataset.mExcluirUs)));
  el.querySelectorAll("[data-m-restaurar]").forEach(b => b.onclick = () => mRestaurarCliente(mst.empresas.find(e => e.id === b.dataset.mRestaurar)));
  el.querySelectorAll("form[data-m-salvar-plano]").forEach(f => f.onsubmit = ev => { ev.preventDefault(); mSalvarPlano(f, el); });
}

const mKpi = (rot, val, sub) => `<div class="card kpi"><span class="muted peq">${esc(rot)}</span><span class="kpi-n">${esc(val)}</span><span class="muted peq">${esc(sub)}</span></div>`;

function mLinhaEmpresa(e) {
  const s = e.situacao || {}, ac = M_ACESSO[s.acesso] || ["—", ""];
  const plano = s.tem_assinatura ? `${esc(s.plano_nome || s.plano)} · ${esc(M_STATUS[s.status] || s.status)}${s.liberado ? " · libera tudo" : ""}` : "Sem plano";
  const extra = s.status === "teste" && s.dias_teste_restantes != null ? ` · ${pl(s.dias_teste_restantes, "dia de teste", "dias de teste")}`
              : s.status === "vitalicia" ? " · sem vencimento" : s.periodo_ate ? ` · até ${dataCurta(s.periodo_ate)}` : "";
  return `<div class="m-emp">
    <div class="m-emp-av">${esc((e.nome || "?").split(/\s+/).map(p => p[0]).slice(0, 2).join("").toUpperCase())}</div>
    <div class="m-emp-txt"><b>${esc(e.nome)}</b>
      <span class="muted peq">${esc(M_ORIGEM[e.origem] || e.origem || "")} · ${pl(e.membros, "usuário", "usuários")} · ${pl(e.agentes, "agente", "agentes")}${e.status !== "ativa" ? ` · empresa ${esc(e.status)}` : ""}</span>
      ${e.dono_email ? `<span class="muted peq">Dono: ${esc(e.dono_email)}</span>` : ""}
      <span class="peq">${plano}${extra}</span>
      ${s.plano_pedido ? `<span class="pill warn m-pedido">Pediu o plano ${esc(mst.planos.find(p => p.chave === s.plano_pedido)?.nome || s.plano_pedido)} em ${dataCurta(s.pedido_em)}</span>` : ""}</div>
    ${e.status === "excluida"
      ? `<span class="pill bad">Excluída${e.excluida_em ? " em " + dataCurta(e.excluida_em) : ""}</span>
    <div class="linha"><button class="btn" data-m-restaurar="${e.id}" title="Devolve o acesso, os usuários e o plano como estavam">Restaurar</button></div>`
      : `<span class="pill ${ac[1]}">${esc(ac[0])}</span>
    <div class="linha"><button class="btn" data-m-equipe="${e.id}">Equipe</button><button class="btn" data-m-plano="${e.id}">Plano</button><button class="btn" data-m-editar="${e.id}">Editar</button>
      ${e.origem === "interna" || M_CASA.includes(e.slug) ? "" : `<button class="btn nao" data-m-excluir="${e.id}" title="Tira o acesso do cliente e para a pesquisa. Dá para restaurar depois">Excluir</button>`}</div>`}
  </div>`;
}

function mCartaoPlano(p) {
  const rec = new Set(p.recursos || []), lim = p.limites || {};
  return `<form class="m-plano" data-m-salvar-plano="${esc(p.chave)}">
    <div class="linha entre"><div><b class="m-plano-nome">${esc(p.nome)}</b> <span class="muted peq">${pl(p.empresas, "empresa", "empresas")}</span></div>
      ${p.chave === "interno" ? `<span class="pill">cortesia</span>` : `<span class="pill ${p.preco_centavos == null ? "warn" : "ok"}">${esc(reais(p.preco_centavos))}</span>`}</div>
    <label class="m-campo"><span>Descrição</span><input name="descricao" value="${esc(p.descricao || "")}" maxlength="160"></label>
    <div class="m-duas">
      <label class="m-campo"><span>Preço por mês (R$)</span><input name="preco" inputmode="decimal" placeholder="a definir" value="${p.preco_centavos == null ? "" : (p.preco_centavos / 100).toFixed(2).replace(".", ",")}" ${p.chave === "interno" ? "disabled" : ""}></label>
      <label class="m-campo"><span>Dias de teste</span><input name="dias_teste" type="number" min="0" max="60" value="${p.dias_teste}"></label>
    </div>
    <label class="m-campo"><span>Preço por ano (R$), com desconto</span><input name="preco_anual" inputmode="decimal" placeholder="vazio = sem plano anual" value="${p.preco_anual_centavos == null ? "" : (p.preco_anual_centavos / 100).toFixed(2).replace(".", ",")}" ${p.chave === "interno" ? "disabled" : ""}>
      ${p.preco_centavos != null && p.preco_anual_centavos != null && p.preco_centavos * 12 > p.preco_anual_centavos ? `<small class="muted peq">Economia de ${esc(reais(p.preco_centavos * 12 - p.preco_anual_centavos))} por ano para quem paga o anual.</small>` : ""}</label>
    <fieldset class="m-rec"><legend class="peq muted">Recursos</legend>
      ${M_RECURSOS.map(([k, n, d]) => `<label class="m-chk" title="${esc(d)}"><input type="checkbox" name="rec" value="${k}" ${rec.has(k) ? "checked" : ""}><span>${esc(n)}</span></label>`).join("")}</fieldset>
    <div class="m-duas">${M_LIMITES.map(([k, n]) => `<label class="m-campo"><span>${esc(n)}</span><input name="lim_${k}" type="number" min="0" placeholder="sem limite" value="${lim[k] ?? ""}"></label>`).join("")}</div>
    <div class="linha entre"><div class="linha">
      <label class="m-chk"><input type="checkbox" name="ativo" ${p.ativo ? "checked" : ""}><span>Ativo</span></label>
      <label class="m-chk" title="Aparece na página de cadastro"><input type="checkbox" name="publico" ${p.publico ? "checked" : ""}><span>No cadastro público</span></label></div>
      <button class="btn prim" type="submit">Salvar plano</button></div>
  </form>`;
}

async function mSalvarPlano(f, el) {
  const v = n => f.elements[n]?.value?.trim() ?? "";
  const dados = {
    descricao: v("descricao"),
    dias_teste: Number(v("dias_teste") || 0),
    recursos: [...f.querySelectorAll("input[name=rec]:checked")].map(i => i.value),
    limites: Object.fromEntries(M_LIMITES.map(([k]) => [k, v("lim_" + k)]).filter(([, x]) => x !== "").map(([k, x]) => [k, Number(x)])),
    ativo: f.elements.ativo.checked, publico: f.elements.publico.checked,
  };
  if (!f.elements.preco.disabled) {
    const txt = v("preco").replace(/\./g, "").replace(",", ".");
    if (txt && !(Number(txt) >= 0)) { aviso("Preço inválido. Use, por exemplo, 97,00.", true); return; }
    dados.preco_centavos = txt ? Math.round(Number(txt) * 100) : null;
  }
  if (f.elements.preco_anual && !f.elements.preco_anual.disabled) {
    const ta = v("preco_anual").replace(/\./g, "").replace(",", ".");
    if (ta && !(Number(ta) >= 1)) { aviso("Preço anual inválido. Use, por exemplo, 2000,00 (mínimo R$ 1,00).", true); return; }
    dados.preco_anual_centavos = ta ? Math.round(Number(ta) * 100) : "";   // vazio apaga o anual
  }
  const b = f.querySelector("[type=submit]"); b.disabled = true;
  try { await rpc("nexo_master_salvar_plano", { p_chave: f.dataset.mSalvarPlano, p_dados: dados }); aviso("Plano salvo."); mst.carregado = false; master(el); }
  catch (e) { aviso(msgErro(e), true); b.disabled = false; }
}

// ---------------------------------------------------------------- janelas
function mJanela(titulo, corpo, aoSalvar, rotulo = "Salvar", classe = "prim") {
  document.querySelector(".ap-fundo")?.remove();
  const fundo = document.createElement("div"); fundo.className = "ap-fundo";
  fundo.innerHTML = `<form class="ap m-janela" role="dialog" aria-modal="true" aria-label="${esc(titulo)}">
    <div class="linha entre"><h2 style="margin:0">${esc(titulo)}</h2><button class="btn" type="button" data-fechar aria-label="Fechar">✕</button></div>
    ${corpo}
    <div class="linha" style="justify-content:flex-end"><button class="btn" type="button" data-fechar>Cancelar</button><button class="btn ${classe}" type="submit">${esc(rotulo)}</button></div></form>`;
  const fechar = () => { fundo.remove(); document.removeEventListener("keydown", tecla); };
  const tecla = ev => { if (ev.key === "Escape") fechar(); };
  fundo.onclick = ev => { if (ev.target === fundo) fechar(); };
  fundo.querySelectorAll("[data-fechar]").forEach(b => b.onclick = fechar);
  const f = fundo.querySelector("form");
  f.onsubmit = async ev => {
    ev.preventDefault(); const b = f.querySelector("[type=submit]"); b.disabled = true;
    try { await aoSalvar(f); fechar(); mst.carregado = false; master($('[data-sec="master"]')); }
    catch (e) { aviso(msgErro(e), true); b.disabled = false; }
  };
  document.addEventListener("keydown", tecla); document.body.appendChild(fundo);
  f.querySelector("input,select")?.focus();
}

// WhatsApp de suporte (botão "Chamar no WhatsApp" do System e do Prospect). Troca vale na hora para todo mundo.
const mFone = n => { const d = String(n || "").replace(/^55/, ""); return d.length >= 10 ? `(${d.slice(0, 2)}) ${d.slice(2, -4)}-${d.slice(-4)}` : d; };
function mCartaoSuporte(s) {
  if (!s) return `<div class="card"><h2>Suporte</h2><div class="aviso peq">Falta aplicar a migração do suporte no Supabase para trocar o número por aqui.</div></div>`;
  return `<div class="card"><div class="linha entre"><div><h2>Suporte</h2>
      <p class="muted peq" style="margin:4px 0 0">WhatsApp do botão "Chamar no WhatsApp" do Marketing e das Vendas.</p></div>
      <button class="btn" id="mSuporte">Trocar número</button></div>
    <div class="m-sup">${s.whatsapp ? `<b>${esc(mFone(s.whatsapp))}</b> <a href="https://wa.me/${esc(s.whatsapp)}" target="_blank" rel="noopener">testar</a>` : `<span class="muted">Sem número: o botão do WhatsApp fica escondido.</span>`}</div></div>`;
}
function mEditarSuporte() {
  mJanela("WhatsApp de suporte", `
    <label class="m-campo"><span>DDD + número</span><input name="whatsapp" inputmode="tel" maxlength="20" required value="${esc(mFone(mst.suporte?.whatsapp))}" placeholder="41 99846-0993"></label>
    <p class="muted peq" style="margin:0">Vale na hora para todas as empresas. A troca fica registrada no Histórico.</p>`,
    async f => { await rpc("nexo_master_salvar_suporte", { p_whatsapp: f.elements.whatsapp.value }); aviso("Número do suporte salvo."); });
}

// Plano novo: nome e preço aqui; recursos, limites e "No cadastro público" no cartão que aparece na lista.
function mNovoPlano() {
  mJanela("Novo plano", `
    <label class="m-campo"><span>Nome do plano</span><input name="nome" required maxlength="40" placeholder="Ex.: Teste"></label>
    <div class="m-duas"><label class="m-campo"><span>Preço por mês (R$)</span><input name="preco" inputmode="decimal" placeholder="Ex.: 1,00"></label>
      <label class="m-campo"><span>Dias de teste</span><input name="dias_teste" type="number" min="0" max="60" value="3"></label></div>
    <p class="muted peq" style="margin:0">Nasce desligado do cadastro público e com todos os recursos. Depois marque "No cadastro público" no cartão do plano para ele aparecer para os clientes. A InfinitePay cobra no mínimo R$ 1,00.</p>`,
    async f => {
      const nome = f.elements.nome.value.trim();
      const chave = nome.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 30);
      if (chave.length < 2 || mst.planos.some(p => p.chave === chave)) throw new Error("Já existe um plano com esse nome (ou o nome é curto demais).");
      const txt = f.elements.preco.value.trim().replace(/\./g, "").replace(",", ".");
      if (txt && !(Number(txt) >= 0)) throw new Error("Preço inválido. Use, por exemplo, 1,00.");
      await rpc("nexo_master_salvar_plano", { p_chave: chave, p_dados: { nome, preco_centavos: txt ? Math.round(Number(txt) * 100) : null,
        dias_teste: Number(f.elements.dias_teste.value || 0), recursos: M_RECURSOS.map(r => r[0]), limites: {}, ativo: true, publico: false,
        ordem: 90 } });
      aviso(`Plano ${nome} criado.`);
    });
}

function mEditarEmpresa(e) {
  const nova = !e; e = e || {};
  const campo = (n, rot, val, extra = "") => `<label class="m-campo"><span>${rot}</span><input name="${n}" value="${esc(val || "")}" ${extra}></label>`;
  mJanela(nova ? "Nova empresa" : "Editar empresa", `
    ${campo("nome", "Nome da empresa", e.nome, "required maxlength=\"120\"")}
    ${campo("slug", "Endereço curto", e.slug, `required pattern="[a-z0-9\\-]{2,40}" placeholder="ex.: clinica-sorriso" ${e.origem === "interna" ? "readonly" : ""}`)}
    <div class="m-duas">${campo("documento", "CNPJ ou CPF", e.documento, "maxlength=\"20\"")}${campo("responsavel", "Responsável", e.responsavel, "maxlength=\"120\"")}</div>
    <div class="m-duas">${campo("whatsapp", "WhatsApp", e.whatsapp, "inputmode=\"tel\" maxlength=\"20\"")}${campo("email_cobranca", "E-mail de cobrança", e.email_cobranca, "type=\"email\" maxlength=\"160\"")}</div>
    ${nova ? "" : `<label class="m-campo"><span>Situação da empresa</span><select name="status">${["ativa", "pausada", "suspensa", "encerrada"].map(s => `<option ${s === e.status ? "selected" : ""}>${s}</option>`).join("")}</select></label>`}
    ${nova ? `<p class="muted peq" style="margin:0">Depois de criar, toque em <b>Plano</b> para começar o teste grátis.</p>` : ""}`,
    async f => {
      const d = Object.fromEntries(["nome", "slug", "documento", "responsavel", "whatsapp", "email_cobranca", "status"].filter(n => f.elements[n]).map(n => [n, f.elements[n].value.trim()]));
      d.slug = (d.slug || "").toLowerCase();
      await rpc("nexo_master_salvar_empresa", { p_id: nova ? null : e.id, p_dados: d });
      aviso(nova ? "Empresa criada." : "Empresa salva.");
    });
}

function mEditarAssinatura(e) {
  const s = e.situacao || {};
  const status = s.status_gravado || (s.tem_assinatura ? s.status : "teste");
  mJanela(`Plano · ${e.nome}`, `
    <div class="m-duas">
      <label class="m-campo"><span>Plano</span><select name="plano">${mst.planos.map(p => `<option value="${esc(p.chave)}" ${p.chave === (s.plano_pedido || s.plano || "inicial") ? "selected" : ""}>${esc(p.nome)} · ${esc(p.chave === "interno" ? "cortesia" : reais(p.preco_centavos))}</option>`).join("")}</select></label>
      <label class="m-campo"><span>Status</span><select name="status">${["teste", "ativa", "vitalicia", "vencida", "suspensa", "cancelada"].map(x => `<option value="${x}" ${x === status ? "selected" : ""}>${M_STATUS[x]}</option>`).join("")}</select></label>
    </div>
    <div class="m-duas">
      <label class="m-campo"><span>Teste grátis até</span><input type="date" name="teste_ate" value="${paraData(s.teste_ate)}"></label>
      <label class="m-campo"><span>Pago até</span><input type="date" name="periodo_ate" value="${paraData(s.periodo_ate)}"></label>
    </div>
    <label class="m-chk"><input type="checkbox" name="liberado" ${s.liberado || status === "vitalicia" ? "checked" : ""}><span><b>Liberar tudo</b>: todas as funções, sem limites e sem depender do plano (só o Master fica de fora). Marca sozinha no Vitalício ou quando você põe uma data em "Pago até".</span></label>
    <div class="m-duas">
      <label class="m-campo"><span>Dias de carência depois de vencer</span><input type="number" name="carencia_dias" min="0" max="60" value="${s.carencia_dias ?? 5}"></label>
      <label class="m-campo"><span>Observação</span><input name="observacao" maxlength="200" value=""></label>
    </div>
    ${s.plano_pedido ? `<div class="aviso peq">A empresa pediu o plano <b>${esc(mst.planos.find(p => p.chave === s.plano_pedido)?.nome || s.plano_pedido)}</b> em ${dataCurta(s.pedido_em)}. Ele já vem marcado acima: salve para confirmar.
      <label class="m-chk" style="margin-top:6px"><input type="checkbox" name="recusar"><span>Recusar o pedido (mantém o plano atual)</span></label></div>` : ""}
    <p class="muted peq" style="margin:0">Teste sem data começa agora e dura os dias de teste do plano. <b>Vitalício</b>: acesso liberado para sempre, sem cobrança e sem data de vencimento. Interno é cortesia da casa.</p>`,
    async f => {
      const d = { plano: f.elements.plano.value, status: f.elements.status.value, carencia_dias: Number(f.elements.carencia_dias.value || 0) };
      if (f.elements.teste_ate.value || s.teste_ate) d.teste_ate = deData(f.elements.teste_ate.value);
      if (f.elements.periodo_ate.value || s.periodo_ate) d.periodo_ate = deData(f.elements.periodo_ate.value);
      d.liberado = f.elements.liberado.checked;
      if (f.elements.observacao.value.trim()) d.observacao = f.elements.observacao.value.trim();
      if (d.status === "teste" && !f.elements.teste_ate.value) delete d.teste_ate;   // o banco calcula
      if (f.elements.recusar?.checked) { d.plano = s.plano; d.limpar_pedido = true; }
      if (d.status === "vitalicia" && s.status_gravado !== "vitalicia" && !confirm(`Liberar acesso vitalício para ${e.nome}? Fica sem cobrança e sem vencimento.`)) throw new Error("Cancelado.");
      await rpc("nexo_master_salvar_assinatura", { p_empresa: e.id, p_dados: d });
      aviso(d.liberado ? "Plano salvo: a empresa tem acesso a tudo, menos o Master." : "Plano da empresa salvo.");
    });
  // A caixa "Liberar tudo" marca sozinha no Vitalício e quando entra uma data em "Pago até" (dá para desmarcar).
  const j = document.querySelector(".m-janela");
  if (j && j.elements.liberado) {
    const marca = () => { if (j.elements.status.value === "vitalicia" || j.elements.periodo_ate.value) j.elements.liberado.checked = true; };
    j.elements.status.addEventListener("change", marca); j.elements.periodo_ate.addEventListener("input", marca);
  }
}

// Usuários da plataforma: quem tem acesso, a empresa e o papel de cada um e o último acesso.
const M_PAPEL = { dono: "Dono", admin: "Administrador", editor: "Editor", leitor: "Leitor" };
function mCartaoUsuarios(us) {
  if (!us) return `<div class="card"><h2>Usuários</h2><div class="aviso peq">A lista de usuários aparece depois da migração 20261119140000_nexo_meu_plano.sql.</div></div>`;
  const quando = iso => iso ? new Date(iso).toLocaleString("pt-BR", { timeZone: FUSO, day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit" }) : "nunca entrou";
  return `<div class="card"><div class="linha entre"><h2>Usuários</h2><span class="muted peq">${pl(us.length, "pessoa", "pessoas")}</span></div>
    <div class="m-usuarios">${us.map(u => `<div class="m-us">
      <div class="m-us-txt"><b>${esc(u.nome || u.email)}</b>${u.nome ? `<span class="muted peq">${esc(u.email)}</span>` : ""}
        <span class="peq">${u.master ? `<span class="pill ok">Master</span> ` : ""}${u.sport ? `<span class="pill info">NEXO SPORT</span> ` : ""}${(u.empresas || []).map(x => `${esc(x.nome)} · ${esc(M_PAPEL[x.papel] || x.papel)}`).join(" · ") || (u.sport || u.master ? "" : "sem empresa (cadastro que não terminou)")}</span></div>
      <div class="m-us-lado peq muted">${u.confirmado ? "" : `<span class="pill warn">e-mail não confirmado</span><br>`}Último acesso: ${esc(quando(u.ultimo_login))}
        ${"motivo_nao_exclui" in u ? (u.motivo_nao_exclui ? `<br><span class="m-us-trava" title="${esc(u.motivo_nao_exclui)}">${u.eu ? "" : "Não exclui: "}${esc(u.motivo_nao_exclui)}</span>`
          : `<br><button class="btn nao peq" type="button" data-m-excluir-us="${esc(u.id)}" title="Apaga a conta de login desta pessoa. Não tem como desfazer.">Excluir conta</button>`) : ""}</div>
    </div>`).join("") || `<div class="vazio">Ninguém ainda.</div>`}</div></div>`;
}

// ---------------------------------------------------------------- excluir usuário (23/11/2026)
// "Tirar acesso" só tira a pessoa da empresa; aqui é a conta de login mesmo, a confirmação é o e-mail exato.
// O banco recusa master, a própria conta, quem tem conta no NEXO SPORT e dono de empresa ativa.
function mExcluirUsuario(u) {
  if (!u) return;
  mJanela(`Excluir a conta de ${u.nome || u.email}`, `
    <div class="aviso"><b>Não tem como desfazer.</b> A conta de login e o acesso a ${pl((u.empresas || []).length, "empresa", "empresas")} saem na hora.
      Convites pendentes para <b>${esc(u.email)}</b> também. Para voltar, a pessoa precisa se cadastrar de novo.</div>
    <label class="m-campo"><span>Para confirmar, digite o e-mail: <b>${esc(u.email)}</b></span>
      <input name="confirmacao" autocomplete="off" required></label>`,
    async f => {
      const email = f.elements.confirmacao.value.trim();
      if (email.toLowerCase() !== String(u.email).trim().toLowerCase()) throw new Error("O e-mail não confere. Digite exatamente como aparece.");
      await rpc("nexo_master_excluir_usuario", { p_user: u.id, p_confirmacao: email });
      aviso(`A conta de ${u.email} foi excluída.`);
    }, "Excluir conta", "nao");
}

// ---------------------------------------------------------------- excluir e restaurar cliente (18/11/2026)
// Excluir não apaga dados: tira o acesso na hora, para a pesquisa e cancela a cobrança. "Restaurar" devolve tudo.
function mExcluirCliente(e) {
  if (!e) return;
  mJanela(`Excluir ${e.nome}`, `
    <div class="aviso"><b>O que acontece:</b> todos os usuários deste cliente perdem o acesso na hora, a pesquisa automática para e a cobrança é cancelada.
      Os dados ficam guardados e você pode <b>restaurar</b> pelo filtro "Excluídas".</div>
    <label class="m-campo"><span>Para confirmar, digite o nome do cliente: <b>${esc(e.nome)}</b></span>
      <input name="confirmacao" autocomplete="off" required></label>`,
    async f => {
      const nome = f.elements.confirmacao.value.trim();
      if (nome !== e.nome.trim()) throw new Error("O nome não confere. Digite exatamente como aparece.");
      await rpc("nexo_master_excluir_cliente", { p_empresa: e.id, p_confirmacao: nome });
      aviso(`${e.nome} foi excluído. Para desfazer, use o filtro Excluídas.`);
    }, "Excluir cliente", "nao");
}
function mRestaurarCliente(e) {
  if (!e) return;
  mJanela(`Restaurar ${e.nome}`, `<p style="margin:0">Os usuários voltam a entrar com o mesmo papel, a pesquisa volta a rodar e o plano volta ao que era antes da exclusão.</p>`,
    async () => { await rpc("nexo_master_restaurar_cliente", { p_empresa: e.id }); aviso(`${e.nome} foi restaurado.`); }, "Restaurar");
}

// ---------------------------------------------------------------- busca de emergência (18/11/2026)
// Fora dos 3 horários: retrato novo e rodada extra do cérebro para a casa e todos os clientes (função nexo-rodada).
async function mBuscaEmergencia(b) {
  b.disabled = true;
  try {
    const sessao = (await sb.auth.getSession()).data.session;
    if (!sessao) throw new Error("Entre de novo no painel.");
    const r = await fetch(`${SUPABASE_URL}/functions/v1/nexo-rodada`, { method: "POST",
      headers: { Authorization: "Bearer " + sessao.access_token, apikey: SUPABASE_KEY, "Content-Type": "application/json" },
      body: JSON.stringify({ acao: "buscar" }) });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(d.erro || "Não deu para pedir a busca agora.");
    aviso(d.disparado ? "Busca de emergência pedida para todos. A equipe começa em uns 2 minutos e entrega em uns 15."
                      : `Já tem uma busca começando (${d.motivo}).`);
  } catch (e) { aviso(e.message || "Falhou.", true); }
  finally { b.disabled = false; }
}
