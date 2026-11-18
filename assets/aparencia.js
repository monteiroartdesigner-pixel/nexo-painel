"use strict";
// ============================================================================
// APARÊNCIA · modo de cor, cor de destaque e logo do painel.
// Clique na logo do canto superior esquerdo para abrir.
// * Modo e cor ficam salvos neste aparelho (preferência de tela).
// * A logo vai para o banco (nexo_salvar_logo_painel) e vale em qualquer aparelho;
//   se a função ainda não existir no banco, fica salva só neste aparelho.
// Carregado antes do script principal: só usa st, rpc e aviso na hora do clique.
// ============================================================================

// Cada área informa o seu contexto em window.AP_CTX = { agente(), logo(), guardarLogo(v), aviso(msg) }.
// Sem AP_CTX, usa o do NEXO System (st, aviso).
const AP_BASE = (document.currentScript && document.currentScript.src || "").replace(/aparencia\.js.*$/, "") || "assets/";
const apCtx = () => window.AP_CTX || {
  agente: () => (typeof st !== "undefined" ? st.agente : null),
  logo: () => (typeof st !== "undefined" ? st.resumo?.identidade?.logo_painel : null),
  guardarLogo: v => { if (typeof st !== "undefined" && st.resumo) st.resumo.identidade = { ...(st.resumo.identidade || {}), logo_painel: v }; },
  aviso: m => aviso(m),
};
const AP_CORES = [["Ouro", "#f2b632"], ["Laranja", "#F2A623"], ["Coral", "#ff7a59"], ["Rosa", "#EC4899"], ["Roxo", "#8b5cf6"], ["Azul", "#2B8CEB"], ["Turquesa", "#14B8A6"], ["Verde", "#22a06b"]];
const AP_LOGOS = [["NEXO", AP_BASE + "nexo-marca.webp"], ["NEXO Marketing", AP_BASE + "nexo-marketing-rosto.webp"]];
const apLer = k => { try { return localStorage.getItem(k); } catch { return null; } };
const apGravar = (k, v) => { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, v); } catch {} };

// Texto legível sobre a cor de destaque: escuro em cores claras, branco em cores fortes.
function apTextoSobre(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex || ""); if (!m) return "#1a1200";
  const n = parseInt(m[1], 16), c = [n >> 16, (n >> 8) & 255, n & 255].map(v => { v /= 255; return v <= .03928 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4; });
  return (.2126 * c[0] + .7152 * c[1] + .0722 * c[2]) > .3 ? "#1a1200" : "#ffffff";
}
const AP_FUNDO = { escuro: "#0A0B0E", claro: "#F3F4F7", cafe: "#F6EFE2" };
function aplicarTema() {
  const tema = AP_FUNDO[apLer("nexo.tema")] ? apLer("nexo.tema") : "escuro", cor = apLer("nexo.cor");
  const r = document.documentElement;
  r.dataset.tema = tema;
  if (cor) r.style.setProperty("--onca", cor); else r.style.removeProperty("--onca");
  r.style.setProperty("--onca-txt", apTextoSobre(cor || "#f2b632"));
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", AP_FUNDO[tema]);
}
aplicarTema();   // antes de desenhar, para não piscar

function logoAtual() {
  const c = apCtx(), ag = c.agente();
  return c.logo() || (ag ? apLer("nexo.logo." + ag) : null) || AP_BASE + "nexo-marca.webp";
}
function aplicarLogo() { document.querySelectorAll("[data-logo-painel]").forEach(img => { img.src = logoAtual(); }); }

// Reduz qualquer imagem para um quadrado de 256 px (cabe no banco e carrega rápido).
function apReduzir(src) {
  return new Promise((ok, falha) => {
    const img = new Image();
    img.onload = () => {
      const c = document.createElement("canvas"), lado = 256, m = Math.min(img.naturalWidth, img.naturalHeight);
      c.width = c.height = lado;
      const g = c.getContext("2d"); g.fillStyle = "#fff"; g.fillRect(0, 0, lado, lado);
      g.drawImage(img, (img.naturalWidth - m) / 2, (img.naturalHeight - m) / 2, m, m, 0, 0, lado, lado);
      let url = c.toDataURL("image/webp", 0.86);
      if (!url.startsWith("data:image/webp")) url = c.toDataURL("image/png");
      ok(url);
    };
    img.onerror = () => falha(new Error("Não deu para ler essa imagem."));
    img.src = src;
  });
}

async function apSalvarLogo(dataUrl) {
  // dataUrl null = voltar para a logo NEXO
  try {
    const c = apCtx();
    await rpc("nexo_salvar_logo_painel", { p_agente: c.agente(), p_logo: dataUrl });
    c.guardarLogo(dataUrl);
    apGravar("nexo.logo." + c.agente(), null);
    return "banco";
  } catch (e) {
    const m = (e && e.message) || "";
    if (/sem_permissao/.test(m)) throw new Error("Seu papel não permite trocar a logo.");
    if (/logo_invalida/.test(m)) throw new Error("Use uma imagem PNG, JPG ou WEBP.");
    apGravar("nexo.logo." + apCtx().agente(), dataUrl);   // função ainda não existe no banco: guarda neste aparelho
    return "aparelho";
  }
}

function abrirAparencia() {
  document.querySelector(".ap-fundo")?.remove();
  const temaAtual = apLer("nexo.tema") || "escuro", corAtual = apLer("nexo.cor") || "#f2b632";
  let escolha = null;   // nova logo (data URL) ainda não salva
  const fundo = document.createElement("div"); fundo.className = "ap-fundo";
  fundo.innerHTML = `<div class="ap" role="dialog" aria-modal="true" aria-label="Cores e logo">
    <div class="linha entre"><h2 style="margin:0">Cores e logo</h2><button class="btn" data-fechar aria-label="Fechar">✕</button></div>
    <section><h3>Modo de cor</h3>
      <div class="ap-modos">
        <button type="button" class="ap-modo" data-tema="escuro" aria-pressed="${temaAtual === "escuro"}"><span class="amostra" style="background:#0A0B0E"><i style="background:#13151B"></i><i style="background:#1A1D25"></i><i style="background:${corAtual}"></i></span>Escuro</button>
        <button type="button" class="ap-modo" data-tema="claro" aria-pressed="${temaAtual === "claro"}"><span class="amostra" style="background:#F3F4F7;box-shadow:inset 0 0 0 1px rgba(15,23,42,.12)"><i style="background:#fff;box-shadow:inset 0 0 0 1px rgba(15,23,42,.12)"></i><i style="background:#E5E7EB"></i><i style="background:${corAtual}"></i></span>Claro</button>
        <button type="button" class="ap-modo" data-tema="cafe" aria-pressed="${temaAtual === "cafe"}"><span class="amostra" style="background:#F6EFE2;box-shadow:inset 0 0 0 2px #16224D"><i style="background:#fff;box-shadow:inset 0 0 0 2px #16224D"></i><i style="background:#16224D"></i><i style="background:${corAtual}"></i></span>Claro · Café</button>
      </div></section>
    <section><h3>Cor de destaque</h3>
      <div class="ap-cores">${AP_CORES.map(([n, c]) => `<button type="button" class="ap-cor" data-cor="${c}" style="background:${c}" title="${n}" aria-label="${n}" aria-pressed="${c.toLowerCase() === corAtual.toLowerCase()}"></button>`).join("")}</div>
      <p class="ap-nota">Modo e cor valem neste aparelho. Cada pessoa escolhe o seu.</p></section>
    <section><h3>Sua logo</h3>
      <div class="ap-logo"><img class="previa" id="apPrevia" src="${logoAtual()}" alt="Prévia da logo">
        <div class="stack" style="display:flex;flex-direction:column;gap:8px">
          <label class="btn" style="text-align:center">Enviar imagem<input type="file" id="apArquivo" accept="image/png,image/jpeg,image/webp" hidden></label>
          <div class="ap-opcoes">${AP_LOGOS.map(([n, u]) => `<button type="button" class="ap-pre" data-pre="${u}" title="${n}" aria-label="Usar ${n}"><img src="${u}" alt=""></button>`).join("")}</div>
        </div></div>
      <div class="linha" style="margin-top:10px"><button class="btn prim" id="apSalvar" disabled>Salvar logo</button><button class="btn" id="apPadrao">Voltar para a logo NEXO</button></div>
      <p class="ap-nota" id="apNota">Imagem quadrada fica melhor. Ela é reduzida para 256 × 256 antes de salvar.</p></section>
  </div>`;
  const $a = s => fundo.querySelector(s), previa = $a("#apPrevia"), salvar = $a("#apSalvar"), nota = $a("#apNota");
  const fechar = () => { fundo.remove(); document.removeEventListener("keydown", teclas); document.getElementById("btnMarca")?.focus(); };
  const teclas = ev => { if (ev.key === "Escape") fechar(); };
  const escolher = async src => {
    try { escolha = await apReduzir(src); previa.src = escolha; salvar.disabled = false; nota.textContent = "Prévia pronta. Toque em Salvar logo."; }
    catch (e) { nota.textContent = e.message; }
  };
  fundo.onclick = ev => { if (ev.target === fundo) fechar(); };
  $a("[data-fechar]").onclick = fechar;
  $a("#apArquivo").onchange = ev => {
    const f = ev.target.files?.[0]; if (!f) return;
    if (f.size > 8 * 1024 * 1024) { nota.textContent = "Imagem muito grande (máximo 8 MB)."; return; }
    const leitor = new FileReader(); leitor.onload = () => escolher(leitor.result); leitor.readAsDataURL(f);
  };
  fundo.querySelectorAll("[data-pre]").forEach(b => b.onclick = () => {
    fundo.querySelectorAll("[data-pre]").forEach(x => x.setAttribute("aria-pressed", x === b)); escolher(b.dataset.pre);
  });
  salvar.onclick = async () => {
    salvar.disabled = true;
    try { const onde = await apSalvarLogo(escolha); aplicarLogo();
      apCtx().aviso(onde === "banco" ? "Logo salva. Ela aparece em qualquer aparelho." : "Logo salva neste aparelho. Para valer em todos, falta aplicar a migração da logo no banco.");
      fechar();
    } catch (e) { salvar.disabled = false; nota.textContent = e.message; }
  };
  $a("#apPadrao").onclick = async () => {
    try { await apSalvarLogo(null); aplicarLogo(); previa.src = logoAtual(); escolha = null; salvar.disabled = true; apCtx().aviso("Voltou para a logo NEXO."); }
    catch (e) { nota.textContent = e.message; }
  };
  fundo.querySelectorAll("[data-tema]").forEach(b => b.onclick = () => {
    apGravar("nexo.tema", b.dataset.tema); aplicarTema();
    fundo.querySelectorAll("[data-tema]").forEach(x => x.setAttribute("aria-pressed", x === b));
  });
  fundo.querySelectorAll("[data-cor]").forEach(b => b.onclick = () => {
    apGravar("nexo.cor", b.dataset.cor); aplicarTema();
    fundo.querySelectorAll("[data-cor]").forEach(x => x.setAttribute("aria-pressed", x === b));
    fundo.querySelectorAll(".ap-modo .amostra i:last-child").forEach(i => i.style.background = b.dataset.cor);
  });
  document.addEventListener("keydown", teclas);
  document.body.appendChild(fundo);
  $a("[data-fechar]").focus();
}

// Botão de paleta ao lado da logo: abre a mesma janela (cores primeiro, logo depois).
const AP_ICONE = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3a9 9 0 1 0 0 18c1.1 0 1.6-.8 1.6-1.6 0-.5-.2-.9-.5-1.2-.3-.3-.5-.7-.5-1.2 0-.9.7-1.6 1.6-1.6H16a5 5 0 0 0 5-5C21 6.5 17 3 12 3z"/><circle cx="7.5" cy="11" r="1.2"/><circle cx="10.5" cy="7" r="1.2"/><circle cx="15" cy="7.5" r="1.2"/></svg>';
function apBotoesPaleta() {
  document.querySelectorAll(".plat-marca.botao").forEach(marca => {
    if (marca.dataset.paleta) return; marca.dataset.paleta = "1";
    const b = document.createElement("button");
    b.type = "button"; b.className = "ap-rapido"; b.title = "Trocar cor"; b.setAttribute("aria-label", "Trocar cor"); b.innerHTML = AP_ICONE;
    b.addEventListener("click", abrirAparencia);
    const pai = marca.parentElement;
    if (pai && (pai.classList.contains("topo-m") || pai.classList.contains("l1"))) { marca.after(b); return; }
    const linha = document.createElement("div"); linha.className = "ap-linha";
    marca.before(linha); linha.append(marca, b);
  });
}
if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", apBotoesPaleta); else apBotoesPaleta();

// Assinatura "Desenvolvido por NEXO | Gestão e Sistemas": sempre na base da tela (painéis e login).
function apAssinatura() {
  const html = `<a class="assinatura-nexo" href="https://www.instagram.com/nexo.rm/" target="_blank" rel="noopener" aria-label="Desenvolvido por NEXO, Gestão e Sistemas. Abre o Instagram da NEXO em nova aba">
    <img src="${AP_BASE}nexo-assinatura.webp" alt="" width="900" height="148" loading="lazy" decoding="async"></a>`;   // arte original do Ricardo (19/11/2026)
  ["#telaApp", "#telaLogin"].forEach(sel => {
    const alvo = document.querySelector(sel);
    if (alvo && !alvo.querySelector(":scope > .assinatura-nexo")) alvo.insertAdjacentHTML("beforeend", html +
      `<nav class="legal-links" aria-label="Documentos"><a href="${AP_BASE}../privacidade.html">Privacidade</a><span aria-hidden="true">·</span><a href="${AP_BASE}../termos.html">Termos de Uso</a></nav>`);
  });
}
if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", apAssinatura); else apAssinatura();
