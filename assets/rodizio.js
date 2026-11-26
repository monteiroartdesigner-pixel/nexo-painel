"use strict";
// ============================================================================
// RODÍZIO de contatos entre vendedoras: a tela de quem administra a empresa (pedido do Ricardo, 26/11/2026).
// Ferramenta opcional: sem o rodízio ligado, nada muda nas outras telas. Só dono, admin e Master chegam aqui,
// e o banco confere de novo em cada função public.nexo_rodizio_* (a tela sozinha não libera nada).
// Usa S, sb, rpc, esc, ic, $, $$, toast, msgErro, abrirModal, fecharModal, confirmar, pintarNav, rotaAtual, corpoCrm (index.html),
// ctVolta e ctCopiar/ctTextoConvite (conta.js).
// ============================================================================

const ROD = { dados: null, filtro: "" };   // dados vazio = ferramenta indisponível (outro papel ou banco sem a atualização)
const rodPodeAdministrar = () => ["plataforma", "dono", "admin"].includes(S.papel);
const rodLigado = () => !!ROD.dados?.ligado;
const rodErro = e => { const m = String(e?.message || e), i = m.indexOf("pedido_invalido:"); if (i < 0) return msgErro(e); const t = m.slice(i + 16).trim(); return t.charAt(0).toUpperCase() + t.slice(1) + "."; };

async function rodCarregar() {
  if (!rodPodeAdministrar()) { ROD.dados = null; return; }
  try { ROD.dados = await rpc("nexo_rodizio_ver", { p_empresa: S.empresaId }); }
  catch { ROD.dados = null; }   // sem a atualização do banco, o menu não aparece e as telas ficam como sempre
  if (ROD.filtro && !(ROD.dados?.vendedoras || []).some(v => v.id === ROD.filtro)) ROD.filtro = "";
}
async function rodAtualizar() {
  await rodCarregar(); pintarNav();
  if (rotaAtual() === "rodizio") vRodizio($("#main"));
}

// ---------------------------------------------------------------- ligações com a tela Clientes (só com o rodízio ligado)
const rodDe = e => ROD.dados?.atribuicoes?.[e.id] || null;
const rodPassa = e => !rodLigado() || !ROD.filtro || rodDe(e)?.vendedora === ROD.filtro;
function rodSelo(e) {
  if (!rodLigado()) return "";
  const a = rodDe(e);
  if (!a) return "";
  return a.vendedora ? `<span class="badge pri rod-selo">para ${esc(a.nome)}</span>` : `<span class="badge warn rod-selo">na fila</span>`;
}
function rodAbas() {
  if (!rodLigado()) return "";
  const aba = (id, nome, n) => `<button type="button" class="chip" data-rod-aba="${esc(id)}" aria-pressed="${ROD.filtro === id}">${esc(nome)} <b>${n}</b></button>`;
  return `<div class="chips rod-abas" role="group" aria-label="Vendedoras">${aba("", "Todas", S.empresas.length)}${ROD.dados.vendedoras.map(v => aba(v.id, v.nome, v.contatos)).join("")}<a class="chip" href="#/rodizio">+ Vendedora</a></div>`;
}
function rodAbasLigar(el) {
  $$("[data-rod-aba]", el).forEach(b => b.onclick = () => {
    ROD.filtro = b.dataset.rodAba;
    $$("[data-rod-aba]", el).forEach(x => x.setAttribute("aria-pressed", x.dataset.rodAba === ROD.filtro));
    corpoCrm();
  });
}
function rodFicha(e) {
  if (!rodLigado()) return "";
  const a = rodDe(e), ativas = ROD.dados.vendedoras.filter(v => v.acesso !== "sem_acesso");
  return `<label class="rod-ficha"><span>Caiu para</span><select class="select" id="rodPassar" data-lead="${esc(e.id)}">
    ${a?.vendedora ? "" : `<option value="" selected>${a ? "na fila" : "ninguém"}</option>`}${ativas.map(v => `<option value="${esc(v.id)}" ${a?.vendedora === v.id ? "selected" : ""}>${esc(v.nome)}</option>`).join("")}</select></label>`;
}
function rodFichaLigar(d) {
  const s = $("#rodPassar", d); if (!s) return;
  s.onchange = async () => {
    if (!s.value) return;
    s.disabled = true;
    try {
      await rpc("nexo_rodizio_passar", { p_empresa: S.empresaId, p_lead: s.dataset.lead, p_id: s.value });
      toast("Contato passado."); await rodCarregar(); if (rotaAtual() === "crm") corpoCrm();
    } catch (e) { toast(rodErro(e), true); }
    s.disabled = false;
  };
}

// ---------------------------------------------------------------- tela Rodízio
const rodAcesso = { criado: ["ok", "Acesso criado"], aguardando: ["warn", "Aguardando criar o acesso"], sem_acesso: ["bad", "Sem acesso"] };

function vRodizio(el) {
  const d = ROD.dados;
  if (!d) { el.innerHTML = `<div class="card"><div class="empty"><h2>Rodízio indisponível</h2><p class="muted" style="margin:0">Só quem administra a empresa usa esta ferramenta.</p></div></div>`; return; }
  const l = d.vendedoras || [], prox = l.find(v => v.id === d.proxima), perdidas = l.filter(v => v.acesso === "sem_acesso" && v.contatos > 0);
  const linha = v => {
    const [cor, rot] = rodAcesso[v.acesso] || rodAcesso.sem_acesso, b = (acao, texto, cls = "") => `<button type="button" class="btn sm ${cls}" data-rod="${acao}" data-id="${esc(v.id)}">${texto}</button>`;
    return `<div class="rod-linha" data-rod-linha="${esc(v.id)}"><span class="rod-av" aria-hidden="true">${esc(v.nome.charAt(0).toUpperCase())}</span>
      <div class="grow"><b>${esc(v.nome)}</b><div class="muted peq">${esc([v.email, `${v.contatos} ${v.contatos === 1 ? "contato" : "contatos"}`, `${v.abordados} ${v.abordados === 1 ? "abordado" : "abordados"}`].join(" · "))}</div></div>
      ${v.status === "pausada" ? `<span class="badge warn">Pausada</span>` : ""}<span class="badge ${cor}">${rot}</span>
      <div class="row">${v.acesso === "aguardando" ? b("link", "Enviar link", "pri") : ""}${v.acesso === "criado" ? b("link", "Reenviar link") + b("senha", "Nova senha") : ""}
        ${b("editar", "Editar")}${v.status === "pausada" ? b("voltar", "Voltar para a fila", "pri") : b("pausar", "Pausar")}${b("excluir", "Excluir", "danger")}</div></div>`;
  };
  el.innerHTML = `
    <div class="page-h"><div><h1>Rodízio</h1><p>Cada empresa nova vai para a próxima vendedora da fila. Cada uma entra com o próprio acesso e vê só os contatos dela.</p></div>
      <div class="row">${d.ligado ? `<span class="badge ok">Rodízio ligado</span><button type="button" class="btn" id="rodDesligar">Desligar</button>` : `<span class="badge">Desligado</span>`}
        <button type="button" class="btn ${l.length ? "" : "pri"}" id="rodNova">+ Vendedora</button>${!d.ligado && l.length ? `<button type="button" class="btn pri" id="rodLigar">Ligar o Rodízio</button>` : ""}</div></div>
    ${d.ligado ? "" : `<div class="alert">${ic("info")}<div><b>Desligado, nada muda no painel.</b> Crie as vendedoras, mande o link para cada uma e depois toque em <b>Ligar o Rodízio</b>.</div></div>`}
    ${d.limite_usuarios != null ? `<p class="muted peq" style="margin:0">Logins do plano: ${d.logins_usados} de ${d.limite_usuarios} em uso. Cada vendedora ocupa um.</p>` : ""}
    ${perdidas.length ? `<div class="alert warn">${ic("alert")}<div>${esc(perdidas.map(v => v.nome).join(", "))} ficou sem acesso e ainda tem contatos. <button type="button" class="btn sm" id="rodRepartir">Repartir entre as outras</button></div></div>` : ""}
    <section class="card rod-card"><h2>Vendedoras (${l.length})</h2>${l.map(linha).join("") || `<p class="muted" style="margin:0">Nenhuma ainda. Toque em <b>+ Vendedora</b>.</p>`}</section>
    ${d.ligado ? `<section class="card rod-card"><h2>Fila</h2><p class="muted" style="margin:0">${prox ? `Próxima da vez: <b>${esc(prox.nome)}</b>.` : "Ninguém disponível agora."} ${d.na_fila ? `${d.na_fila === 1 ? "1 contato está esperando" : `${d.na_fila} contatos estão esperando`} alguém disponível.` : "Nenhum contato esperando."} Quem tem e quem não tem WhatsApp roda em filas separadas.</p></section>` : ""}`;
  $("#rodNova").onclick = () => rodEditar(null);
  const lig = $("#rodLigar"); if (lig) lig.onclick = rodLigar;
  const des = $("#rodDesligar"); if (des) des.onclick = () => confirmar("Desligar o Rodízio?", "As telas voltam a ser as de sempre e as vendedoras deixam de entrar. Quem abordou o quê fica guardado para quando você religar.",
    async () => { await rodRpc("nexo_rodizio_desligar", {}); toast("Rodízio desligado."); ROD.filtro = ""; await rodAtualizar(); }, "Desligar", true);
  const rep = $("#rodRepartir"); if (rep) rep.onclick = async () => { rep.disabled = true; try { const r = await rodRpc("nexo_rodizio_repartir", {}); toast(`${r?.repartidos || 0} contatos repartidos.`); await rodAtualizar(); } catch (e) { rep.disabled = false; toast(e.message, true); } };
  $$("[data-rod]", el).forEach(b => b.onclick = () => {
    const v = l.find(x => x.id === b.dataset.id);
    ({ link: () => rodLink(v), senha: () => rodSenha(v), editar: () => rodEditar(v), pausar: () => rodPausar(v), voltar: () => rodVoltar(v), excluir: () => rodExcluir(v) })[b.dataset.rod]();
  });
}

// Erro do banco em português antes de chegar na janela.
async function rodRpc(fn, args) {
  try { return await rpc(fn, { p_empresa: S.empresaId, ...args }); } catch (e) { throw new Error(rodErro(e)); }
}
function rodJanela(titulo, corpo, rotulo, aoSalvar, perigo = false) {
  abrirModal(`<form id="rodForm" novalidate><div class="modal-h"><h2>${esc(titulo)}</h2></div><div class="modal-b">${corpo}<p class="rod-erro" role="alert"></p></div>
    <div class="modal-f"><button type="button" class="btn ghost" data-fechar>Cancelar</button><button type="submit" class="btn ${perigo ? "danger" : "pri"}">${esc(rotulo)}</button></div></form>`, m => {
    const f = $("#rodForm", m), b = f.querySelector("[type=submit]");
    f.onsubmit = async ev => {
      ev.preventDefault(); if (b.disabled) return; b.disabled = true; $(".rod-erro", f).textContent = "";
      try { const depois = await aoSalvar(f); fecharModal(); if (typeof depois === "function") depois(); }
      catch (e) { b.disabled = false; $(".rod-erro", f).textContent = e.message; }
    };
  });
}
const rodCampo = (rot, html, dica = "") => `<label class="field"><span>${rot}</span>${html}${dica ? `<small>${dica}</small>` : ""}</label>`;

function rodEditar(v) {
  rodJanela(v ? `Editar ${v.nome}` : "Nova vendedora",
    `${rodCampo("Nome", `<input class="input" name="nome" required maxlength="60" autocomplete="off" value="${esc(v?.nome || "")}">`)}
     ${v ? `<p class="muted peq" style="margin:0">E-mail de entrada: <b>${esc(v.email)}</b>. Para trocar o e-mail, exclua e crie de novo.</p>`
         : rodCampo("E-mail (é com ele que ela entra)", `<input class="input" type="email" name="email" required autocomplete="off">`)}
     ${rodCampo("WhatsApp dela (se quiser)", `<input class="input" name="whatsapp" inputmode="tel" maxlength="20" autocomplete="off" value="${esc(v?.whatsapp || "")}">`)}`,
    v ? "Salvar" : "Criar e ver o link", async f => {
      const dados = { nome: f.elements.nome.value.trim(), whatsapp: f.elements.whatsapp.value.trim(), email: v ? v.email : f.elements.email.value.trim() };
      if (dados.nome.length < 2) throw new Error("Informe o nome da vendedora.");
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(dados.email)) throw new Error("Confira o e-mail.");
      const r = await rodRpc("nexo_rodizio_salvar_vendedora", { p_id: v?.id || null, p_dados: dados });
      await rodAtualizar();
      if (v) { toast("Salvo."); return; }
      return () => rodLink({ ...dados, email: dados.email.toLowerCase(), acesso: r?.acesso || "aguardando" });
    });
}

// A mensagem com o link. O sistema não manda e-mail: quem manda é a pessoa (WhatsApp ou copiar).
function rodTexto(v) {
  const base = ctVolta();
  if (v.acesso === "criado") return { link: base, texto: `Olá, ${v.nome}! Seu acesso à prospecção da ${S.empresaNome}:\n1. Abra: ${base}\n2. Entre com este e-mail: ${v.email}\n3. Não lembra a senha? Toque em "Esqueci a senha".` };
  const link = `${base}?convite=${encodeURIComponent(v.email)}`;
  return { link, texto: `Olá, ${v.nome}! Seu acesso à prospecção da ${S.empresaNome}:\n1. Abra o link: ${link}\n2. Crie a sua senha com este e-mail: ${v.email}\n3. Pronto: os seus contatos aparecem.` };
}
function rodLink(v) {
  const t = rodTexto(v), fone = String(v.whatsapp || "").replace(/\D/g, ""), para = fone ? (fone.length <= 11 ? "55" + fone : fone) : "";
  abrirModal(`<div class="modal-h"><h2>Link de acesso de ${esc(v.nome)}</h2></div><div class="modal-b"><p class="t2" style="margin:0">Mande esta mensagem para ela. Ela vê só os contatos dela.</p>
      <div class="msg peq" id="rodMsg">${esc(t.texto)}</div></div>
    <div class="modal-f"><button type="button" class="btn ghost" data-fechar>Fechar</button><button type="button" class="btn" id="rodCopiar">Copiar mensagem</button>
      <a class="btn pri" target="_blank" rel="noopener" href="https://wa.me/${para}?text=${encodeURIComponent(t.texto)}">Enviar pelo WhatsApp</a></div>`, m => {
    $("#rodCopiar", m).onclick = async () => { try { await navigator.clipboard.writeText(t.texto); toast("Mensagem copiada."); } catch { toast("O navegador bloqueou a cópia. Selecione o texto e copie.", true); } };
  });
}
function rodSenha(v) {
  confirmar("Mandar nova senha", `Vai um <b>e-mail para ${esc(v.email)}</b> com o link para ela criar outra senha. Você não vê nem digita a senha dela.`, async () => {
    const { error } = await sb.auth.resetPasswordForEmail(v.email, { redirectTo: ctVolta() });
    if (error) throw new Error(/rate limit/i.test(error.message) ? "pedido_invalido: muitos e-mails seguidos, espere alguns minutos" : error.message);
    toast("E-mail enviado.");
  }, "Mandar e-mail");
}
const rodMarca = (nome, texto, marcado = true) => `<label class="rod-marca"><input type="checkbox" name="${nome}" ${marcado ? "checked" : ""}> <span>${texto}</span></label>`;
function rodPausar(v) {
  rodJanela(`Pausar ${v.nome}`, `<p class="t2" style="margin:0">Ela sai da vez e não recebe empresas novas. Continua entrando para ver as dela.</p>
    ${rodMarca("repartir", "Passar para as outras os contatos que ela ainda não abordou", false)}`, "Pausar", async f => {
      const r = await rodRpc("nexo_rodizio_pausar", { p_id: v.id, p_pausar: true, p_repartir: f.elements.repartir.checked });
      toast(`${v.nome} pausada.${r?.repartidos ? ` ${r.repartidos} contatos repartidos.` : ""}`); await rodAtualizar();
    });
}
async function rodVoltar(v) {
  try { const r = await rodRpc("nexo_rodizio_pausar", { p_id: v.id, p_pausar: false, p_repartir: false }); toast(`${v.nome} voltou para a fila.${r?.repartidos ? ` ${r.repartidos} contatos saíram da espera.` : ""}`); await rodAtualizar(); }
  catch (e) { toast(e.message, true); }
}
function rodExcluir(v) {
  rodJanela(`Excluir ${v.nome}`, `<div class="alert warn">${ic("alert")}<div>Ela <b>perde o acesso na hora</b> e o link deixa de valer. Os contatos que não estão encerrados voltam para a fila e são repartidos. O que ela fez fica no histórico.</div></div>
    ${rodCampo(`Para confirmar, digite o nome: <b>${esc(v.nome)}</b>`, `<input class="input" name="nome" required autocomplete="off">`)}`, "Excluir vendedora", async f => {
      const nome = f.elements.nome.value.trim();
      if (nome.toLowerCase() !== v.nome.trim().toLowerCase()) throw new Error("O nome não confere.");
      await rodRpc("nexo_rodizio_excluir", { p_id: v.id, p_confirmacao: nome });
      toast(`${v.nome} foi excluída.`); await rodAtualizar();
    }, true);
}
function rodLigar() {
  const n = ROD.dados.sem_dona_nao_abordadas || 0;
  rodJanela("Ligar o Rodízio", `<p class="t2" style="margin:0">A partir de agora, cada empresa nova vai para a próxima vendedora da fila.</p>
    ${n ? rodMarca("repartir", `Repartir também ${n === 1 ? "a empresa que ainda não foi abordada" : `as ${n} empresas que ainda não foram abordadas`}`) : ""}`, "Ligar", async f => {
      const r = await rodRpc("nexo_rodizio_ligar", { p_repartir: !!f.elements.repartir?.checked });
      toast(`Rodízio ligado.${r?.repartidos ? ` ${r.repartidos} contatos repartidos.` : ""}`); await rodAtualizar();
    });
}
