"use strict";
// ============================================================================
// CONTA · criar conta com teste grátis, esqueci minha senha, convites e equipe (NEXO SaaS Etapa 5, 18/11/2026).
// Comum ao NEXO System e ao NEXO Prospect. Usa sb e esc de assets/base.js.
// Banco: nexo_planos_publicos, nexo_cadastrar_empresa, nexo_aceitar_convites, nexo_membros, nexo_convidar, nexo_remover_acesso
// (migração 20261118180000_nexo_saas_etapa5.sql). A senha nunca passa por aqui além do envio direto ao Supabase.
// ============================================================================

const CT_PENDENTE = "nexo.cadastro.pendente";
const ctLer = k => { try { return JSON.parse(localStorage.getItem(k) || "null"); } catch { return null; } };
const ctGravar = (k, v) => { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, JSON.stringify(v)); } catch {} };
const ctVolta = () => location.origin + location.pathname;
const CT_ERROS = {
  email_invalido: "Confira o e-mail.", papel_invalido: "Escolha o papel.", ja_e_membro: "Essa pessoa já tem acesso.",
  limite_usuarios: "O plano chegou no limite de usuários. Aumente o plano para incluir mais gente.",
  nao_remove_dono: "O dono da empresa não pode ser removido.", membro_nao_encontrado: "Essa pessoa não tem mais acesso.",
  ja_tem_empresa: "Este login já tem uma empresa cadastrada.", plano_invalido: "Esse plano não está disponível no cadastro.",
  email_nao_confirmado: "Confirme o e-mail primeiro (abra o link que chegou na sua caixa de entrada).",
  cadastro_invalido: "Informe o nome da empresa.", sem_permissao: "Seu papel não permite essa ação.",
  "User already registered": "Esse e-mail já tem conta. Entre com ele ou use \"Esqueci minha senha\".",
  "Password should be": "A senha precisa ter pelo menos 8 caracteres.", "rate limit": "Muitas tentativas. Espere alguns minutos e tente de novo.",
};
const ctMsg = e => { const m = (e && (e.message || e.error_description)) || String(e); for (const k in CT_ERROS) if (m.includes(k)) return CT_ERROS[k]; return "Não deu certo: " + m; };
const ctRpc = async (fn, args) => { const { data, error } = await sb.rpc(fn, args); if (error) throw error; return data; };
const ctReais = c => c == null ? "preço a combinar" : (c / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" }) + "/mês";

function ctJanela(titulo, corpo, montar) {
  document.querySelector(".ap-fundo")?.remove();
  const fundo = document.createElement("div"); fundo.className = "ap-fundo";
  fundo.innerHTML = `<div class="ap ct-janela" role="dialog" aria-modal="true" aria-label="${esc(titulo)}">
    <div class="linha entre"><h2 style="margin:0">${esc(titulo)}</h2><button class="btn" type="button" data-fechar aria-label="Fechar">✕</button></div>${corpo}</div>`;
  const fechar = () => { fundo.remove(); document.removeEventListener("keydown", tecla); };
  const tecla = ev => { if (ev.key === "Escape") fechar(); };
  fundo.onclick = ev => { if (ev.target === fundo) fechar(); };
  fundo.querySelectorAll("[data-fechar]").forEach(b => b.onclick = fechar);
  document.addEventListener("keydown", tecla); document.body.appendChild(fundo);
  montar?.(fundo.querySelector(".ap"), fechar);
  fundo.querySelector("input,select,button:not([data-fechar])")?.focus();
}
const ctNota = (el, txt, erro) => { const n = el.querySelector("[data-nota]"); if (n) { n.textContent = txt; n.classList.toggle("ct-erro", !!erro); } };

// ---------------------------------------------------------------- esqueci minha senha
function ctEsqueci(emailInicial) {
  ctJanela("Esqueci minha senha", `<form class="ct-form" data-f>
      <p class="ct-txt">Mandamos um link para o seu e-mail. Abra o link e crie uma senha nova.</p>
      <label class="ct-campo"><span>E-mail</span><input type="email" name="email" autocomplete="username" required value="${esc(emailInicial || "")}"></label>
      <button class="btn prim pri" type="submit">Mandar o link</button><p class="ct-nota" data-nota></p></form>`, (j) => {
    const f = j.querySelector("[data-f]");
    f.onsubmit = async ev => {
      ev.preventDefault(); const b = f.querySelector("[type=submit]"); b.disabled = true;
      const { error } = await sb.auth.resetPasswordForEmail(f.email.value.trim(), { redirectTo: ctVolta() });
      b.disabled = false;
      // Mesmo texto com ou sem conta: não revela quais e-mails existem. Só o limite de tentativas aparece como erro.
      if (error && /rate limit/i.test(error.message)) ctNota(j, ctMsg(error), true);
      else ctNota(j, "Se esse e-mail tiver conta, o link chega em instantes. Confira também o spam.");
    };
  });
}
function ctNovaSenha() {
  ctJanela("Crie a sua senha nova", `<form class="ct-form" data-f>
      <label class="ct-campo"><span>Senha nova (mínimo 8 caracteres)</span><input type="password" name="s1" autocomplete="new-password" minlength="8" required></label>
      <label class="ct-campo"><span>Repita a senha</span><input type="password" name="s2" autocomplete="new-password" minlength="8" required></label>
      <button class="btn prim pri" type="submit">Salvar senha</button><p class="ct-nota" data-nota></p></form>`, (j, fechar) => {
    const f = j.querySelector("[data-f]");
    f.onsubmit = async ev => {
      ev.preventDefault();
      if (f.s1.value !== f.s2.value) { ctNota(j, "As duas senhas não são iguais.", true); return; }
      const b = f.querySelector("[type=submit]"); b.disabled = true;
      const { error } = await sb.auth.updateUser({ password: f.s1.value });
      b.disabled = false;
      if (error) { ctNota(j, ctMsg(error), true); return; }
      f.reset(); fechar(); history.replaceState(null, "", ctVolta()); location.reload();
    };
  });
}

// ---------------------------------------------------------------- conta de quem foi convidado (não cria empresa)
// O acesso entra sozinho no primeiro login, pelo convite feito para este e-mail (nexo_aceitar_convites).
function ctContaConvidado(emailInicial) {
  ctJanela("Criar sua conta", `<form class="ct-form" data-f>
      <p class="ct-txt">Recebeu um convite para a equipe de uma empresa no NEXO? Crie a sua conta <b>com o mesmo e-mail do convite</b>. O acesso aparece no primeiro login.</p>
      <label class="ct-campo"><span>Seu nome</span><input name="nome" autocomplete="name" required maxlength="120"></label>
      <label class="ct-campo"><span>E-mail do convite</span><input type="email" name="email" autocomplete="username" required value="${esc(emailInicial || "")}"></label>
      <label class="ct-campo"><span>Crie uma senha (mínimo 8 caracteres)</span><input type="password" name="senha" autocomplete="new-password" minlength="8" required></label>
      <button class="btn prim pri" type="submit">Criar minha conta</button><p class="ct-nota" data-nota></p></form>`, (j) => {
    const f = j.querySelector("[data-f]");
    f.onsubmit = async ev => {
      ev.preventDefault(); const b = f.querySelector("[type=submit]"); b.disabled = true;
      const email = f.email.value.trim();
      ctGravar(CT_PENDENTE, null);   // conta de convidado nunca cria empresa
      const { data, error } = await sb.auth.signUp({ email, password: f.senha.value,
        options: { emailRedirectTo: ctVolta(), data: { full_name: f.nome.value.trim() } } });
      f.senha.value = ""; b.disabled = false;
      if (error) { ctNota(j, ctMsg(error), true); return; }
      if (data.session) { history.replaceState(null, "", ctVolta()); location.reload(); return; }
      f.innerHTML = `<p class="ct-txt"><b>Quase lá!</b> Mandamos um link de confirmação para <b>${esc(email)}</b>. Abra o link e entre aqui com o seu e-mail e senha: o acesso à equipe aparece na hora.</p>`;
    };
  });
}

// ---------------------------------------------------------------- criar conta com teste grátis
async function ctCriarConta(escolhido) {
  escolhido = typeof escolhido === "string" ? escolhido : null;   // vem da vitrine de planos; clique no link manda o evento
  let planos = [];
  try { planos = await ctRpc("nexo_planos_publicos") || []; } catch { planos = []; }
  if (!planos.length) {
    ctJanela("Criar conta", `<p class="ct-txt">O cadastro de empresas ainda não está aberto: o NEXO Prospect está liberado só por convite. Fale com a NEXO para começar.</p>
      <a class="btn prim pri" href="https://www.instagram.com/nexo.rm/" target="_blank" rel="noopener">Falar com a NEXO</a>
      <button type="button" class="ct-link" data-convidado>Recebi um convite de uma empresa</button>`, j => { j.querySelector("[data-convidado]").onclick = () => ctContaConvidado(); });
    return;
  }
  ctJanela("Teste grátis do NEXO", `<form class="ct-form" data-f>
      <p class="ct-txt">Crie a conta da sua empresa. Sem cartão: o teste começa agora e você decide depois.
        <button type="button" class="ct-link" data-convidado>Recebi um convite de uma empresa</button></p>
      <fieldset class="ct-planos"><legend>Plano</legend>${planos.map((p, i) => `<label class="ct-plano"><input type="radio" name="plano" value="${esc(p.chave)}" ${(escolhido ? p.chave === escolhido : i === 0) ? "checked" : ""}>
        <span><b>${esc(p.nome)}</b><small>${esc(p.descricao || "")}</small><small>${pl(p.dias_teste, "dia grátis", "dias grátis")} · depois ${esc(ctReais(p.preco_centavos))}</small></span></label>`).join("")}</fieldset>
      <div class="ct-duas"><label class="ct-campo"><span>Seu nome</span><input name="responsavel" autocomplete="name" required maxlength="120"></label>
        <label class="ct-campo"><span>Nome da empresa</span><input name="empresa" autocomplete="organization" required maxlength="120"></label></div>
      <div class="ct-duas"><label class="ct-campo"><span>WhatsApp</span><input name="whatsapp" inputmode="tel" autocomplete="tel" maxlength="20"></label>
        <label class="ct-campo"><span>E-mail</span><input type="email" name="email" autocomplete="username" required></label></div>
      <label class="ct-campo"><span>Senha (mínimo 8 caracteres)</span><input type="password" name="senha" autocomplete="new-password" minlength="8" required></label>
      <button class="btn prim pri" type="submit">Criar conta e começar o teste</button><p class="ct-nota" data-nota></p></form>`, (j) => {
    const f = j.querySelector("[data-f]");
    j.querySelector("[data-convidado]").onclick = () => ctContaConvidado(f.email.value.trim());
    f.onsubmit = async ev => {
      ev.preventDefault(); const b = f.querySelector("[type=submit]"); b.disabled = true;
      const dados = { empresa: f.empresa.value.trim(), responsavel: f.responsavel.value.trim(), whatsapp: f.whatsapp.value.trim(), plano: f.plano.value };
      ctGravar(CT_PENDENTE, dados);   // a empresa é criada depois que o e-mail for confirmado e a pessoa entrar
      const { data, error } = await sb.auth.signUp({ email: f.email.value.trim(), password: f.senha.value,
        options: { emailRedirectTo: ctVolta(), data: { full_name: dados.responsavel } } });
      f.senha.value = ""; b.disabled = false;
      if (error) { ctGravar(CT_PENDENTE, null); ctNota(j, ctMsg(error), true); return; }
      if (data.session) { location.reload(); return; }   // projeto sem confirmação de e-mail: já entra
      f.innerHTML = `<p class="ct-txt"><b>Quase lá!</b> Mandamos um link de confirmação para <b>${esc(f.email?.value || "o seu e-mail")}</b>.
        Abra o link e depois entre aqui com o seu e-mail e senha: a empresa e o teste grátis são criados na hora.</p>`;
    };
  });
}

// Depois de qualquer login: aceita convites e termina um cadastro que ficou esperando a confirmação do e-mail.
// Devolve true quando criou uma empresa (o painel recarrega o contexto).
async function contaPosLogin() {
  try { await ctRpc("nexo_aceitar_convites"); } catch {}
  const pend = ctLer(CT_PENDENTE); if (!pend) return false;
  try { await ctRpc("nexo_cadastrar_empresa", { p_dados: pend }); ctGravar(CT_PENDENTE, null); return true; }
  catch (e) {
    const m = e?.message || "";
    if (/ja_tem_empresa|plano_invalido|cadastro_invalido/.test(m)) ctGravar(CT_PENDENTE, null);
    if (!/email_nao_confirmado|Could not find|does not exist/.test(m)) setTimeout(() => alert(ctMsg(e)), 300);
    return false;
  }
}

// Links "Esqueci minha senha" e "Criar conta" embaixo do formulário de login.
function contaLigarLogin(form, campoEmail) {
  if (!form || form.querySelector(".ct-links")) return;
  form.insertAdjacentHTML("beforeend", `<div class="ct-links"><button type="button" class="ct-link" data-esqueci>Esqueci minha senha</button>
    <button type="button" class="ct-link" data-criar>Criar conta com teste grátis</button></div>`);
  form.querySelector("[data-esqueci]").onclick = () => ctEsqueci(campoEmail?.value);
  form.querySelector("[data-criar]").onclick = ctCriarConta;
  // Cadastro fechado (nenhum plano público, 25/11/2026): o botão não promete "teste grátis"; quem recebeu convite continua entrando por ele.
  ctVitrine(form).then(n => { if (n === 0) { const b = form.querySelector("[data-criar]"); if (b) b.textContent = "Criar conta ou usar um convite"; ctVitrinePlanos(form); } });
  // Link do convite (?convite=email): abre direto a conta de convidado, com o e-mail preenchido.
  const conv = new URLSearchParams(location.search).get("convite");
  if (conv) setTimeout(() => ctContaConvidado(conv), 300);
}

// Planos só para OLHAR na tela de entrada do Prospect (24/11/2026, pedido do Ricardo: "os planos têm que aparecer assim também na page de login").
// O cadastro segue fechado (nenhum plano público): aqui não há "teste grátis" nem compra, só o que cada plano tem ligado e desligado, preço mensal e anual.
// Usa nexo_planos_vitrine (anônima, só dados comerciais) e os mesmos desenhos do Meu plano (mpLista, mpEconomia, mpReais, mpTemAnual em meuplano.js).
async function ctVitrinePlanos(form) {
  if (typeof EXP_PRODUTO === "undefined" || EXP_PRODUTO !== "prospect" || typeof mpLista !== "function") return;
  const tela = form.closest(".login"); if (!tela || tela.querySelector(".ct-vitrine")) return;
  let planos = [];
  try { planos = await ctRpc("nexo_planos_vitrine") || []; } catch { return; }
  if (!planos.length || tela.querySelector(".ct-vitrine")) return;
  let ciclo = "mensal";
  const sec = document.createElement("section");
  sec.className = "ct-vitrine aberta ct-info"; sec.setAttribute("aria-labelledby", "ctVitTit");
  const desenhar = () => {
    const anual = ciclo === "anual";
    const e = planos.filter(mpTemAnual).map(mpEconomia).filter(Boolean)[0];
    sec.innerHTML = `<div class="ct-v-topo"><span class="ct-v-eyebrow">Planos</span><h2 id="ctVitTit">Escolha o plano do tamanho da sua empresa</h2>
        <p>Veja o que cada plano tem. O acesso é por convite: fale com a NEXO para começar.</p></div>
      ${planos.some(mpTemAnual) ? `<div class="mp-ciclo" role="group" aria-label="Como pagar"><button type="button" data-ciclo="mensal" aria-pressed="${!anual}">Mensal</button>
        <button type="button" data-ciclo="anual" aria-pressed="${anual}">Anual${e ? ` <span class="mp-tag">${esc(e.texto)}</span>` : ""}</button></div>` : ""}
      <div class="ct-v-grade">${planos.map(p => {
        const comAnual = anual && mpTemAnual(p), eco = comAnual ? mpEconomia(p) : null;
        const [valor] = mpReais(comAnual ? p.preco_anual_centavos : p.preco_centavos).split("/");
        return `<article class="ct-v-plano"><h3>${esc(p.nome)}</h3>
          <p class="ct-v-preco"><b>${esc(valor)}</b><span>${comAnual ? "/ano" : "/mês"}</span></p>
          ${comAnual ? `<p class="mp-eq">${esc(mpReais(Math.round(p.preco_anual_centavos / 12)))}/mês${eco ? ` · <b>economize ${esc(mpReais(eco.eco))}</b> (${esc(eco.texto)})` : ""}</p>` : (anual ? `<p class="mp-eq">Só mensal</p>` : "")}
          ${p.descricao ? `<p class="ct-v-desc">${esc(p.descricao)}</p>` : ""}
          <a class="btn prim pri" href="https://www.instagram.com/nexo.rm/" target="_blank" rel="noopener">Falar com a NEXO</a>
          ${mpLista(p)}</article>`;
      }).join("")}</div>`;
    sec.querySelectorAll("[data-ciclo]").forEach(b => b.onclick = () => { ciclo = b.dataset.ciclo === "anual" ? "anual" : "mensal"; desenhar(); });
  };
  desenhar();
  const exp = tela.querySelector("#explicador");
  if (exp) exp.after(sec); else tela.appendChild(sec);
}

// Vitrine de planos na tela de entrada (pedido do Ricardo, 18/11/2026: "planos não aparecem na page do login").
// Mostra só os planos marcados "No cadastro público" no Master; sem nenhum, a vitrine não aparece.
async function ctVitrine(form) {
  const tela = form.closest(".login");
  if (!tela || tela.querySelector(".ct-vitrine")) return -1;
  let planos = [];
  try { planos = await ctRpc("nexo_planos_publicos") || []; } catch { return -1; }   // sem saber, mantém como está
  if (!planos.length) return 0;
  if (tela.querySelector(".ct-vitrine")) return -1;
  const dias = Math.min(...planos.map(p => Number(p.dias_teste) || 0));
  const sec = document.createElement("section");
  sec.className = "ct-vitrine"; sec.setAttribute("aria-labelledby", "ctVitTit");
  // 18/11/2026, Ricardo: a entrada mostra só "3 dias grátis"; o clique abre a aba dos planos.
  const chamada = dias ? `Teste ${pl(dias, "dia", "dias")} grátis` : "Ver os planos";
  sec.innerHTML = `<div class="ct-v-topo"><span class="ct-v-eyebrow">Sem cartão</span>
      <h2 id="ctVitTit">Ainda não tem conta?</h2>
      <p>Você escolhe o plano, testa e decide depois.</p></div>
    <button type="button" class="btn prim pri ct-v-abrir" aria-expanded="false" aria-controls="ctVitGrade">${esc(chamada)} <span aria-hidden="true">→</span></button>
    <div class="ct-v-grade" id="ctVitGrade" hidden>${planos.map(p => {
      const [valor, mes] = ctReais(p.preco_centavos).split("/");
      return `<article class="ct-v-plano"><h3>${esc(p.nome)}</h3>
        <p class="ct-v-preco"><b>${esc(valor)}</b>${mes ? `<span>/${esc(mes)}</span>` : ""}</p>
        ${p.descricao ? `<p class="ct-v-desc">${esc(p.descricao)}</p>` : ""}
        <p class="ct-v-teste">${esc(pl(p.dias_teste, "dia grátis", "dias grátis"))}</p>
        <button type="button" class="btn prim pri" data-plano="${esc(p.chave)}">Começar teste grátis</button></article>`;
    }).join("")}</div>`;
  const exp = tela.querySelector("#explicador");
  if (exp) exp.after(sec); else tela.appendChild(sec);
  sec.querySelectorAll("[data-plano]").forEach(b => b.onclick = () => ctCriarConta(b.dataset.plano));
  const abrir = sec.querySelector(".ct-v-abrir"), grade = sec.querySelector(".ct-v-grade");
  abrir.onclick = () => {
    grade.hidden = false; abrir.hidden = true; abrir.setAttribute("aria-expanded", "true");
    sec.classList.add("aberta");
    sec.scrollIntoView({ block: "start" });
    grade.querySelector("[data-plano]")?.focus({ preventScroll: true });
  };
  return planos.length;
}

// Mensagem pronta do convite, com o link que abre a conta de convidado.
function ctTextoConvite(email, nomeEmpresa) {
  const link = `${ctVolta()}?convite=${encodeURIComponent(email)}`;
  return { link, texto: `Olá! Você foi convidado para a equipe ${nomeEmpresa || "da empresa"} no NEXO.\n\n` +
    `1. Abra o link: ${link}\n2. Crie a sua conta com este e-mail: ${email}\n3. Confirme pelo e-mail que vai chegar e entre: o acesso já aparece.` };
}
// Volta do e-mail de "esqueci minha senha": o Supabase avisa PASSWORD_RECOVERY.
if (typeof sb !== "undefined" && sb) sb.auth.onAuthStateChange(ev => { if (ev === "PASSWORD_RECOVERY") setTimeout(ctNovaSenha, 200); });

// ---------------------------------------------------------------- equipe da empresa (Master, dono ou admin)
const CT_PAPEL = { dono: "Dono", admin: "Administrador", editor: "Editor", leitor: "Leitor" };
async function abrirEquipe(empresaId, nomeEmpresa) {
  let d;
  try { d = await ctRpc("nexo_membros", { p_empresa: empresaId }); }
  catch (e) { alert(/Could not find|does not exist/.test(e.message || "") ? "A equipe precisa da migração da Etapa 5 no banco." : ctMsg(e)); return; }
  const usados = d.membros.length + d.convites.length, lim = d.limite_usuarios;
  ctJanela(`Equipe · ${nomeEmpresa || "empresa"}`, `
    <p class="ct-txt">${usados} de ${lim ?? "∞"} usuários do plano. Quem já tem conta entra na hora; quem não tem recebe o acesso ao criar a conta com o mesmo e-mail.</p>
    <div class="ct-lista">${d.membros.map(m => `<div class="ct-membro"><div><b>${esc(m.email)}</b><small>${esc(CT_PAPEL[m.papel] || m.papel)}</small></div>
        ${m.papel === "dono" ? "" : `<button class="btn nao" type="button" data-tirar="${esc(m.user_id)}">Tirar acesso</button>`}</div>`).join("")}
      ${d.convites.map(c => { const t = ctTextoConvite(c.email, nomeEmpresa); return `<div class="ct-membro ct-pend"><div><b>${esc(c.email)}</b><small>${esc(CT_PAPEL[c.papel] || c.papel)} · convite esperando a pessoa criar a conta. O NEXO não manda e-mail sozinho: envie o convite abaixo.</small>
          <div class="ct-envio"><a class="btn" target="_blank" rel="noopener" href="https://wa.me/?text=${encodeURIComponent(t.texto)}">WhatsApp</a>
            <a class="btn" href="mailto:${esc(c.email)}?subject=${encodeURIComponent("Convite para a equipe " + (nomeEmpresa || "") + " no NEXO")}&body=${encodeURIComponent(t.texto)}">E-mail</a>
            <button class="btn" type="button" data-copiar-convite="${esc(c.email)}">Copiar</button></div></div>
        <button class="btn" type="button" data-cancelar="${esc(c.id)}">Cancelar convite</button></div>`; }).join("")}</div>
    <form class="ct-form ct-convite" data-f><div class="ct-duas"><label class="ct-campo"><span>Convidar por e-mail</span><input type="email" name="email" required placeholder="nome@empresa.com"></label>
      <label class="ct-campo"><span>Papel</span><select name="papel"><option value="editor">Editor (trabalha no dia a dia)</option><option value="leitor">Leitor (só vê)</option><option value="admin">Administrador</option></select></label></div>
      <button class="btn prim pri" type="submit">Convidar</button><p class="ct-nota" data-nota></p></form>`, (j) => {
    const refazer = () => abrirEquipe(empresaId, nomeEmpresa);
    j.querySelector("[data-f]").onsubmit = async ev => {
      ev.preventDefault(); const f = ev.target, b = f.querySelector("[type=submit]"); b.disabled = true;
      try { const r = await ctRpc("nexo_convidar", { p_empresa: empresaId, p_email: f.email.value.trim(), p_papel: f.papel.value });
        refazer(); setTimeout(() => alert(r.situacao === "incluido" ? "Pronto: essa pessoa já tem acesso."
          : "Convite criado. O NEXO não manda e-mail sozinho: use os botões WhatsApp, E-mail ou Copiar ao lado do convite para avisar a pessoa."), 100); }
      catch (e) { b.disabled = false; ctNota(j, ctMsg(e), true); }
    };
    j.querySelectorAll("[data-tirar]").forEach(b => b.onclick = async () => {
      if (!confirm("Tirar o acesso dessa pessoa a esta empresa?")) return;
      try { await ctRpc("nexo_remover_acesso", { p_empresa: empresaId, p_user: b.dataset.tirar, p_convite: null }); refazer(); } catch (e) { ctNota(j, ctMsg(e), true); }
    });
    j.querySelectorAll("[data-copiar-convite]").forEach(b => b.onclick = async () => {
      const { texto } = ctTextoConvite(b.dataset.copiarConvite, nomeEmpresa);
      try { await navigator.clipboard.writeText(texto); b.textContent = "✓ Copiado"; }
      catch { ctNota(j, "O navegador bloqueou a cópia. Use os botões WhatsApp ou E-mail.", true); }
      setTimeout(() => { b.textContent = "Copiar"; }, 2500);
    });
    j.querySelectorAll("[data-cancelar]").forEach(b => b.onclick = async () => {
      try { await ctRpc("nexo_remover_acesso", { p_empresa: empresaId, p_user: null, p_convite: b.dataset.cancelar }); refazer(); } catch (e) { ctNota(j, ctMsg(e), true); }
    });
  });
}
