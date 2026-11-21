"use strict";
// ============================================================================
// IDEIAS · você pede, a equipe (Pauta e Rabisco) cria e decide o formato.
// O pedido vai para a fila (nexo_pedir_ideias); o robô atende na rodada seguinte
// e as peças chegam em Aprovar, ligadas ao pedido, com o motivo do formato.
// Usa st, rpc, esc, aviso, msgErro, quando, podeEditar e abrirAba do painel.
// ============================================================================

const ID_FORMATO = { post: "Post", carrossel: "Carrossel", story: "Story", reel: "Reels" };
const ID_ST = { na_fila: ["Na fila", "info"], pronto: ["Pronto", "ok"], sem_resultado: ["Não deu para fazer", "warn"], cancelado: ["Cancelado", "muted"] };
const ID_ST_PECA = { rascunho: "Esperando aprovação", revisar: "Esperando aprovação", aprovado: "Aprovada", pronto: "Na fila para publicar",
  publicando: "Publicando", publicado: "Publicada", cancelado: "Cancelada", recusado: "Recusada" };
let idQtd = 3, idCache = null;
// Transcrição .srt/.vtt: tira números, horários e linhas repetidas; sobra só a fala.
function idLimparLegenda(txt) {
  const linhas = String(txt || "").replace(/\r/g, "").split("\n").map(l => l.trim())
    .filter(l => l && l !== "WEBVTT" && !/^\d+$/.test(l) && !/-->/.test(l) && !/^(NOTE|Kind:|Language:)/.test(l))
    .map(l => l.replace(/<[^>]+>/g, "").trim()).filter(Boolean);
  return linhas.filter((l, i) => l !== linhas[i - 1]).join(" ").replace(/\s+/g, " ").trim();
}
const idPalavras = t => (String(t || "").trim().match(/\S+/g) || []).length;

// O retrato do robô sai ~1h30 antes de cada rodada (04:40 › 06:10, 10:40 › 12:10, 16:40 › 18:10).
function idProximaRodada() {
  const agora = new Date(), sp = new Date(agora.toLocaleString("en-US", { timeZone: "America/Sao_Paulo" })), dif = agora - sp;
  for (let d = 0; d < 2; d++) for (const [ch, cm, rh, rm] of [[4, 40, 6, 10], [10, 40, 12, 10], [16, 40, 18, 10]]) {
    const corte = new Date(sp); corte.setDate(corte.getDate() + d); corte.setHours(ch, cm, 0, 0);
    if (corte > sp) { const r = new Date(corte); r.setHours(rh, rm); return new Date(+r + dif); }
  }
  return null;
}
const idHora = d => d ? d.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", weekday: "short", hour: "2-digit", minute: "2-digit" }) : "";
const idRosto = id => `<img src="assets/${id === "pauta" ? "nexo-marketing-rosto.webp" : "equipe/" + id + "-rosto.webp"}" alt="">`;

async function ideias(el) {
  if (!idCache) el.innerHTML = `<div class="vazio">Chamando a Pauta e o Rabisco…</div>`;
  let lista;
  try { lista = await rpc("nexo_ideias", { p_agente: st.agente }) || []; idCache = lista; }
  catch (e) {
    const m = (e && e.message) || "";
    el.innerHTML = /nexo_ideias|does not exist|Could not find/i.test(m)
      ? `<div class="aviso">A aba Pedir peça precisa da atualização do banco (migração <b>20261116190000_nexo_ideias.sql</b>). Depois de aplicada, esta tela passa a funcionar.</div>`
      : `<div class="vazio">${esc(msgErro(e))}</div>`;
    return;
  }
  const pode = podeEditar(), prox = idProximaRodada(), naFila = lista.filter(p => p.status === "na_fila").length;
  el.innerHTML = `<div class="id">
    <section class="card id-pedir">
      <div class="id-time">${idRosto("pauta")}${idRosto("rabisco")}</div>
      <div style="flex:1;min-width:0">
        <h2 style="margin:0">Peça novas peças à equipe</h2>
        <p class="muted peq" style="margin:4px 0 0">Diga o tema, mande fotos e vídeos ou deixe em branco. A <b>Pauta</b> escolhe o formato (post, carrossel, story ou reels) e explica o porquê; o <b>Rabisco</b> monta a arte a partir do que você mandou. Tudo chega em <b>Aprovar</b>: nada vai ao ar sem o seu OK.</p>
      </div>
    </section>
    <section class="card">
      <label class="campo">O que você quer?<textarea id="idTexto" maxlength="500" placeholder="Ex.: peças para o fim de semana da final do campeonato · algo para atrair donos de arena · deixe em branco para a equipe escolher" ${pode ? "" : "disabled"}></textarea></label>
      ${typeof anexosHtml === "function" ? anexosHtml(pode) : ""}
      <details class="id-mat"><summary><b>Usar um material seu</b> <span class="muted peq">(transcrição de vídeo, podcast, áudio ou texto)</span></summary>
        <p class="muted peq" style="margin:6px 0">A equipe cria a partir das <b>suas palavras</b>, sem partir do zero: carrossel com as ideias principais, guia passo a passo ou roteiro de reels.</p>
        <label class="campo">Material<textarea id="idMat" maxlength="40000" placeholder="Cole aqui a transcrição ou o texto (mínimo de 200 caracteres)." ${pode ? "" : "disabled"} style="min-height:150px"></textarea></label>
        <div class="linha">
          <label class="btn" ${pode ? "" : 'aria-disabled="true"'}>Carregar arquivo (.txt, .srt, .vtt)<input type="file" id="idArq" accept=".txt,.srt,.vtt,text/plain" hidden ${pode ? "" : "disabled"}></label>
          <select id="idOrigem" aria-label="De onde veio" style="width:auto" ${pode ? "" : "disabled"}><option value="vídeo">Vídeo</option><option value="podcast">Podcast</option><option value="áudio">Áudio</option><option value="texto">Texto</option></select>
          <span class="muted peq" id="idConta">0 palavras</span>
        </div></details>
      <div class="linha entre">
        ${typeof mkMarcaSelect === "function" ? mkMarcaSelect(pode) : ""}
        <div class="linha"><span class="muted peq">Quantas ideias?</span><div class="id-qtd" role="group" aria-label="Quantidade">${[1, 2, 3, 4, 5].map(n => `<button type="button" data-q="${n}" aria-pressed="${idQtd === n}" ${pode ? "" : "disabled"}>${n}</button>`).join("")}</div></div>
        <button class="btn prim" id="idPedir" ${pode && naFila < 5 ? "" : "disabled"}>Pedir à equipe</button>
      </div>
      <p class="muted peq" style="margin:0">${naFila >= 5 ? "Já há 5 pedidos na fila. Espere a próxima rodada." : prox ? `Se pedir agora, a equipe trabalha na rodada de <b>${esc(idHora(prox))}</b> e as peças chegam logo depois.` : ""}${pode ? "" : " Seu papel só permite ver."}</p>
    </section>
    <section class="stack-id">
      <h2 style="margin:0">Seus pedidos</h2>
      ${lista.length ? lista.map(p => { const [rot, cls] = ID_ST[p.status] || [p.status, "muted"]; return `
        <article class="card id-pedido">
          <div class="linha entre" style="flex-wrap:nowrap;align-items:flex-start">
            <div style="min-width:0"><b>${p.texto ? esc(p.texto) : "Surpreendam-me (a equipe escolhe o tema)"}</b>
              <div class="muted peq">${pl(p.quantidade, "ideia", "ideias")} · pedido ${esc(quando(p.criado_em))}</div></div>
            <span class="linha" style="gap:6px;flex-wrap:nowrap">${typeof mkMarca === "function" ? mkMarca(p.marca) : ""}<span class="pill ${cls}">${rot}</span></span></div>
          ${typeof anexosTiras === "function" ? anexosTiras(p) : ""}
          ${p.material_palavras ? `<div class="peq muted id-mat-info">Material: <b>${esc(p.material_origem || "texto")}</b> · ${p.material_palavras} palavras${p.material_inicio ? ` · “${esc(p.material_inicio.slice(0, 110))}…”` : ""}</div>` : ""}
          ${p.status === "na_fila" ? `<div class="linha entre"><span class="peq muted">A equipe pega na próxima rodada${prox ? ` (${esc(idHora(prox))})` : ""}.</span>${pode ? `<button class="btn nao peq" data-cancelar="${p.id}">Cancelar</button>` : ""}</div>` : ""}
          ${p.status === "sem_resultado" && p.observacao ? `<div class="aviso peq">${esc(p.observacao)}</div>` : ""}
          ${(p.pecas || []).length ? `<div class="id-pecas">${p.pecas.map(c => `
            <div class="id-peca">
              <span class="id-fmt ${esc(c.formato)}">${esc(ID_FORMATO[c.formato] || c.formato)}</span>
              <div style="min-width:0"><b>${esc(c.pauta)}</b>
                ${c.motivo_formato ? `<div class="peq">${idRosto("pauta")}<span>${esc(c.motivo_formato)}</span></div>` : ""}
                <div class="muted peq">${esc(ID_ST_PECA[c.status] || c.status)}${c.agendado_para ? " · " + esc(quando(c.agendado_para)) : ""}</div>
                ${typeof anexosBase === "function" ? anexosBase(p, c) : ""}</div>
            </div>`).join("")}</div>
            <button class="btn" data-aprovar style="align-self:flex-start">Ver em Aprovar</button>` : ""}
        </article>`; }).join("") : vazioOnca("pauta", "Nenhum pedido ainda.", "Escreva um tema acima (ou deixe em branco) e clique em Pedir à equipe. A Pauta cuida do resto.")}
    </section></div>`;

  $$("[data-q]", el).forEach(b => b.onclick = () => { idQtd = Number(b.dataset.q); $$("[data-q]", el).forEach(x => x.setAttribute("aria-pressed", x === b)); });
  const pedir = $("#idPedir", el), pedirPode = pedir && !pedir.disabled;
  // Enquanto algum arquivo ainda sobe, o pedido espera (assets/anexos.js).
  if (pedir && typeof anexosMontar === "function") anexosMontar(el, subindo => {
    if (!pedirPode) return;
    pedir.disabled = subindo; pedir.textContent = subindo ? "Esperando os arquivos subirem…" : "Pedir à equipe";
  });
  if (typeof anexosAssinar === "function") anexosAssinar(el);
  if (pedir) pedir.onclick = async () => {
    pedir.disabled = true;
    const texto = $("#idTexto", el).value.trim() || null, mat = $("#idMat", el).value.trim();
    if (mat && mat.length < 200) { pedir.disabled = false; aviso("O material precisa de pelo menos 200 caracteres.", true); return; }
    try {
      const r = mat ? await rpc("nexo_pedir_ideias_material", { p_agente: st.agente, p_texto: texto, p_quantidade: idQtd, p_material: mat, p_origem: $("#idOrigem", el).value })
                    : await rpc("nexo_pedir_ideias", { p_agente: st.agente, p_texto: texto, p_quantidade: idQtd });
      const marca = $("#idMarca", el)?.value || "";
      if (marca && typeof mkMarcarPedido === "function") await mkMarcarPedido(r?.id, marca);
      let n = 0;
      if (typeof anexosTem === "function" && anexosTem() && r?.id) {
        try { n = await anexosLigar(r.id); }
        catch (e) { aviso("O pedido foi feito, mas os anexos não entraram: " + msgErro(e).replace(/^.*pedido_invalido:\s*/, ""), true); ideias(el); return; }
      }
      aviso(n ? `Pedido enviado. O Rabisco recebeu ${n} ${n > 1 ? "arquivos" : "arquivo"}.` : mat ? "Pedido enviado com o seu material." : "Pedido enviado à equipe."); ideias(el); }
    catch (e) { pedir.disabled = false;
      const m = (e && e.message) || "";
      aviso(/nexo_pedir_ideias_material|Could not find/i.test(m) ? "O material precisa da atualização do banco (migração 20261116230000_nexo_ideias_material.sql)." : msgErro(e).replace(/^.*pedido_invalido:\s*/, ""), true); }
  };
  const mat = $("#idMat", el), conta = $("#idConta", el);
  if (mat) {
    const contar = () => { const n = idPalavras(mat.value); conta.textContent = `${n} palavras${n ? ` · uns ${Math.max(1, Math.round(n / 140))} min de fala` : ""}`; };
    mat.oninput = contar;
    $("#idArq", el).onchange = ev => {
      const f = ev.target.files?.[0]; if (!f) return;
      if (f.size > 2 * 1024 * 1024) { aviso("Arquivo muito grande (máximo 2 MB de texto).", true); return; }
      const r = new FileReader();
      r.onload = () => { let t = String(r.result || ""); if (/\.(srt|vtt)$/i.test(f.name) || /-->/.test(t)) t = idLimparLegenda(t);
        mat.value = t.slice(0, 40000); contar(); if (t.length > 40000) aviso("O material foi cortado em 40 mil caracteres.", true); };
      r.readAsText(f, "utf-8");
    };
  }
  $$("[data-cancelar]", el).forEach(b => b.onclick = async () => {
    b.disabled = true;
    try { await rpc("nexo_cancelar_ideia", { p_pedido: b.dataset.cancelar }); aviso("Pedido cancelado."); ideias(el); }
    catch (e) { b.disabled = false; aviso(msgErro(e), true); }
  });
  $$("[data-aprovar]", el).forEach(b => b.onclick = () => abrirAba("aprovar"));
}
