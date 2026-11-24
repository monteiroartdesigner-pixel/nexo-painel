"use strict";
// ============================================================================
// VÍDEO EXPLICATIVO DA EQUIPE NEXO (tela de login, pedido do Ricardo em 17/11/2026).
// Cenas revistas em 19/11/2026 (nomes novos: Marketing, Vendas, Pedir peça, Clientes, Buscas; Equipe, Tarefas e Suporte entraram). Narração: só a gravação da voz do Claude
// (assets/explicador/audio2/cena_00.mp3 …, uma por cena, na ordem de EXP_CENAS). Sem ela, as cenas passam com legenda.
// A voz do navegador saiu (Ricardo, 17/11: "não quero essa narração").
// Só fatos do que está construído. Narração: "a onça" + nome (regra do Ricardo).
// ============================================================================

// base: "" nas duas páginas (Marketing e Prospect ficam na raiz do site)
let EXP_BASE = "";
const EXP_IMG = n => `${EXP_BASE}assets/explicador/${n}.webp`;
// 24/11/2026: no site do Prospect a entrada mostra o vídeo de apresentação do Nexo Prospect (arquivo MP4 com narração do Thales e legendas, assets/prospect-apresentacao.mp4); no Marketing, as cenas de sempre.
const EXP_PRODUTO = /\/marketing(\.html)?\/?$/.test(location.pathname) ? "marketing" : "prospect";
const EXP_AUDIO = n => `${EXP_BASE}assets/explicador/audio2/cena_${String(n).padStart(2, "0")}.mp3`;
const EXP_CENAS_MARKETING = [
  { tit: "Abertura", so: "marketing", eb: "NEXO Prospect", h: "Uma equipe de onças trabalhando por você", abre: true,
    fala: "Esta é a equipe da NEXO. Enquanto você cuida do seu dia, ela pesquisa clientes, prepara mensagens e cria conteúdo. Vou te mostrar, do começo ao fim, o que a sua automação faz.",
    vis: `<div class="exp-chips"><span class="exp-chip">Marketing</span><span class="exp-chip">Vendas</span><span class="exp-chip">Atendimento</span></div>` },
  { tit: "Quando trabalha", eb: "Sozinha, na nuvem", h: "Três rodadas por dia", img: "pintada",
    fala: "Três vezes por dia, às seis e dez, ao meio-dia e dez e às dezoito e dez, a equipe acorda sozinha, na nuvem. O seu computador pode estar desligado. E se o GitHub atrasar um horário, uma rodada de reserva entra no lugar.",
    vis: `<div class="exp-horas"><span class="exp-hora">06:10</span><span class="exp-hora">12:10</span><span class="exp-hora">18:10</span></div><div class="exp-chips"><span class="exp-chip">Computador desligado</span><span class="exp-chip">Rodada de reserva</span></div>` },
  { tit: "A gestora", so: "marketing", eb: "Onça Pintada · gestora da equipe", h: "Primeiro, ela lê o retrato do dia", img: "pintada",
    fala: "A onça Pintada, gestora da equipe, começa lendo o retrato do dia: as métricas do Instagram, os leads que já existem, os conteúdos agendados e tudo o que você pediu no painel.",
    vis: `<div class="exp-fluxo"><span>Métricas do Instagram</span><span>Leads</span><span>Agenda de posts</span><span>Seus pedidos</span></div>` },
  { tit: "Equipe ao vivo", so: "marketing", eb: "Aba Equipe", h: "Veja cada onça trabalhando", abre: true,
    fala: "Na aba Equipe, você vê cada onça: quem está trabalhando, quem está descansando e o que cada uma entregou. E a equipe sobe de nível conforme entrega.",
    vis: `<div class="exp-chips"><span class="exp-chip">Na ativa agora</span><span class="exp-chip">Entregas recentes</span><span class="exp-chip">Nível da equipe</span></div>` },
  { tit: "Leads do Várzea", soCasa: true, eb: "Onça Faro · pesquisa e prospecção", h: "Times, ligas e escolinhas para o NEXO Várzea", img: "faro",
    fala: "A onça Faro pesquisa times, ligas, campeonatos e escolinhas de futebol amador. Ela usa só informação pública, procura o contato oficial do time e dá uma nota para cada lead. Quem tem contato e nota boa vai para Para abordar, com a mensagem pronta.",
    vis: `<div class="exp-cartao"><b>Lead encontrado</b><div class="lin"><span>Fonte</span>perfil público</div><div class="lin"><span>Contato</span>só o oficial do time</div><div class="lin"><span>Destino</span>Para abordar, com mensagem</div></div>` },
  { tit: "Conteúdo", so: "marketing", eb: "Onças Rabisco e Vitrine", h: "Posts prontos, publicados só com o seu OK", duo: ["rabisco", "vitrine"],
    fala: "A onça Rabisco cria as peças do Instagram: posts, carrosséis, stories e roteiros de reels, com legenda e chamada. Tudo cai na aba Aprovar. Se quiser mudar algo, é só pedir um ajuste, e a equipe refaz a peça. E a onça Vitrine só publica o que você aprovou.",
    vis: `<div class="exp-chips"><span class="exp-chip">Post</span><span class="exp-chip">Carrossel</span><span class="exp-chip">Story</span><span class="exp-chip">Roteiro de reels</span></div><div class="exp-fluxo"><span>Criado</span><i>→</i><span>Aprovar ou pedir ajuste</span><i>→</i><span>Publicado</span></div>` },
  { tit: "Pedir peça", so: "marketing", eb: "Aba Pedir peça", h: "Você dá o tema, a equipe faz as peças", img: "rabisco",
    fala: "Na aba Pedir peça, você escreve um tema, ou cola a transcrição de um vídeo seu. A equipe usa as suas palavras para montar carrossel, guia ou roteiro, e explica por que escolheu cada formato.",
    vis: `<div class="exp-fluxo"><span>Seu tema ou seu vídeo</span><i>→</i><span>Peças com as suas palavras</span></div>` },
  { tit: "Atendimento", so: "marketing", eb: "Onça Papo · atendimento", h: "Respostas só com fatos que você aprovou", img: "papo",
    fala: "A onça Papo cuida do atendimento. Ela usa só os fatos que você aprovou na Base da marca. O que ela não sabe responder, ela não inventa: separa a pergunta para você.",
    vis: `<div class="exp-chips"><span class="exp-chip ok">Base da marca</span><span class="exp-chip ok">Fatos aprovados</span><span class="exp-chip nao">Nada inventado</span></div>` },
  { tit: "Vendas", eb: "Área de Vendas · onça Faro", h: "Você diz o que vende, ela busca as empresas", img: "faro",
    fala: "Na área de Vendas, você cria uma busca dizendo o que vende, onde e para quem. Nas rodadas do dia, a onça Faro procura empresas em fontes públicas e entrega cada uma em Clientes, com nota e mensagem pronta.",
    vis: `<div class="exp-fluxo"><span>Sua busca</span><i>→</i><span>Pesquisa em fontes públicas</span><i>→</i><span>Clientes</span></div><div class="exp-chips"><span class="exp-chip">Nota de 0 a 100</span><span class="exp-chip">Mensagem pronta</span></div>` },
  { tit: "Análise comercial", eb: "Cada empresa, uma análise", h: "O que faz, o que falta e como abordar", img: "lupa",
    fala: "Para cada empresa, a equipe escreve uma análise comercial: o que ela faz, os problemas que dá para ver, o que dá para oferecer, o potencial e a melhor abordagem. E não repete empresa: confere CNPJ, site, e-mail e telefone.",
    vis: `<div class="exp-cartao"><b>Análise comercial</b><div class="lin"><span>O que faz</span>visto no site e no perfil</div><div class="lin"><span>Problemas</span>só com sinal visível</div><div class="lin"><span>Oferta</span>o que dá para propor</div><div class="lin"><span>Sem repetir</span>CNPJ, site, e-mail, telefone</div></div>` },
  { tit: "Dúvida vira pergunta", eb: "Na dúvida, ela pergunta", h: "A equipe pergunta antes de escrever", img: "faro",
    fala: "Quando a equipe não tem certeza sobre um lead, ela não chuta. Ela deixa uma pergunta curta para você no painel, e só escreve a mensagem depois da sua resposta.",
    vis: `<div class="exp-fluxo"><span>Dúvida</span><i>→</i><span>Pergunta para você</span><i>→</i><span>Mensagem certa</span></div>` },
  { tit: "Mandar link", eb: "Você manda o link", h: "O robô faz o resto", img: "faro",
    fala: "E quando você achar uma empresa, é só colar o link no Início de Vendas. Na rodada seguinte, o robô abre o link, analisa e deixa a empresa em Clientes, com a mensagem pronta. Se não servir, ele descarta e explica o motivo.",
    vis: `<div class="exp-colar"><span class="campo-f">instagram.com/nome_da_empresa</span><span class="bt">Mandar para a equipe</span></div><div class="exp-fluxo"><span>Link</span><i>→</i><span>Análise</span><i>→</i><span>Clientes</span></div>` },
  { tit: "Clientes e tarefas", eb: "Do primeiro contato ao contrato", h: "Cada cliente com o próximo passo", img: "lupa",
    fala: "Em Clientes, você registra o contato, a resposta, a proposta e o contrato. Ao registrar um contato ou uma proposta, o painel já cria o follow-up em Tarefas. E se o cliente pediu retorno, você marca o dia e ele fica em destaque.",
    vis: `<div class="exp-fluxo"><span>Contato</span><i>→</i><span>Resposta</span><i>→</i><span>Proposta</span><i>→</i><span>Contrato</span></div><div class="exp-chips"><span class="exp-chip">Follow-up em Tarefas</span><span class="exp-chip">Pediu retorno</span></div>` },
  { tit: "Painel", eb: "Onça Lupa · análise", h: "Tudo à vista no quadro Automação", img: "lupa",
    fala: "A onça Lupa acompanha os números. No quadro Automação, você vê as pesquisas do dia, o que foi encontrado, aprovado e descartado, as mensagens prontas, a próxima rodada e qualquer erro.",
    vis: `<div class="exp-chips"><span class="exp-chip">Pesquisas do dia</span><span class="exp-chip">Encontradas</span><span class="exp-chip">Mensagens prontas</span><span class="exp-chip">Próxima rodada</span><span class="exp-chip">Avisos e erros</span></div>` },
  { tit: "Suporte", so: "marketing", eb: "Botão Suporte", h: "Dúvida? Uma onça responde na hora", duo: ["pintada", "faro"],
    fala: "Ficou com alguma dúvida? Toque em Suporte. A onça Pintada, no Marketing, e a onça Faro, em Vendas, respondem na hora. E se precisar, você chama a gente no WhatsApp.",
    vis: `<div class="exp-chips"><span class="exp-chip">Resposta na hora</span><span class="exp-chip ok">Chamar no WhatsApp</span></div>` },
  { tit: "Regra de ouro", eb: "Quem decide é você", h: "Nada sai sem o seu OK", img: "pintada",
    fala: "E a regra de ouro: nada é enviado, publicado ou pago sem o seu OK. A equipe prepara tudo. Você abre o painel, revisa e manda.",
    vis: `<div class="exp-grande">Você decide.</div><div class="exp-chips"><span class="exp-chip nao">Nada enviado sozinho</span><span class="exp-chip nao">Nada publicado sozinho</span><span class="exp-chip nao">Nada pago sozinho</span></div>` },
// 25/11/2026, Ricardo: o Prospect é independente do Marketing. No site do Prospect o vídeo só mostra as cenas de vendas (so: "marketing" = só na página do Marketing).
// O áudio de cada cena é pelo número original (n), então tirar cenas não desalinha a narração.
].map((c, n) => ({ ...c, n })).filter(c => !c.soCasa);   // soCasa: cena só da casa (NEXO VÁRZEA), fora do vídeo dos clientes

const EXP_CENAS = EXP_CENAS_MARKETING;

// Vídeo de apresentação do Nexo Prospect: um arquivo só, com narração e legendas; só baixa quando a pessoa aperta o play.
function explicadorFilmeProspect(el) {
  el.classList.add("exp");
  el.innerHTML = `
    <div class="exp-topo"><span class="ey">NEXO · Design &amp; Automação</span><h2>NEXO Prospect em Ação</h2>
      <p>Veja em menos de 2 minutos o que o Nexo Prospect faz pela sua empresa.</p></div>
    <div class="exp-filme"><video controls preload="none" playsinline poster="${EXP_BASE}assets/prospect-apresentacao-poster.jpg" width="1280" height="720"
      aria-label="Vídeo de apresentação do NEXO Prospect, com narração e legendas"><source src="${EXP_BASE}assets/prospect-apresentacao.mp4" type="video/mp4">
      Seu navegador não toca vídeo. Fale com a NEXO para conhecer o Prospect.</video></div>
    <p class="exp-filme-nota">As telas do vídeo usam dados de exemplo.</p>`;
}

function explicadorMontar(el, opcoes = {}) {
  if (!el || el.dataset.montado) return;
  el.dataset.montado = "1";
  EXP_BASE = opcoes.base || "";
  if (EXP_PRODUTO === "prospect") return explicadorFilmeProspect(el);
  const N = EXP_CENAS.length;
  const img = n => `<img src="${EXP_IMG(n)}" alt="" width="352" height="440" loading="lazy" decoding="async">`;
  el.classList.add("exp");
  el.innerHTML = `
    <div class="exp-topo"><span class="ey">NEXO · Design &amp; Automação</span><h2>${EXP_PRODUTO === "prospect" ? "NEXO Prospect em Ação" : "Equipe NEXO em Ação"}</h2>
      <p>${EXP_PRODUTO === "prospect" ? "O que a onça Faro faz pelas suas vendas" : "O que a equipe de onças faz pelo seu marketing e pelas suas vendas"}, em ${N} cenas.</p></div>
    <section class="exp-palco" aria-label="${EXP_PRODUTO === "prospect" ? "Vídeo explicativo do NEXO Prospect" : "Vídeo explicativo da equipe NEXO"}">
      ${EXP_CENAS.map((c, i) => `<article class="exp-cena${c.abre ? " abre" : ""}" data-i="${i}" aria-hidden="true">
        ${c.abre ? `<div class="exp-time">${["papo", "rabisco", "vitrine", "faro", "pintada", "lupa"].map(img).join("")}</div>`
          : `<div class="exp-pers">${c.duo ? `<div class="exp-duo">${c.duo.map(img).join("")}</div>` : img(c.img)}</div>`}
        <div class="exp-info"><div class="exp-eb">${c.eb}</div><h3>${c.h}</h3>${c.vis}</div></article>`).join("")}
      <div class="exp-leg" aria-live="polite"><span></span></div>
      <div class="exp-barra"><i></i></div>
      <button class="exp-play" type="button" aria-label="Assistir a apresentação"><span><svg viewBox="0 0 24 24" fill="currentColor"><path d="M7 4l13 8-13 8z"/></svg>Assistir</span></button>
    </section>
    <div class="exp-ctls">
      <button class="exp-ctl" type="button" data-exp="ant" aria-label="Cena anterior"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M15 18l-6-6 6-6"/></svg></button>
      <button class="exp-ctl pri" type="button" data-exp="play"><svg viewBox="0 0 24 24" fill="currentColor"><path d="M7 4l13 8-13 8z"/></svg><span>Assistir</span></button>
      <button class="exp-ctl" type="button" data-exp="prox" aria-label="Próxima cena"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 6l6 6-6 6"/></svg></button>
      <span class="exp-cont">Cena 1 de ${N}</span>
      <span class="exp-esp"></span>
      ${opcoes.irPara ? `<a class="exp-ir" href="${opcoes.irPara}">Ir para o login <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><path d="M12 5v14M6 13l6 6 6-6"/></svg></a>` : ""}
    </div>
    <nav class="exp-caps" aria-label="Capítulos">${EXP_CENAS.map((c, i) => `<button type="button" class="exp-cap" data-cap="${i}"><b>${String(i + 1).padStart(2, "0")}</b>${c.tit}</button>`).join("")}</nav>`;

  const q = s => el.querySelector(s), qa = s => [...el.querySelectorAll(s)];
  const leg = q(".exp-leg span"), barra = q(".exp-barra i"), btPlay = q('[data-exp="play"]'), grande = q(".exp-play");
  let atual = 0, tocando = false, pausado = false, sessao = 0, timer = null, audio = null, temAudio = null;

  const mostrar = i => {
    atual = Math.max(0, Math.min(N - 1, i));
    qa(".exp-cena").forEach(c => { const on = +c.dataset.i === atual; c.classList.toggle("on", on); c.setAttribute("aria-hidden", on ? "false" : "true"); });
    leg.textContent = EXP_CENAS[atual].fala;
    barra.style.width = ((atual + 1) / N * 100) + "%";
    q(".exp-cont").textContent = `Cena ${atual + 1} de ${N}`;
    qa(".exp-cap").forEach(b => b.classList.toggle("on", +b.dataset.cap === atual));
  };
  const botao = () => {
    const lbl = tocando && !pausado ? "Pausar" : pausado ? "Continuar" : (atual >= N - 1 ? "Assistir de novo" : "Assistir");
    btPlay.querySelector("span").textContent = lbl;
    btPlay.querySelector("svg").innerHTML = tocando && !pausado ? '<path d="M7 4h4v16H7zM13 4h4v16h-4z"/>' : '<path d="M7 4l13 8-13 8z"/>';
    grande.hidden = tocando || pausado;
  };
  const parar = () => {
    clearTimeout(timer);
    if (audio) { audio.onended = null; audio.pause(); audio = null; }
    try { window.speechSynthesis && speechSynthesis.cancel(); } catch {}
  };
  // Voz do navegador: a melhor voz pt-BR que houver (as "online/natural" soam melhor).
  const vozPt = () => {
    const vs = (window.speechSynthesis && speechSynthesis.getVoices()) || [];
    const pt = vs.filter(v => /^pt(-|_)BR/i.test(v.lang));
    return pt.find(v => /natural|online|francisca|antonio/i.test(v.name)) || pt.find(v => /google/i.test(v.name)) || pt[0] || null;
  };
  const falarNavegador = (texto, minha, fim) => {
    // o Chrome corta falas longas: fala frase por frase
    const frases = texto.match(/[^.!?:]+[.!?:]?/g).map(s => s.trim()).filter(Boolean);
    const v = vozPt();
    const prox = k => {
      if (minha !== sessao) return;
      if (k >= frases.length) { timer = setTimeout(fim, 450); return; }
      const u = new SpeechSynthesisUtterance(frases[k]);
      u.lang = "pt-BR"; if (v) u.voice = v; u.rate = 1.03;
      u.onend = () => prox(k + 1); u.onerror = () => prox(k + 1);
      speechSynthesis.speak(u);
    };
    prox(0);
  };
  const tocarDe = async i => {
    const minha = ++sessao; parar();
    tocando = true; pausado = false; mostrar(i); botao();
    if (temAudio === null) {
      try { temAudio = (await fetch(EXP_AUDIO(0), { method: "HEAD" })).ok; } catch { temAudio = false; }
      if (minha !== sessao) return;
    }
    const passo = j => {
      if (minha !== sessao) return;
      if (j >= N) { tocando = false; botao(); return; }
      mostrar(j);
      const seguir = () => passo(j + 1);
      if (temAudio) {
        // Um arquivo por cena do vídeo, na ordem em que aparecem. Cena ainda sem gravação: passa com legenda.
        const soLegenda = () => { if (minha !== sessao) return; audio = null; timer = setTimeout(seguir, Math.max(5, EXP_CENAS[j].fala.split(/\s+/).length / 2.6) * 1000); };
        audio = new Audio(EXP_AUDIO(j));
        audio.onended = () => { timer = setTimeout(seguir, 350); };
        audio.onerror = soLegenda;
        audio.play().catch(e => { if (e && e.name === "NotAllowedError") { tocando = false; botao(); } else soLegenda(); });
      } else {   // sem a gravação da voz do Claude: as cenas passam com legenda (o Ricardo não quer a voz do navegador)
        timer = setTimeout(seguir, Math.max(5, EXP_CENAS[j].fala.split(/\s+/).length / 2.6) * 1000);
      }
    };
    passo(i);
  };
  const pausar = () => {
    pausado = true; botao();
    if (audio) audio.pause(); else if (window.speechSynthesis && speechSynthesis.speaking) speechSynthesis.pause(); else clearTimeout(timer);
  };
  const continuar = () => {
    if (audio) { pausado = false; botao(); audio.play(); }
    else if (window.speechSynthesis && speechSynthesis.paused) { pausado = false; botao(); speechSynthesis.resume(); }
    else tocarDe(atual);
  };
  const irPara = i => { if (tocando || pausado) tocarDe(i); else { mostrar(i); botao(); } };

  btPlay.onclick = () => tocando && !pausado ? pausar() : pausado ? continuar() : tocarDe(atual >= N - 1 ? 0 : atual);
  grande.onclick = () => tocarDe(atual);
  q('[data-exp="ant"]').onclick = () => irPara(atual - 1);
  q('[data-exp="prox"]').onclick = () => irPara(atual + 1);
  q(".exp-caps").onclick = e => { const b = e.target.closest("[data-cap]"); if (b) irPara(+b.dataset.cap); };
  mostrar(0); botao();
  // quem entra no sistema não precisa da narração tocando por trás
  return { parar: () => { sessao++; parar(); tocando = false; pausado = false; botao(); } };
}
