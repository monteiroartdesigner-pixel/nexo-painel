/* Abas "Acesse os apps" (pedido do Ricardo, 21/11/2026): uma aba por projeto de projetos.js, com o link para abrir.
 * O link vem do campo "link" de cada projeto. Sem link, a aba mostra "Pedir acesso" pelo WhatsApp (nada inventado).
 * Teclado: setas esquerda/direita trocam de aba (padrão de abas acessíveis). */
(() => {
  const dados = window.PROJETOS, raiz = document.getElementById("apps-abas");
  if (!dados || !raiz) return;
  const lista = dados.lista;
  const zap = (window.SITE && window.SITE.whatsapp) || {};
  const linkZap = (p) => `https://wa.me/${zap.numero || ""}?text=${encodeURIComponent(`Olá! Quero acessar a demonstração do ${p.nome}.`)}`;

  const el = (tag, classe, texto) => { const n = document.createElement(tag); if (classe) n.className = classe; if (texto != null) n.textContent = texto; return n; };

  const barra = el("div", "abas-barra"); barra.setAttribute("role", "tablist"); barra.setAttribute("aria-label", "Apps desenvolvidos pela NEXO");
  const quadros = el("div", "abas-quadros");

  lista.forEach((p, i) => {
    const aba = el("button", "aba", p.nome);
    aba.type = "button"; aba.id = `aba-${p.id}`;
    aba.setAttribute("role", "tab"); aba.setAttribute("aria-controls", `quadro-${p.id}`);
    aba.setAttribute("aria-selected", i === 0 ? "true" : "false"); aba.tabIndex = i === 0 ? 0 : -1;
    barra.appendChild(aba);

    const q = el("div", "abas-quadro");
    q.id = `quadro-${p.id}`; q.setAttribute("role", "tabpanel"); q.setAttribute("aria-labelledby", aba.id); q.hidden = i !== 0;
    const capa = el("img", "abas-capa"); capa.src = `assets/media/${p.videos[0].arquivo}.jpg`; capa.alt = `Tela do ${p.nome}`; capa.loading = "lazy";
    const txt = el("div", "abas-texto");
    txt.appendChild(el("h3", "", p.nome));
    txt.appendChild(el("p", "projeto-tipo", p.tipo));
    const acao = el("a", "botao", p.link ? "Acessar o app" : "Pedir acesso pelo WhatsApp");
    acao.href = p.link || linkZap(p); acao.target = "_blank"; acao.rel = "noopener";
    if (p.link) acao.setAttribute("aria-label", `Acessar o ${p.nome} (abre em outra aba)`);
    txt.appendChild(acao);
    q.append(capa, txt);
    quadros.appendChild(q);
  });

  const abas = [...barra.children];
  const ir = (i) => {
    abas.forEach((a, k) => { const sel = k === i; a.setAttribute("aria-selected", sel); a.tabIndex = sel ? 0 : -1; quadros.children[k].hidden = !sel; });
    abas[i].focus({ preventScroll: true });
  };
  abas.forEach((a, i) => {
    a.addEventListener("click", () => ir(i));
    a.addEventListener("keydown", (e) => {
      if (e.key === "ArrowRight") { e.preventDefault(); ir((i + 1) % abas.length); }
      if (e.key === "ArrowLeft") { e.preventDefault(); ir((i - 1 + abas.length) % abas.length); }
    });
  });
  raiz.append(barra, quadros);
})();
