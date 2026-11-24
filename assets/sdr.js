"use strict";
// ============================================================================
// WHATSAPP E SDR · tela de configuração do NEXO Prospect (F3 do plano, 24/11/2026).
// Aqui só se CONFIGURA: nada é enviado por esta tela. O recebimento e o atendimento pela IA entram com o webhook (F4).
// Segredos (token do WhatsApp, chave da IA) vão direto para o cofre pelo banco e NUNCA voltam ao navegador:
// o campo é só de escrita e depois mostra só o final, "••••1234".
// Usa S, rpc, esc, ic, toast, msgErro, copiarTexto e SUPABASE_URL do Prospect (index.html / base.js).
// ============================================================================

const SDR_PERSONA = nome => `Você é a consultora comercial da ${nome || "empresa"}. Fale como no WhatsApp: mensagens curtas, naturais e consultivas, sem textão.
Objetivo: quebrar o gelo, entender a dor do cliente, apresentar a solução em uma frase e fazer UMA pergunta de qualificação por vez (urgência, orçamento, interesse em reunião ou proposta).
Nunca invente preço, prazo, resultado ou cliente. Se não souber, diga que vai confirmar com a equipe.
Quando o cliente pedir valores, disser que quer contratar, pedir para falar com um especialista ou aceitar uma conversa, avise que vai chamar a equipe e transfira para um humano.
Se a pessoa pedir para parar de receber mensagens, pare na hora e agradeça.`;

const SDR_MODELOS = { anthropic: ["claude-sonnet-5-5", "claude-haiku-5-5"], openai: [], gemini: [] };
const SDR_ROTULO_IA = { anthropic: "Anthropic (Claude)", openai: "OpenAI", gemini: "Google Gemini" };
const sdrPodeConfigurar = () => ["plataforma", "dono", "admin"].includes(S.papel);
const sdrNum = v => String(v ?? "").replace(/\D/g, "");

// O que falta para poder ligar o SDR (o banco confere de novo ao ligar).
function sdrFaltas(c) {
  const f = [];
  if (!c.provedor) f.push("Escolher o provedor do WhatsApp");
  if (c.provedor === "ycloud") { if (!c.instance_id) f.push("Informar o número do WhatsApp da empresa"); }   // a YCloud assina o webhook: sem token da Meta
  else {
    if (!c.credenciais?.whatsapp_business?.salva) f.push("Guardar o token do WhatsApp");
    if (!c.phone_number_id) f.push("Informar o ID do número (Phone Number ID)");
  }
  if (!c.llm_provedor || !c.llm_modelo) f.push("Escolher a IA e o modelo");
  if (!c.credenciais?.llm?.salva) f.push("Guardar a chave da IA");
  if ((c.persona_prompt || "").trim().length < 20) f.push("Escrever a persona comercial");
  if (!c.gestor_whatsapp) f.push("Informar o WhatsApp do vendedor que recebe os alertas");
  return f;
}

const sdrCred = (c, tipo) => c.credenciais?.[tipo] || {};
function sdrEstado(c) {
  if (!c.ativo) return `<span class="badge">Desligado</span>`;
  return c.modo === "autonomo" ? `<span class="badge bad">Ligado · autônomo</span>` : `<span class="badge ok">Ligado · modo sombra</span>`;
}

async function sdrTela(el) {
  el.innerHTML = `<div class="page-h"><div><h1>WhatsApp e SDR</h1><p>Seu atendimento por IA no WhatsApp, com passagem para uma pessoa quando o lead esquenta.</p></div></div>
    <div class="sk" style="height:90px"></div><div class="sk" style="height:300px;margin-top:12px"></div>`;
  let c;
  try { c = await rpc("nexo_sdr_config", { p_agente: S.agente }); }
  catch (e) { el.innerHTML = `<div class="page-h"><div><h1>WhatsApp e SDR</h1></div></div><div class="alert warn">${ic("alert")}<div>${esc(msgErro(e))}</div></div>`; return; }
  sdrDesenhar(el, c);
}

function sdrDesenhar(el, c) {
  const pode = sdrPodeConfigurar(), dis = pode ? "" : "disabled";
  const faltas = sdrFaltas(c), wa = sdrCred(c, "whatsapp_business"), ia = sdrCred(c, "llm");
  const urlWebhook = `${SUPABASE_URL}/functions/v1/nexo-sdr-webhook`, ycloud = c.provedor === "ycloud";
  const modelos = (SDR_MODELOS[c.llm_provedor || "anthropic"] || []).map(m => `<option value="${esc(m)}">`).join("");
  const credBloco = (id, rotulo, cr, dica) => `
    <div class="field"><label for="${id}">${rotulo}</label>
      <div class="sdr-linha"><input class="input" id="${id}" type="password" autocomplete="off" spellcheck="false" placeholder="${cr.salva ? "Salvo no cofre. Cole outro para trocar" : "Cole aqui"}" ${dis}>
        <button class="btn" type="button" data-sdr-cred="${id}" ${dis}>Guardar</button></div>
      <small>${cr.salva ? `Guardado: <b>${esc(cr.final || "••••")}</b> · fica no cofre e não volta para esta tela.` : dica}</small></div>`;
  el.innerHTML = `<div class="sdr">
    <div class="page-h"><div><h1>WhatsApp e SDR</h1><p>Seu atendimento por IA no WhatsApp, com passagem para uma pessoa quando o lead esquenta.</p></div><div>${sdrEstado(c)}</div></div>
    <div class="alert">${ic("info")}<div><b>Esta tela só configura.</b> Nada é enviado por aqui. Em modo sombra a IA só deixa sugestões. O envio automático pelo WhatsApp fica desligado até a NEXO liberar o envio real para a sua empresa.
      ${pode ? "" : "<br>Só o dono ou o administrador da empresa muda estas configurações."}</div></div>

    <section class="card sdr-card" aria-labelledby="sdrH1"><h2 id="sdrH1">1. Conexão do WhatsApp</h2>
      <div class="sdr-grade">
        <div class="field"><label for="sdrProv">Provedor</label>
          <select class="select" id="sdrProv" ${dis}><option value="cloud_api" ${c.provedor === "cloud_api" || !c.provedor ? "selected" : ""}>WhatsApp Cloud API (oficial da Meta)</option>
            <option value="ycloud" ${c.provedor === "ycloud" ? "selected" : ""}>YCloud (coexistência: a empresa segue usando o WhatsApp Business no celular)</option>
            <option disabled>Evolution API (em breve)</option><option disabled>Z-API (em breve)</option></select>
          <small>${ycloud ? "A empresa continua usando o aplicativo WhatsApp Business no celular, e a IA recebe as mesmas conversas pela API oficial, conectada pela YCloud."
                          : "Na primeira versão só a API oficial: as outras conectam pelo WhatsApp Web e podem ter o número bloqueado."}</small></div>
        ${ycloud ? `<div class="field"><label for="sdrNumero">Número do WhatsApp da empresa</label>
          <input class="input" id="sdrNumero" value="${esc(c.instance_id || "")}" inputmode="tel" placeholder="(45) 99999-0000" autocomplete="off" ${dis}>
          <small>O número que os clientes dela usam (o do aplicativo WhatsApp Business). É por ele que o sistema sabe de qual empresa é cada mensagem.</small></div>`
        : `<div class="field"><label for="sdrPhone">ID do número (Phone Number ID)</label>
          <input class="input" id="sdrPhone" value="${esc(c.phone_number_id || "")}" inputmode="numeric" autocomplete="off" ${dis}>
          <small>Está no painel da Meta, em WhatsApp › Configuração da API.</small></div>`}
      </div>
      ${ycloud ? `<div class="field"><label>Endereço do webhook (YCloud)</label>
        <div class="sdr-linha"><input class="input" id="sdrUrl" readonly value="${esc(urlWebhook + "?provedor=ycloud")}"><button class="btn" type="button" data-sdr-copiar="sdrUrl">${ic("copy")}Copiar</button></div>
        <small>Na YCloud, em Developers › Webhook, cole este endereço e marque os eventos: mensagem recebida do cliente, mensagem enviada pelo celular, histórico e remoção de conta ou número.
          A YCloud assina cada envio e o NEXO confere a assinatura: aqui não há token para colar. Enquanto o SDR estiver em modo sombra, nada é enviado.</small></div>`
      : `${credBloco("sdrTokWa", "Token de acesso do WhatsApp", wa, "Cole o token permanente do app da Meta. Ele vai direto para o cofre.")}
      <div class="field"><label>Endereço do webhook</label>
        <div class="sdr-linha"><input class="input" id="sdrUrl" readonly value="${esc(urlWebhook)}"><button class="btn" type="button" data-sdr-copiar="sdrUrl">${ic("copy")}Copiar</button></div>
        <small>Este é o endereço-base. Ao gerar o token abaixo, aparece o endereço completo (com o token) para colar na Meta.</small></div>
      <div class="field"><label>Token de verificação do webhook</label>
        <div class="sdr-linha"><span class="muted peq" style="flex:1">${c.webhook_gerado ? "Já existe um token. Por segurança ele não aparece de novo." : "Ainda não gerado."}</span>
          <button class="btn" type="button" id="sdrGerar" ${dis}>${c.webhook_gerado ? "Gerar outro" : "Gerar token"}</button></div>
        <div id="sdrTokenNovo" class="oculto"></div></div>`}
    </section>

    <section class="card sdr-card" aria-labelledby="sdrH2"><h2 id="sdrH2">2. Inteligência artificial</h2>
      <div class="sdr-grade">
        <div class="field"><label for="sdrLlm">IA</label>
          <select class="select" id="sdrLlm" ${dis}>${["anthropic", "openai", "gemini"].map(k => `<option value="${k}" ${(c.llm_provedor || "anthropic") === k ? "selected" : ""} ${k === "anthropic" ? "" : "disabled"}>${SDR_ROTULO_IA[k]}${k === "anthropic" ? "" : " (em breve)"}</option>`).join("")}</select></div>
        <div class="field"><label for="sdrModelo">Modelo</label>
          <input class="input" id="sdrModelo" list="sdrModelos" value="${esc(c.llm_modelo || "")}" placeholder="ex.: claude-sonnet-5-5" autocomplete="off" ${dis}><datalist id="sdrModelos">${modelos}</datalist></div>
      </div>
      ${credBloco("sdrChaveIa", "Chave da API da IA", ia, "O custo das respostas vai para a conta dessa chave.")}
      <div class="field"><label for="sdrPersona">Persona comercial (como a IA fala e quando passa para uma pessoa)</label>
        <textarea class="textarea" id="sdrPersona" rows="9" maxlength="8000" ${dis}>${esc(c.persona_prompt || "")}</textarea>
        <div class="sdr-linha"><small id="sdrConta">${(c.persona_prompt || "").length} / 8000</small>${pode ? `<button class="btn sm ghost" type="button" id="sdrModeloPersona">Usar o modelo pronto</button>` : ""}</div></div>
    </section>

    <section class="card sdr-card" aria-labelledby="sdrH3"><h2 id="sdrH3">3. Quem recebe o alerta de lead quente</h2>
      <div class="field"><label for="sdrGestor">WhatsApp do vendedor ou gestor</label>
        <input class="input" id="sdrGestor" value="${esc(c.gestor_whatsapp || "")}" inputmode="tel" placeholder="(41) 99999-0000" autocomplete="off" ${dis}>
        <small>Quando a IA passa um lead para uma pessoa, este número recebe o resumo e o link para assumir a conversa.</small></div>
    </section>

    <section class="card sdr-card" aria-labelledby="sdrH4"><h2 id="sdrH4">4. Segurança e limites</h2>
      <div class="field"><label for="sdrModo">Modo de atendimento</label>
        <select class="select" id="sdrModo" ${dis}><option value="sombra" ${c.modo !== "autonomo" ? "selected" : ""}>Sombra: a IA sugere, uma pessoa envia (recomendado no começo)</option>
          <option value="autonomo" ${c.modo === "autonomo" ? "selected" : ""}>Autônomo: a IA responde sozinha</option></select>
        ${ycloud ? `<small id="sdrAutYcloud">Pela YCloud, no modo autônomo a IA responde sozinha a quem escreve primeiro, e avisa o vendedor quando o cliente esquentar.
          Se alguém da sua equipe responder pelo celular, a IA pausa naquela conversa (para ela voltar, use "Devolver para IA"). O envio real só começa depois que a NEXO liga a chave geral de envio; até lá a IA só sugere.</small>` : ""}</div>
      <label class="sdr-check ${c.modo === "autonomo" ? "" : "oculto"}" id="sdrAceiteAutBox"><input type="checkbox" id="sdrAceiteAut" ${dis} ${c.aceite_autonomo_em ? "checked" : ""}>
        <span>Revisei as conversas em modo sombra e aceito que a IA responda sozinha em nome da minha empresa.</span></label>
      <label class="sdr-check"><input type="checkbox" id="sdrSoResp" ${dis} ${c.so_responde_quem_escreveu !== false ? "checked" : ""}>
        <span>A IA só responde quem escreve primeiro (recomendado). Desmarcar deixa a IA puxar conversa, o que o WhatsApp restringe.</span></label>
      <label class="sdr-check ${c.so_responde_quem_escreveu === false ? "" : "oculto"}" id="sdrAceiteAbBox"><input type="checkbox" id="sdrAceiteAb" ${dis} ${c.aceite_abordagem_em ? "checked" : ""}>
        <span>Confirmo que os contatos autorizaram receber mensagens da minha empresa e que uso modelos de mensagem aprovados pela Meta.</span></label>
      <div class="sdr-grade">
        <div class="field"><label for="sdrHora">Máximo de mensagens por hora</label><input class="input" id="sdrHora" type="number" min="1" max="300" value="${esc(c.max_msgs_hora ?? 30)}" ${dis}></div>
        <div class="field"><label for="sdrDia">Máximo de conversas novas por dia</label><input class="input" id="sdrDia" type="number" min="0" max="500" value="${esc(c.max_novas_conversas_dia ?? 20)}" ${dis}></div>
      </div>
    </section>

    <section class="card sdr-card" aria-labelledby="sdrH5"><h2 id="sdrH5">5. Ligar</h2>
      ${faltas.length ? `<div class="alert warn">${ic("alert")}<div><b>Falta para ligar:</b><ul class="sdr-falta">${faltas.map(f => `<li>${esc(f)}</li>`).join("")}</ul></div></div>`
        : `<div class="alert">${ic("check")}<div>Tudo pronto para ligar.</div></div>`}
      <div class="sdr-linha" style="margin-top:12px;flex-wrap:wrap">
        <button class="btn pri" type="button" id="sdrSalvar" ${dis}>Salvar configurações</button>
        ${c.ativo ? `<button class="btn danger" type="button" id="sdrDesligar" ${dis}>Desligar o SDR</button>`
                  : `<button class="btn" type="button" id="sdrLigar" ${dis || faltas.length ? "disabled" : ""}>Ligar o SDR</button>`}
      </div>
      <small class="muted">Ao ligar, o SDR passa a atender as mensagens que chegarem pelo webhook. No modo sombra nada é enviado: a resposta fica como sugestão.</small>
    </section></div>`;
  sdrLigar(el, c);
}

function sdrLigar(el, c) {
  const $s = s => el.querySelector(s);
  const recarregar = async msg => { if (msg) toast(msg); try { c = await rpc("nexo_sdr_config", { p_agente: S.agente }); sdrDesenhar(el, c); } catch (e) { toast(msgErro(e), true); } };
  const coletar = extra => ({
    provedor: $s("#sdrProv").value, phone_number_id: $s("#sdrPhone")?.value.trim() || "", instance_id: $s("#sdrNumero")?.value.trim() || "", llm_provedor: $s("#sdrLlm").value, llm_modelo: $s("#sdrModelo").value.trim(),
    persona_prompt: $s("#sdrPersona").value, gestor_whatsapp: sdrNum($s("#sdrGestor").value) ? $s("#sdrGestor").value : "",
    modo: $s("#sdrModo").value, so_responde_quem_escreveu: $s("#sdrSoResp").checked,
    max_msgs_hora: Number($s("#sdrHora").value) || 30, max_novas_conversas_dia: Number($s("#sdrDia").value) || 0,
    aceite_autonomo: $s("#sdrAceiteAut").checked, aceite_abordagem_automatica: $s("#sdrAceiteAb").checked, ...extra });
  const salvar = async (extra, msg) => {
    const cfg = coletar(extra);
    if (cfg.modo === "autonomo" && c.modo !== "autonomo" && !cfg.aceite_autonomo) { toast("Para o modo autônomo, marque a confirmação.", true); return; }
    if (!cfg.so_responde_quem_escreveu && c.so_responde_quem_escreveu !== false && !cfg.aceite_abordagem_automatica) { toast("Para a IA puxar conversa, marque a confirmação dos contatos.", true); return; }
    try { await rpc("nexo_sdr_salvar", { p_agente: S.agente, p_cfg: cfg }); await recarregar(msg); }
    catch (e) { toast(msgErro(e), true); }
  };
  $s("#sdrProv").onchange = () => sdrDesenhar(el, { ...c, ...coletar(), instance_id: $s("#sdrNumero")?.value.trim() || c.instance_id || null });
  $s("#sdrModo").onchange = () => $s("#sdrAceiteAutBox").classList.toggle("oculto", $s("#sdrModo").value !== "autonomo");
  $s("#sdrSoResp").onchange = () => $s("#sdrAceiteAbBox").classList.toggle("oculto", $s("#sdrSoResp").checked);
  $s("#sdrPersona").oninput = () => { $s("#sdrConta").textContent = `${$s("#sdrPersona").value.length} / 8000`; };
  $s("#sdrLlm").onchange = () => { $s("#sdrModelos").innerHTML = (SDR_MODELOS[$s("#sdrLlm").value] || []).map(m => `<option value="${esc(m)}">`).join(""); };
  const mp = $s("#sdrModeloPersona"); if (mp) mp.onclick = () => { const t = $s("#sdrPersona"); if (!t.value.trim() || confirm("Trocar o texto atual pelo modelo pronto?")) { t.value = SDR_PERSONA(S.empresaNome); t.oninput(); } };
  el.querySelectorAll("[data-sdr-cred]").forEach(b => b.onclick = async () => {
    const campo = $s("#" + b.dataset.sdrCred), tipo = b.dataset.sdrCred === "sdrTokWa" ? "whatsapp_business" : "llm", valor = campo.value.trim();
    if (!valor) { toast("Cole o valor antes de guardar.", true); return; }
    try { const r = await rpc("nexo_sdr_salvar_credencial", { p_agente: S.agente, p_tipo: tipo, p_segredo: valor }); campo.value = ""; await recarregar(`Guardado no cofre (${r?.final || "••••"}).`); }
    catch (e) { toast(msgErro(e), true); }
  });
  el.querySelectorAll("[data-sdr-copiar]").forEach(b => b.onclick = async () => { await copiarTexto($s("#" + b.dataset.sdrCopiar).value); toast("Endereço copiado."); });
  const ger = $s("#sdrGerar"); if (ger) ger.onclick = async () => {
    if (c.webhook_gerado && !confirm("Gerar outro token invalida o atual: você terá de colar o novo na Meta. Continuar?")) return;
    try {
      const urlBase = $s("#sdrUrl").value;
      const r = await rpc("nexo_sdr_gerar_webhook", { p_agente: S.agente }), box = $s("#sdrTokenNovo");
      box.classList.remove("oculto");
      const completa = `${urlBase}?t=${r.token}`;
      box.innerHTML = `<div class="alert warn">${ic("alert")}<div><b>Copie agora: o token e o endereço completo não aparecem de novo.</b>
        <div class="field" style="margin-top:8px"><label for="sdrUrlCompleta">1. URL de callback (cole na Meta)</label>
          <div class="sdr-linha"><input class="input" id="sdrUrlCompleta" readonly value="${esc(completa)}"><button class="btn" type="button" id="sdrCopiarUrl">${ic("copy")}Copiar</button></div></div>
        <div class="field" style="margin-top:8px"><label for="sdrTokenValor">2. Token de verificação (cole na Meta, no campo Verify token)</label>
          <div class="sdr-linha"><input class="input" id="sdrTokenValor" readonly value="${esc(r.token)}"><button class="btn" type="button" id="sdrCopiarToken">${ic("copy")}Copiar</button></div></div></div></div>`;
      $s("#sdrCopiarToken").onclick = async () => { await copiarTexto(r.token); toast("Token copiado."); };
      $s("#sdrCopiarUrl").onclick = async () => { await copiarTexto(completa); toast("Endereço copiado."); };
      c.webhook_gerado = true;
    } catch (e) { toast(msgErro(e), true); }
  };
  $s("#sdrSalvar").onclick = () => salvar({}, "Configurações salvas.");
  const lig = $s("#sdrLigar"); if (lig) lig.onclick = () => salvar({ ativo: true }, "SDR ligado.");
  const des = $s("#sdrDesligar"); if (des) des.onclick = () => salvar({ ativo: false }, "SDR desligado.");
}
