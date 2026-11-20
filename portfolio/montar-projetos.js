/* Monta as fichas dos projetos a partir de projetos.js. Roda antes do app.js, que cuida do resto. */
(() => {
  const dados = window.PROJETOS;
  const secao = document.getElementById("projetos");
  if (!dados || !secao) return;

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

  dados.lista.forEach((p, i) => {
    const emPe = p.formato !== "horizontal";
    const ficha = el("article", "painel projeto revelar" + (emPe ? " projeto--vertical" : "") + (i % 2 === 1 ? " projeto--inverso" : ""));
    ficha.id = p.id;

    const midia = el("div", "projeto-midia" + (p.formato === "dupla" ? " projeto-midia--dupla" : ""));
    p.videos.forEach((v) => midia.appendChild(tela(v, p.formato)));

    const texto = el("div", "projeto-texto");
    texto.appendChild(el("h3", "", p.nome));
    texto.appendChild(el("p", "projeto-tipo", p.tipo));
    const lista = el("ul");
    p.itens.forEach((item) => lista.appendChild(el("li", "", item)));
    texto.appendChild(lista);
    const serve = el("p", "projeto-serve");
    serve.appendChild(el("b", "", "Serve para"));
    serve.appendChild(document.createTextNode(" " + p.serve));
    texto.appendChild(serve);

    ficha.appendChild(midia);
    ficha.appendChild(texto);
    secao.appendChild(ficha);
  });

  // "Atualizado em 20/11/2026" no cabeçalho da seção
  const marca = document.querySelector("[data-atualizado]");
  if (marca && /^\d{4}-\d{2}-\d{2}$/.test(dados.atualizado || "")) {
    const [a, m, d] = dados.atualizado.split("-");
    marca.textContent = `${dados.lista.length} projetos. Atualizado em ${d}/${m}/${a}.`;
  }
})();
