/* Monta as fichas dos projetos a partir de projetos.js. Roda antes do app.js, que cuida do resto.
 * Projetos com  destaque: true  vão para a seção "Projetos em destaque" (#destaques); os outros, para "Mais projetos" (#projetos). */
(() => {
  const dados = window.PROJETOS;
  const mais = document.getElementById("projetos");
  if (!dados || !mais) return;
  const destaques = document.getElementById("destaques") || mais;

  const el = (tag, classe, texto) => {
    const n = document.createElement(tag);
    if (classe) n.className = classe;
    if (texto != null) n.textContent = texto;
    return n;
  };

  const tela = (video, formato) => {
    const caixa = el("div", "tela" + (formato === "4x5" ? " tela--45" : formato === "horizontal" ? "" : " tela--v"));
    const v = document.createElement("video");
    v.controls = true; v.muted = true; v.loop = true; v.playsInline = true;
    v.setAttribute("playsinline", ""); v.setAttribute("muted", "");
    v.preload = "none";
    v.poster = `assets/media/${video.arquivo}.jpg`;
    v.src = `assets/media/${video.arquivo}.mp4`;
    v.setAttribute("aria-label", video.descricao || "");
    caixa.appendChild(v);
    return caixa;
  };

  const conta = new Map();   // alterna o lado do vídeo dentro de cada seção
  dados.lista.forEach((p) => {
    const secao = p.destaque ? destaques : mais;
    const i = conta.get(secao) || 0; conta.set(secao, i + 1);
    const emPe = p.formato !== "horizontal";
    const ficha = el("article", "painel projeto revelar" + (p.destaque ? " projeto--destaque" : "") + (emPe ? " projeto--vertical" : "") + (i % 2 === 1 ? " projeto--inverso" : ""));
    ficha.id = p.id;

    const midia = el("div", "projeto-midia" + (p.formato === "dupla" ? " projeto-midia--dupla" : ""));
    p.videos.forEach((v) => midia.appendChild(tela(v, p.formato)));

    const texto = el("div", "projeto-texto");
    if (p.selo || p.quando) {
      const selos = el("p", "projeto-selos");
      if (p.selo) selos.appendChild(el("span", "selo", p.selo));
      if (p.quando) selos.appendChild(el("span", "selo selo--data", p.quando));
      texto.appendChild(selos);
    }
    texto.appendChild(el("h3", "", p.nome));
    texto.appendChild(el("p", "projeto-tipo", p.tipo));
    const lista = el("ul");
    p.itens.forEach((item) => lista.appendChild(el("li", "", item)));
    texto.appendChild(lista);
    const serve = el("p", "projeto-serve");
    serve.appendChild(el("b", "", "Serve para"));
    serve.appendChild(document.createTextNode(" " + p.serve));
    texto.appendChild(serve);
    if (p.link) {
      const abrir = el("a", "botao botao--linha projeto-abrir", `Abrir o ${p.nome}`);
      abrir.href = p.link; abrir.target = "_blank"; abrir.rel = "noopener";
      abrir.setAttribute("aria-label", `Abrir o ${p.nome} (abre em outra aba)`);
      texto.appendChild(abrir);
    }

    ficha.appendChild(midia);
    ficha.appendChild(texto);
    secao.appendChild(ficha);
  });

  // "9 projetos. Atualizado em 26/11/2026." no cabeçalho dos destaques
  const marca = document.querySelector("[data-atualizado]");
  if (marca && /^\d{4}-\d{2}-\d{2}$/.test(dados.atualizado || "")) {
    const [a, m, d] = dados.atualizado.split("-");
    marca.textContent = `${dados.lista.length} projetos nesta página. Atualizado em ${d}/${m}/${a}.`;
  }
  // Total de projetos na abertura ("9 projetos nesta página.")
  document.querySelectorAll("[data-total]").forEach((n) => { n.textContent = String(dados.lista.length); });
})();
