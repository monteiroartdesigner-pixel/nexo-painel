"use strict";
// ============================================================================
// EQUIPE DE ONÇAS · o agente autônomo de marketing visto como uma equipe.
// Cada onça representa um trabalho REAL do agente e reage aos registros reais
// (mkt.log via nexo_atividades, e o resumo de nexo_resumo). Nada é simulado:
// sem registro, a onça descansa e diz quando é a próxima ronda prevista.
// Usa rpc, st, esc, quando e abrirAba do painel (index.html).
// ============================================================================


// Quem faz o quê. "acoes" são os nomes gravados pelo agente em mkt.log.
const EQUIPE = [
  { id: "gestora", nome: "Pintada", cargo: "Gestora da equipe", roupa: "#1f3f8f", aba: "inicio",
    faz: "Faz a ronda de hora em hora: confere os interruptores do painel, a trava de autonomia e se a equipe pode trabalhar.",
    acoes: ["pulso_ok", "fila_desligada", "autonomia_so_registra", "modo_automatico", "teste_base"], agenda: "hora" },
  { id: "faro", nome: "Faro", cargo: "Pesquisa e prospecção", roupa: "#3f6b46", aba: "leads", funcao: "pesquisar",
    faz: "Pesquisa cidades atrás de times, ligas e arenas, acha o contato público de cada um e organiza os retornos dos leads.",
    acoes: ["prospeccao", "cadencia"], agenda: "cerebro" },
  { id: "pauta", nome: "Pauta", cargo: "Social media", roupa: "#2a56d6", aba: "aprovar",
    arte: "assets/equipe/pauta.webp?v=20261118", rosto: "assets/nexo-marketing-rosto.webp",
    faz: "Planeja o calendário, escreve as legendas e os roteiros das peças e manda tudo para a sua aprovação antes de ir ao ar.",
    acoes: ["conteudo_para_revisar"], agenda: "cerebro" },
  { id: "rabisco", nome: "Rabisco", cargo: "Designer gráfico", roupa: "#6a35b0", aba: "aprovar",
    faz: "Monta as artes de cada peça (imagens de posts e stories) no padrão visual da marca.",
    acoes: ["arte_pronta", "artes_ok", "arte_falhou"], agenda: "cerebro" },
  { id: "vitrine", nome: "Vitrine", cargo: "Publicação", roupa: "#c8464f", aba: "aprovar", funcao: "publicar",
    faz: "Publica no Instagram só as peças que você aprovou, no horário marcado, dentro do limite do dia.",
    acoes: ["publicado", "story_repost", "falha_publicar", "sem_instagram", "teste_video"], agenda: "hora" },
  { id: "papo", nome: "Papo", cargo: "Atendimento", roupa: "#1f7f86", aba: "conhecimento", funcao: "responder",
    faz: "Lê comentários e directs e responde só pelo FAQ que você aprovou. O que não sabe, deixa para você.",
    acoes: ["respondido", "ensaio_responderia", "diagnostico_direct"], agenda: "hora" },
  { id: "lupa", nome: "Lupa", cargo: "Análise", roupa: "#2b6cb0", aba: "integracoes",
    faz: "Lê as métricas da conta, testa as conexões e monta o retrato do dia que orienta o resto da equipe.",
    acoes: ["metricas", "conexao_instagram", "conexao_telegram", "retrato"], agenda: "diario" },
];
const PESSOA = Object.fromEntries(EQUIPE.map(p => [p.id, p]));

// ---------------------------------------------------------------- desenho (artes da equipe NEXO Marketing)
const ART_V = "?v=20261117";   // artes em alta resolução e sem fundo (17/11)
const ARTE = p => p.arte || `assets/equipe/${p.id}.webp${ART_V}`, ROSTO = p => p.rosto || `assets/equipe/${p.id}-rosto.webp${ART_V}`;
const rosto = (p, cls = "") => `<img class="rosto ${cls}" src="${ROSTO(p)}" alt="" loading="lazy" decoding="async">`;
const CORES_CONF = ["#f2b632", "#3CC4E6", "#4cc27a", "#ff7a6e", "#8b3fd1", "#ffd76e"];
const confete = () => CORES_CONF.map((c, i) => `<i style="left:${20 + i * 12}%;background:${c};--dx:${(i % 2 ? 1 : -1) * (10 + i * 6)}px;animation-delay:${i * 60}ms"></i>`).join("");

// ---------------------------------------------------------------- leitura dos dados reais
const MIN = 60e3, HORA = 60 * MIN;
let eqCache = { em: 0, itens: [] }, eqTimer = null;
const acaoDe = x => x.origem === "painel" ? null : EQUIPE.find(p => p.acoes.includes(x.acao)) ||
  (x.acao === "ingerido" ? (/lead/i.test(x.texto || "") ? PESSOA.faro : /prospect/i.test(x.texto || "") ? null : PESSOA.pauta) : null);
const totalDe = o => Object.values(o || {}).reduce((a, b) => a + (Number(b) || 0), 0);
const hhmm = d => d.toLocaleTimeString("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit" });
const corta = (s, n = 110) => { s = String(s || "").replace(/\s+/g, " ").trim(); return s.length > n ? s.slice(0, n - 1) + "…" : s; };

// Próxima ronda prevista (horários configurados no agente; o GitHub pode atrasar).
function proximaRonda(tipo) {
  const agora = new Date(), sp = new Date(agora.toLocaleString("en-US", { timeZone: "America/Sao_Paulo" }));
  const dif = agora - sp, horas = { hora: null, cerebro: [[6, 10], [12, 10], [18, 10]], diario: [[4, 40], [10, 40], [16, 40]] }[tipo];
  if (!horas) { const n = new Date(sp); n.setMinutes(17, 0, 0); if (n <= sp) n.setHours(n.getHours() + 1); return new Date(+n + dif); }
  for (let dd = 0; dd < 2; dd++) for (const [h, m] of horas) { const n = new Date(sp); n.setDate(n.getDate() + dd); n.setHours(h, m, 0, 0); if (n > sp) return new Date(+n + dif); }
  return null;
}

// Fala de cada onça a partir do último registro real dela.
function falaDoRegistro(x) {
  const t = corta(x.texto, 120);
  return ({
    pulso_ok: "Ronda feita. A equipe está em ordem.",
    fila_desligada: "Ronda feita. Algumas funções estão desligadas no painel, então a fila ficou parada.",
    autonomia_so_registra: "Segurei uma ação pela trava de autonomia e só registrei: " + t,
    modo_automatico: "Modo de trabalho atualizado: " + t,
    prospeccao: "Mapa da prospecção: " + t,
    cadencia: "Organizei os retornos: " + t,
    arte_pronta: "Arte pronta: " + t,
    artes_ok: "Terminei as artes: " + t,
    arte_falhou: "Uma arte falhou e vou tentar de novo: " + t,
    conteudo_para_revisar: "Uma peça precisa do seu olhar: " + t,
    publicado: "Publiquei: " + t,
    story_repost: "Repostei nos stories: " + t,
    falha_publicar: "Não consegui publicar: " + t,
    sem_instagram: "Estou sem acesso ao Instagram. Preciso da conexão para publicar.",
    teste_video: "Testei um vídeo com o Instagram: " + t,
    respondido: "Respondi um comentário pelo FAQ (" + t + ").",
    ensaio_responderia: "Ensaio: eu responderia este comentário (" + t + "), mas só registrei.",
    diagnostico_direct: "Li o direct e conferi seguidores. Nada foi enviado.",
    metricas: "Conferi a conta: " + t + ".",
    conexao_instagram: "Testei a conexão com o Instagram: " + t + ".",
    conexao_telegram: "A conexão do Telegram precisa de você: " + t + ".",
    retrato: "Montei o retrato do dia para a equipe.",
    ingerido: /lead/i.test(x.texto || "") ? "Levei os leads novos da rodada para Clientes, em Vendas." : /pec|conteud/i.test(x.texto || "") ? "Levei as peças novas da rodada para a sua aprovação." : "Guardei o trabalho da rodada.",
  })[x.acao] || (x.acao.replace(/_/g, " ") + (t ? ": " + t : ""));
}
const SUCESSO = new Set(["publicado", "story_repost", "arte_pronta", "artes_ok", "prospeccao", "cadencia", "metricas", "respondido", "retrato", "ingerido", "pulso_ok"]);

function estadoDe(p, itens, r) {
  const meus = itens.filter(x => acaoDe(x) === p), ult = meus[0], agora = Date.now();
  const c = r.controle || {}, cont = r.conteudos || {};
  const erroRec = meus.find(x => (x.nivel === "erro" || x.acao === "sem_instagram" || x.acao === "conexao_telegram") && agora - new Date(x.em) < 24 * HORA);
  const base = { meus, ult, prox: proximaRonda(p.agenda) };
  if (p.id === "gestora" && c.pausado) return { ...base, st: "atencao", rot: "Pausada", fala: "Pausei a equipe, como você pediu. Ninguém trabalha até você retomar no Início." };
  if (p.funcao && c[p.funcao] === false) return { ...base, st: "off", rot: "Desligada", fala: `Minha função está desligada no painel. Quando quiser, ligue em Início › Interruptores.` };
  if (p.id === "gestora" && r.erros_24h > 0) return { ...base, st: "atencao", rot: "Atenção", fala: `A equipe teve ${pl(r.erros_24h, "erro", "erros")} nas últimas 24 horas. Os detalhes estão na Atividade.` };
  if (p.id === "pauta" && (cont.revisar || 0) > 0) return { ...base, st: "espera", rot: "Esperando você", fala: `Tenho ${pl(cont.revisar, "peça", "peças")} prontas esperando a sua aprovação.` };
  if (p.id === "lupa") { const prob = (r.integracoes || []).filter(i => i.ultimo_teste_ok === false || i.status === "erro"); if (prob.length) return { ...base, st: "atencao", rot: "Atenção", fala: `A conexão ${prob.map(i => i.tipo).join(", ")} precisa de você. Veja em Integrações.` }; }
  if (erroRec) return { ...base, st: "atencao", rot: "Atenção", fala: falaDoRegistro(erroRec) };
  if (ult && agora - new Date(ult.em) < 12 * MIN) return { ...base, st: "trab", rot: "Trabalhando", fala: falaDoRegistro(ult) };
  if (ult && SUCESSO.has(ult.acao) && agora - new Date(ult.em) < 3 * HORA) return { ...base, st: "ok", rot: "Missão concluída", fala: falaDoRegistro(ult) };
  return { ...base, st: "descanso", rot: "Descansando", fala: ult ? falaDoRegistro(ult) : "Ainda não tenho registro recente. Fico de prontidão para a próxima ronda." };
}

// ---------------------------------------------------------------- missões, nível e conquistas (só números reais)
function numerosReais(r, itens) {
  const leads = r.leads || {}, cont = r.conteudos || {};
  const prosp = itens.find(x => x.acao === "prospeccao"), mapa = /(\d+)\s+de\s+(\d+)\s+cidades/i.exec(prosp?.texto || "");
  const cad = itens.find(x => x.acao === "cadencia"), retornos = /(\d+)\s+retorno/i.exec(cad?.texto || "");
  return { leadsTotal: totalDe(leads), leadsAbordar: (leads.novo || 0) + (leads.abordar || 0) + (leads.qualificado || 0), leadsAbordados: leads.abordado || 0,
    conversando: leads.conversando || 0, revisar: cont.revisar || 0, fila: (cont.pronto || 0) + (cont.aprovado || 0) + (cont.agendado || 0),
    publicados: cont.publicado || 0, pecasTotal: totalDe(cont), seguidores: r.conta?.seguidores ?? null,
    cidades: mapa ? [Number(mapa[1]), Number(mapa[2])] : null, cidadesEm: prosp?.em, retornos: retornos ? Number(retornos[1]) : null, retornosEm: cad?.em };
}
function proximoMarco(v, marcos) { for (const m of marcos) if (v < m) return m; return null; }
function nivelDe(n) {
  // Experiência = leads encontrados + 3 por peça criada + 10 por publicação (fórmula mostrada na tela).
  const xp = n.leadsTotal + 3 * n.pecasTotal + 10 * n.publicados;
  const nivel = Math.floor(Math.sqrt(xp / 15)) + 1, ini = 15 * (nivel - 1) ** 2, fim = 15 * nivel ** 2;
  return { xp, nivel, pct: Math.round(100 * (xp - ini) / (fim - ini)), falta: fim - xp };
}
function missoes(n, r) {
  const m = [];
  if (n.revisar) m.push({ p: "pauta", voce: true, t: `Aprovar ${pl(n.revisar, "peça", "peças")}`, d: "Prontas e esperando o seu OK para entrar na fila.", aba: "aprovar" });
  if (n.retornos && n.retornosEm && (Date.now() - new Date(n.retornosEm)) < 20 * HORA) m.push({ p: "faro", voce: true, t: `${pl(n.retornos, "retorno", "retornos")} de leads para hoje`, d: "A Faro separou quem está na hora de receber um retorno.", aba: "leads" });
  if (n.leadsAbordar) m.push({ p: "faro", voce: true, t: `${pl(n.leadsAbordar, "lead esperando", "leads esperando")} abordagem`, d: "Com mensagem pronta. Você copia, revisa e envia.", aba: "leads" });
  if (n.cidades) m.push({ p: "faro", t: "Mapa da prospecção", d: `${n.cidades[0]} de ${n.cidades[1]} cidades pesquisadas.`, pct: Math.round(100 * n.cidades[0] / n.cidades[1]), aba: "leads" });
  if (n.fila) m.push({ p: "vitrine", t: `${pl(n.fila, "peça aprovada", "peças aprovadas")} na fila`, d: r.controle?.publicar === false ? "Publicação desligada: ficam esperando você ligar." : "Saem no horário marcado.", aba: "aprovar" });
  if (n.seguidores != null) { const alvo = proximoMarco(n.seguidores, [100, 250, 500, 1000, 2500, 5000, 10000]); if (alvo) m.push({ p: "lupa", t: `Rumo a ${alvo} seguidores`, d: `Hoje: ${n.seguidores}.`, pct: Math.round(100 * n.seguidores / alvo), aba: "inicio" }); }
  return m;
}
function conquistas(n, r) {
  const ig = (r.integracoes || []).find(i => /instagram|meta/i.test(i.tipo));
  const faixa = (v, marcos) => { let feito = 0; for (const x of marcos) if (v >= x) feito = x; return { feito, prox: proximoMarco(v, marcos) }; };
  const L = faixa(n.leadsTotal, [25, 50, 100, 250, 500, 1000]), P = faixa(n.publicados, [1, 5, 20, 50, 100]), C = n.cidades ? faixa(n.cidades[0], [10, 50, 100, 200, n.cidades[1]]) : null;
  const S = n.seguidores != null ? faixa(n.seguidores, [100, 250, 500, 1000, 5000]) : null;
  return [
    { i: "🎯", t: L.feito ? `Caçadora de leads · ${L.feito}` : "Caçadora de leads", d: L.prox ? `${n.leadsTotal} de ${L.prox} leads` : `${n.leadsTotal} leads`, ok: !!L.feito, aba: "leads" },
    { i: "📣", t: P.feito ? `No ar · ${P.feito} publicação(ões)` : "Primeira publicação", d: P.prox ? `${n.publicados} de ${P.prox}` : `${n.publicados} publicadas`, ok: !!P.feito, aba: "aprovar" },
    C && { i: "🗺️", t: C.feito ? `Desbravadora · ${C.feito} cidades` : "Desbravadora", d: C.prox ? `${n.cidades[0]} de ${C.prox} cidades` : "Mapa completo", ok: !!C.feito, aba: "leads" },
    S && { i: "⭐", t: S.feito ? `Comunidade · ${S.feito}` : "Comunidade de 100", d: S.prox ? `${n.seguidores} de ${S.prox} seguidores` : `${n.seguidores} seguidores`, ok: !!S.feito, aba: "inicio" },
    { i: "🛡️", t: "Ronda limpa", d: r.erros_24h ? `${pl(r.erros_24h, "erro", "erros")} nas últimas 24 h` : "Nenhum erro nas últimas 24 h", ok: !r.erros_24h, aba: "atividade" },
    ig && { i: "🔗", t: "Conectada ao Instagram", d: ig.status === "conectado" ? "Conexão oficial ativa" : "Conexão pendente", ok: ig.status === "conectado", aba: "integracoes" },
  ].filter(Boolean);
}

// ---------------------------------------------------------------- tela
async function equipe(el) {
  const r = st.resumo || {};
  if (!eqCache.itens.length || Date.now() - eqCache.em > 60e3) {
    if (!el.querySelector(".eq")) el.innerHTML = `<div class="vazio">Chamando a equipe…</div>`;
    try { eqCache = { em: Date.now(), itens: await rpc("nexo_atividades", { p_agente: st.agente }) || [] }; }
    catch (e) { el.innerHTML = `<div class="vazio">${esc(msgErro(e))}</div>`; return; }
  }
  const itens = eqCache.itens.filter(x => x.origem !== "painel").sort((a, b) => a.em < b.em ? 1 : -1);
  const n = numerosReais(r, itens), lv = nivelDe(n), ms = missoes(n, r), cq = conquistas(n, r);
  const estados = Object.fromEntries(EQUIPE.map(p => [p.id, estadoDe(p, itens, r)]));
  const ativos = EQUIPE.filter(p => ["trab", "ok"].includes(estados[p.id].st)).length;
  const feitos = itens.filter(x => SUCESSO.has(x.acao) && x.acao !== "pulso_ok" && acaoDe(x)).slice(0, 12);
  const desde = itens.length ? itens[itens.length - 1].em : null;
  const nomeAg = r.identidade?.nome_exibicao || r.agente?.nome || "Agente";

  el.innerHTML = `<div class="eq">
    <section class="eq-hero">
      <img class="eq-mascote" src="assets/equipe/pauta.webp?v=20261118" alt="NEXO Marketing">
      <h2>Equipe ${esc(nomeAg)}</h2>
      <p>Sete onças, cada uma com um trabalho de verdade do seu agente. O que você vê aqui sai dos registros reais: quando alguém trabalha, ele aparece na mesa; quando termina, comemora.</p>
      <div class="eq-stats">
        <div class="eq-stat" title="Experiência = leads + 3 × peças criadas + 10 × publicações"><div class="l">Nível da equipe</div><div class="v">${lv.nivel}</div><div class="eq-xp"><i style="width:${lv.pct}%"></i></div><div class="s">faltam ${lv.falta} pontos</div></div>
        <div class="eq-stat"><div class="l">Na ativa agora</div><div class="v">${ativos} de ${EQUIPE.length}</div><div class="s">trabalhando ou recém-concluído</div></div>
        <div class="eq-stat"><div class="l">Entregas recentes</div><div class="v">${feitos.length}</div><div class="s">${desde ? "desde " + quando(desde) : "sem registro ainda"}</div></div>
        <div class="eq-stat"><div class="l">Missões com você</div><div class="v">${ms.filter(x => x.voce).length}</div><div class="s">esperando a sua decisão</div></div>
      </div>
    </section>

    <section class="eq-office" aria-label="Escritório da equipe">
      ${EQUIPE.map(p => { const e = estados[p.id]; return `
      <article class="est st-${e.st}" style="--cor:${p.roupa}" data-pessoa="${p.id}" tabindex="0" role="button" aria-label="${esc(p.nome)}, ${esc(p.cargo)}: ${esc(e.rot)}">
        <div class="est-top"><span class="agora">Agora</span><span class="chip-st"><i></i>${esc(e.rot)}</span></div>
        <div class="cena">
          <img class="onca" src="${ARTE(p)}" alt="" decoding="async">
          <span class="sinal ex">!</span><span class="sinal ok">✓</span><span class="zz">z z</span><div class="conf">${confete()}</div>
        </div>
        <div class="balao">${esc(e.fala)}${e.ult ? `<small>${quando(e.ult.em)}</small>` : ""}</div>
        <div class="pe"><span>${e.st === "descanso" && e.prox ? `Próxima ronda prevista: ${hhmm(e.prox)}` : esc(p.faz.split(".")[0])}</span><span aria-hidden="true">›</span></div>
      </article>`; }).join("")}
    </section>

    <section class="eq-cols">
      <div class="card"><div class="linha entre"><h2>Missões em andamento</h2><span class="muted peq">${ms.length}</span></div>
        <div>${ms.map(m => `<div class="miss ${m.voce ? "voce" : ""}" data-ir="${m.aba}" role="button" tabindex="0">
          <div class="av">${rosto(PESSOA[m.p])}</div>
          <div style="flex:1;min-width:0"><div class="linha entre" style="flex-wrap:nowrap"><span class="t">${esc(m.t)}</span><span class="tag">${m.voce ? "com você" : esc(PESSOA[m.p].nome)}</span></div>
            <div class="d">${esc(m.d)}</div>${m.pct != null ? `<div class="barra"><i style="width:${Math.min(100, m.pct)}%"></i></div>` : ""}</div></div>`).join("")
          || `<div class="vazio">Nenhuma missão aberta agora. A equipe volta na próxima ronda.</div>`}</div></div>
      <div class="card"><h2>Diário da equipe</h2>
        <div>${feitos.map(x => { const p = acaoDe(x); return `<div class="feito"><div class="mini">${rosto(p)}</div><div><b>${esc(p.nome)}</b> <span class="muted">${esc(falaDoRegistro(x))}</span></div><span class="q">${quando(x.em)}</span></div>`; }).join("")
          || `<div class="vazio">Ainda sem entregas registradas.</div>`}</div>
        <button class="btn" data-ir="atividade" style="margin-top:8px">Ver tudo no Histórico</button></div>
    </section>

    <section class="card"><div class="linha entre"><h2>Conquistas da equipe</h2><span class="muted peq">${cq.filter(c => c.ok).length} de ${cq.length}</span></div>
      <div class="conq">${cq.map(c => `<div class="medalha ${c.ok ? "" : "bloq"}" data-ir="${c.aba}" role="button" tabindex="0" title="Abrir"><div class="m" aria-hidden="true">${c.i}</div><div><div class="t">${esc(c.t)}</div><div class="d">${esc(c.d)}</div></div></div>`).join("")}</div>
    </section>
  </div>`;

  $$("[data-pessoa]", el).forEach(c => { const abrir = () => fichaOnca(PESSOA[c.dataset.pessoa], estados[c.dataset.pessoa]);
    c.onclick = abrir; c.onkeydown = ev => { if (ev.key === "Enter" || ev.key === " ") { ev.preventDefault(); abrir(); } }; });
  $$("[data-ir]", el).forEach(b => { const ir = () => abrirAba(b.dataset.ir); b.onclick = ir; b.onkeydown = ev => { if (ev.key === "Enter") ir(); }; });

  clearTimeout(eqTimer);   // atualiza sozinha a cada minuto enquanto a aba estiver aberta
  eqTimer = setTimeout(() => { if (st.aba === "equipe" && !document.hidden) { eqCache.em = 0; equipe(el); } }, 60e3);
}

function fichaOnca(p, e) {
  document.querySelector(".eq-ficha-fundo")?.remove();
  const fundo = document.createElement("div"); fundo.className = "eq-ficha-fundo";
  fundo.innerHTML = `<aside class="eq-ficha" role="dialog" aria-modal="true" aria-label="${esc(p.nome)}">
    <div class="topo"><div class="retrato"><img src="${ARTE(p)}" alt=""></div><div style="flex:1"><div class="eyebrow">${esc(p.cargo)}</div><h2 style="margin:2px 0">${esc(p.nome)}</h2>
      <span class="chip-st st-${e.st}" style="display:inline-flex"><i></i>${esc(e.rot)}</span></div><button class="btn" data-fechar aria-label="Fechar">✕</button></div>
    <div class="card" style="padding:12px"><b>O que eu faço</b><span class="muted peq">${esc(p.faz)}</span>
      ${e.prox ? `<span class="peq">Próxima ronda prevista: <b>${hhmm(e.prox)}</b></span>` : ""}</div>
    <div class="card" style="padding:12px"><b>Agora</b><span class="peq">${esc(e.fala)}</span></div>
    <div class="card" style="padding:12px"><b>Meus últimos registros</b>
      <div class="tempo">${e.meus.slice(0, 15).map(x => `<div class="it"><span class="mono muted">${quando(x.em)}</span><span class="peq">${x.nivel === "erro" ? `<span class="pill bad">erro</span> ` : ""}${esc(falaDoRegistro(x))}</span></div>`).join("") || `<div class="muted peq">Nada registrado recentemente.</div>`}</div></div>
    <button class="btn prim" data-ir="${p.aba}">Abrir ${esc({ inicio: "o Início", leads: "os Leads", aprovar: "a Aprovação", conhecimento: "a Base da marca", integracoes: "as Contas conectadas" }[p.aba] || "a área")}</button>
  </aside>`;
  const fechar = () => { fundo.remove(); document.removeEventListener("keydown", esc_); };
  const esc_ = ev => { if (ev.key === "Escape") fechar(); };
  fundo.onclick = ev => { if (ev.target === fundo) fechar(); };
  fundo.querySelector("[data-fechar]").onclick = fechar;
  fundo.querySelector("[data-ir]").onclick = () => { fechar(); abrirAba(p.aba); };
  document.addEventListener("keydown", esc_);
  document.body.appendChild(fundo);
  fundo.querySelector("[data-fechar]").focus();
}
