// Suporte do painel (pedido do Ricardo, 18/11/2026: "a IA para ser o suporte, com opção de chamar no WhatsApp").
// Responde pelas respostas abaixo (sem custo e sem inventar). O que não souber vai para o WhatsApp de suporte,
// que o Master troca quando quiser (nexo_suporte / nexo_master_salvar_suporte). Sem número salvo, o botão some.
// Uso: Suporte.iniciar({ produto: "System" | "Prospect", onca: { nome, img }, empresa: () => "nome", abas: [...], ir: aba => {} })
const Suporte = (() => {
  // Cada resposta: palavras que disparam (sem acento, começo da palavra basta), texto e, se tiver, a aba que resolve.
  const COMUM = [
    { p: ["senha", "esqueci", "login", "entrar", "acesso", "acessar"], r: "Na tela de entrada, toque em <b>Esqueci minha senha</b>. O link para criar uma senha nova chega no seu e-mail. Confira também a caixa de spam." },
    { p: ["convid", "equipe", "membro", "colaborador", "funcionario", "usuario", "acesso de"], r: "Abra <b>Equipe</b> e toque em <b>Convidar</b>. O convite gera um link para mandar por WhatsApp, por e-mail ou copiar. A pessoa cria a conta pelo link e já entra na sua empresa.", ir: "equipe" },
    { p: ["plano", "pagamento", "pagar", "boleto", "cobranca", "fatura", "assinatura", "cancelar", "preco", "valor"], r: "Plano, pagamento e cancelamento são tratados direto com o time NEXO. Toque em <b>Chamar no WhatsApp</b> que a gente resolve com você." },
    { p: ["um login", "marketing e vendas", "system e prospect", "os dois", "trocar de sistema", "mudar para"], r: "É um login só. No canto de cima do menu tem <b>Marketing</b> e <b>Vendas</b>: toque para trocar." },
  ];
  const SYSTEM = [
    { p: ["aprovar", "aprova", "aprovacao", "fila"], r: "Em <b>Aprovar</b>, veja a peça, ajuste a data se quiser e toque em <b>Aprovar</b>. Ela só vai ao ar se <b>Publicar</b> estiver ligado no Início.", ir: "aprovar" },
    { p: ["sem arte", "arte", "imagem", "travada", "midia"], r: "Peça sem arte mostra o motivo no próprio cartão. Toque em <b>Pedir ajuste</b> e escreva o que quer (ex.: \"fazer a arte\"). A equipe refaz na rodada da manhã e a arte sai junto.", ir: "aprovar" },
    { p: ["reel", "video", "roteiro", "gravar"], r: "Reel é vídeo: a equipe escreve o roteiro e você grava. O roteiro aparece no cartão em <b>Ver roteiro</b>. Se preferir arte, peça ajuste com \"fazer a arte\" e ele vira carrossel.", ir: "aprovar" },
    { p: ["publicar", "publica", "postar", "nao saiu", "nao foi ao ar", "agendar", "horario", "data"], r: "Para ir ao ar, a peça precisa estar aprovada e o interruptor <b>Publicar</b> ligado no <b>Início</b>. Cada peça sai na data e hora do cartão. <b>Postar agora</b> no Aprovar publica na hora.", ir: "inicio" },
    { p: ["pausar", "pausa", "parar", "desligar", "retomar"], r: "No <b>Início</b>, ligue <b>Pausar tudo</b>. A equipe para na próxima atualização (até 1 hora). Para voltar, desligue o mesmo interruptor.", ir: "inicio" },
    { p: ["ideia", "pedir post", "pedir conteudo", "pauta", "tema"], r: "Em <b>Pedir peça</b>, escreva o tema e quantas peças quer. A equipe atende na próxima rodada e as peças chegam no Aprovar.", ir: "ideias" },
    { p: ["nome", "personalidade", "jeito de falar", "tom", "assinatura", "logo", "cor", "instrucao", "nivel", "autonomia"], r: "Tudo isso fica em <b>Identidade</b>, em 4 passos: nome, quanto ela faz sozinha, jeito de falar e o que precisa saber da empresa. Um botão salva tudo.", ir: "agente" },
    { p: ["faq", "resposta automatica", "responder comentario", "comentario", "direct", "fatos"], r: "As respostas automáticas saem da <b>Base da marca</b> (FAQ, fatos aprovados e voz da marca). A equipe só responde pelo que está lá.", ir: "conhecimento" },
    { p: ["instagram", "conectar", "integracao", "meta", "facebook"], r: "A conexão do Instagram fica em <b>Contas conectadas</b>. Se travar em algum passo, chame no WhatsApp que a gente conecta junto com você.", ir: "integracoes" },
    { p: ["lead", "abordar", "abordado", "mensagem pronta", "contato"], r: "Copie a mensagem pronta do lead, mande pelo seu Instagram ou WhatsApp e mude o status para <b>Abordado</b>. Nada é enviado sozinho." },
    { p: ["historico", "atividade", "quem mudou", "registro", "log"], r: "No <b>Histórico</b> fica tudo o que a equipe fez e quem mudou o quê no painel.", ir: "atividade" },
    { p: ["funcao", "funcoes", "o que ela faz", "ligar funcao"], r: "Em <b>Permissões</b> você liga e desliga o que a equipe pode fazer.", ir: "funcoes" },
  ];
  const PROSPECT = [
    { p: ["campanha", "pesquisar", "pesquisa", "procurar", "buscar", "empresa"], r: "Crie uma <b>Busca</b> dizendo o que você vende, onde e para quem. O robô pesquisa nas rodadas de 06:10, 12:10 e 18:10, só em fontes públicas.", ir: "campanhas" },
    { p: ["enviar", "envia", "mensagem", "whatsapp do lead", "abordar"], r: "A área de Vendas prepara a mensagem, mas <b>quem envia é você</b>, pelo seu canal. Copie em Clientes, revise e mande. Nada sai daqui sozinho.", ir: "crm" },
    { p: ["nota", "score", "prioridade", "alta", "media"], r: "A nota vai de 0 a 100: contato disponível (até 30), evidências (até 30), oportunidade comprovada (20), atividade recente (15) e segmento (5). <b>Alta</b> a partir de 70.", ir: "ajuda" },
    { p: ["crm", "funil", "proposta", "contrato", "etapa", "lead"], r: "Em <b>Clientes</b> você vê cada oportunidade com a evidência e a mensagem pronta, e registra contatos, propostas e contratos.", ir: "crm" },
    { p: ["tarefa", "follow", "retorno", "lembrete"], r: "Em <b>Tarefas</b> ficam os retornos combinados com data. As de hoje aparecem com um número no menu.", ir: "tarefas" },
    { p: ["duplicado", "repetido", "igual"], r: "Duplicado é nome parecido na mesma cidade. Confira antes de abordar para não falar duas vezes com a mesma empresa.", ir: "crm" },
    { p: ["nao achou", "poucos", "nenhum lead", "demora", "quando chega"], r: "Os leads chegam nas rodadas de 06:10, 12:10 e 18:10. Busca muito estreita (cidade pequena ou nicho raro) traz menos resultados. Se passar um dia sem nada, chame no WhatsApp.", ir: "campanhas" },
  ];
  const norm = s => String(s || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();
  let cfg = null, numero = "", aberto = false;

  function responder(pergunta) {
    const q = " " + norm(pergunta) + " ";
    let melhor = null, nota = 0;
    for (const it of [...(cfg.produto === "Vendas" ? PROSPECT : SYSTEM), ...COMUM]) {
      let n = 0;
      for (const k of it.p) { const kk = norm(k); if (q.includes(" " + kk)) n += kk.includes(" ") ? 2 : 1; }   // começo de palavra; frase vale mais
      if (n > nota) { nota = n; melhor = it; }
    }
    return melhor;
  }
  async function quem() {
    let nome = (cfg.nome && cfg.nome()) || "";
    if (!nome) try { const { data } = await sb.auth.getSession(); nome = data.session?.user?.user_metadata?.full_name || ""; } catch { /* sem nome */ }
    return { nome, empresa: (cfg.empresa && cfg.empresa()) || "" };
  }
  async function linkZap(pergunta) {
    const q = await quem();
    const txt = `Oi! Sou ${q.nome || "cliente"}${q.empresa ? ` da ${q.empresa}` : ""} e preciso de ajuda na NEXO Prospect (${cfg.produto}).` + (pergunta ? `\n\n${pergunta}` : "");
    return `https://wa.me/${numero}?text=${encodeURIComponent(txt)}`;
  }
  function bolha(html, de = "ela") {
    const b = document.createElement("div");
    b.className = "sp-msg " + de; b.innerHTML = html;
    $("#spConversa").appendChild(b); $("#spConversa").scrollTop = 1e6;
    return b;
  }
  function botaoZap(pergunta) {
    if (!numero) return `<span class="sp-sem">O time NEXO responde pelo e-mail de cadastro.</span>`;
    return `<a class="sp-zap" data-zap="${esc(pergunta || "")}" href="https://wa.me/${numero}" target="_blank" rel="noopener">${ICONE_ZAP} Chamar no WhatsApp</a>`;
  }
  function ligarZaps(raiz) {
    raiz.querySelectorAll("[data-zap]").forEach(a => a.onclick = async ev => {   // monta o texto na hora, com quem está pedindo
      ev.preventDefault(); window.open(await linkZap(a.dataset.zap), "_blank", "noopener");
    });
  }
  function perguntar(texto) {
    texto = String(texto || "").trim().slice(0, 500);
    if (!texto) return;
    bolha(esc(texto), "eu");
    const it = responder(texto);
    const b = it
      ? bolha(`${it.r}<div class="sp-acoes">${it.ir && cfg.ir && (cfg.abas || []).includes(it.ir) ? `<button type="button" class="sp-ir">Abrir ${esc(NOME_ABA[it.ir] || it.ir)}</button>` : ""}<span class="sp-ainda">Não resolveu?</span>${botaoZap(texto)}</div>`)
      : bolha(`Essa eu não sei responder daqui. Fala com o time NEXO, que é rapidinho:<div class="sp-acoes">${botaoZap(texto)}</div>`);
    const ir = b.querySelector(".sp-ir");
    if (ir) ir.onclick = () => { cfg.ir(it.ir); fechar(); };
    ligarZaps(b);
  }
  const NOME_ABA = { equipe: "Equipe", aprovar: "Aprovar", inicio: "Início", ideias: "Pedir peça", agente: "Identidade", conhecimento: "Base da marca",
    integracoes: "Contas conectadas", atividade: "Histórico", funcoes: "Permissões", campanhas: "Buscas", crm: "Clientes", tarefas: "Tarefas", ajuda: "Ajuda" };
  const SUGESTOES = { Marketing: ["Como aprovar uma peça?", "Por que a peça está sem arte?", "Como convidar alguém?", "Como pausar a equipe?"],
    Vendas: ["Como criar uma busca?", "A Faro envia mensagem?", "Como funciona a nota?", "Quando chegam os leads?"] };
  const ICONE_ZAP = `<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path fill="currentColor" d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2zm0 18.2a8.2 8.2 0 0 1-4.2-1.1l-.3-.2-3 .8.8-2.9-.2-.3A8.2 8.2 0 1 1 12 20.2zm4.5-6.1c-.2-.1-1.5-.7-1.7-.8s-.4-.1-.6.1-.7.8-.8 1-.3.2-.5.1a6.7 6.7 0 0 1-3.3-2.9c-.3-.4.3-.4.7-1.3.1-.2 0-.3 0-.4l-.8-1.8c-.2-.5-.4-.4-.6-.4h-.5a1 1 0 0 0-.7.3 3 3 0 0 0-.9 2.2 5.2 5.2 0 0 0 1.1 2.7 11.8 11.8 0 0 0 4.5 4c1.7.7 2.3.8 3.2.6a2.7 2.7 0 0 0 1.8-1.2 2.2 2.2 0 0 0 .1-1.2c0-.1-.2-.2-.5-.3z"/></svg>`;

  function montar() {
    const raiz = document.createElement("div");
    raiz.id = "suporte";
    raiz.innerHTML = `
      <button type="button" class="sp-abrir" id="spAbrir" aria-expanded="false" aria-controls="spPainel"><img src="${esc(cfg.onca.img)}" alt=""><span>Suporte</span></button>
      <section class="sp-painel" id="spPainel" role="dialog" aria-label="Suporte NEXO" hidden>
        <header class="sp-topo"><img src="${esc(cfg.onca.img)}" alt=""><div><b>${esc(cfg.onca.nome)} · Suporte</b><span>Respostas na hora. Se precisar, chama o time no WhatsApp.</span></div>
          <button type="button" class="sp-fechar" id="spFechar" aria-label="Fechar o suporte">×</button></header>
        <div class="sp-conversa" id="spConversa" aria-live="polite"></div>
        <div class="sp-sug" id="spSug">${SUGESTOES[cfg.produto].map(s => `<button type="button">${esc(s)}</button>`).join("")}</div>
        <form class="sp-form" id="spForm"><input id="spTxt" type="text" maxlength="500" placeholder="Escreva sua dúvida" autocomplete="off" aria-label="Sua dúvida">
          <button type="submit" class="sp-enviar">Perguntar</button></form>
        <div class="sp-rodape" id="spRodape"></div>
      </section>`;
    document.body.appendChild(raiz);
    $("#spAbrir").onclick = () => (aberto ? fechar() : abrir());
    $("#spFechar").onclick = fechar;
    $("#spForm").onsubmit = ev => { ev.preventDefault(); const t = $("#spTxt"); perguntar(t.value); t.value = ""; };
    $$("#spSug button").forEach(b => b.onclick = () => perguntar(b.textContent));
    document.addEventListener("keydown", e => { if (e.key === "Escape" && aberto) fechar(); });
  }
  async function abrir() {
    aberto = true; $("#spPainel").hidden = false; $("#spAbrir").setAttribute("aria-expanded", "true");
    if (!$("#spConversa").children.length) {
      const q = await quem(), primeiro = (q.nome || "").split(" ")[0];
      bolha(`Oi${primeiro ? ", " + esc(primeiro) : ""}! Eu sou a onça ${esc(cfg.onca.nome)}. Me conta a dúvida ou toque numa das perguntas abaixo.`);
    }
    $("#spRodape").innerHTML = numero ? `Prefere falar com uma pessoa? ${botaoZap("")}` : "";
    ligarZaps($("#spRodape"));
    setTimeout(() => $("#spTxt").focus(), 50);
  }
  function fechar() { aberto = false; $("#spPainel").hidden = true; $("#spAbrir").setAttribute("aria-expanded", "false"); }

  async function iniciar(opcoes) {
    if (cfg) return;   // uma vez por página
    cfg = opcoes;
    try { const data = cfg.rpc ? await cfg.rpc("nexo_suporte") : (await sb.rpc("nexo_suporte")).data; numero = /^\d{12,13}$/.test(data?.whatsapp || "") ? data.whatsapp : ""; } catch { numero = ""; }
    montar();
  }
  return { iniciar, responder: t => { const it = responder(t); return it ? it.r : null; }, numero: () => numero };
})();
