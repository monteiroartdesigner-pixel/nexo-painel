"use strict";
// ============================================================================
// CONECTAR CANAIS · cadastro e guia rápido para ligar WhatsApp e Instagram (pedido do Ricardo, 24/11/2026).
// Feito para ser MUITO fácil, para o cliente e para o Master: uma etapa por vez, salva sozinho, diz o que falta e leva ao próximo passo.
// A função é GLOBAL (qualquer empresa com o recurso do WhatsApp e SDR): cada empresa tem o seu cadastro; nada aqui é de um cliente.
// NUNCA pede nem guarda senha, código de verificação, token, CPF ou data de nascimento: quem faz o login é o próprio cliente,
// na tela da Meta (o banco recusa qualquer campo com cara de senha ou código).
// Usa S, rpc, esc, ic, toast, msgErro e copiarTexto do Prospect (index.html / base.js). Lê e grava por public.nexo_canais_cadastro / nexo_canais_salvar.
// ============================================================================

const CN_ESCOLHAS = [["", "Escolha"], ["sim", "Sim"], ["nao", "Não"], ["nao_sei", "Não sei"]];
// campo: [rótulo, tipo, dica, obrigatório]
const CN_CAMPOS = {
  dono_nome: ["Nome completo", "text", "Igual ao documento.", true],
  dono_email: ["E-mail que a pessoa lê", "email", "Os códigos de confirmação da Meta chegam aqui.", true],
  dono_celular: ["Celular (com DDD)", "tel", "Também recebe códigos por SMS ou WhatsApp.", true],
  empresa_nome: ["Nome da empresa", "text", "Como quer aparecer.", true],
  site: ["Site", "text", "", false], email_comercial: ["E-mail comercial", "email", "", false],
  telefone_comercial: ["Telefone comercial (com DDD)", "tel", "", false], endereco: ["Endereço", "text", "", false], cidade_uf: ["Cidade e estado", "text", "", false],
  tem_cnpj: ["A empresa já tem CNPJ?", "escolha", "Sem CNPJ não tem problema: a verificação oficial da empresa fica para depois.", false],
  cnpj: ["CNPJ", "text", "Só se já existir.", false],
  instagram_arroba: ["Perfil do Instagram (@)", "text", "Ex.: @suaempresa", true],
  instagram_profissional: ["É conta profissional (comercial ou criador)?", "escolha", "Veja em Configurações > Tipo de conta. Se for pessoal, troque antes de conectar.", true],
  whatsapp_numero: ["Número do WhatsApp da empresa (com DDD)", "tel", "O número que a empresa já usa no celular.", true],
  whatsapp_business: ["É o aplicativo WhatsApp Business?", "escolha", "O ícone verde com um B.", true],
  whatsapp_versao: ["Versão do aplicativo", "text", "Configurações > Ajuda > Informações do app. Precisa estar atualizado.", false],
  whatsapp_outro_aparelho: ["O número é usado em outro aparelho ou sistema de atendimento?", "escolha", "", false],
  whatsapp_grupos: ["Usa grupos, listas de transmissão ou mensagens temporárias nesse número?", "escolha", "Esses recursos continuam só no aplicativo.", false],
  lead_quente_nome: ["Nome de quem recebe o aviso", "text", "A pessoa da equipe que vai assumir o cliente.", false],
  lead_quente_whatsapp: ["WhatsApp de quem recebe o aviso (com DDD)", "tel", "Quando a IA perceber que o cliente está pronto para comprar, avisa este número.", true],
  produtos: ["Produtos ou serviços principais", "area", "", false], precos: ["Preços que podem ser informados", "area", "", false],
  horario: ["Horário de atendimento", "text", "", false], pagamento: ["Formas de pagamento", "text", "", false], entrega: ["Entrega, prazo e frete", "text", "", false],
  nunca_dizer: ["O que a IA NUNCA pode dizer", "area", "Ex.: promessa de resultado, preço ou prazo que a empresa não confirmou, desconto que não existe.", false],
  tom: ["Tom de voz", "text", "Ex.: leve e simpático, ou mais formal.", false],
};
const CN_EMAILS = new Set(["dono_email", "email_comercial"]), CN_FONES = new Set(["dono_celular", "telefone_comercial", "whatsapp_numero", "lead_quente_whatsapp"]);

// As 5 etapas. campos = sempre à vista; mais = dentro de "Mais dados (pode deixar para depois)".
const CN_ETAPAS = [
  { id: "voce", t: "Você e a empresa", sub: "A pessoa que vai entrar na conta da Meta e os dados básicos da empresa.",
    campos: ["dono_nome", "dono_email", "dono_celular", "empresa_nome"], mais: ["site", "email_comercial", "telefone_comercial", "endereco", "cidade_uf", "tem_cnpj", "cnpj"] },
  { id: "instagram", t: "Instagram", sub: "Só o nome do perfil. A senha você digita direto no Instagram, na hora de conectar.", campos: ["instagram_arroba", "instagram_profissional"], mais: [] },
  { id: "whatsapp", t: "WhatsApp", sub: "O número que a empresa já usa no celular. Você continua usando o aplicativo normalmente.",
    campos: ["whatsapp_numero", "whatsapp_business"], mais: ["whatsapp_versao", "whatsapp_outro_aparelho", "whatsapp_grupos"] },
  { id: "ia", t: "Sua IA", sub: "O que a IA precisa saber para atender bem. Só o que pode ser dito ao cliente: ela nunca inventa preço, prazo ou resultado.",
    campos: ["lead_quente_whatsapp", "lead_quente_nome"], mais: ["produtos", "precos", "horario", "pagamento", "entrega", "nunca_dizer", "tom"], persona: true },
  { id: "conectar", t: "Conectar", sub: "Siga os passos e marque cada um quando fizer.", guia: true },
];

// Passo a passo. A tela real da Meta muda de tempos em tempos: aqui vão palavras, não prints.
const CN_PASSOS = [
  ["conta_meta", "Criar ou entrar na conta da Meta", ["Abra o endereço que a NEXO mandar, no computador ou no celular.", "Entre com a sua conta (Instagram ou Facebook) ou crie uma, com os seus dados reais.", "Ligue a verificação em duas etapas no seu celular."],
    "Se a Meta pedir um código, ele chega no seu celular ou e-mail. Só você digita, na tela da Meta."],
  ["portfolio", "Criar o portfólio empresarial", ["Dê o nome da empresa e o e-mail comercial.", "Sem CNPJ não tem problema: a verificação da empresa fica para depois."],
    "O portfólio fica no seu nome. Você pode dar acesso de administrador à NEXO para ajudar, e retirar quando quiser."],
  ["instagram", "Conectar o Instagram", ["No portfólio, escolha conectar uma conta do Instagram.", "Entre no Instagram da empresa com a sua senha, na tela do próprio Instagram."],
    "O perfil precisa ser profissional (comercial ou criador). Pessoal não conecta."],
  ["whatsapp", "Conectar o WhatsApp", ["Pegue o celular que tem o WhatsApp Business da empresa.", "Quando a tela mostrar um QR, abra o WhatsApp Business no celular e leia o QR, seguindo o que o aplicativo pedir.", "Você segue usando o aplicativo normalmente."],
    "Abra o WhatsApp Business no celular pelo menos a cada 2 semanas, ou a conexão pode cair."],
  ["teste", "Teste", ["A NEXO manda uma mensagem de teste para o número da empresa.", "Se ela aparecer no sistema, está pronto."],
    "No começo a IA só sugere respostas. Nada é enviado sozinho até você autorizar."],
];

const cnTxt = v => String(v ?? "").trim();
const cnPode = () => ["plataforma", "dono", "admin", "editor"].includes(S.papel);
const cnEmailOk = v => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v);
const cnFoneOk = v => { const n = String(v).replace(/\D/g, "").length; return n >= 10 && n <= 15; };
const cnErroCampo = (k, v) => !cnTxt(v) ? "" : CN_EMAILS.has(k) && !cnEmailOk(v) ? "Confira o e-mail: falta o @ ou o final (.com)." : CN_FONES.has(k) && !cnFoneOk(v) ? "Confira o número: use o DDD, por exemplo (45) 99999-0000." : "";

// O que falta numa etapa: [campo, rótulo] obrigatórios sem valor (ou inválidos).
const cnFaltaEtapa = (e, d) => (e.campos || []).filter(k => CN_CAMPOS[k][3] && (!cnTxt(d[k]) || cnErroCampo(k, d[k]))).map(k => [k, CN_CAMPOS[k][0]]);
// Avisos que não travam, mas precisam de atenção.
const cnAvisos = d => [d.instagram_profissional === "nao" && "Troque o Instagram para conta profissional antes de conectar (Configurações > Tipo de conta).",
  d.whatsapp_business === "nao" && "Instale o WhatsApp Business: o aplicativo comum não conecta."].filter(Boolean);
const cnEtapaOk = (e, d, p) => e.guia ? CN_PASSOS.every(([k]) => p[k]) : cnFaltaEtapa(e, d).length === 0;

// Texto do perfil da IA a partir do cadastro: para copiar e colar em "WhatsApp e SDR". Só usa o que o cliente escreveu.
function cnPersona(d) {
  const linha = (rot, v) => cnTxt(v) ? `${rot}: ${cnTxt(v)}` : "";
  return [`Você é a assistente virtual da ${cnTxt(d.empresa_nome) || "empresa"}. Fale como no WhatsApp: mensagens curtas, naturais e consultivas.`,
    "Objetivo: entender o que o cliente procura, explicar em uma frase e fazer UMA pergunta por vez. Quando o cliente pedir valores, quiser comprar ou pedir uma pessoa, avise que vai chamar a equipe.",
    linha("Produtos e serviços", d.produtos), linha("Preços que podem ser informados", d.precos), linha("Horário de atendimento", d.horario),
    linha("Formas de pagamento", d.pagamento), linha("Entrega", d.entrega), linha("Tom de voz", d.tom),
    cnTxt(d.nunca_dizer) ? `NUNCA diga: ${cnTxt(d.nunca_dizer)}.` : "",
    "Nunca invente preço, prazo, resultado ou cliente. Se não souber, diga que vai confirmar com a equipe.",
    "Se perguntarem, diga a verdade: você é uma assistente virtual.",
    "Se a pessoa pedir para parar de receber mensagens, pare na hora e agradeça."].filter(Boolean).join("\n");
}

async function canaisTela(el) {
  el.innerHTML = `<div class="page-h"><div><h1>Conectar canais</h1><p>Cadastro e passo a passo para ligar o WhatsApp e o Instagram da empresa.</p></div></div>
    <div class="sk" style="height:90px"></div><div class="sk" style="height:300px;margin-top:12px"></div>`;
  let c;
  try { c = await rpc("nexo_canais_cadastro", { p_agente: S.agente }); }
  catch (e) { el.innerHTML = `<div class="page-h"><div><h1>Conectar canais</h1></div></div><div class="alert warn">${ic("alert")}<div>${esc(msgErro(e))}</div></div>`; return; }
  canaisDesenhar(el, c || {});
}

function cnCampo(k, d, dis) {
  const [rotulo, tipo, dica, obrig] = CN_CAMPOS[k], v = d[k] ?? "", id = "cn_" + k;
  const lbl = `${esc(rotulo)}${obrig ? ` <abbr class="cn-obr" title="Obrigatório">*</abbr>` : ""}`;
  const ajuda = `${dica ? `<small>${esc(dica)}</small>` : ""}<small class="cn-err" data-erro="${k}" role="alert">${esc(cnErroCampo(k, v))}</small>`;
  if (tipo === "escolha") return `<div class="field"><label for="${id}">${lbl}</label><select class="select" id="${id}" data-cn="${k}" ${dis}>${CN_ESCOLHAS.map(([val, nome]) => `<option value="${val}" ${v === val ? "selected" : ""}>${nome}</option>`).join("")}</select>${ajuda}</div>`;
  if (tipo === "area") return `<div class="field cn-larga"><label for="${id}">${lbl}</label><textarea class="input" id="${id}" data-cn="${k}" rows="3" maxlength="2000" ${dis}>${esc(v)}</textarea>${ajuda}</div>`;
  return `<div class="field"><label for="${id}">${lbl}</label><input class="input" id="${id}" data-cn="${k}" type="${tipo === "email" ? "email" : tipo === "tel" ? "tel" : "text"}" value="${esc(v)}" maxlength="500" autocomplete="off" ${dis}>${ajuda}</div>`;
}

function canaisDesenhar(el, c) {
  const pode = cnPode(), dis = pode ? "" : "disabled";
  const cn = { dados: { ...(c.dados || {}) }, passos: { ...(c.passos || {}) }, etapa: 0, estado: c.atualizado_em ? "salvo" : "", quando: c.atualizado_em ? new Date(c.atualizado_em) : null, msg: "", timer: null };
  const primeira = () => { const i = CN_ETAPAS.findIndex(e => !cnEtapaOk(e, cn.dados, cn.passos)); return i < 0 ? CN_ETAPAS.length - 1 : i; };
  try { const g = sessionStorage.getItem("canais.etapa:" + S.empresaId); cn.etapa = g != null && CN_ETAPAS[+g] ? +g : primeira(); } catch { cn.etapa = primeira(); }

  const hora = d => d ? d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: typeof FUSO !== "undefined" ? FUSO : "America/Sao_Paulo" }) : "";
  const estadoHtml = () => cn.estado === "salvando" ? "Salvando…" : cn.estado === "erro" ? `<span class="cn-bad">Não salvou: ${esc(cn.msg)}</span>` : cn.estado === "salvo" ? `Salvo ✓ ${cn.quando ? "às " + hora(cn.quando) : ""}` : pode ? "Salva sozinho enquanto você preenche." : "";
  // Só valores válidos vão para o banco (e-mail ou telefone pela metade ficam na tela, mas não são enviados).
  const payload = () => Object.fromEntries(Object.entries(cn.dados).filter(([k, v]) => cnTxt(v) && !cnErroCampo(k, v)));
  async function salvar() {
    if (!pode) return true;
    clearTimeout(cn.timer); cn.estado = "salvando"; pintarEstado();
    try { await rpc("nexo_canais_salvar", { p_agente: S.agente, p_dados: payload(), p_passos: cn.passos }); cn.estado = "salvo"; cn.quando = new Date(); pintarEstado(); return true; }
    catch (e) { cn.estado = "erro"; cn.msg = msgErro(e); pintarEstado(); return false; }
  }
  const agendar = () => { if (!pode) return; clearTimeout(cn.timer); cn.estado = ""; pintarEstado(true); cn.timer = setTimeout(salvar, 700); };
  const pintarEstado = (sujo) => { const x = el.querySelector("#cnEstado"); if (x) x.innerHTML = sujo ? "Alterações ainda não salvas…" : estadoHtml(); };

  const proximoItem = () => { for (let i = 0; i < CN_ETAPAS.length; i++) { const e = CN_ETAPAS[i]; if (e.guia) { const p = CN_PASSOS.find(([k]) => !cn.passos[k]); if (p) return { i, texto: `Falta fazer: ${p[1]}`, campo: null }; continue; }
    const f = cnFaltaEtapa(e, cn.dados); if (f.length) return { i, texto: `Falta preencher: ${f[0][1]}${f.length > 1 ? ` e mais ${f.length - 1}` : ""}`, campo: f[0][0] }; } return null; };

  function desenhar() {
    const e = CN_ETAPAS[cn.etapa], feitas = CN_ETAPAS.filter(x => cnEtapaOk(x, cn.dados, cn.passos)).length, prox = proximoItem(), avisos = cnAvisos(cn.dados);
    const chip = (x, i) => { const ok = cnEtapaOk(x, cn.dados, cn.passos); return `<button type="button" class="cn-chip ${i === cn.etapa ? "on" : ""} ${ok ? "ok" : ""}" data-etapa="${i}" aria-current="${i === cn.etapa ? "step" : "false"}"><b>${ok ? "✓" : i + 1}</b><span>${esc(x.t)}</span></button>`; };
    const corpoEtapa = () => {
      if (e.guia) return `<ol class="cn-passos">${CN_PASSOS.map(([k, titulo, itens, atencao], i) => `<li class="cn-passo ${cn.passos[k] ? "feito" : ""}">
          <div class="cn-n" aria-hidden="true">${cn.passos[k] ? "✓" : i + 1}</div>
          <div class="cn-corpo"><h3>${esc(titulo)}</h3><ul>${itens.map(t => `<li>${esc(t)}</li>`).join("")}</ul>
            <p class="cn-atencao"><b>Atenção:</b> ${esc(atencao)}</p>
            <label class="sdr-check"><input type="checkbox" data-cn-passo="${k}" ${cn.passos[k] ? "checked" : ""} ${dis}><span>Já fiz este passo</span></label></div></li>`).join("")}</ol>
        ${CN_PASSOS.every(([k]) => cn.passos[k]) ? `<div class="alert ok cn-pronto">${ic("check")}<div><b>Tudo pronto!</b> A NEXO confere a conexão e faz o teste com você.</div></div>`
          : `<p class="muted peq">Travou em algum passo? A tela da Meta muda de vez em quando. Chame a NEXO pelo botão Suporte.</p>`}`;
      const mais = (e.mais || []).length ? `<details class="cn-mais" ${(e.mais || []).some(k => cnTxt(cn.dados[k])) ? "open" : ""}><summary>Mais dados (pode deixar para depois)</summary><div class="sdr-grade">${e.mais.map(k => cnCampo(k, cn.dados, dis)).join("")}</div></details>` : "";
      const persona = e.persona ? `<div class="cn-persona"><div class="linha"><button class="btn" type="button" id="cnGerar">Gerar texto do perfil da IA</button>
          <span class="muted peq">Junta o que você escreveu. Copie e cole em "WhatsApp e SDR" (persona). Nada é aplicado sozinho.</span></div>
          <div id="cnPersonaBox" class="oculto"><textarea class="input" id="cnPersona" rows="9" readonly></textarea><div class="linha" style="margin-top:8px"><button class="btn" type="button" id="cnCopiar">${ic("copy")}Copiar</button></div></div></div>` : "";
      return `<div class="sdr-grade">${e.campos.map(k => cnCampo(k, cn.dados, dis)).join("")}</div>${mais}${persona}`;
    };
    el.innerHTML = `<div class="cn">
      <div class="page-h"><div><h1>Conectar canais</h1><p>Cadastro e passo a passo para ligar o WhatsApp e o Instagram da empresa.</p></div>
        <div><span class="badge ${feitas === CN_ETAPAS.length ? "ok" : ""}">${feitas} de ${CN_ETAPAS.length} etapas</span></div></div>
      <div class="cn-prog" role="navigation" aria-label="Etapas"><div class="cn-chips">${CN_ETAPAS.map(chip).join("")}</div><div class="cn-bar" aria-hidden="true"><i style="width:${Math.round(feitas / CN_ETAPAS.length * 100)}%"></i></div></div>
      ${prox ? `<div class="cn-proximo" id="cnProximo"><span>${esc(prox.texto)}</span><button type="button" class="btn" data-ir="${prox.i}" ${prox.campo ? `data-campo="${prox.campo}"` : ""}>Ir para lá</button></div>` : ""}
      <div class="alert">${ic("info")}<div><b>Nunca coloque senha ou código aqui.</b> A senha e os códigos de verificação você digita só na tela da Meta. Este cadastro não guarda senha, CPF nem data de nascimento.
        ${pode ? "" : "<br>Só o dono, um administrador ou um editor da empresa preenche esta tela."}</div></div>
      <section class="card sdr-card" aria-labelledby="cnH"><div><span class="cn-eb">Etapa ${cn.etapa + 1} de ${CN_ETAPAS.length}</span><h2 id="cnH">${esc(e.t)}</h2><p class="muted peq" style="margin:4px 0 0">${esc(e.sub)}</p></div>
        ${corpoEtapa()}
        ${cn.etapa === 1 || cn.etapa === 2 ? avisos.map(a => `<div class="alert warn">${ic("alert")}<div>${esc(a)}</div></div>`).join("") : ""}
        <div class="cn-rodape"><span class="muted peq" id="cnEstado" aria-live="polite">${estadoHtml()}</span>
          <div class="linha">${cn.etapa > 0 ? `<button type="button" class="btn" id="cnVoltar">Voltar</button>` : ""}
            ${cn.etapa < CN_ETAPAS.length - 1 ? `<button type="button" class="btn prim pri" id="cnContinuar">Continuar</button>` : ""}</div></div>
      </section></div>`;
    ligar();
  }

  function ir(i, campo) {
    cn.etapa = Math.max(0, Math.min(CN_ETAPAS.length - 1, i));
    try { sessionStorage.setItem("canais.etapa:" + S.empresaId, String(cn.etapa)); } catch {}
    desenhar(); window.scrollTo({ top: 0, behavior: "smooth" });
    if (campo) setTimeout(() => el.querySelector("#cn_" + campo)?.focus(), 80);
  }

  function ligar() {
    el.querySelectorAll("[data-etapa]").forEach(b => b.onclick = () => ir(+b.dataset.etapa));
    const px = el.querySelector("[data-ir]"); if (px) px.onclick = () => ir(+px.dataset.ir, px.dataset.campo);
    el.querySelectorAll("[data-cn]").forEach(x => {
      const mudou = () => {
        const k = x.dataset.cn; cn.dados[k] = x.value.trim();
        const er = el.querySelector(`[data-erro="${k}"]`); if (er) er.textContent = cnErroCampo(k, cn.dados[k]);
        agendar();
      };
      x.oninput = mudou; x.onchange = () => { mudou(); if (x.tagName === "SELECT") desenhar(); else atualizarTopo(); };
      x.onblur = () => atualizarTopo();
    });
    el.querySelectorAll("[data-cn-passo]").forEach(x => x.onchange = async () => { cn.passos[x.dataset.cnPasso] = x.checked; await salvar(); desenhar(); });
    const v = el.querySelector("#cnVoltar"); if (v) v.onclick = () => ir(cn.etapa - 1);
    const ct = el.querySelector("#cnContinuar");
    if (ct) ct.onclick = async () => {
      const e = CN_ETAPAS[cn.etapa], f = cnFaltaEtapa(e, cn.dados);
      if (f.length) {   // mostra o que falta, no próprio campo, e não avança
        f.forEach(([k]) => { const er = el.querySelector(`[data-erro="${k}"]`); if (er) er.textContent = cnErroCampo(k, cn.dados[k]) || "Preencha este campo."; });
        el.querySelector("#cn_" + f[0][0])?.focus(); toast(`Falta: ${f.map(x => x[1]).join(", ")}.`, true); return;
      }
      ct.disabled = true; const ok = await salvar(); ct.disabled = false;
      if (ok) ir(cn.etapa + 1); else toast("Não deu para salvar. Tente de novo.", true);
    };
    const g = el.querySelector("#cnGerar");
    if (g) { g.onclick = () => { el.querySelector("#cnPersona").value = cnPersona(cn.dados); el.querySelector("#cnPersonaBox").classList.remove("oculto"); };
      el.querySelector("#cnCopiar").onclick = () => copiarTexto(el.querySelector("#cnPersona").value); }
  }
  // Atualiza o que muda quando um campo é preenchido (progresso e "o que falta") sem redesenhar a etapa e perder o foco.
  function atualizarTopo() {
    const feitas = CN_ETAPAS.filter(x => cnEtapaOk(x, cn.dados, cn.passos)).length, prox = proximoItem();
    el.querySelectorAll(".cn-chip").forEach((b, i) => { const ok = cnEtapaOk(CN_ETAPAS[i], cn.dados, cn.passos); b.classList.toggle("ok", ok); b.querySelector("b").textContent = ok ? "✓" : String(i + 1); });
    const bar = el.querySelector(".cn-bar i"); if (bar) bar.style.width = Math.round(feitas / CN_ETAPAS.length * 100) + "%";
    const bd = el.querySelector(".page-h .badge"); if (bd) { bd.textContent = `${feitas} de ${CN_ETAPAS.length} etapas`; bd.classList.toggle("ok", feitas === CN_ETAPAS.length); }
    const pbox = el.querySelector("#cnProximo"); if (pbox) { if (prox) { pbox.querySelector("span").textContent = prox.texto; const b = pbox.querySelector("button"); b.dataset.ir = prox.i; if (prox.campo) b.dataset.campo = prox.campo; else delete b.dataset.campo; } else pbox.remove(); }
  }
  desenhar();
}
