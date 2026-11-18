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
def contexto(com_onca=True, master=False):
    empresas = [{"id": "emp-p", "nome": "NEXO Inteligência (teste)", "slug": "nexo-inteligencia", "status": "ativa",
                 "papel": "dono", "agentes": [{"id": AG_PROSP, "nome": "Prospect", "slug": "prospect", "nivel": 1, "ativo": True}]}]
    if com_onca:
        empresas.insert(0, {"id": "emp-v", "nome": "NEXO VÁRZEA (teste)", "slug": "nexo-varzea", "status": "ativa",
                            "papel": "dono", "agentes": [{"id": AG_ONCA, "nome": "Onça", "slug": "onca", "nivel": 2, "ativo": True}]})
    return {"email": "teste@exemplo.com", "plataforma": master, "empresas": empresas}


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


TAREFAS = []   # cada teste que precisa de tarefa preenche e limpa
CONTEUDOS = []  # peças do System (Aprovar)
PUBLICADOS = []  # arquivo completo (nexo_publicados)
PLANOS_PUB = []  # planos no cadastro público
FALHAR = {}      # funções que o banco recusa neste teste
SUPORTE = {"whatsapp": "5541998460993"}  # nexo_suporte (o Master troca)
SITUACAO = {}  # situação do plano por empresa (vazio = sem assinatura = tudo liberado)
PLANOS_CLIENTE = [
    {"chave": "inicial", "nome": "Inicial", "descricao": "Vendas", "preco_centavos": 20000, "recursos": ["prospect"], "dias_teste": 3},
    {"chave": "profissional", "nome": "Profissional", "descricao": "Inicial + Marketing", "preco_centavos": 40000, "recursos": ["prospect"], "dias_teste": 3},
    {"chave": "completo", "nome": "Completo", "descricao": "<b>Tudo</b>", "preco_centavos": 80000, "recursos": ["prospect"], "dias_teste": 3}]
MEU_PLANO = {}   # nexo_meu_plano: cada teste monta
MASTER_USUARIOS = [
    {"id": "u1", "email": "dono@cliente.com", "nome": "<img src=x onerror=alert(2)>Ana", "ultimo_login": "2026-11-19T12:00:00Z", "confirmado": True,
     "master": False, "empresas": [{"id": "emp-c", "nome": "Clínica", "papel": "dono"}]},
    {"id": "u9", "email": "ricardo@nexo.com", "nome": None, "ultimo_login": None, "confirmado": False, "master": True, "empresas": []}]

SIT_INTERNO = {"tem_assinatura": True, "acesso": "total", "status": "ativa", "status_gravado": "ativa", "plano": "interno",
               "plano_nome": "Interno", "recursos": ["prospect"], "limites": {}, "teste_ate": None, "periodo_ate": None, "carencia_dias": 5}
MASTER_EMPRESAS = [
    {"id": "emp-v", "nome": "NEXO VÁRZEA (teste)", "slug": "nexo-varzea", "status": "ativa", "origem": "interna", "membros": 1, "agentes": 1,
     "situacao": SIT_INTERNO},
    {"id": "emp-c", "nome": "<img src=x onerror=alert(1)> Clínica", "slug": "clinica", "status": "ativa", "origem": "master", "membros": 0,
     "agentes": 0, "situacao": {**SIT_INTERNO, "plano": "inicial", "plano_nome": "Inicial", "status": "teste", "status_gravado": "teste",
                                 "dias_teste_restantes": 2, "teste_ate": "2026-11-20T02:59:00Z"}},
]
MASTER_PLANOS = [
    {"chave": "interno", "nome": "Interno", "descricao": "Casa", "preco_centavos": 0, "recursos": ["prospect"], "limites": {}, "dias_teste": 0,
     "publico": False, "ativo": True, "ordem": 0, "empresas": 1},
    {"chave": "inicial", "nome": "Inicial", "descricao": "Prospect", "preco_centavos": None, "recursos": ["prospect"],
     "limites": {"usuarios": 2}, "dias_teste": 3, "publico": False, "ativo": True, "ordem": 1, "empresas": 1},
]


def rpc_falso(nome, args, com_onca=True, master=False):
    if nome == "nexo_contexto":
        return contexto(com_onca, master)
    if nome.startswith("nexo_master_") and not master:
        raise PermissionError("sem_permissao")
    if nome == "nexo_master_indicadores":
        return {"empresas": 2, "empresas_por_origem": {"interna": 1, "master": 1}, "assinaturas_por_status": {"ativa": 1, "teste": 1},
                "receita_mensal_centavos": 0, "testes_acabando": 1, "faturas_abertas_centavos": 0, "usuarios": 1}
    if nome == "nexo_master_empresas":
        return MASTER_EMPRESAS
    if nome == "nexo_master_planos":
        return MASTER_PLANOS
    if nome == "nexo_master_usuarios":
        return MASTER_USUARIOS
    if nome == "nexo_meu_plano":
        return MEU_PLANO
    if nome == "nexo_pedir_plano":
        return {}
    if nome.startswith("nexo_master_salvar_"):
        return {"ok": True}
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
    if nome == "nexo_prospect_tarefas":
        return TAREFAS
    if nome == "nexo_situacao":
        return SITUACAO.get(args.get("p_empresa"), {"tem_assinatura": False, "acesso": "total"})
    if nome == "nexo_conteudos":
        if FALHAR.get("nexo_conteudos"):
            raise PermissionError("recurso_fora_do_plano: marketing_instagram")
        return CONTEUDOS
    if nome == "nexo_publicados":
        return PUBLICADOS
    if nome == "nexo_suporte":
        return SUPORTE
    if nome == "nexo_planos_publicos":
        return PLANOS_PUB
    if nome == "nexo_aceitar_convites":
        return {"aceitos": 0}
    if nome == "nexo_membros":
        return {"membros": [{"user_id": "u1", "email": "dono@cliente.com", "papel": "dono"}, {"user_id": "u2", "email": "<b>x</b>@cliente.com", "papel": "editor"}],
                "convites": [{"id": "cv1", "email": "futuro@cliente.com", "papel": "leitor"}], "limite_usuarios": 5}
    if nome == "nexo_convidar":
        return {"ok": True, "situacao": "convite"}
    if nome in ("nexo_atividades", "nexo_ideias", "nexo_links", "nexo_categorias_lead", "nexo_integracoes"):
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

    def __init__(self, logado=True, com_onca=True, local=None, master=False):
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
        self.args = []

        def supa(route, req):
            m = re.search(r"/rest/v1/rpc/(\w+)", req.url)
            if m:
                args = json.loads(req.post_data or "{}")
                self.chamadas.append(m.group(1))
                self.args.append((m.group(1), args))
                try:
                    corpo = rpc_falso(m.group(1), args, com_onca, master)
                except PermissionError as e:
                    return route.fulfill(status=403, content_type="application/json", body=json.dumps({"code": "42501", "message": str(e)}))
                return route.fulfill(status=200, content_type="application/json", body=json.dumps(corpo))
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
            abas = pg.eval_on_selector_all(".menu [data-aba]", "bs => bs.filter(b => b.offsetParent).map(b => b.dataset.aba)")   # o Master fica escondido para cliente
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


class Aparencia(unittest.TestCase):
    """Visual NEXO: botão de paleta, três modos e cor de destaque, nos dois painéis."""

    def test_visual_carrega_depois_do_estilo_da_pagina(self):
        for nome in ("index.html", "prospect/index.html"):
            h = (RAIZ / nome).read_text(encoding="utf-8")
            self.assertGreater(h.find("visual.css"), h.find("</style>"), f"{nome}: visual.css precisa vir depois do <style>")

    def test_paleta_troca_modo_e_cor(self):
        for url in ("/index.html", "/prospect/"):
            p = Pagina()
            try:
                pg = p.abrir(url, 1500)
                botoes = [b for b in pg.query_selector_all(".ap-rapido") if b.is_visible()]
                self.assertEqual(len(botoes), 1, f"{url}: um botão de paleta visível")
                botoes[0].click()
                pg.click('.ap-modo[data-tema="claro"]')
                pg.click('.ap-cor[aria-label="Roxo"]')
                self.assertEqual(pg.evaluate("document.documentElement.dataset.tema"), "claro")
                self.assertEqual(pg.evaluate("getComputedStyle(document.documentElement).getPropertyValue('--onca').trim()"), "#8b5cf6")
                self.assertEqual(pg.evaluate("getComputedStyle(document.documentElement).getPropertyValue('--onca-txt').trim()"), "#ffffff")
                self.assertEqual(pg.evaluate("getComputedStyle(document.body).backgroundColor"), "rgb(243, 244, 247)")
                pg.reload(); pg.wait_for_timeout(800)
                self.assertEqual(pg.evaluate("document.documentElement.dataset.tema"), "claro", f"{url}: modo salvo no aparelho")
                self.assertEqual(p.erros, [])
            finally:
                p.fechar()

    def test_equipe_mostra_onca_inteira_com_a_cor_dela(self):
        p = Pagina()
        try:
            pg = p.abrir("/index.html", 1500)
            cartoes = pg.eval_on_selector_all(".est", "es => es.map(e => [e.style.getPropertyValue('--cor'), e.querySelector('.onca').getAttribute('src')])")
            self.assertEqual(len(cartoes), 7)
            for cor, src in cartoes:
                self.assertRegex(cor, r"^#[0-9a-f]{6}$")
                self.assertNotIn("rosto", src)
            quebradas = pg.evaluate("[...document.querySelectorAll('.est .onca')].filter(i => i.complete && !i.naturalWidth).length")
            self.assertEqual(quebradas, 0)
        finally:
            p.fechar()

    def test_assinatura_nexo_sempre_na_base(self):
        for url, logado in (("/index.html", True), ("/prospect/", True), ("/index.html", False), ("/prospect/", False)):
            p = Pagina(logado=logado)
            try:
                pg = p.abrir(url, 1500)
                vis = pg.evaluate("[...document.querySelectorAll('.assinatura-nexo')].filter(a => a.offsetParent).map(a => [a.getAttribute('aria-label'), a.querySelector('img').getAttribute('src'), a.querySelector('img').naturalWidth])")
                self.assertEqual(len(vis), 1, f"{url} logado={logado}: uma assinatura visível")
                self.assertRegex(vis[0][0], r"(?i)desenvolvido por nexo, gest(ã|a)o e sistemas")
                self.assertTrue(vis[0][1].endswith("nexo-assinatura.webp"), "a arte original da assinatura")
                self.assertGreater(vis[0][2], 0, "a imagem da assinatura carrega")
            finally:
                p.fechar()


class Master(unittest.TestCase):
    """Etapa 4: a aba Master só para o administrador da plataforma."""

    def abrir_master(self, p):
        pg = p.abrir("/index.html", 1500)
        pg.click('.menu [data-aba="master"]')
        pg.wait_for_timeout(600)
        return pg

    def test_cliente_comum_nao_ve_o_master(self):
        p = Pagina()
        try:
            pg = p.abrir("/index.html", 1500)
            self.assertFalse(pg.is_visible('.menu [data-aba="master"]'))
            self.assertNotIn("nexo_master_empresas", p.chamadas)
            self.assertEqual(p.erros, [])
        finally:
            p.fechar()

    def test_aba_master_salva_no_aparelho_nao_abre_para_cliente(self):
        p = Pagina(local={"nexo.aba": "master"})
        try:
            pg = p.abrir("/index.html", 1500)
            self.assertTrue(pg.is_visible('[data-sec="equipe"]'))
            self.assertFalse(pg.is_visible('[data-sec="master"]'))
        finally:
            p.fechar()

    def test_master_mostra_indicadores_empresas_e_planos(self):
        p = Pagina(master=True)
        try:
            pg = self.abrir_master(p)
            sec = pg.inner_text('[data-sec="master"]')
            self.assertEqual(pg.inner_text("#tituloAba"), "Master", "o título fica no cabeçalho da aba")
            for txt in ("Empresas", "Planos", "NEXO VÁRZEA (teste)", "Teste grátis", "a definir"):
                self.assertIn(txt, sec)
            self.assertEqual(pg.evaluate("document.querySelectorAll('[data-sec=master] img[src=x]').length"), 0, "nome com HTML não vira imagem")
            self.assertEqual(len(pg.query_selector_all(".m-emp")), 2)
            self.assertEqual(len(pg.query_selector_all("form.m-plano")), 2)
            self.assertEqual(p.erros, [])
        finally:
            p.fechar()

    def test_master_salva_plano_com_preco_em_centavos(self):
        p = Pagina(master=True)
        try:
            pg = self.abrir_master(p)
            f = 'form[data-m-salvar-plano="inicial"]'
            pg.fill(f + " [name=preco]", "97,50")
            pg.fill(f + " [name=lim_usuarios]", "")
            pg.check(f + " input[value=marketing_instagram]")
            pg.click(f + " [type=submit]")
            pg.wait_for_timeout(500)
            args = [a for n, a in p.args if n == "nexo_master_salvar_plano"][-1]
            self.assertEqual(args["p_chave"], "inicial")
            self.assertEqual(args["p_dados"]["preco_centavos"], 9750)
            self.assertEqual(args["p_dados"]["recursos"], ["prospect", "marketing_instagram"])
            self.assertNotIn("usuarios", args["p_dados"]["limites"], "limite vazio = sem limite")
            self.assertEqual(p.erros, [])
        finally:
            p.fechar()

    def test_master_cria_plano_novo(self):
        p = Pagina(master=True)
        try:
            pg = self.abrir_master(p)
            pg.click("#mNovoPlano")
            pg.fill(".m-janela [name=nome]", "Teste Pagamento")
            pg.fill(".m-janela [name=preco]", "1,00")
            pg.click(".m-janela [type=submit]"); pg.wait_for_timeout(600)
            args = [a for n, a in p.args if n == "nexo_master_salvar_plano"][-1]
            self.assertEqual(args["p_chave"], "teste_pagamento")
            self.assertEqual((args["p_dados"]["preco_centavos"], args["p_dados"]["publico"], args["p_dados"]["ativo"]), (100, False, True))
            self.assertIn("prospect", args["p_dados"]["recursos"])
            self.assertEqual(p.erros, [])
        finally:
            p.fechar()
    def test_master_cria_empresa_e_define_plano(self):
        p = Pagina(master=True)
        try:
            pg = self.abrir_master(p)
            pg.click("#mNova")
            pg.fill(".m-janela [name=nome]", "Clínica Sorriso")
            pg.fill(".m-janela [name=slug]", "clinica-sorriso")
            pg.fill(".m-janela [name=whatsapp]", "(41) 99999-0000")
            pg.click(".m-janela [type=submit]")
            pg.wait_for_timeout(600)
            args = [a for n, a in p.args if n == "nexo_master_salvar_empresa"][-1]
            self.assertIsNone(args["p_id"])
            self.assertEqual(args["p_dados"]["slug"], "clinica-sorriso")
            pg.click('[data-m-plano="emp-c"]')
            pg.select_option(".m-janela [name=status]", "ativa")
            pg.fill(".m-janela [name=periodo_ate]", "2026-12-18")
            pg.click(".m-janela [type=submit]")
            pg.wait_for_timeout(600)
            args = [a for n, a in p.args if n == "nexo_master_salvar_assinatura"][-1]
            self.assertEqual(args["p_empresa"], "emp-c")
            self.assertEqual(args["p_dados"]["status"], "ativa")
            self.assertTrue(args["p_dados"]["periodo_ate"].startswith("2026-12-19T02:59"))
            self.assertEqual(p.erros, [])
        finally:
            p.fechar()


class EmpresaEmVendas(unittest.TestCase):
    """Master enxerga todas as empresas: Vendas abre a NEXO, nunca a de um cliente por acaso (bug de 19/11/2026: abria a Godoi)."""

    CTX_MASTER = {"email": "ricardo@nexo.com", "plataforma": True, "empresas": [
        {"id": "emp-g", "nome": "GODOI NOBREAKS", "slug": "godoi-nobreaks-0ba62", "status": "ativa", "papel": "plataforma",
         "agentes": [{"id": "ag-godoi", "nome": "Prospect", "slug": "prospect", "nivel": 1, "ativo": True}]},
        {"id": "emp-p", "nome": "NEXO Inteligência e Automação", "slug": "nexo-inteligencia", "status": "ativa", "papel": "plataforma",
         "agentes": [{"id": AG_PROSP, "nome": "Prospect", "slug": "prospect", "nivel": 1, "ativo": True}]}]}

    def abrir(self, ctx_json):
        p = Pagina(master=True)
        p.ctx.route("**/rest/v1/rpc/nexo_contexto", lambda r: r.fulfill(status=200, content_type="application/json", body=json.dumps(ctx_json)))
        return p, p.abrir("/prospect/", 2000)

    def test_master_abre_a_nexo_e_troca_de_proposito(self):
        p, pg = self.abrir(self.CTX_MASTER)
        try:
            self.assertEqual(pg.evaluate("window.__prospect.estado.agente"), AG_PROSP, "abre a NEXO, não a Godoi")
            self.assertIsNone(pg.query_selector(".aviso-cliente"))
            self.assertTrue(pg.is_visible("#selEmpresaP"), "o Master tem o seletor de empresa")
            with pg.expect_navigation():
                pg.select_option("#selEmpresaP", "emp-g")
            pg.wait_for_timeout(1500)
            self.assertEqual(pg.evaluate("window.__prospect.estado.agente"), "ag-godoi")
            self.assertIn("GODOI NOBREAKS", pg.inner_text(".aviso-cliente"), "aviso claro de que é empresa de cliente")
            with pg.expect_navigation():
                pg.click("#voltarNexo")
            pg.wait_for_timeout(1500)
            self.assertEqual(pg.evaluate("window.__prospect.estado.agente"), AG_PROSP)
            self.assertEqual(p.erros, [])
        finally:
            p.fechar()

    def test_cliente_so_tem_a_propria_empresa_e_nao_ve_seletor(self):
        ctx = {"email": "dono@godoi.com", "plataforma": False, "empresas": [{**self.CTX_MASTER["empresas"][0], "papel": "dono"}]}
        p, pg = self.abrir(ctx)
        try:
            self.assertEqual(pg.evaluate("window.__prospect.estado.agente"), "ag-godoi")
            self.assertFalse(pg.is_visible("#selEmpresaP"))
            self.assertIsNone(pg.query_selector(".aviso-cliente"))
        finally:
            p.fechar()

class MeuPlano(unittest.TestCase):
    """Aba Meu plano (Marketing) e o Master com pedidos, vitalício e usuários (19/11/2026)."""

    def tearDown(self):
        MEU_PLANO.clear()

    def abrir_plano(self, p):
        pg = p.abrir("/index.html", 1500)
        pg.click('.menu [data-aba="plano"]'); pg.wait_for_timeout(500)
        return pg

    def test_cliente_ve_os_planos_e_pede_troca(self):
        MEU_PLANO.update({"pode_pedir": True, "planos": PLANOS_CLIENTE, "situacao": {"tem_assinatura": True, "acesso": "total", "status": "teste",
                          "plano": "inicial", "plano_nome": "Inicial", "preco_centavos": 20000, "dias_teste_restantes": 2, "teste_ate": "2026-11-21T13:00:00Z"}})
        p = Pagina()
        try:
            pg = self.abrir_plano(p)
            sec = '[data-sec="plano"]'
            self.assertIn("Inicial", pg.inner_text(sec + " .mp-atual"))
            self.assertIn("faltam 2 dias", pg.inner_text(sec + " .mp-atual"))
            self.assertEqual(pg.eval_on_selector_all(sec + " .ct-v-plano h3", "hs => hs.map(h => h.textContent)"), ["Inicial", "Profissional", "Completo"])
            self.assertIn("Seu plano atual", pg.inner_text(sec + " .mp-este"))
            self.assertIsNone(pg.query_selector(sec + " .ct-v-desc b"), "descrição do plano sai como texto, nunca como HTML")
            pg.on("dialog", lambda d: d.accept())
            pg.click(sec + ' [data-mp-plano="completo"]'); pg.wait_for_timeout(500)
            args = [a for n, a in p.args if n == "nexo_pedir_plano"][-1]
            self.assertEqual(args, {"p_empresa": "emp-v", "p_plano": "completo"})
            self.assertEqual(p.erros, [])
        finally:
            p.fechar()

    def test_leitor_so_ve_e_vitalicio_aparece(self):
        MEU_PLANO.update({"pode_pedir": False, "planos": PLANOS_CLIENTE, "situacao": {"tem_assinatura": True, "acesso": "total", "status": "vitalicia",
                          "plano": "completo", "plano_nome": "Completo", "preco_centavos": 80000}})
        p = Pagina()
        try:
            pg = self.abrir_plano(p)
            txt = pg.inner_text('[data-sec="plano"]')
            self.assertIn("Vitalício", txt)
            self.assertIn("sem mensalidade", txt)
            self.assertIn("Só o dono ou um administrador", txt)
            self.assertIsNone(pg.query_selector("[data-mp-plano]"), "quem não é dono nem admin não pede troca")
            self.assertEqual(p.erros, [])
        finally:
            p.fechar()

    def test_sem_a_migracao_avisa(self):
        p = Pagina()
        try:
            p.ctx.route("**/rest/v1/rpc/nexo_meu_plano", lambda r: r.fulfill(status=404, content_type="application/json",
                        body='{"code":"PGRST202","message":"Could not find the function public.nexo_meu_plano"}'))
            pg = self.abrir_plano(p)
            self.assertIn("20261119140000", pg.inner_text('[data-sec="plano"]'))
        finally:
            p.fechar()

    def test_pagar_abre_o_checkout_da_infinitepay(self):
        MEU_PLANO.update({"pode_pedir": True, "pagamento_ligado": True, "planos": PLANOS_CLIENTE, "situacao": {"tem_assinatura": True, "acesso": "total",
                          "status": "teste", "plano": "inicial", "plano_nome": "Inicial", "preco_centavos": 20000, "dias_teste_restantes": 2}})
        p = Pagina()
        try:
            pedidos = []
            def servidor(r):
                pedidos.append((r.request.headers.get("authorization", ""), json.loads(r.request.post_data or "{}")))
                r.fulfill(status=200, content_type="application/json", body='{"link":"https://checkout.infinitepay.io/teste-nexo"}')
            p.ctx.route("**/functions/v1/nexo-pagamento", servidor)
            p.ctx.route("https://checkout.infinitepay.io/**", lambda r: r.fulfill(status=200, content_type="text/html", body="<h1>Checkout InfinitePay</h1>"))
            pg = self.abrir_plano(p)
            sec = '[data-sec="plano"]'
            self.assertIn("Pagar mensalidade", pg.inner_text(sec + " .mp-este"), "no teste grátis o plano atual já pode ser pago")
            self.assertIn("Pix ou cartão", pg.inner_text(sec))
            self.assertIsNone(pg.query_selector(sec + " [data-mp-plano]"), "com o pagamento ligado não tem pedido de troca")
            with pg.expect_navigation():
                pg.click(sec + ' [data-mp-pagar="completo"]')
            self.assertEqual(pg.url, "https://checkout.infinitepay.io/teste-nexo")
            self.assertEqual(pedidos[0][1], {"acao": "pagar", "empresa": "emp-v", "plano": "completo"})
            self.assertTrue(pedidos[0][0].startswith("Bearer "), "vai com o login de quem está pagando")
        finally:
            p.fechar()

    def test_erro_do_pagamento_aparece_e_o_botao_volta(self):
        MEU_PLANO.update({"pode_pedir": True, "pagamento_ligado": True, "planos": PLANOS_CLIENTE, "situacao": {"tem_assinatura": True, "acesso": "total",
                          "status": "ativa", "plano": "inicial", "plano_nome": "Inicial", "preco_centavos": 20000, "periodo_ate": "2099-01-01T00:00:00Z"}})
        p = Pagina()
        try:
            p.ctx.route("**/functions/v1/nexo-pagamento", lambda r: r.fulfill(status=503, content_type="application/json",
                        body='{"erro":"INFINITEPAY_NOT_ENABLED","mensagem":"O checkout da InfinitePay está desligado na conta da NEXO."}'))
            pg = self.abrir_plano(p)
            sec = '[data-sec="plano"]'
            self.assertIn("Seu plano atual", pg.inner_text(sec + " .mp-este"), "pago até longe: não pede mensalidade agora")
            pg.click(sec + ' [data-mp-pagar="completo"]'); pg.wait_for_timeout(500)
            self.assertIn("checkout da InfinitePay está desligado", pg.inner_text("#toast"))
            self.assertEqual(pg.inner_text(sec + ' [data-mp-pagar="completo"]'), "Assinar e pagar")
        finally:
            p.fechar()

    def test_volta_do_checkout_confere_e_abre_meu_plano(self):
        MEU_PLANO.update({"pode_pedir": True, "pagamento_ligado": True, "planos": PLANOS_CLIENTE, "situacao": {"tem_assinatura": True, "acesso": "total",
                          "status": "ativa", "plano": "completo", "plano_nome": "Completo", "preco_centavos": 80000, "periodo_ate": "2026-12-19T12:00:00Z"}})
        p = Pagina()
        try:
            pedidos = []
            def servidor(r):
                pedidos.append(json.loads(r.request.post_data or "{}"))
                r.fulfill(status=200, content_type="application/json", body='{"resultado":"pago","pago_ate":"2026-12-19T12:00:00Z"}')
            p.ctx.route("**/functions/v1/nexo-pagamento", servidor)
            pg = p.abrir("/index.html?pagamento=volta&order_nsu=ABCDEFGHIJKLMNOPQRSTUVWXYZ12&transaction_nsu=T-1&slug=fat9&capture_method=pix", 2500)
            self.assertEqual(pedidos[0], {"acao": "conferir", "order_nsu": "ABCDEFGHIJKLMNOPQRSTUVWXYZ12", "transaction_nsu": "T-1", "slug": "fat9"})
            self.assertIn("Pagamento confirmado", pg.inner_text("#toast"))
            self.assertTrue(pg.is_visible('[data-sec="plano"]'), "abre a aba Meu plano")
            self.assertNotIn("order_nsu", pg.url, "o endereço fica limpo")
            self.assertEqual(p.erros, [])
        finally:
            p.fechar()

    def test_master_filtra_pedidos_libera_vitalicio_e_ve_usuarios(self):
        MASTER_EMPRESAS.append({"id": "emp-x", "nome": "Loja Pedido", "slug": "loja", "status": "ativa", "origem": "cadastro", "membros": 1, "agentes": 0,
                                "dono_email": "loja@cliente.com", "situacao": {**SIT_INTERNO, "plano": "inicial", "plano_nome": "Inicial", "status": "teste",
                                "status_gravado": "teste", "plano_pedido": "inicial", "pedido_em": "2026-11-19T12:00:00Z"}})
        p = Pagina(master=True)
        try:
            pg = p.abrir("/index.html", 1500)
            pg.click('.menu [data-aba="master"]'); pg.wait_for_timeout(600)
            pg.click('[data-m-filtro="pedidos"]'); pg.wait_for_timeout(300)
            nomes = pg.eval_on_selector_all(".m-lista .m-emp-txt b", "bs => bs.map(b => b.textContent)")
            self.assertEqual(nomes, ["Loja Pedido"])
            self.assertIn("Dono: loja@cliente.com", pg.inner_text(".m-lista"))
            self.assertIn("Pediu o plano Inicial", pg.inner_text(".m-lista"))
            usu = pg.inner_text(".m-usuarios")
            self.assertIn("dono@cliente.com", usu); self.assertIn("nunca entrou", usu); self.assertIn("e-mail não confirmado", usu)
            self.assertIsNone(pg.query_selector(".m-usuarios img"), "nome do usuário sai como texto")
            pg.click('[data-m-filtro="todas"]'); pg.wait_for_timeout(300)
            pg.on("dialog", lambda d: d.accept())
            pg.click('[data-m-plano="emp-c"]')
            pg.select_option(".m-janela [name=status]", "vitalicia")
            pg.click(".m-janela [type=submit]"); pg.wait_for_timeout(600)
            args = [a for n, a in p.args if n == "nexo_master_salvar_assinatura"][-1]
            self.assertEqual((args["p_empresa"], args["p_dados"]["status"]), ("emp-c", "vitalicia"))
            self.assertEqual(p.erros, [])
        finally:
            MASTER_EMPRESAS.pop()
            p.fechar()

class Retorno(unittest.TestCase):
    """Lead que pediu retorno: data marcada e destaque no CRM."""

    def tearDown(self):
        TAREFAS.clear()

    def test_card_de_quem_pediu_retorno_fica_em_destaque(self):
        import datetime
        ontem = (datetime.date.today() - datetime.timedelta(days=1)).isoformat()
        TAREFAS.append({"id": "t1", "titulo": "Retorno pedido pelo lead: ligar depois das 14h", "vence_em": ontem, "feita": False,
                        "empresa": "e1", "empresa_nome": "Clínica Teste", "empresa_status": "qualificado"})
        p = Pagina()
        try:
            pg = p.abrir("/prospect/#/crm", 1800)
            card = pg.query_selector('.kc[data-id="e1"]')
            self.assertIsNotNone(card)
            self.assertIn("retorno", card.get_attribute("class"))
            self.assertIn("bad", card.get_attribute("class"), "retorno atrasado fica vermelho")
            self.assertIn("Retorno atrasado", card.inner_text())
            self.assertEqual(p.erros, [])
        finally:
            p.fechar()

    def test_ficha_marca_retorno_com_data(self):
        p = Pagina()
        try:
            pg = p.abrir("/prospect/#/crm", 1800)
            pg.click('.kc[data-id="e1"]')
            pg.wait_for_timeout(600)
            pg.click('[data-reg="retorno"]')
            pg.click('[data-dias="7"]')
            pg.fill("#retObs", "quer ver com o sócio")
            pg.click("#mSalvar")
            pg.wait_for_timeout(700)
            reg = [a for n, a in p.args if n == "nexo_prospect_registrar"][-1]
            tar = [a for n, a in p.args if n == "nexo_prospect_salvar_tarefa"][-1]
            self.assertEqual(reg["p_tipo"], "resposta")
            self.assertIn("Pediu retorno para", reg["p_texto"])
            self.assertEqual(tar["p_titulo"], "Retorno pedido pelo lead: quer ver com o sócio")
            import datetime
            self.assertEqual(tar["p_vence_em"], (datetime.date.today() + datetime.timedelta(days=7)).isoformat())
            self.assertEqual(p.erros, [])
        finally:
            p.fechar()


class PlanoDaEmpresa(unittest.TestCase):
    """O que não está no plano não aparece; no lugar fica o convite para ativar."""

    INICIAL = {"tem_assinatura": True, "acesso": "total", "status": "ativa", "plano": "inicial", "plano_nome": "Inicial",
               "recursos": ["prospect"], "limites": {}}

    def tearDown(self):
        SITUACAO.clear()

    def test_sem_assinatura_tudo_liberado(self):
        p = Pagina()
        try:
            pg = p.abrir("/index.html", 1500)
            self.assertEqual(pg.evaluate("document.querySelectorAll('.trancado').length"), 0)
            pg = p.abrir("/prospect/", 1500)
            self.assertEqual(pg.evaluate("document.querySelectorAll('.trancado').length"), 0)
            self.assertIsNone(pg.query_selector(".plano-trava"))
        finally:
            p.fechar()

    def test_plano_inicial_tranca_marketing_e_ia(self):
        SITUACAO.update({"emp-v": self.INICIAL, "emp-p": self.INICIAL})
        p = Pagina()
        try:
            pg = p.abrir("/index.html", 1500)
            self.assertIn("trancado", pg.get_attribute('.menu [data-aba="ideias"]', "class"))
            pg.click('.menu [data-aba="ideias"]'); pg.wait_for_timeout(300)
            txt = pg.inner_text('[data-sec="ideias"]')
            self.assertIn("disponível no plano profissional", txt.lower())
            self.assertNotIn("nexo_ideias", [n for n, a in p.args][-1:], "a função trancada não é carregada")
            pg = p.abrir("/prospect/#/leads", 1500)
            self.assertIsNotNone(pg.query_selector(".plano-trava"), "Leads IG fora do plano Inicial")
            pg = p.abrir("/prospect/#/crm", 1500)
            self.assertIsNone(pg.query_selector(".plano-trava"), "CRM está no plano Inicial")
            self.assertEqual(p.erros, [])
        finally:
            p.fechar()

    def test_teste_vencido_tranca_e_mostra_faixa(self):
        SITUACAO.update({"emp-p": {**self.INICIAL, "status": "teste_vencido", "acesso": "leitura"}})
        p = Pagina()
        try:
            pg = p.abrir("/prospect/#/crm", 1500)
            self.assertIn("Seu teste grátis acabou", pg.inner_text("#main"))
            self.assertIsNotNone(pg.query_selector(".plano-faixa.bad"))
            self.assertIsNone(pg.query_selector(".kanban"), "o CRM não aparece")
            self.assertEqual(p.erros, [])
        finally:
            p.fechar()


class CopiaAoAbrir(unittest.TestCase):
    """Tocar em Instagram, WhatsApp ou e-mail na ficha deixa a mensagem sugerida copiada."""

    def test_instagram_da_ficha_copia_a_mensagem(self):
        e = EMPRESAS_P[0]
        antes = (e.get("instagram"), [dict(c) for c in e["campanhas"]])
        e["instagram"] = "https://www.instagram.com/clinicateste/"
        e["campanhas"][0]["mensagem_pt"] = "Oi! Vi o perfil de vocês e tenho uma ideia."
        p = Pagina()
        try:
            p.ctx.grant_permissions(["clipboard-read", "clipboard-write"])
            pg = p.abrir("/prospect/#/crm", 1800)
            pg.click('.kc[data-id="e1"]')
            pg.wait_for_timeout(700)
            link = pg.query_selector('a[data-copia][href="https://www.instagram.com/clinicateste/"]')
            self.assertIsNotNone(link, "Instagram abre o perfil (ig.me não abre no computador)")
            with pg.expect_popup() as janela:
                link.click()
            janela.value.close()
            pg.wait_for_timeout(300)
            self.assertEqual(pg.evaluate("navigator.clipboard.readText()"), "Oi! Vi o perfil de vocês e tenho uma ideia.")
            wa = pg.get_attribute("a[data-copia][href^='https://wa.me/']", "href")
            self.assertIn("text=Oi", wa, "WhatsApp abre com a mensagem preenchida")
            self.assertEqual(p.erros, [])
        finally:
            p.fechar()
            e["instagram"], e["campanhas"] = antes[0], antes[1]
            if antes[0] is None:
                e.pop("instagram", None)


class ArquivoDePublicados(unittest.TestCase):
    """Aprovar: publicados saem da fila e ficam no arquivo."""

    def tearDown(self):
        CONTEUDOS.clear(); PUBLICADOS.clear()

    def test_publicados_vao_para_o_arquivo(self):
        base = {"formato": "post", "origem": "agente", "midias": [], "legenda": "Legenda"}
        CONTEUDOS.extend([
            {**base, "id": "c1", "pauta": "Peça esperando", "status": "revisar", "agendado_para": "2026-11-20T21:00:00Z"},
            {**base, "id": "c2", "pauta": "Peça publicada antiga", "status": "publicado", "agendado_para": "2026-11-10T21:00:00Z", "permalink": "https://www.instagram.com/p/abc/"},
            {**base, "id": "c3", "pauta": "Peça publicada nova", "status": "publicado", "agendado_para": "2026-11-15T21:00:00Z"},
        ])
        PUBLICADOS.extend(x for x in CONTEUDOS if x["status"] == "publicado")   # o arquivo completo vem de nexo_publicados
        p = Pagina()
        try:
            pg = p.abrir("/index.html", 1500)
            pg.click('.menu [data-aba="aprovar"]'); pg.wait_for_timeout(300)
            sec = '[data-sec="aprovar"]'
            fila = pg.eval_on_selector_all(sec + " article h3", "hs => hs.map(h => h.textContent)")
            self.assertEqual(fila, ["Peça esperando"], "publicadas não ficam na fila")
            pg.click(sec + ' [data-vista="arquivo"]'); pg.wait_for_timeout(200)
            arq = pg.eval_on_selector_all(sec + " article h3", "hs => hs.map(h => h.textContent)")
            self.assertEqual(arq, ["Peça publicada nova", "Peça publicada antiga"], "arquivo do mais recente para o mais antigo")
            self.assertIsNotNone(pg.query_selector(sec + ' a[href="https://www.instagram.com/p/abc/"]'))
            self.assertEqual(p.erros, [])
        finally:
            p.fechar()


class Suporte(unittest.TestCase):
    """Suporte flutuante: responde pelas respostas prontas e leva ao WhatsApp que o Master troca."""

    def tearDown(self):
        SUPORTE.clear(); SUPORTE["whatsapp"] = "5541998460993"

    def test_system_responde_e_leva_ao_whatsapp(self):
        p = Pagina()
        try:
            pg = p.abrir("/index.html", 1500)
            pg.click("#spAbrir"); pg.wait_for_timeout(300)
            self.assertIn("onça Pintada", pg.inner_text("#spConversa"))
            pg.fill("#spTxt", "como faço para aprovar uma peça?"); pg.press("#spTxt", "Enter"); pg.wait_for_timeout(200)
            ultima = pg.eval_on_selector_all(".sp-msg.ela", "ms => ms[ms.length - 1].innerText")
            self.assertIn("Publicar", ultima)
            pg.click(".sp-msg.ela:last-child .sp-ir"); pg.wait_for_timeout(300)
            self.assertEqual(pg.inner_text("#tituloAba"), "Aprovar", "o botão leva para a aba certa")
            self.assertTrue(pg.is_hidden("#spPainel"))
            pg.click("#spAbrir"); pg.fill("#spTxt", "xyzw qwerty"); pg.press("#spTxt", "Enter"); pg.wait_for_timeout(200)
            self.assertIn("não sei", pg.eval_on_selector_all(".sp-msg.ela", "ms => ms[ms.length - 1].innerText"))
            self.assertIsNotNone(pg.query_selector('.sp-msg.ela:last-child a.sp-zap[href^="https://wa.me/5541998460993"]'))
            self.assertEqual(p.erros, [])
        finally:
            p.fechar()

    def test_sem_numero_o_botao_do_whatsapp_some(self):
        SUPORTE["whatsapp"] = ""
        p = Pagina()
        try:
            pg = p.abrir("/index.html", 1500)
            pg.click("#spAbrir"); pg.fill("#spTxt", "xyzw"); pg.press("#spTxt", "Enter"); pg.wait_for_timeout(200)
            self.assertIsNone(pg.query_selector(".sp-zap"))
            self.assertEqual(p.erros, [])
        finally:
            p.fechar()

    def test_prospect_tem_a_faro(self):
        p = Pagina()
        try:
            pg = p.abrir("/prospect/", 2000)
            pg.click("#spAbrir"); pg.wait_for_timeout(300)
            self.assertIn("onça Faro", pg.inner_text("#spConversa"))
            pg.click("#spSug button >> nth=1"); pg.wait_for_timeout(200)
            self.assertIn("quem envia é você", pg.eval_on_selector_all(".sp-msg.ela", "ms => ms[ms.length - 1].innerText"))
            self.assertEqual(p.erros, [])
        finally:
            p.fechar()

    def test_master_troca_o_numero(self):
        p = Pagina(master=True)
        try:
            pg = p.abrir("/index.html", 1500)
            pg.click('.menu [data-aba="master"]'); pg.wait_for_timeout(500)
            self.assertIn("(41) 99846-0993", pg.inner_text('[data-sec="master"]'))
            pg.click("#mSuporte"); pg.fill('input[name="whatsapp"]', "41 91234-5678"); pg.click('.m-janela [type="submit"]'); pg.wait_for_timeout(400)
            self.assertIn(("nexo_master_salvar_suporte", {"p_whatsapp": "41 91234-5678"}), p.args)
            self.assertEqual(p.erros, [])
        finally:
            p.fechar()


class PecaSemArte(unittest.TestCase):
    """Aprovar: peça sem arte diz o porquê e o que fazer (antes: só "sem mídia")."""

    def tearDown(self):
        CONTEUDOS.clear()

    def test_explica_cada_caso(self):
        base = {"origem": "agente", "midias": [], "legenda": "x", "status": "revisar", "agendado_para": "2026-11-20T21:00:00Z"}
        CONTEUDOS.extend([
            {**base, "id": "a", "pauta": "Travada", "formato": "carrossel", "motivo": "número não aprovado: 200",
             "checagem": {"problemas": [{"tipo": "número não aprovado", "trecho": "200"}]}},
            {**base, "id": "b", "pauta": "Reel", "formato": "reel", "motivo": None,
             "arte": {"cenas": [{"tempo": "0-3s", "fala": "WhatsApp não é sistema.", "imagem": "Close no celular"}]}},
            {**base, "id": "c", "pauta": "Ajuste", "formato": "reel", "motivo": "ajustar: fazer a artes"},
        ])
        p = Pagina()
        try:
            pg = p.abrir("/index.html", 1500)
            pg.click('.menu [data-aba="aprovar"]'); pg.wait_for_timeout(300)
            txt = lambda i: pg.inner_text(f'article[data-id="{i}"] .sem-arte')
            self.assertIn("Arte travada", txt("a")); self.assertIn('"200"', txt("a"))
            self.assertIn("Reel é vídeo", txt("b")); self.assertIn("Ver roteiro (1 cena)", txt("b"))
            self.assertIn("Ajuste pedido", txt("c"))
            self.assertNotIn("sem mídia", pg.inner_text('[data-sec="aprovar"]'))
            self.assertIsNone(pg.query_selector('article[data-id="a"] [data-dec="aprovado"]'), "sem arte não tem Aprovar")
            self.assertIsNotNone(pg.query_selector('article[data-id="a"] [data-dec="ajustar"]'))
            self.assertEqual(p.erros, [])
        finally:
            p.fechar()


class Conta(unittest.TestCase):
    """Criar conta, esqueci a senha, equipe e arquivo completo."""

    def tearDown(self):
        PLANOS_PUB.clear(); PUBLICADOS.clear(); CONTEUDOS.clear(); FALHAR.clear()

    def test_login_tem_esqueci_e_criar_conta(self):
        for url in ("/index.html", "/prospect/"):
            p = Pagina(logado=False)
            try:
                pg = p.abrir(url, 1500)
                self.assertTrue(pg.is_visible("[data-esqueci]"), url)
                self.assertTrue(pg.is_visible("[data-criar]"), url)
                pg.click("[data-esqueci]")
                self.assertTrue(pg.is_visible(".ct-janela input[type=email]"))
                self.assertEqual(p.erros, [])
            finally:
                p.fechar()

    def test_cadastro_fechado_sem_plano_publico(self):
        p = Pagina(logado=False)
        try:
            pg = p.abrir("/prospect/", 1500)
            pg.click("[data-criar]"); pg.wait_for_timeout(400)
            self.assertIn("ainda não está aberto", pg.inner_text(".ct-janela"))
        finally:
            p.fechar()

    def test_cadastro_guarda_dados_e_pede_confirmacao(self):
        PLANOS_PUB.append({"chave": "inicial", "nome": "Inicial", "descricao": "Prospect", "preco_centavos": 9700, "recursos": ["prospect"], "dias_teste": 3})
        p = Pagina(logado=False)
        try:
            pg = p.abrir("/index.html", 1500)
            pg.click("[data-criar]"); pg.wait_for_timeout(400)
            self.assertIn("R$ 97,00/mês", pg.inner_text(".ct-janela").replace(" ", " "))
            pg.fill(".ct-janela [name=responsavel]", "Ana"); pg.fill(".ct-janela [name=empresa]", "Clínica Sorriso")
            pg.fill(".ct-janela [name=whatsapp]", "41999990000"); pg.fill(".ct-janela [name=email]", "ana@clinica.com")
            pg.fill(".ct-janela [name=senha]", "senha-de-teste-123")
            pg.click(".ct-janela [type=submit]"); pg.wait_for_timeout(800)
            self.assertIn("Quase lá", pg.inner_text(".ct-janela"))
            pend = pg.evaluate("JSON.parse(localStorage.getItem('nexo.cadastro.pendente'))")
            self.assertEqual(pend, {"empresa": "Clínica Sorriso", "responsavel": "Ana", "whatsapp": "41999990000", "plano": "inicial"})
            self.assertNotIn("senha", str(pend), "a senha nunca fica guardada no aparelho")
        finally:
            p.fechar()

    def test_planos_aparecem_na_tela_de_entrada(self):
        PLANOS_PUB.extend([
            {"chave": "inicial", "nome": "Inicial", "descricao": "Prospect", "preco_centavos": 20000, "recursos": ["prospect"], "dias_teste": 3},
            {"chave": "completo", "nome": "Completo", "descricao": "Tudo", "preco_centavos": 80000, "recursos": ["prospect"], "dias_teste": 3}])
        for url in ("/index.html", "/prospect/"):
            p = Pagina(logado=False)
            try:
                pg = p.abrir(url, 1800)
                self.assertFalse(pg.is_visible(".ct-vitrine .ct-v-grade"), "os planos ficam fechados até o clique")
                self.assertIn("Teste 3 dias grátis", pg.inner_text(".ct-v-abrir"))
                pg.click(".ct-v-abrir"); pg.wait_for_timeout(300)
                self.assertTrue(pg.is_visible(".ct-vitrine .ct-v-grade"), "o clique abre a aba dos planos")
                cards = pg.eval_on_selector_all(".ct-vitrine .ct-v-plano h3", "hs => hs.map(h => h.textContent)")
                self.assertEqual(cards, ["Inicial", "Completo"], url)
                self.assertIn("3 dias grátis", pg.inner_text(".ct-vitrine"))
                self.assertIn("R$ 800,00", pg.inner_text(".ct-vitrine").replace("\xa0", " "))
                pg.click('.ct-vitrine [data-plano="completo"]'); pg.wait_for_timeout(400)
                self.assertTrue(pg.is_checked('.ct-janela input[name=plano][value="completo"]'), "abre o cadastro com o plano escolhido")
                self.assertEqual(p.erros, [], url)
            finally:
                p.fechar()

    def test_sem_plano_publico_a_vitrine_nao_aparece(self):
        p = Pagina(logado=False)
        try:
            pg = p.abrir("/index.html", 1500)
            self.assertIsNone(pg.query_selector(".ct-vitrine"))
        finally:
            p.fechar()

    def test_master_abre_equipe_e_convida(self):
        p = Pagina(master=True)
        try:
            pg = p.abrir("/index.html", 1500)
            pg.click('.menu [data-aba="master"]'); pg.wait_for_timeout(600)
            pg.click('[data-m-equipe="emp-v"]'); pg.wait_for_timeout(500)
            txt = pg.inner_text(".ct-janela")
            self.assertIn("dono@cliente.com", txt); self.assertIn("futuro@cliente.com", txt)
            self.assertEqual(pg.evaluate("document.querySelectorAll('.ct-janela b b').length"), 0, "e-mail com HTML não vira negrito")
            pg.on("dialog", lambda d: d.accept())
            pg.fill(".ct-janela [name=email]", "novo@cliente.com"); pg.select_option(".ct-janela [name=papel]", "leitor")
            pg.click(".ct-janela [type=submit]"); pg.wait_for_timeout(600)
            args = [a for n, a in p.args if n == "nexo_convidar"][-1]
            self.assertEqual(args, {"p_empresa": "emp-v", "p_email": "novo@cliente.com", "p_papel": "leitor"})
            self.assertEqual(p.erros, [])
        finally:
            p.fechar()

    def test_arquivo_completo_vem_de_nexo_publicados(self):
        base = {"formato": "post", "origem": "agente", "midias": [], "status": "publicado"}
        PUBLICADOS.extend([{**base, "id": f"p{i}", "pauta": f"Antiga {i}", "agendado_para": f"2026-10-{10 + i}T21:00:00Z"} for i in range(5)])
        p = Pagina()
        try:
            pg = p.abrir("/index.html", 1500)
            pg.click('.menu [data-aba="aprovar"]'); pg.wait_for_timeout(300)
            pg.click('[data-sec="aprovar"] [data-vista="arquivo"]'); pg.wait_for_timeout(500)
            self.assertIn("nexo_publicados", p.chamadas)
            self.assertEqual(len(pg.query_selector_all('[data-sec="aprovar"] article')), 5)
            self.assertEqual(p.erros, [])
        finally:
            p.fechar()

    def test_system_abre_mesmo_com_marketing_fora_do_plano(self):
        FALHAR["nexo_conteudos"] = True
        p = Pagina()
        try:
            pg = p.abrir("/index.html", 1500)
            self.assertTrue(pg.is_visible('[data-sec="equipe"]'), "o painel abre normalmente")
            self.assertEqual([e for e in p.erros if "console" not in e], [])
        finally:
            p.fechar()


class ConviteSemEmail(unittest.TestCase):
    """O NEXO não manda e-mail de convite: o dono envia pelo WhatsApp ou e-mail dele, e o link abre a conta de convidado."""

    def test_convite_pendente_tem_whatsapp_email_e_copiar(self):
        p = Pagina(master=True)
        try:
            pg = p.abrir("/index.html", 1500)
            pg.click('.menu [data-aba="master"]'); pg.wait_for_timeout(600)
            pg.click('[data-m-equipe="emp-v"]'); pg.wait_for_timeout(500)
            wa = pg.get_attribute('.ct-pend a[href^="https://wa.me/"]', "href")
            mail = pg.get_attribute('.ct-pend a[href^="mailto:"]', "href")
            self.assertIn("convite%3Dfuturo%2540cliente.com", wa, "o link do convite leva o e-mail")
            self.assertTrue(mail.startswith("mailto:futuro@cliente.com?subject="))
            self.assertIsNotNone(pg.query_selector('.ct-pend [data-copiar-convite="futuro@cliente.com"]'))
            self.assertEqual(p.erros, [])
        finally:
            p.fechar()

    def test_link_do_convite_abre_conta_de_convidado(self):
        p = Pagina(logado=False)
        try:
            pg = p.abrir("/prospect/?convite=ana%40cliente.com", 1800)
            self.assertIn("Criar sua conta", pg.inner_text(".ct-janela"))
            self.assertEqual(pg.input_value(".ct-janela [name=email]"), "ana@cliente.com")
            pg.fill(".ct-janela [name=nome]", "Ana"); pg.fill(".ct-janela [name=senha]", "senha-de-teste-123")
            pg.click(".ct-janela [type=submit]"); pg.wait_for_timeout(800)
            self.assertIn("Quase lá", pg.inner_text(".ct-janela"))
            self.assertIsNone(pg.evaluate("localStorage.getItem('nexo.cadastro.pendente')"), "convidado não cria empresa")
        finally:
            p.fechar()

    def test_cadastro_fechado_ainda_deixa_convidado_criar_conta(self):
        p = Pagina(logado=False)
        try:
            pg = p.abrir("/index.html", 1500)
            pg.click("[data-criar]"); pg.wait_for_timeout(400)
            pg.click(".ct-janela [data-convidado]"); pg.wait_for_timeout(300)
            self.assertIn("Criar sua conta", pg.inner_text(".ct-janela"))
        finally:
            p.fechar()


class AbaAgenteSimples(unittest.TestCase):
    """Aba Agente em 4 passos com um botão só, que grava apenas o que mudou."""

    def abrir(self, p):
        pg = p.abrir("/index.html", 1500)
        pg.click('.menu [data-aba="agente"]'); pg.wait_for_timeout(400)
        return pg

    def test_quatro_passos_e_titulo_da_aba(self):
        p = Pagina()
        try:
            pg = self.abrir(p)
            self.assertEqual(pg.inner_text("#tituloAba"), "Identidade")
            self.assertEqual(len(pg.query_selector_all(".ag-passo")), 4)
            self.assertEqual(len(pg.query_selector_all('[data-sec="agente"] button[type=submit]')), 1, "um botão Salvar só")
            self.assertFalse(pg.is_visible("#idLogo"), "logo e cores ficam em Mais opções")
            self.assertEqual(p.erros, [])
        finally:
            p.fechar()

    def test_estilo_por_toque_e_salva_so_o_que_mudou(self):
        p = Pagina()
        try:
            pg = self.abrir(p)
            pg.click('[data-tom="Descontraído"]'); pg.click('[data-tom="Direto"]')
            self.assertEqual(pg.input_value("#idPers"), "Descontraído, direto.")
            self.assertIn("mudanças sem salvar", pg.inner_text("#agMud"))
            pg.click("#agSalvar"); pg.wait_for_timeout(600)
            chamadas = [n for n, a in p.args]
            self.assertIn("nexo_salvar_identidade", chamadas)
            self.assertNotIn("nexo_salvar_agente", chamadas, "nome e nível não mudaram")
            self.assertNotIn("nexo_salvar_instrucoes", chamadas, "instruções não mudaram")
            self.assertEqual(p.erros, [])
        finally:
            p.fechar()


if __name__ == "__main__":
    unittest.main(verbosity=2)
