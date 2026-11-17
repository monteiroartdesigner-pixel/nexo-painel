"""Testes automáticos do NEXO System e do NEXO Prospect.

Abrem as duas páginas num navegador de verdade (Microsoft Edge sem janela, via Playwright),
com o Supabase FALSO: nenhuma chamada sai para a internet, nenhum login ou senha real é usado
e todos os dados abaixo são inventados.

Rodar (da pasta painel):
    testes/.venv/Scripts/python.exe -m unittest discover -s testes -v
Instalar do zero:
    uv venv --python 3.11 testes/.venv
    uv pip install --python testes/.venv/Scripts/python.exe playwright
"""
import functools
import http.server
import json
import pathlib
import re
import threading
import time
import unittest

from playwright.sync_api import sync_playwright

RAIZ = pathlib.Path(__file__).resolve().parents[1]
SUPA = "https://rtjcvvjmmljizkjnztlb.supabase.co"
CHAVE_SESSAO = "sb-rtjcvvjmmljizkjnztlb-auth-token"
LINK_RUIM = "javascript:alert(document.domain)"

AG_ONCA, AG_PROSP = "00000000-0000-4000-a000-00000000f101", "00000000-0000-4000-a000-00000000f201"


# ---------------------------------------------------------------- dados inventados
def contexto(com_onca=True):
    empresas = [{"id": "emp-p", "nome": "NEXO Inteligência (teste)", "slug": "nexo-inteligencia", "status": "ativa",
                 "papel": "dono", "agentes": [{"id": AG_PROSP, "nome": "Prospect", "slug": "prospect", "nivel": 1, "ativo": True}]}]
    if com_onca:
        empresas.insert(0, {"id": "emp-v", "nome": "NEXO VÁRZEA (teste)", "slug": "nexo-varzea", "status": "ativa",
                            "papel": "dono", "agentes": [{"id": AG_ONCA, "nome": "Onça", "slug": "onca", "nivel": 2, "ativo": True}]})
    return {"email": "teste@exemplo.com", "plataforma": False, "empresas": empresas}


LEADS = [
    {"id": "l1", "nome": "Liga Teste de Futebol", "status": "abordar", "nota": 80, "cidade": "Curitiba", "estado": "PR",
     "whatsapp": "5541999990000", "fonte_url": "https://exemplo.com/liga", "mensagem": "Oi! Mensagem de teste."},
    {"id": "l2", "nome": "Liga Com Link Malicioso", "status": "novo", "nota": 50, "cidade": "Curitiba",
     "fonte_url": LINK_RUIM},
    {"id": "l3", "nome": "Time Em Conversa", "status": "conversando", "nota": 60, "instagram": "timeteste"},
]

EMPRESAS_P = [
    {"id": "e1", "nome": "Clínica Teste", "status": "qualificado", "pontuacao": 80, "cidade": "Curitiba", "estado": "PR", "pais": "BR",
     "segmento": "clínica", "whatsapp": "5541999990000", "site": LINK_RUIM, "fonte_url": LINK_RUIM,
     "campanhas": [{"id": "c1", "nome": "Sites", "prioridade": "alta"}]},
]


def rpc_falso(nome, args, com_onca=True):
    if nome == "nexo_contexto":
        return contexto(com_onca)
    if nome == "nexo_resumo":
        return {"papel": "dono", "controle": {}, "conteudos": {}, "leads": {"total": len(LEADS)}, "identidade": {},
                "agente": {"nome": "Onça", "nivel_autonomia": 2},
                "funcoes": [{"acao": "pesquisar", "nome": "Pesquisar clientes", "descricao": "Teste", "nivel_minimo": 1,
                             "ligada": True, "exige_aprovacao": False, "sensivel": False}]}
    if nome == "nexo_leads":
        return LEADS
    if nome == "nexo_prospect_empresas":
        return EMPRESAS_P
    if nome == "nexo_prospect_campanhas":
        return [{"id": "c1", "nome": "Sites", "servico": "Sites", "status": "ativa", "modo": "manual", "idioma": "pt", "paises": ["BR"],
                 "empresas": 1, "prioritarias": 1, "buscas_7d": 0, "fontes": ["busca_web"]}]
    if nome == "nexo_prospect_indicadores":
        return {"empresas": 1, "com_contato": 1, "qualificadas": 1, "prioritarias": 1, "abordadas": 0, "responderam": 0, "propostas": 0,
                "contratos": 0, "propostas_valor": {}, "receita": {}, "pesquisas": {"buscas": 0}, "por_nicho": [], "por_pais": {"BR": 1}}
    if nome == "nexo_prospect_ficha":
        e = EMPRESAS_P[0]
        return {"empresa": e, "campanhas": [{**e["campanhas"][0], "oportunidade": "Teste", "evidencias": [{"o_que": "Evidência", "onde": LINK_RUIM}]}],
                "historico": [], "tarefas": []}
    if nome in ("nexo_conteudos", "nexo_atividades", "nexo_ideias", "nexo_links", "nexo_categorias_lead", "nexo_integracoes",
                "nexo_prospect_tarefas"):
        return []
    return {}


# ---------------------------------------------------------------- servidor local da pasta painel
class _Silencioso(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a):
        pass


def setUpModule():
    global SERVIDOR, BASE, PW, NAV
    SERVIDOR = http.server.ThreadingHTTPServer(("127.0.0.1", 0), functools.partial(_Silencioso, directory=str(RAIZ)))
    threading.Thread(target=SERVIDOR.serve_forever, daemon=True).start()
    BASE = f"http://127.0.0.1:{SERVIDOR.server_address[1]}"
    PW = sync_playwright().start()
    NAV = PW.chromium.launch(channel="msedge", headless=True)


def tearDownModule():
    NAV.close(); PW.stop(); SERVIDOR.shutdown()


class Pagina:
    """Abre uma página com o Supabase falso e junta todos os erros de JavaScript."""

    def __init__(self, logado=True, com_onca=True, local=None):
        self.ctx = NAV.new_context(viewport={"width": 1280, "height": 900})
        self.erros = []
        if logado:
            sessao = {"access_token": "teste.teste.teste", "token_type": "bearer", "expires_in": 3600,
                      "expires_at": int(time.time()) + 3600, "refresh_token": "teste",
                      "user": {"id": "u-teste", "aud": "authenticated", "role": "authenticated", "email": "teste@exemplo.com"}}
            local = {**(local or {}), CHAVE_SESSAO: json.dumps(sessao)}
        if local:
            self.ctx.add_init_script("(() => { const d = %s; for (const k in d) localStorage.setItem(k, d[k]); })()" % json.dumps(local))
        self.chamadas = []

        def supa(route, req):
            m = re.search(r"/rest/v1/rpc/(\w+)", req.url)
            if m:
                args = json.loads(req.post_data or "{}")
                self.chamadas.append(m.group(1))
                return route.fulfill(status=200, content_type="application/json", body=json.dumps(rpc_falso(m.group(1), args, com_onca)))
            return route.fulfill(status=200, content_type="application/json", body="{}")

        self.ctx.route(SUPA + "/**", supa)
        self.page = self.ctx.new_page()
        self.page.on("pageerror", lambda e: self.erros.append(str(e)))
        self.page.on("console", lambda m: m.type == "error" and self.erros.append("console: " + m.text))

    def abrir(self, caminho, espera=900):
        self.page.goto(BASE + caminho)
        self.page.wait_for_timeout(espera)
        return self.page

    def fechar(self):
        self.ctx.close()


# ---------------------------------------------------------------- testes
class Estatico(unittest.TestCase):
    """Conferências no código, sem abrir o navegador."""

    def setUp(self):
        self.sys = (RAIZ / "index.html").read_text(encoding="utf-8")
        self.pro = (RAIZ / "prospect" / "index.html").read_text(encoding="utf-8")
        self.js = {p.name: p.read_text(encoding="utf-8") for p in (RAIZ / "assets").glob("*.js")}

    def test_biblioteca_supabase_com_integridade(self):
        for nome, h in (("System", self.sys), ("Prospect", self.pro)):
            tags = re.findall(r'<script[^>]+supabase-js[^>]*>', h)
            self.assertEqual(len(tags), 1, nome)
            self.assertIn('integrity="sha384-', tags[0], nome)
            self.assertIn('crossorigin="anonymous"', tags[0], nome)

    def test_politica_de_conteudo(self):
        for nome, h in (("System", self.sys), ("Prospect", self.pro)):
            self.assertIn('http-equiv="Content-Security-Policy"', h, nome)
            self.assertIn("object-src 'none'", h, nome)

    def test_nenhum_link_externo_sem_filtro(self):
        tudo = self.sys + self.pro + "".join(self.js.values())
        self.assertEqual(re.findall(r'href="\$\{esc\([^)]*\)\}"', tudo), [], "use hrefSeguro() em links que vêm de fora")

    def test_base_carrega_antes_dos_outros_scripts(self):
        for nome, h in (("System", self.sys), ("Prospect", self.pro)):
            srcs = re.findall(r'<script src="([^"]+)"', h)
            i_supa = next(i for i, s in enumerate(srcs) if "supabase-js" in s)
            i_base = next(i for i, s in enumerate(srcs) if "assets/base.js" in s)
            self.assertEqual(i_base, i_supa + 1, nome)
            for i, s in enumerate(srcs):
                if i > i_base or "aparencia.js" in s:
                    continue
                self.assertTrue("supabase-js" in s or "base.js" in s, f"{nome}: {s} carrega antes da base")

    def test_sem_duplicacoes_antigas(self):
        self.assertNotIn('data-sec="prospect"', self.sys)
        self.assertNotIn('data-aba="leads"', self.sys)
        self.assertNotIn("async function prospect(el)", self.sys)
        for nome, h in (("System", self.sys), ("Prospect", self.pro)):
            self.assertNotRegex(h, r"const SUPABASE_KEY|function esc\(|const esc =", f"{nome} repete a base")


class FiltroDeLinks(unittest.TestCase):
    def test_url_segura(self):
        p = Pagina(logado=False)
        try:
            pg = p.abrir("/")
            casos = {"javascript:alert(1)": "", " JaVaScRiPt:x": "", "data:text/html,x": "", "vbscript:x": "", "//evil.com": "",
                     "": "", None: "", "https://exemplo.com/a b": "https://exemplo.com/a%20b", "http://x.com": "http://x.com/"}
            for entrada, esperado in casos.items():
                self.assertEqual(pg.evaluate("v => urlSegura(v)", entrada), esperado, repr(entrada))
            self.assertEqual(pg.evaluate("hrefSeguro('javascript:x')"), "#")
        finally:
            p.fechar()


class System(unittest.TestCase):
    def test_login_abre_sem_erros(self):
        p = Pagina(logado=False)
        try:
            pg = p.abrir("/", 1500)
            self.assertTrue(pg.is_visible("#email"))
            self.assertEqual(p.erros, [])
        finally:
            p.fechar()

    def test_todas_as_abas_abrem_sem_erros(self):
        p = Pagina()
        try:
            pg = p.abrir("/", 1500)
            abas = pg.eval_on_selector_all(".menu [data-aba]", "bs => bs.map(b => b.dataset.aba)")
            self.assertGreaterEqual(len(abas), 8)
            self.assertNotIn("leads", abas)
            for aba in abas:
                pg.click(f'.menu [data-aba="{aba}"]')
                pg.wait_for_timeout(350)
                sec = pg.eval_on_selector(f'[data-sec="{aba}"]', "s => [s.classList.contains('oculto'), s.innerHTML.trim().length]")
                self.assertEqual(sec[0], False, f"{aba} continua escondida")
                self.assertGreater(sec[1], 0, f"{aba} ficou vazia")
            self.assertEqual(p.erros, [], "erros de JavaScript nas abas")
        finally:
            p.fechar()

    def test_aba_antiga_salva_volta_para_equipe(self):
        p = Pagina(local={"nexo.aba": "prospect"})
        try:
            pg = p.abrir("/", 1500)
            self.assertFalse(pg.eval_on_selector('[data-sec="equipe"]', "s => s.classList.contains('oculto')"))
            self.assertEqual(p.erros, [])
        finally:
            p.fechar()

    def test_atalho_de_leads_leva_ao_prospect(self):
        p = Pagina()
        try:
            pg = p.abrir("/", 1500)
            pg.evaluate("abrirAba('leads')")
            pg.wait_for_url(re.compile(r"/prospect/#/leads$"), timeout=5000)
        finally:
            p.fechar()


class Prospect(unittest.TestCase):
    MODULOS = ["inicio", "crm", "tarefas", "campanhas", "leads", "ajuda"]

    def test_login_abre_sem_erros(self):
        p = Pagina(logado=False)
        try:
            pg = p.abrir("/prospect/", 1500)
            self.assertTrue(pg.is_visible("#lEmail"))
            self.assertEqual(p.erros, [])
        finally:
            p.fechar()

    def test_todos_os_modulos_abrem_sem_erros(self):
        p = Pagina()
        try:
            pg = p.abrir("/prospect/", 1500)
            nav = pg.eval_on_selector_all("#nav a", "as => as.map(a => a.getAttribute('href'))")
            self.assertEqual(nav, [f"#/{m}" for m in self.MODULOS])
            for m in self.MODULOS:
                pg.evaluate(f"location.hash = '#/{m}'")
                pg.wait_for_timeout(500)
            self.assertEqual(p.erros, [], "erros de JavaScript nos módulos")
        finally:
            p.fechar()

    def test_leads_do_instagram_aparecem_e_link_malicioso_some(self):
        p = Pagina()
        try:
            pg = p.abrir("/prospect/#/leads", 1800)
            self.assertIn("nexo_leads", p.chamadas)
            texto = pg.inner_text("#main")
            self.assertIn("Leads do Instagram", texto)
            pg.click("text=Todos")
            pg.wait_for_timeout(300)
            self.assertIn("Liga Com Link Malicioso", pg.inner_text("#main"))
            self.assertEqual(pg.eval_on_selector_all("a[href^='javascript' i]", "as => as.length"), 0)
            self.assertEqual(p.erros, [])
        finally:
            p.fechar()

    def test_sem_acesso_a_onca_nao_mostra_leads_instagram(self):
        p = Pagina(com_onca=False)
        try:
            pg = p.abrir("/prospect/", 1500)
            nav = pg.eval_on_selector_all("#nav a", "as => as.map(a => a.getAttribute('href'))")
            self.assertNotIn("#/leads", nav)
            self.assertEqual(p.erros, [])
        finally:
            p.fechar()

    def test_ficha_nao_cria_link_malicioso(self):
        p = Pagina()
        try:
            pg = p.abrir("/prospect/#/crm", 1500)
            pg.evaluate("abrirFicha && abrirFicha('e1')") if pg.evaluate("typeof abrirFicha") == "function" else pg.click("text=Clínica Teste")
            pg.wait_for_timeout(800)
            self.assertIn("nexo_prospect_ficha", p.chamadas)
            self.assertEqual(pg.eval_on_selector_all("a[href^='javascript' i]", "as => as.length"), 0)
            self.assertEqual(p.erros, [])
        finally:
            p.fechar()


if __name__ == "__main__":
    unittest.main(verbosity=2)
