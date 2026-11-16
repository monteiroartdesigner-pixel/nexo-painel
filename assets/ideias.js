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
      ? `<div class="aviso">A aba Ideias precisa da atualização do banco (migração <b>20261116190000_nexo_ideias.sql</b>). Depois de aplicada, esta tela passa a funcionar.</div>`
      : `<div class="vazio">${esc(msgErro(e))}</div>`;
    return;
  }
  const pode = podeEditar(), prox = idProximaRodada(), naFila = lista.filter(p => p.status === "na_fila").length;
  el.innerHTML = `<div class="id">
    <section class="card id-pedir">
      <div class="id-time">${idRosto("pauta")}${idRosto("rabisco")}</div>
      <div style="flex:1;min-width:0">
        <h2 style="margin:0">Peça ideias à equipe</h2>
        <p class="muted peq" style="margin:4px 0 0">Diga o tema ou deixe em branco. A <b>Pauta</b> escolhe o formato (post, carrossel, story ou reels) e explica o porquê; o <b>Rabisco</b> monta a arte. Tudo chega em <b>Aprovar</b>: nada vai ao ar sem o seu OK.</p>
      </div>
    </section>
    <section class="card">
      <label class="campo">O que você quer?<textarea id="idTexto" maxlength="500" placeholder="Ex.: peças para o fim de semana da final do campeonato · algo para atrair donos de arena · deixe em branco para a equipe escolher" ${pode ? "" : "disabled"}></textarea></label>
      <div class="linha entre">
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
              <div class="muted peq">${p.quantidade} ideia(s) · pedido ${esc(quando(p.criado_em))}</div></div>
            <span class="pill ${cls}">${rot}</span></div>
          ${p.status === "na_fila" ? `<div class="linha entre"><span class="peq muted">A equipe pega na próxima rodada${prox ? ` (${esc(idHora(prox))})` : ""}.</span>${pode ? `<button class="btn nao peq" data-cancelar="${p.id}">Cancelar</button>` : ""}</div>` : ""}
          ${p.status === "sem_resultado" && p.observacao ? `<div class="aviso peq">${esc(p.observacao)}</div>` : ""}
          ${(p.pecas || []).length ? `<div class="id-pecas">${p.pecas.map(c => `
            <div class="id-peca">
              <span class="id-fmt ${esc(c.formato)}">${esc(ID_FORMATO[c.formato] || c.formato)}</span>
              <div style="min-width:0"><b>${esc(c.pauta)}</b>
                ${c.motivo_formato ? `<div class="peq">${idRosto("pauta")}<span>${esc(c.motivo_formato)}</span></div>` : ""}
                <div class="muted peq">${esc(ID_ST_PECA[c.status] || c.status)}${c.agendado_para ? " · " + esc(quando(c.agendado_para)) : ""}</div></div>
            </div>`).join("")}</div>
            <button class="btn" data-aprovar style="align-self:flex-start">Ver em Aprovar</button>` : ""}
        </article>`; }).join("") : `<div class="vazio">Nenhum pedido ainda. Escreva um tema acima ou deixe em branco e clique em Pedir à equipe.</div>`}
    </section></div>`;

  $$("[data-q]", el).forEach(b => b.onclick = () => { idQtd = Number(b.dataset.q); $$("[data-q]", el).forEach(x => x.setAttribute("aria-pressed", x === b)); });
  const pedir = $("#idPedir", el);
  if (pedir) pedir.onclick = async () => {
    pedir.disabled = true;
    try { await rpc("nexo_pedir_ideias", { p_agente: st.agente, p_texto: $("#idTexto", el).value.trim() || null, p_quantidade: idQtd });
      aviso("Pedido enviado à equipe."); ideias(el); }
    catch (e) { pedir.disabled = false; aviso(msgErro(e).replace(/^.*pedido_invalido:\s*/, ""), true); }
  };
  $$("[data-cancelar]", el).forEach(b => b.onclick = async () => {
    b.disabled = true;
    try { await rpc("nexo_cancelar_ideia", { p_pedido: b.dataset.cancelar }); aviso("Pedido cancelado."); ideias(el); }
    catch (e) { b.disabled = false; aviso(msgErro(e), true); }
  });
  $$("[data-aprovar]", el).forEach(b => b.onclick = () => abrirAba("aprovar"));
}
