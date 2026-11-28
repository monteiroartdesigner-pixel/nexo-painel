/* Fundo de vidro canelado: a rolagem da página desloca a luz por trás do vidro, bem devagar.
 * Só mexe em uma variável de CSS (--rol, de 0 a 1); quem move é o próprio visitante, então vale mesmo com animações desligadas.
 * A altura da página é medida só quando ela muda (não a cada quadro da rolagem). */
(() => {
  const fundo = document.querySelector(".fundo-vidro");
  if (!fundo) return;
  let max = 0, marcado = false;
  const aplicar = () => {
    marcado = false;
    fundo.style.setProperty("--rol", max > 0 ? Math.min(1, Math.max(0, window.scrollY / max)).toFixed(4) : "0");
  };
  const medir = () => { max = document.documentElement.scrollHeight - window.innerHeight; aplicar(); };
  window.addEventListener("scroll", () => { if (!marcado) { marcado = true; requestAnimationFrame(aplicar); } }, { passive: true });
  window.addEventListener("resize", medir);
  window.addEventListener("load", medir);
  if ("ResizeObserver" in window) new ResizeObserver(medir).observe(document.body);
  medir();
})();
