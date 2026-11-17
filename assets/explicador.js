"use strict";
// ============================================================================
// VÍDEO EXPLICATIVO DA EQUIPE NEXO (tela de login, pedido do Ricardo em 17/11/2026).
// As mesmas 13 cenas da página narrada no claude.ai. Narração:
//   1) a gravação da voz do Claude, se existir: assets/explicador/audio/cena_00.mp3 … cena_12.mp3;
//   2) senão, a voz em português do próprio navegador (speechSynthesis);
//   3) sem voz nenhuma, as cenas passam sozinhas com legenda.
// Só fatos do que está construído. Narração: "a onça" + nome (regra do Ricardo).
// ============================================================================

// base: "" no NEXO System, "../" no NEXO Prospect (que fica na pasta prospect/)
let EXP_BASE = "";
const EXP_IMG = n => `${EXP_BASE}assets/explicador/${n}.webp`;
const EXP_AUDIO = n => `${EXP_BASE}assets/explicador/audio/cena_${String(n).padStart(2, "0")}.mp3`;
const EXP_CENAS = [
  { tit: "Abertura", eb: "NEXO", h: "Uma equipe de onças trabalhando por você", abre: true,
    fala: "Esta é a equipe da NEXO. Enquanto você cuida do seu dia, ela pesquisa clientes, prepara mensagens e cria conteúdo. Vou te mostrar, do começo ao fim, o que a sua automação faz.",
    vis: `<div class="exp-chips"><span class="exp-chip">Prospecção</span><span class="exp-chip">Marketing</span><span class="exp-chip">Atendimento</span></div>` },
  { tit: "Quando trabalha", eb: "Sozinha, na nuvem", h: "Três rodadas por dia", img: "pintada",
    fala: "Três vezes por dia, às seis e dez, ao meio-dia e dez e às dezoito e dez, a equipe acorda sozinha, na nuvem. O seu computador pode estar desligado. E se o GitHub atrasar um horário, uma rodada de reserva entra no lugar.",
    vis: `<div class="exp-horas"><span class="exp-hora">06:10</span><span class="exp-hora">12:10</span><span class="exp-hora">18:10</span></div><div class="exp-chips"><span class="exp-chip">Computador desligado</span><span class="exp-chip">Rodada de reserva</span></div>` },
  { tit: "A gestora", eb: "Onça Pintada · gestora da equipe", h: "Primeiro, ela lê o retrato do dia", img: "pintada",
    fala: "A onça Pintada, gestora da equipe, começa lendo o retrato do dia: as métricas do Instagram, os leads que já existem, os conteúdos agendados e tudo o que você pediu no painel.",
    vis: `<div class="exp-fluxo"><span>Métricas do Instagram</span><span>Leads</span><span>Agenda de posts</span><span>Seus pedidos</span></div>` },
  { tit: "Leads do Várzea", eb: "Onça Faro · pesquisa e prospecção", h: "Times, ligas e escolinhas para o NEXO Várzea", img: "faro",
    fala: "A onça Faro pesquisa times, ligas, campeonatos e escolinhas de futebol amador. Ela usa só informação pública, procura o contato oficial do time e dá uma nota para cada lead. Quem tem contato e nota boa vai para Para abordar, com a mensagem pronta.",
    vis: `<div class="exp-cartao"><b>Lead encontrado</b><div class="lin"><span>Fonte</span>perfil público</div><div class="lin"><span>Contato</span>só o oficial do time</div><div class="lin"><span>Destino</span>Para abordar, com mensagem</div></div>` },
  { tit: "Dúvida vira pergunta", eb: "Classificação flexível", h: "Na dúvida, a equipe pergunta antes de escrever", img: "faro",
    fala: "Quando a equipe não tem certeza do tipo de lead, ela não chuta. Ela deixa uma pergunta curta para você no painel, e só escreve a mensagem depois da sua resposta.",
    vis: `<div class="exp-fluxo"><span>Dúvida</span><i>→</i><span>Pergunta para você</span><i>→</i><span>Mensagem certa</span></div>` },
  { tit: "Conteúdo", eb: "Onças Rabisco e Vitrine", h: "Posts prontos, publicados só com o seu OK", duo: ["rabisco", "vitrine"],
    fala: "A onça Rabisco cria as peças do Instagram: posts, carrosséis, stories e roteiros de reels, com legenda e chamada. Tudo cai na aba Aprovar. E a onça Vitrine só publica o que você aprovou.",
    vis: `<div class="exp-chips"><span class="exp-chip">Post</span><span class="exp-chip">Carrossel</span><span class="exp-chip">Story</span><span class="exp-chip">Roteiro de reels</span></div><div class="exp-fluxo"><span>Criado</span><i>→</i><span>Aprovar</span><i>→</i><span>Publicado</span></div>` },
  { tit: "Suas ideias", eb: "Aba Ideias", h: "Você dá o tema, a equipe faz as peças", img: "rabisco",
    fala: "Na aba Ideias, você pede um tema, ou cola a transcrição de um vídeo seu. A equipe usa as suas palavras para montar carrossel, guia ou roteiro, e explica por que escolheu cada formato.",
    vis: `<div class="exp-fluxo"><span>Seu tema ou seu vídeo</span><i>→</i><span>Peças com as suas palavras</span></div>` },
  { tit: "Atendimento", eb: "Onça Papo · atendimento", h: "Respostas só com fatos que você aprovou", img: "papo",
    fala: "A onça Papo cuida do atendimento. Ela usa só os fatos que você aprovou no painel. O que ela não sabe responder, ela não inventa: separa a pergunta para você.",
    vis: `<div class="exp-chips"><span class="exp-chip ok">Fatos aprovados</span><span class="exp-chip nao">Nada inventado</span></div>` },
  { tit: "NEXO Prospect", eb: "Outra marca, outro funil", h: "Sete campanhas buscando empresas", img: "faro",
    fala: "Na outra marca, o NEXO Prospect, sete campanhas rodam no automático, de segunda a sábado, cada uma no seu turno: sites, sistemas web, aplicativos empresariais, automação e inteligência artificial, soluções personalizadas, freelas e design.",
    vis: `<div class="exp-chips"><span class="exp-chip"><b>Manhã</b> Sites</span><span class="exp-chip"><b>Manhã</b> Sistemas web</span><span class="exp-chip"><b>Manhã</b> Aplicativos</span><span class="exp-chip"><b>Tarde</b> Automação e IA</span><span class="exp-chip"><b>Tarde</b> Personalizadas</span><span class="exp-chip"><b>Noite</b> Freelas</span><span class="exp-chip"><b>Noite</b> Design</span></div>` },
  { tit: "Análise comercial", eb: "Cada empresa, uma análise", h: "O que faz, o que falta e como abordar", img: "lupa",
    fala: "Para cada empresa, a equipe escreve uma análise comercial: o que ela faz, os problemas que dá para ver, o sistema que a NEXO faria, o potencial e a melhor abordagem. E não repete empresa: confere CNPJ, site, e-mail e telefone.",
    vis: `<div class="exp-cartao"><b>Análise comercial</b><div class="lin"><span>O que faz</span>visto no site e no perfil</div><div class="lin"><span>Problemas</span>só com sinal visível</div><div class="lin"><span>Sistema</span>o que a NEXO faria</div><div class="lin"><span>Sem repetir</span>CNPJ, site, e-mail, telefone</div></div>` },
  { tit: "Mandar link", eb: "Você manda o link", h: "O robô faz o resto", img: "faro",
    fala: "E quando você encontrar alguém, é só colar o link no painel. Na rodada seguinte, o robô abre o link, decide se é time ou empresa, analisa e deixa pronto em Para abordar. Se não servir, ele descarta e explica o motivo.",
    vis: `<div class="exp-colar"><span class="campo-f">instagram.com/nome_do_perfil</span><span class="bt">Mandar para a equipe</span></div><div class="exp-fluxo"><span>Time</span><i>→</i><span>NEXO Várzea</span><span>Empresa</span><i>→</i><span>NEXO Prospect</span></div>` },
  { tit: "Painel", eb: "Onça Lupa · análise", h: "Tudo à vista no quadro Automação", img: "lupa",
    fala: "A onça Lupa acompanha os números. No quadro Automação, você vê as pesquisas do dia, o que foi encontrado, aprovado e descartado, as mensagens prontas, a próxima rodada e qualquer erro.",
    vis: `<div class="exp-chips"><span class="exp-chip">Pesquisas do dia</span><span class="exp-chip">Encontradas</span><span class="exp-chip">Mensagens prontas</span><span class="exp-chip">Próxima rodada</span><span class="exp-chip">Avisos e erros</span></div>` },
  { tit: "Regra de ouro", eb: "Quem decide é você", h: "Nada sai sem o seu OK", img: "pintada",
    fala: "E a regra de ouro: nada é enviado, publicado ou pago sem o seu OK. A equipe prepara tudo. Você abre o painel, revisa e manda.",
    vis: `<div class="exp-grande">Você decide.</div><div class="exp-chips"><span class="exp-chip nao">Nada enviado sozinho</span><span class="exp-chip nao">Nada publicado sozinho</span><span class="exp-chip nao">Nada pago sozinho</span></div>` },
];

function explicadorMontar(el, opcoes = {}) {
  if (!el || el.dataset.montado) return;
  el.dataset.montado = "1";
  EXP_BASE = opcoes.base || "";
  const N = EXP_CENAS.length;
  const img = n => `<img src="${EXP_IMG(n)}" alt="" width="352" height="440" loading="lazy" decoding="async">`;
  el.classList.add("exp");
  el.innerHTML = `
    <div class="exp-topo"><span class="ey">NEXO · Design &amp; Automação</span><h2>Equipe NEXO em Ação</h2>
      <p>O que a equipe de onças faz pela sua prospecção e pelo seu marketing, em 13 cenas.</p></div>
    <section class="exp-palco" aria-label="Vídeo explicativo da equipe NEXO">
      ${EXP_CENAS.map((c, i) => `<article class="exp-cena${c.abre ? " abre" : ""}" data-i="${i}" aria-hidden="true">
        ${c.abre ? `<div class="exp-time">${["papo", "rabisco", "vitrine", "faro", "pintada", "lupa"].map(img).join("")}</div>`
          : `<div class="exp-pers">${c.duo ? `<div class="exp-duo">${c.duo.map(img).join("")}</div>` : img(c.img)}</div>`}
        <div class="exp-info"><div class="exp-eb">${c.eb}</div><h3>${c.h}</h3>${c.vis}</div></article>`).join("")}
      <div class="exp-leg" aria-live="polite"><span></span></div>
      <div class="exp-barra"><i></i></div>
      <button class="exp-play" type="button" aria-label="Assistir com narração"><span><svg viewBox="0 0 24 24" fill="currentColor"><path d="M7 4l13 8-13 8z"/></svg>Assistir com narração</span></button>
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
        audio = new Audio(EXP_AUDIO(j)); audio.onended = () => { timer = setTimeout(seguir, 350); };
        audio.play().catch(() => { tocando = false; botao(); });
      } else if (window.speechSynthesis) {
        falarNavegador(EXP_CENAS[j].fala, minha, seguir);
      } else {
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
  if (window.speechSynthesis) speechSynthesis.getVoices();   // carrega a lista de vozes antes do primeiro clique
  mostrar(0); botao();
  // quem entra no sistema não precisa da narração tocando por trás
  return { parar: () => { sessao++; parar(); tocando = false; pausado = false; botao(); } };
}
