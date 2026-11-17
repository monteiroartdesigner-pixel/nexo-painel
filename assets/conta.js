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

// ---------------------------------------------------------------- criar conta com teste grátis
async function ctCriarConta() {
  let planos = [];
  try { planos = await ctRpc("nexo_planos_publicos") || []; } catch { planos = []; }
  if (!planos.length) {
    ctJanela("Criar conta", `<p class="ct-txt">O cadastro com teste grátis ainda não está aberto. Fale com a NEXO para começar.</p>
      <a class="btn prim pri" href="https://ig.me/m/nexo.rm" target="_blank" rel="noopener">Falar com a NEXO</a>`);
    return;
  }
  ctJanela("Teste grátis do NEXO", `<form class="ct-form" data-f>
      <p class="ct-txt">Crie a conta da sua empresa. Sem cartão: o teste começa agora e você decide depois.</p>
      <fieldset class="ct-planos"><legend>Plano</legend>${planos.map((p, i) => `<label class="ct-plano"><input type="radio" name="plano" value="${esc(p.chave)}" ${i === 0 ? "checked" : ""}>
        <span><b>${esc(p.nome)}</b><small>${esc(p.descricao || "")}</small><small>${p.dias_teste} dia(s) grátis · depois ${esc(ctReais(p.preco_centavos))}</small></span></label>`).join("")}</fieldset>
      <div class="ct-duas"><label class="ct-campo"><span>Seu nome</span><input name="responsavel" autocomplete="name" required maxlength="120"></label>
        <label class="ct-campo"><span>Nome da empresa</span><input name="empresa" autocomplete="organization" required maxlength="120"></label></div>
      <div class="ct-duas"><label class="ct-campo"><span>WhatsApp</span><input name="whatsapp" inputmode="tel" autocomplete="tel" maxlength="20"></label>
        <label class="ct-campo"><span>E-mail</span><input type="email" name="email" autocomplete="username" required></label></div>
      <label class="ct-campo"><span>Senha (mínimo 8 caracteres)</span><input type="password" name="senha" autocomplete="new-password" minlength="8" required></label>
      <button class="btn prim pri" type="submit">Criar conta e começar o teste</button><p class="ct-nota" data-nota></p></form>`, (j) => {
    const f = j.querySelector("[data-f]");
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
    <p class="ct-txt">${usados} de ${lim ?? "∞"} usuário(s) do plano. Quem já tem conta entra na hora; quem não tem recebe o acesso ao criar a conta com o mesmo e-mail.</p>
    <div class="ct-lista">${d.membros.map(m => `<div class="ct-membro"><div><b>${esc(m.email)}</b><small>${esc(CT_PAPEL[m.papel] || m.papel)}</small></div>
        ${m.papel === "dono" ? "" : `<button class="btn nao" type="button" data-tirar="${esc(m.user_id)}">Tirar acesso</button>`}</div>`).join("")}
      ${d.convites.map(c => `<div class="ct-membro ct-pend"><div><b>${esc(c.email)}</b><small>${esc(CT_PAPEL[c.papel] || c.papel)} · convite esperando a pessoa criar a conta</small></div>
        <button class="btn" type="button" data-cancelar="${esc(c.id)}">Cancelar convite</button></div>`).join("")}</div>
    <form class="ct-form ct-convite" data-f><div class="ct-duas"><label class="ct-campo"><span>Convidar por e-mail</span><input type="email" name="email" required placeholder="nome@empresa.com"></label>
      <label class="ct-campo"><span>Papel</span><select name="papel"><option value="editor">Editor (trabalha no dia a dia)</option><option value="leitor">Leitor (só vê)</option><option value="admin">Administrador</option></select></label></div>
      <button class="btn prim pri" type="submit">Convidar</button><p class="ct-nota" data-nota></p></form>`, (j) => {
    const refazer = () => abrirEquipe(empresaId, nomeEmpresa);
    j.querySelector("[data-f]").onsubmit = async ev => {
      ev.preventDefault(); const f = ev.target, b = f.querySelector("[type=submit]"); b.disabled = true;
      try { const r = await ctRpc("nexo_convidar", { p_empresa: empresaId, p_email: f.email.value.trim(), p_papel: f.papel.value });
        refazer(); setTimeout(() => alert(r.situacao === "incluido" ? "Pronto: essa pessoa já tem acesso." : "Convite criado. Avise a pessoa para criar a conta com esse e-mail."), 100); }
      catch (e) { b.disabled = false; ctNota(j, ctMsg(e), true); }
    };
    j.querySelectorAll("[data-tirar]").forEach(b => b.onclick = async () => {
      if (!confirm("Tirar o acesso dessa pessoa a esta empresa?")) return;
      try { await ctRpc("nexo_remover_acesso", { p_empresa: empresaId, p_user: b.dataset.tirar, p_convite: null }); refazer(); } catch (e) { ctNota(j, ctMsg(e), true); }
    });
    j.querySelectorAll("[data-cancelar]").forEach(b => b.onclick = async () => {
      try { await ctRpc("nexo_remover_acesso", { p_empresa: empresaId, p_user: null, p_convite: b.dataset.cancelar }); refazer(); } catch (e) { ctNota(j, ctMsg(e), true); }
    });
  });
}
