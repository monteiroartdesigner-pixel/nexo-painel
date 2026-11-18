"use strict";
// ============================================================================
// ANEXOS de Pedir peça (prévia aprovada pelo Ricardo em 19/11/2026: "Aprovo, monta").
// Fotos e vídeos sobem direto para o armazenamento privado "nexo-anexos", na pasta
// <empresa>/<agente>/, e depois o pedido liga os arquivos (nexo_anexar_ideia).
// Foto: aberta no aparelho, reduzida até 2048 px e salva em JPEG. Isso comprime e também
// apaga os dados escondidos da foto, inclusive a localização (GPS).
// Vídeo: MP4 ou MOV até 50 MB (o teto por arquivo do plano do Supabase).
// Usa st, sb, SUPABASE_URL, SUPABASE_KEY, rpc, esc, aviso, $ e $$ do painel.
// ============================================================================

const AX_BUCKET = "nexo-anexos";
const AX_LIM = { qtd: 10, foto: 25 * 1024 * 1024, video: 50 * 1024 * 1024, lado: 2048 };
const AX_FOTO = /^image\/(jpeg|png|webp|heic|heif)$/i, AX_VIDEO = /^video\/(mp4|quicktime)$/i;
let axLista = [], axSeq = 0, axAoMudar = null;

const axTipo = f => {
  const ext = (f.name.split(".").pop() || "").toLowerCase();
  if (AX_FOTO.test(f.type) || ["jpg", "jpeg", "png", "webp", "heic", "heif"].includes(ext)) return "foto";
  if (AX_VIDEO.test(f.type) || ["mp4", "mov"].includes(ext)) return "video";
  return null;
};
const axTam = n => n < 1048576 ? Math.max(1, Math.round(n / 1024)) + " KB" : (n / 1048576).toLocaleString("pt-BR", { maximumFractionDigits: 1 }) + " MB";
const axUuid = () => (crypto.randomUUID ? crypto.randomUUID() : "10000000-1000-4000-8000-100000000000".replace(/[018]/g, c =>
  (c ^ crypto.getRandomValues(new Uint8Array(1))[0] & 15 >> c / 4).toString(16)));
const axSubindo = () => axLista.some(a => !a.erro && !a.caminhoOk);
const axProntos = () => axLista.filter(a => a.caminhoOk);

// Foto -> JPEG de até 2048 px (sem os dados da câmera, sem GPS).
async function axConverter(f) {
  const bmp = await createImageBitmap(f);
  const k = Math.min(1, AX_LIM.lado / Math.max(bmp.width, bmp.height));
  const c = document.createElement("canvas"); c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k);
  c.getContext("2d").drawImage(bmp, 0, 0, c.width, c.height); bmp.close?.();
  return await new Promise((ok, falha) => c.toBlob(b => b ? ok(b) : falha(new Error("conversão")), "image/jpeg", 0.85));
}

// Envio com barra de progresso (o fetch não informa o andamento do envio).
async function axEnviar(a) {
  const sessao = sb ? (await sb.auth.getSession()).data.session : null;
  if (!sessao) throw new Error("Entre de novo no painel para enviar arquivos.");
  return new Promise((ok, falha) => {
    const x = new XMLHttpRequest(); a.xhr = x;
    x.open("POST", `${SUPABASE_URL}/storage/v1/object/${AX_BUCKET}/${a.caminho}`);
    x.setRequestHeader("Authorization", "Bearer " + sessao.access_token);
    x.setRequestHeader("apikey", SUPABASE_KEY);
    x.setRequestHeader("Content-Type", a.mime);
    x.setRequestHeader("x-upsert", "false");
    x.upload.onprogress = e => { if (e.lengthComputable) { a.prog = Math.min(99, e.loaded / e.total * 100); axPintarItem(a); } };
    x.onload = () => {
      if (x.status >= 200 && x.status < 300) return ok();
      const t = x.responseText || "";
      falha(new Error(/bucket not found|not found/i.test(t) ? "O armazenamento de anexos ainda não foi criado (migração 20261119200000)."
        : /payload too large|exceeded|413/i.test(t + x.status) ? "Arquivo acima do limite de 50 MB."
        : /row-level security|unauthorized|403/i.test(t + x.status) ? "Seu papel não permite enviar arquivos." : "Não deu para enviar agora. Tente de novo."));
    };
    x.onerror = () => falha(new Error("Sem conexão. Tente de novo."));
    x.onabort = () => falha(new Error("cancelado"));
    x.send(a.blob);
  });
}

async function axAdicionar(arquivos) {
  const erros = [];
  for (const f of arquivos) {
    const tipo = axTipo(f);
    if (!tipo) { erros.push(`${f.name}: só fotos (JPG, PNG, WebP, HEIC) e vídeos (MP4, MOV)`); continue; }
    if (axLista.length >= AX_LIM.qtd) { erros.push(`Até ${AX_LIM.qtd} arquivos por pedido`); break; }
    if (f.size > (tipo === "foto" ? AX_LIM.foto : AX_LIM.video)) { erros.push(`${f.name}: ${axTam(f.size)}, acima do limite`); continue; }
    const a = { id: ++axSeq, nome: f.name, tipo, tam: f.size, prog: 0, legenda: "", url: null, erro: "", caminhoOk: false };
    axLista.push(a);
    axDesenhar();
    try {
      if (tipo === "foto") {
        try { a.blob = await axConverter(f); } catch { throw new Error("Não deu para abrir esta foto. No iPhone, escolha pela galeria (ela vira JPG)."); }
        a.mime = "image/jpeg"; a.ext = "jpg"; a.tam = a.blob.size;
      } else { a.blob = f; a.mime = /quicktime|\.mov$/i.test(f.type + f.name) ? "video/quicktime" : "video/mp4"; a.ext = a.mime === "video/mp4" ? "mp4" : "mov"; }
      if (!axLista.includes(a)) continue;   // removido enquanto convertia
      a.url = URL.createObjectURL(a.blob);
      a.caminho = `${st.empresaId}/${st.agente}/${axUuid()}.${a.ext}`;
      axDesenhar();
      await axEnviar(a);
      a.prog = 100; a.caminhoOk = true;
    } catch (e) {
      if (e.message !== "cancelado") a.erro = e.message || "Falhou.";
    }
    axDesenhar();
  }
  const caixa = $("#axErro"); if (caixa) caixa.textContent = erros.join(" · ");
}

async function axRemover(id) {
  const a = axLista.find(x => x.id === id); if (!a) return;
  axLista = axLista.filter(x => x !== a);
  try { a.xhr?.abort(); } catch {}
  if (a.url) URL.revokeObjectURL(a.url);
  if (a.caminhoOk && sb) sb.storage.from(AX_BUCKET).remove([a.caminho]).catch(() => {});
  axDesenhar();
}

function axPintarItem(a) {
  const el = document.querySelector(`.ax-item[data-ax="${a.id}"]`); if (!el) return;
  el.querySelector(".ax-barra i").style.width = (a.caminhoOk ? 100 : a.prog) + "%";
  el.querySelector(".ax-nome").textContent = a.erro ? a.erro : (a.caminhoOk ? "Enviado" : a.url ? `Enviando ${Math.round(a.prog)}%` : "Preparando…") + " · " + axTam(a.tam);
}

function axDesenhar() {
  const grade = $("#axGrade"); if (!grade) return;
  grade.innerHTML = axLista.map(a => `
    <div class="ax-item ${a.caminhoOk ? "pronto" : ""} ${a.erro ? "falhou" : ""}" data-ax="${a.id}">
      <div class="ax-mini">${!a.url ? `<span class="muted peq">${a.tipo === "foto" ? "Preparando foto…" : "Vídeo"}</span>`
        : a.tipo === "foto" ? `<img src="${a.url}" alt="">` : `<video src="${a.url}" muted playsinline preload="metadata"></video>`}
        <span class="ax-tag">${a.tipo === "foto" ? "FOTO" : "VÍDEO"}</span>
        <button type="button" class="ax-x" data-ax-rem="${a.id}" aria-label="Remover ${esc(a.nome)}">×</button></div>
      <div class="ax-barra"><i style="width:${a.caminhoOk ? 100 : a.prog}%"></i></div>
      <div class="ax-info"><span class="ax-nome"></span>
        <input type="text" id="axLeg${a.id}" maxlength="120" placeholder="Legenda (opcional)" value="${esc(a.legenda)}" ${a.erro ? "disabled" : ""}></div>
    </div>`).join("");
  axLista.forEach(axPintarItem);
  $$("[data-ax-rem]", grade).forEach(b => b.onclick = () => axRemover(Number(b.dataset.axRem)));
  $$(".ax-item input", grade).forEach(i => i.oninput = () => { const a = axLista.find(x => "axLeg" + x.id === i.id); if (a) a.legenda = i.value; });
  const ok = axLista.filter(a => !a.erro), fotos = ok.filter(a => a.tipo === "foto").length, videos = ok.length - fotos;
  const partes = [fotos && `${fotos} ${fotos > 1 ? "fotos" : "foto"}`, videos && `${videos} ${videos > 1 ? "vídeos" : "vídeo"}`].filter(Boolean);
  const fala = $("#axFala");
  if (fala) {
    fala.hidden = !partes.length;
    $("#axFalaTxt").innerHTML = !partes.length ? "" : axSubindo() ? `<b>Rabisco</b> está recebendo ${partes.join(" e ")}…`
      : `<b>Rabisco</b> recebeu ${partes.join(" e ")}. Vou usar como base da arte.`;
  }
  axAoMudar?.(axSubindo());
}

// HTML do bloco (vai logo abaixo de "O que você quer?").
function anexosHtml(pode) {
  if (!pode) return "";
  return `<div class="campo ax">
    <span>Anexar fotos e vídeos</span>
    <div class="ax-zona" id="axZona" tabindex="0" role="button" aria-label="Escolher fotos e vídeos ou arrastar para cá">
      <svg viewBox="0 0 24 24" width="38" height="38" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="3"/><circle cx="9" cy="10" r="1.8"/><path d="M4 17l5-5 4 4 3-3 4 4"/></svg>
      <b>Arraste as fotos e vídeos para cá</b>
      <span class="muted peq">ou <u>escolha os arquivos</u> · no celular abre a câmera ou a galeria · também dá para colar (Ctrl+V)</span>
      <span class="muted peq">Fotos JPG, PNG, WebP ou HEIC · vídeos MP4 ou MOV até 50 MB · até 10 por pedido</span>
    </div>
    <input type="file" id="axArq" accept="image/*,.heic,.heif,video/mp4,video/quicktime,.mov" multiple hidden>
    <div class="ax-erro" id="axErro" role="alert"></div>
    <div class="ax-grade" id="axGrade"></div>
    <div class="ax-fala" id="axFala" hidden><img src="assets/equipe/rabisco-rosto.webp" alt=""><span id="axFalaTxt"></span></div>
  </div>`;
}

// Liga os eventos. aoMudar(subindo) avisa a tela para travar o "Pedir à equipe".
function anexosMontar(el, aoMudar) {
  axAoMudar = aoMudar;
  const zona = $("#axZona", el), input = $("#axArq", el);
  if (!zona) return;
  zona.onclick = () => input.click();
  zona.onkeydown = e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); input.click(); } };
  input.onchange = () => { axAdicionar([...input.files]); input.value = ""; };
  ["dragenter", "dragover"].forEach(t => zona.addEventListener(t, e => { e.preventDefault(); zona.classList.add("sobre"); }));
  ["dragleave", "drop"].forEach(t => zona.addEventListener(t, e => { e.preventDefault(); zona.classList.remove("sobre"); }));
  zona.addEventListener("drop", e => axAdicionar([...(e.dataTransfer?.files || [])]));
  axDesenhar();
}
document.addEventListener("paste", e => {
  if (!document.getElementById("axZona")) return;
  const fs = [...(e.clipboardData?.files || [])]; if (fs.length) { e.preventDefault(); axAdicionar(fs); }
});

const anexosTem = () => axProntos().length > 0;

// Depois que o pedido existe: liga os arquivos enviados a ele e limpa a lista.
async function anexosLigar(pedidoId) {
  const prontos = axProntos(); if (!prontos.length) return 0;
  await rpc("nexo_anexar_ideia", { p_pedido: pedidoId, p_anexos: prontos.map(a => ({ caminho: a.caminho, legenda: (a.legenda || "").trim() || null })) });
  axLista.forEach(a => a.url && URL.revokeObjectURL(a.url)); axLista = [];
  return prontos.length;
}

// Miniaturas dos anexos de um pedido (o endereço assinado vem depois, em anexosAssinar).
function anexosTiras(p) {
  const xs = p.anexos || []; if (!xs.length) return "";
  return `<div class="ax-tiras">${xs.map(x => `<figure class="${(p.pecas || []).some(c => c.anexo_base === x.id) ? "base" : ""}">
    ${x.tipo === "foto" ? `<img data-ax-cam="${esc(x.caminho)}" alt="">` : `<span class="ax-vid">VÍDEO</span>`}
    <figcaption>${x.legenda ? esc(x.legenda) : (x.tipo === "foto" ? "Foto " : "Vídeo ") + x.ordem}</figcaption></figure>`).join("")}</div>`;
}
function anexosBase(p, c) {
  const x = (p.anexos || []).find(a => a.id === c.anexo_base); if (!x) return "";
  return `<div class="ax-origem"><img data-ax-cam="${esc(x.caminho)}" alt=""><span>Feita a partir da <b>${x.tipo === "foto" ? "foto" : "vídeo"} ${x.ordem}</b>${x.legenda ? `: "${esc(x.legenda)}"` : ""}</span></div>`;
}
// Endereços com validade de 1 hora: só a equipe da empresa consegue abrir.
async function anexosAssinar(el) {
  const imgs = $$("img[data-ax-cam]", el); if (!imgs.length || !sb) return;
  const caminhos = [...new Set(imgs.map(i => i.dataset.axCam))];
  try {
    const { data } = await sb.storage.from(AX_BUCKET).createSignedUrls(caminhos, 3600);
    const mapa = new Map((Array.isArray(data) ? data : []).filter(d => d && d.signedUrl).map(d => [d.path, d.signedUrl]));
    imgs.forEach(i => { const u = mapa.get(i.dataset.axCam); if (u) i.src = u; });
  } catch {}
}
