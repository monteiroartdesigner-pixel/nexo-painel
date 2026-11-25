"use strict";
/* Baixar o NEXO Prospect como aplicativo e balãozinho de clientes para responder (pedido do Ricardo, 25/11/2026).
   Sem programa para baixar de loja: o navegador instala o próprio site (manifest.webmanifest).
   O número no ícone do aparelho só muda com o aplicativo aberto: notificação com ele fechado é outra etapa.
   Usa S, CV, hoje, rpc, pintarNav, toast, abrirModal e fecharModal do index.html. */
const APP = { convite: null, timer: null };

const appInstalado = () => matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;
const appEhIphone = () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
const appEhAndroid = () => /android/i.test(navigator.userAgent);
const appLogado = () => typeof S !== "undefined" && !!S.empresaId;
/* No iPhone o número no ícone só aparece depois que a pessoa permite notificações. */
const appFaltaPermitir = () => appInstalado() && appEhIphone() && "Notification" in window && Notification.permission === "default";

/* Clientes para responder: retorno vencido ou de hoje + conversa do WhatsApp esperando uma pessoa. Cada cliente conta uma vez. */
function appPendentes() {
  const h = hoje();
  const retornos = new Set((S.tarefas || []).filter(t => !t.feita && t.vence_em && t.vence_em <= h).map(t => t.empresa || t.id));
  const conversas = typeof CV !== "undefined" ? CV.lista.filter(c => c.estado_ia === "atendimento_humano" && c.nao_lida_humano) : [];
  const todos = new Set(retornos);
  conversas.forEach(c => todos.add(c.lead_id || c.id));
  return { total: todos.size, retornos: retornos.size, conversas: conversas.length };
}

function appIcone(n) {
  if (!("setAppBadge" in navigator)) return;
  try { (n ? navigator.setAppBadge(n) : navigator.clearAppBadge()).catch(() => {}); } catch { /* aparelho sem número no ícone */ }
}

function appDetalhe(p) {
  if (!p.total) return "Nenhum cliente esperando resposta";
  const partes = [];
  if (p.retornos) partes.push(`${p.retornos} com retorno vencido ou de hoje`);
  if (p.conversas) partes.push(`${p.conversas} esperando no WhatsApp`);
  return `${p.total === 1 ? "1 cliente" : p.total + " clientes"} para responder: ${partes.join(" e ")}`;
}

/* Chamada pelo pintarNav: roda sempre que as tarefas ou as conversas mudam. */
function appPintar() {
  if (!appLogado()) return;
  const p = appPendentes(), instalado = appInstalado(), permitir = appFaltaPermitir();
  const rotulo = !instalado ? "Baixar app" : permitir ? "Número no ícone" : "Para responder";
  document.querySelectorAll("[data-app]").forEach(b => {
    b.classList.toggle("oculto", instalado && !p.total && !permitir);   /* instalado e sem pendência: não há o que mostrar */
    b.querySelector("[data-app-rotulo]").textContent = rotulo;
    const balao = b.querySelector("[data-app-balao]");
    balao.textContent = p.total > 99 ? "99+" : String(p.total);
    balao.classList.toggle("oculto", !p.total);
    b.title = appDetalhe(p);
    b.setAttribute("aria-label", `${rotulo}. ${appDetalhe(p)}`);
  });
  appIcone(p.total);
}

function appPassos() {
  if (appEhIphone()) return { titulo: "Instalar no iPhone ou iPad", passos: [
    "Abra o nexoprospect.com no <b>Safari</b>.",
    "Toque em <b>Compartilhar</b> (o quadrado com a seta para cima).",
    "Escolha <b>Adicionar à Tela de Início</b> e confirme.",
    "Abra pelo ícone novo e entre com o mesmo e-mail e senha.",
    "Para o número aparecer no ícone, toque em <b>Número no ícone</b> e permita as notificações."] };
  if (appEhAndroid()) return { titulo: "Instalar no celular", passos: [
    "Abra o nexoprospect.com no <b>Chrome</b>.",
    "Toque no menu <b>⋮</b>, no alto da tela.",
    "Escolha <b>Instalar app</b> ou <b>Adicionar à tela inicial</b> e confirme."] };
  return { titulo: "Instalar no computador", passos: [
    "Abra o nexoprospect.com no <b>Chrome</b> ou no <b>Edge</b>.",
    "Clique no ícone de <b>instalar</b>, no fim da barra de endereço. Se ele não aparecer, abra o menu do navegador e procure <b>Instalar</b>.",
    "Confirme. O NEXO Prospect ganha janela e ícone próprios.",
    "Se já instalou, abra pelo ícone do NEXO Prospect."] };
}

function appComoInstalar() {
  const { titulo, passos } = appPassos(), p = appPendentes();
  abrirModal(`<div class="modal-h"><h2>${titulo}</h2></div>
    <div class="modal-b">${p.total ? `<p class="muted" style="margin:0">${appDetalhe(p)}.</p>` : ""}
      <ol class="app-passos">${passos.map(x => `<li>${x}</li>`).join("")}</ol></div>
    <div class="modal-f"><button type="button" class="btn pri" data-fechar>Entendi</button></div>`);
}

async function appClicar() {
  const p = appPendentes();
  if (appInstalado()) {
    if (appFaltaPermitir()) {   /* o pedido de permissão precisa sair direto do toque */
      Notification.requestPermission().then(() => appPintar()).catch(() => {});
      if (!p.total) return;
    }
    if (p.total) location.hash = p.conversas ? "#/conversas" : "#/tarefas";
    return;
  }
  if (APP.convite) {
    const convite = APP.convite; APP.convite = null;   /* o navegador deixa usar o convite uma vez só */
    try { await convite.prompt(); } catch { appComoInstalar(); }
    return;
  }
  appComoInstalar();
}

/* Com o aplicativo aberto o dia todo, as tarefas são relidas para o número não envelhecer. */
async function appAtualizar() {
  if (!appLogado()) return;
  try {
    S.tarefas = await rpc("nexo_prospect_tarefas", { p_agente: S.agente, p_filtro: "todas" }) || [];
    pintarNav();
  } catch { /* sem acesso ou sem internet: fica o número que já estava */ }
}

window.addEventListener("beforeinstallprompt", ev => { ev.preventDefault(); APP.convite = ev; });
window.addEventListener("appinstalled", () => { APP.convite = null; if (typeof toast === "function") toast("Pronto: o NEXO Prospect foi instalado."); });
document.addEventListener("click", ev => {
  if (ev.target.closest("[data-app]")) appClicar();
  else if (ev.target.closest("[data-sair]")) appIcone(0);
}, true);
document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") appAtualizar(); });
APP.timer = setInterval(appAtualizar, 5 * 60000);
