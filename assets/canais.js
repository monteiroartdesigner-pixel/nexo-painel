"use strict";
// ============================================================================
// CONECTAR CANAIS · cadastro e guia rápido para ligar WhatsApp e Instagram (pedido do Ricardo, 24/11/2026).
// O cliente preenche UMA vez os dados da empresa e das contas, e marca os passos do guia conforme faz.
// NUNCA pede nem guarda senha, código de verificação, token, CPF ou data de nascimento: quem faz o login é o próprio cliente,
// na tela da Meta (o banco recusa qualquer campo com cara de senha ou código).
// Usa S, rpc, esc, ic, toast, msgErro e copiarTexto do Prospect (index.html / base.js). Lê e grava por public.nexo_canais_cadastro / nexo_canais_salvar.
// ============================================================================

const CN_ESCOLHAS = [["", "Escolha"], ["sim", "Sim"], ["nao", "Não"], ["nao_sei", "Não sei"]];
// [campo, rótulo, tipo, dica, obrigatório]
const CN_GRUPOS = [
  { id: "conta", titulo: "1. Quem é o dono da conta", sub: "A pessoa de verdade que vai entrar na conta da Meta. Os códigos de confirmação chegam para ela.", campos: [
    ["dono_nome", "Nome completo", "text", "Igual ao documento.", true],
    ["dono_email", "E-mail que a pessoa lê", "email", "Os códigos de confirmação da Meta chegam aqui.", true],
    ["dono_celular", "Celular (com DDD)", "tel", "Também recebe códigos por SMS ou WhatsApp.", true]] },
  { id: "empresa", titulo: "2. A empresa", sub: "Pode preencher sem CNPJ. A verificação oficial da empresa na Meta fica para quando o CNPJ existir.", campos: [
    ["empresa_nome", "Nome da empresa", "text", "Como quer aparecer.", true],
    ["site", "Site", "text", "", false],
    ["email_comercial", "E-mail comercial", "email", "", false],
    ["telefone_comercial", "Telefone comercial (com DDD)", "tel", "", false],
    ["endereco", "Endereço", "text", "", false],
    ["cidade_uf", "Cidade e estado", "text", "", false],
    ["tem_cnpj", "A empresa já tem CNPJ?", "escolha", "", false],
    ["cnpj", "CNPJ", "text", "Só se já existir.", false]] },
  { id: "instagram", titulo: "3. Instagram", sub: "Só o nome do perfil. A senha você digita direto no Instagram, na hora de conectar.", campos: [
    ["instagram_arroba", "Perfil (@)", "text", "Ex.: @empresa", true],
    ["instagram_profissional", "É conta profissional (comercial ou criador)?", "escolha", "Em Configurações > Tipo de conta. Se for pessoal, troque antes de conectar.", true]] },
  { id: "whatsapp", titulo: "4. WhatsApp", sub: "O número que a empresa já usa no celular.", campos: [
    ["whatsapp_numero", "Número do WhatsApp (com DDD)", "tel", "", true],
    ["whatsapp_business", "É o aplicativo WhatsApp Business?", "escolha", "O ícone verde com um B.", true],
    ["whatsapp_versao", "Versão do aplicativo", "text", "Configurações > Ajuda > Informações do app. Precisa estar atualizado.", false],
    ["whatsapp_outro_aparelho", "O número é usado em outro aparelho ou sistema de atendimento?", "escolha", "", false],
    ["whatsapp_grupos", "Usa grupos, listas de transmissão ou mensagens temporárias nesse número?", "escolha", "Esses recursos continuam só no aplicativo.", false]] },
  { id: "ia", titulo: "5. Para a IA atender bem", sub: "Só o que pode ser dito ao cliente. A IA nunca inventa preço, prazo ou resultado.", campos: [
    ["produtos", "Produtos ou serviços principais", "area", "", false],
    ["precos", "Preços que podem ser informados", "area", "", false],
    ["horario", "Horário de atendimento", "text", "", false],
    ["pagamento", "Formas de pagamento", "text", "", false],
    ["entrega", "Entrega, prazo e frete", "text", "", false],
    ["nunca_dizer", "O que a IA NUNCA pode dizer", "area", "Ex.: promessa de resultado, cura ou emagrecimento, desconto que não existe.", false],
    ["tom", "Tom de voz", "text", "Ex.: leve e simpático, ou mais formal.", false]] },
  { id: "aviso", titulo: "6. Aviso de cliente pronto para comprar", sub: "Quando a IA perceber que o cliente está quente, avisa esta pessoa da sua equipe.", campos: [
    ["lead_quente_nome", "Nome de quem recebe", "text", "", false],
    ["lead_quente_whatsapp", "WhatsApp de quem recebe (com DDD)", "tel", "", true]] },
];
const CN_OBRIGATORIOS = CN_GRUPOS.flatMap(g => g.campos.filter(c => c[4]).map(c => [c[0], c[1]]));

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

const cnSim = v => v === "sim", cnTxt = v => String(v ?? "").trim();
const cnPode = () => ["plataforma", "dono", "admin", "editor"].includes(S.papel);

async function canaisTela(el) {
  el.innerHTML = `<div class="page-h"><div><h1>Conectar canais</h1><p>Cadastro e passo a passo para ligar o WhatsApp e o Instagram da empresa.</p></div></div>
    <div class="sk" style="height:90px"></div><div class="sk" style="height:300px;margin-top:12px"></div>`;
  let c;
  try { c = await rpc("nexo_canais_cadastro", { p_agente: S.agente }); }
  catch (e) { el.innerHTML = `<div class="page-h"><div><h1>Conectar canais</h1></div></div><div class="alert warn">${ic("alert")}<div>${esc(msgErro(e))}</div></div>`; return; }
  canaisDesenhar(el, c || {});
}

function cnCampo([k, rotulo, tipo, dica], dados, dis) {
  const v = dados[k] ?? "", id = "cn_" + k;
  const ajuda = dica ? `<small>${esc(dica)}</small>` : "";
  if (tipo === "escolha") return `<div class="field"><label for="${id}">${esc(rotulo)}</label><select class="select" id="${id}" data-cn="${k}" ${dis}>${CN_ESCOLHAS.map(([val, nome]) => `<option value="${val}" ${v === val ? "selected" : ""}>${nome}</option>`).join("")}</select>${ajuda}</div>`;
  if (tipo === "area") return `<div class="field cn-larga"><label for="${id}">${esc(rotulo)}</label><textarea class="input" id="${id}" data-cn="${k}" rows="3" maxlength="2000" ${dis}>${esc(v)}</textarea>${ajuda}</div>`;
  return `<div class="field"><label for="${id}">${esc(rotulo)}</label><input class="input" id="${id}" data-cn="${k}" type="${tipo === "email" ? "email" : tipo === "tel" ? "tel" : "text"}" value="${esc(v)}" maxlength="500" autocomplete="off" ${dis}>${ajuda}</div>`;
}

function cnFaltas(dados) {
  const f = CN_OBRIGATORIOS.filter(([k]) => !cnTxt(dados[k])).map(([, n]) => n);
  if (dados.instagram_profissional === "nao") f.push("Trocar o Instagram para conta profissional");
  if (dados.whatsapp_business === "nao") f.push("Instalar o WhatsApp Business (o aplicativo comum não conecta)");
  return f;
}

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

function canaisDesenhar(el, c) {
  const pode = cnPode(), dis = pode ? "" : "disabled", dados = c.dados || {}, passos = c.passos || {};
  const faltas = cnFaltas(dados), feitos = CN_PASSOS.filter(([k]) => passos[k]).length;
  el.innerHTML = `<div class="cn">
    <div class="page-h"><div><h1>Conectar canais</h1><p>Cadastro e passo a passo para ligar o WhatsApp e o Instagram da empresa.</p></div>
      <div><span class="badge ${faltas.length ? "" : "ok"}" id="cnSelo">${faltas.length ? `Faltam ${faltas.length} ${faltas.length === 1 ? "item" : "itens"}` : "Cadastro completo"}</span></div></div>
    <div class="alert">${ic("info")}<div><b>Nunca coloque senha ou código aqui.</b> A senha e os códigos de verificação você digita só na tela da Meta, na hora de conectar. Este cadastro não guarda senha, CPF nem data de nascimento.
      ${pode ? "" : "<br>Só o dono, um administrador ou um editor da empresa preenche esta tela."}</div></div>

    ${CN_GRUPOS.map(g => `<section class="card sdr-card" aria-labelledby="cnH_${g.id}"><div><h2 id="cnH_${g.id}">${esc(g.titulo)}</h2><p class="muted peq" style="margin:4px 0 0">${esc(g.sub)}</p></div>
      <div class="sdr-grade">${g.campos.map(f => cnCampo(f, dados, dis)).join("")}</div></section>`).join("")}

    <div class="linha"><button class="btn prim pri" type="button" id="cnSalvar" ${dis}>Salvar cadastro</button>
      <span class="muted peq" id="cnQuando">${c.atualizado_em ? `Salvo em ${new Date(c.atualizado_em).toLocaleString("pt-BR", { timeZone: typeof FUSO !== "undefined" ? FUSO : "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" })}` : "Ainda não salvo."}</span></div>
    ${faltas.length ? `<div class="alert warn" id="cnFaltas">${ic("alert")}<div><b>Falta para conectar:</b><ul class="sdr-falta">${faltas.map(f => `<li>${esc(f)}</li>`).join("")}</ul></div></div>` : ""}

    <section class="card sdr-card" aria-labelledby="cnH_guia"><div><h2 id="cnH_guia">Passo a passo para conectar</h2>
      <p class="muted peq" style="margin:4px 0 0">${feitos} de ${CN_PASSOS.length} passos feitos. As telas da Meta mudam de vez em quando: se a sua for diferente, chame a NEXO.</p></div>
      <ol class="cn-passos">${CN_PASSOS.map(([k, titulo, itens, atencao], i) => `<li class="cn-passo ${passos[k] ? "feito" : ""}">
        <div class="cn-n" aria-hidden="true">${i + 1}</div>
        <div class="cn-corpo"><h3>${esc(titulo)}</h3><ul>${itens.map(t => `<li>${esc(t)}</li>`).join("")}</ul>
          <p class="cn-atencao"><b>Atenção:</b> ${esc(atencao)}</p>
          <label class="sdr-check"><input type="checkbox" data-cn-passo="${k}" ${passos[k] ? "checked" : ""} ${dis}><span>Já fiz este passo</span></label></div></li>`).join("")}</ol>
    </section>

    <section class="card sdr-card" aria-labelledby="cnH_ia"><div><h2 id="cnH_ia">Perfil da IA a partir deste cadastro</h2>
      <p class="muted peq" style="margin:4px 0 0">Gera um texto com o que você preencheu. Copie e cole em "WhatsApp e SDR" (persona). Nada é aplicado sozinho.</p></div>
      <div class="linha"><button class="btn" type="button" id="cnGerar">Gerar texto do perfil da IA</button></div>
      <div id="cnPersonaBox" class="oculto"><textarea class="input" id="cnPersona" rows="9" readonly></textarea>
        <div class="linha" style="margin-top:8px"><button class="btn" type="button" id="cnCopiar">${ic("copy")}Copiar</button></div></div>
    </section>
  </div>`;

  const lerDados = () => Object.fromEntries([...el.querySelectorAll("[data-cn]")].map(x => [x.dataset.cn, x.value.trim()]));
  const lerPassos = () => Object.fromEntries([...el.querySelectorAll("[data-cn-passo]")].map(x => [x.dataset.cnPasso, x.checked]));
  $("#cnSalvar", el).onclick = async () => {
    const b = $("#cnSalvar", el); b.disabled = true;
    try {
      await rpc("nexo_canais_salvar", { p_agente: S.agente, p_dados: lerDados(), p_passos: lerPassos() });
      toast("Cadastro salvo."); canaisTela(el);
    } catch (e) { toast(msgErro(e), true); b.disabled = false; }
  };
  $("#cnGerar", el).onclick = () => { $("#cnPersona", el).value = cnPersona(lerDados()); $("#cnPersonaBox", el).classList.remove("oculto"); };
  $("#cnCopiar", el).onclick = () => copiarTexto($("#cnPersona", el).value);
}
