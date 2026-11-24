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
HISTORICO = []   # recusadas e com falha (nexo_conteudos_historico)
INTEGRACOES = []  # nexo_integracoes (redes conectadas)
PLANOS_PUB = []  # planos no cadastro público
VITRINE = []     # nexo_planos_vitrine: planos só para olhar na tela de entrada
FALHAR = {}      # funções que o banco recusa neste teste
FICHA_EXTRA = {}  # campos que a ficha do primeiro lead devolve a mais/a menos neste teste (ex.: whatsapp None)
SDR_CFG = {}     # nexo_sdr_config: cada teste monta
CANAIS = {"dados": {}, "passos": {}, "atualizado_em": None}   # nexo_canais_cadastro / nexo_canais_salvar


def sdr_cfg_inicial():
    return {"empresa_id": "emp-p", "ativo": False, "modo": "sombra", "provedor": None, "phone_number_id": None, "instance_id": None,
            "persona_prompt": "", "llm_provedor": None, "llm_modelo": None, "gestor_whatsapp": None, "horario": None,
            "max_msgs_hora": 30, "max_novas_conversas_dia": 20, "so_responde_quem_escreveu": True, "aceite_autonomo_em": None,
            "aceite_abordagem_em": None, "webhook_gerado": False,
            "credenciais": {"whatsapp_business": {"salva": False}, "llm": {"salva": False}}}


def sdr_cfg_pronto():
    c = sdr_cfg_inicial()
    c.update({"provedor": "cloud_api", "phone_number_id": "1055", "llm_provedor": "anthropic", "llm_modelo": "claude-sonnet-5-5",
              "persona_prompt": "Você é a consultora comercial da Empresa: curta e natural.", "gestor_whatsapp": "5541999991111"})
    c["credenciais"] = {"whatsapp_business": {"salva": True, "final": "••••1234", "status": "pendente"}, "llm": {"salva": True, "final": "••••9876", "status": "pendente"}}
    return c


CONVERSAS_SDR = []   # nexo_sdr_conversas: cada teste monta
MENSAGENS_SDR = {}   # conversa -> mensagens


def conv_sdr(i, nome, estado_ia="ia_ativa", temp="frio", aguardando=False, lead_id=None, resumo=None):
    return {"id": f"cv{i}", "telefone": f"554199999000{i}", "lead_id": lead_id, "lead_nome": nome, "estado_ia": estado_ia, "temperatura": temp,
            "resumo_transbordo": resumo, "dor_interesse": "Agenda só no WhatsApp" if resumo else None, "motivo_transbordo": "pediu valores" if resumo else None,
            "transferido_em": None, "nao_lida_humano": aguardando, "ultima_msg_em": "2026-11-24T12:00:00Z", "janela_24h_ate": None,
            "ultima_msg": f"última mensagem de {nome}", "link_whatsapp": f"https://wa.me/554199999000{i}"}


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
        e = {**EMPRESAS_P[0], **FICHA_EXTRA}
        return {"empresa": e, "campanhas": [{**e["campanhas"][0], "oportunidade": "Teste", "evidencias": [{"o_que": "Evidência", "onde": LINK_RUIM}]}],
                "historico": [], "tarefas": []}
    if nome == "nexo_prospect_contato":
        if FALHAR.get("contato"):
            raise PermissionError(FALHAR["contato"])
        if args.get("p_whatsapp"):
            FICHA_EXTRA["whatsapp"] = "5545999123456"
        if args.get("p_instagram"):
            FICHA_EXTRA["instagram"] = "clinicateste"
        return {"ok": True}
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
    if nome == "nexo_conteudos_historico":
        return HISTORICO
    if nome == "nexo_integracoes":
        return INTEGRACOES
    if nome in ("nexo_marcar_pedido", "nexo_decidir_conteudo"):
        return {"ok": True}
    if nome == "nexo_pedir_ideias":
        return {"id": "ped-novo"}
    if nome == "nexo_sdr_conversas":
        est = args.get("p_estado")
        return [c for c in CONVERSAS_SDR if not est or c["estado_ia"] == est]
    if nome == "nexo_sdr_mensagens":
        return MENSAGENS_SDR.get(args["p_conversa"], [])
    if nome == "nexo_sdr_assumir":
        c = next(c for c in CONVERSAS_SDR if c["id"] == args["p_conversa"])
        c["estado_ia"] = "atendimento_humano"; c["nao_lida_humano"] = False
        return {"ok": True, "link_whatsapp": c["link_whatsapp"]}
    if nome == "nexo_sdr_devolver_ia":
        c = next(c for c in CONVERSAS_SDR if c["id"] == args["p_conversa"])
        c["estado_ia"] = "ia_ativa"; c["temperatura"] = "morno"; c["nao_lida_humano"] = False
        return {"ok": True}
    if nome == "nexo_canais_cadastro":
        return {"empresa_id": "emp-p", **json.loads(json.dumps(CANAIS))}
    if nome == "nexo_canais_salvar":
        CANAIS["dados"] = {k: v for k, v in (args.get("p_dados") or {}).items() if v != ""}
        CANAIS["passos"] = args.get("p_passos") or {}
        CANAIS["atualizado_em"] = "2026-11-24T15:00:00Z"
        return {"ok": True}
    if nome == "nexo_sdr_config":
        return json.loads(json.dumps(SDR_CFG))
    if nome == "nexo_sdr_salvar":
        SDR_CFG.update({k: v for k, v in (args.get("p_cfg") or {}).items() if not k.startswith("aceite_")})
        return {"ok": True}
    if nome == "nexo_sdr_salvar_credencial":
        SDR_CFG["credenciais"][args["p_tipo"]] = {"salva": True, "final": "••••" + args["p_segredo"][-4:], "status": "pendente"}
        return {"ok": True, "final": "••••" + args["p_segredo"][-4:]}
    if nome == "nexo_sdr_gerar_webhook":
        SDR_CFG["webhook_gerado"] = True
        return {"ok": True, "token": "ab" * 32, "aviso": "Copie agora: este token não aparece de novo."}
    if nome == "nexo_suporte":
        return SUPORTE
    if nome == "nexo_planos_publicos":
        return PLANOS_PUB
    if nome == "nexo_planos_vitrine":
        return json.loads(json.dumps(VITRINE))
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
        self.sys = (RAIZ / "marketing.html").read_text(encoding="utf-8")
        self.pro = (RAIZ / "index.html").read_text(encoding="utf-8")
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
            pg = p.abrir("/marketing.html")
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
            pg = p.abrir("/marketing.html", 1500)
            self.assertTrue(pg.is_visible("#email"))
            self.assertEqual(p.erros, [])
        finally:
            p.fechar()

    def test_todas_as_abas_abrem_sem_erros(self):
        p = Pagina()
        try:
            pg = p.abrir("/marketing.html", 1500)
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
            pg = p.abrir("/marketing.html", 1500)
            self.assertFalse(pg.eval_on_selector('[data-sec="equipe"]', "s => s.classList.contains('oculto')"))
            self.assertEqual(p.erros, [])
        finally:
            p.fechar()

    def test_atalho_de_leads_leva_ao_prospect(self):
        p = Pagina()
        try:
            pg = p.abrir("/marketing.html", 1500)
            pg.evaluate("abrirAba('leads')")
            pg.wait_for_url(re.compile(r"/#/leads$"), timeout=5000)
        finally:
            p.fechar()


class Prospect(unittest.TestCase):
    MODULOS = ["inicio", "crm", "tarefas", "campanhas", "plano", "ajuda"]

    def test_login_abre_sem_erros(self):
        p = Pagina(logado=False)
        try:
            pg = p.abrir("/", 1500)
            self.assertTrue(pg.is_visible("#lEmail"))
            self.assertEqual(p.erros, [])
        finally:
            p.fechar()

    def test_todos_os_modulos_abrem_sem_erros(self):
        p = Pagina()
        try:
            pg = p.abrir("/", 1500)
            nav = pg.eval_on_selector_all("#nav a", "as => as.map(a => a.getAttribute('href'))")
            self.assertEqual(nav, [f"#/{m}" for m in self.MODULOS])
            for m in self.MODULOS:
                pg.evaluate(f"location.hash = '#/{m}'")
                pg.wait_for_timeout(500)
            self.assertEqual(p.erros, [], "erros de JavaScript nos módulos")
        finally:
            p.fechar()

    def test_leads_do_instagram_nao_aparecem_no_prospect(self):
        """25/11/2026, Ricardo: o Prospect é independente do Marketing. Os leads do Instagram (Várzea) ficam só lá."""
        p = Pagina()
        try:
            pg = p.abrir("/#/leads", 1800)
            self.assertNotIn("Leads Instagram", pg.inner_text("#nav"))
            self.assertNotIn("nexo_leads", p.chamadas, "o Prospect nem pede os leads do Várzea")
            self.assertEqual(pg.evaluate("location.hash"), "#/leads")
            self.assertIn("Início", pg.inner_text("#main h1") + pg.inner_text("#nav a[aria-current=page]"), "rota desconhecida cai no Início")
            self.assertEqual(p.erros, [])
        finally:
            p.fechar()

    def test_sem_acesso_a_onca_nao_mostra_leads_instagram(self):
        p = Pagina(com_onca=False)
        try:
            pg = p.abrir("/", 1500)
            nav = pg.eval_on_selector_all("#nav a", "as => as.map(a => a.getAttribute('href'))")
            self.assertNotIn("#/leads", nav)
            self.assertEqual(p.erros, [])
        finally:
            p.fechar()

    def test_ficha_nao_cria_link_malicioso(self):
        p = Pagina()
        try:
            pg = p.abrir("/#/crm", 1500)
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
        for nome in ("marketing.html", "index.html"):
            h = (RAIZ / nome).read_text(encoding="utf-8")
            self.assertGreater(h.find("visual.css"), h.find("</style>"), f"{nome}: visual.css precisa vir depois do <style>")

    def test_paleta_troca_modo_e_cor(self):
        for url in ("/marketing.html", "/"):
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
            pg = p.abrir("/marketing.html", 1500)
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
        for url, logado in (("/marketing.html", True), ("/", True), ("/marketing.html", False), ("/", False)):
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
        pg = p.abrir("/marketing.html", 1500)
        pg.click('.menu [data-aba="master"]')
        pg.wait_for_timeout(600)
        return pg

    def test_busca_de_emergencia_no_topo_do_master(self):
        p = Pagina(master=True)
        pedidos = []
        p.page.on("request", lambda r: "/functions/v1/nexo-rodada" in r.url and pedidos.append(r.post_data))
        try:
            pg = self.abrir_master(p)
            pg.click("#mEmergencia"); pg.wait_for_timeout(500)
            self.assertEqual([json.loads(x) for x in pedidos], [{"acao": "buscar"}])
            self.assertEqual(p.erros, [])
        finally:
            p.fechar()

    def test_excluir_cliente_pede_o_nome_e_nao_aparece_na_casa(self):
        p = Pagina(master=True)
        try:
            pg = self.abrir_master(p)
            self.assertEqual(pg.eval_on_selector_all('[data-m-excluir="emp-v"]', "x => x.length"), 0, "a casa não tem Excluir")
            pg.click('[data-m-excluir="emp-c"]'); pg.wait_for_timeout(200)
            pg.fill('.m-janela input[name="confirmacao"]', "outro nome")
            pg.click('.m-janela [type=submit]'); pg.wait_for_timeout(300)
            self.assertNotIn("nexo_master_excluir_cliente", p.chamadas, "nome errado não chama o banco")
            nome = next(e["nome"] for e in MASTER_EMPRESAS if e["id"] == "emp-c")
            pg.fill('.m-janela input[name="confirmacao"]', nome)
            pg.click('.m-janela [type=submit]'); pg.wait_for_timeout(500)
            args = [a for n, a in p.args if n == "nexo_master_excluir_cliente"]
            self.assertEqual(args, [{"p_empresa": "emp-c", "p_confirmacao": nome}])
            self.assertEqual(p.erros, [])
        finally:
            p.fechar()

    def test_excluida_so_no_filtro_e_com_restaurar(self):
        MASTER_EMPRESAS.append({**MASTER_EMPRESAS[1], "id": "emp-x", "nome": "Padaria Excluída", "status": "excluida",
                                "excluida_em": "2026-11-18T22:00:00Z", "membros": 0})
        p = Pagina(master=True)
        try:
            pg = self.abrir_master(p)
            self.assertNotIn("Padaria Excluída", pg.inner_text(".m-lista"), "fora do filtro Excluídas não aparece")
            pg.click('[data-m-filtro="excluidas"]'); pg.wait_for_timeout(400)
            self.assertIn("Padaria Excluída", pg.inner_text(".m-lista"))
            self.assertIn("Excluída em", pg.inner_text(".m-lista"))
            pg.click('[data-m-restaurar="emp-x"]'); pg.wait_for_timeout(200)
            pg.click('.m-janela [type=submit]'); pg.wait_for_timeout(500)
            self.assertEqual([a for n, a in p.args if n == "nexo_master_restaurar_cliente"], [{"p_empresa": "emp-x"}])
            self.assertEqual(p.erros, [])
        finally:
            p.fechar()
            MASTER_EMPRESAS.pop()

    def test_cliente_comum_nao_ve_o_master(self):
        p = Pagina()
        try:
            pg = p.abrir("/marketing.html", 1500)
            self.assertFalse(pg.is_visible('.menu [data-aba="master"]'))
            self.assertNotIn("nexo_master_empresas", p.chamadas)
            self.assertEqual(p.erros, [])
        finally:
            p.fechar()

    def test_aba_master_salva_no_aparelho_nao_abre_para_cliente(self):
        p = Pagina(local={"nexo.aba": "master"})
        try:
            pg = p.abrir("/marketing.html", 1500)
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


class RodadasDaEquipe(unittest.TestCase):
    """Vendas mostra se a rodada das 06:10/12:10/18:10 chegou; o master tem os botões (18/11/2026)."""
    ST = {"rodadas": [
        {"horario": "2026-11-18T21:10:00Z", "estado": "atrasada", "gravado_em": None, "empresas_novas": 0, "leads_novos": None},
        {"horario": "2026-11-18T15:10:00Z", "estado": "gravada", "gravado_em": "2026-11-18T16:27:00Z", "empresas_novas": 8, "leads_novos": 7}],
        "pedidos": []}

    def abrir(self, master):
        global rpc_falso
        orig, st = rpc_falso, {**self.ST, "master": master}

        def com_rodadas(nome, args, *a, **k):
            return st if nome == "nexo_rodada_status" else orig(nome, args, *a, **k)
        rpc_falso = com_rodadas
        self.addCleanup(lambda: globals().__setitem__("rpc_falso", orig))
        p = Pagina()
        self.addCleanup(p.fechar)
        pedidos = []
        p.page.on("request", lambda r: "/functions/v1/nexo-rodada" in r.url and pedidos.append(r.post_data))
        pg = p.abrir("/", 1800)
        return p, pg, pedidos

    def test_cliente_ve_a_rodada_sem_os_botoes(self):
        p, pg, _ = self.abrir(False)
        txt = pg.inner_text(".rd-lista")
        self.assertIn("Não chegou", txt)
        self.assertIn("8 empresas novas para você", txt)
        self.assertNotIn("do Várzea", txt)   # leads da casa só o master vê
        self.assertEqual(pg.eval_on_selector_all("[data-rodada]", "x => x.length"), 0)
        self.assertEqual(pg.eval_on_selector_all(".btn.emergencia", "x => x.length"), 0, "cliente não vê a busca de emergência")
        self.assertEqual(p.erros, [])

    def test_selo_da_automacao_nao_diz_sem_erro_com_rodada_vermelha(self):
        p, pg, _ = self.abrir(False)
        selo = pg.inner_text(".card-h:has(h2:text-is('Automação')) .badge")
        self.assertIn("rodada não chegou", selo)
        self.assertNotIn("sem erro", selo)
        self.assertIn("bad", pg.get_attribute(".card-h:has(h2:text-is('Automação')) .badge", "class"))
        self.assertEqual(p.erros, [])

    def test_selo_da_automacao_continua_verde_com_as_rodadas_em_dia(self):
        em_dia = {"rodadas": [{"horario": "2026-11-18T15:10:00Z", "estado": "gravada", "gravado_em": "2026-11-18T16:27:00Z", "empresas_novas": 8, "leads_novos": 7}], "pedidos": []}
        original = self.ST
        self.ST = em_dia
        try:
            p, pg, _ = self.abrir(False)
            self.assertIn("Rodando sem erro", pg.inner_text(".card-h:has(h2:text-is('Automação')) .badge"))
        finally:
            self.ST = original

    def test_master_tem_busca_de_emergencia_no_topo(self):
        p, pg, pedidos = self.abrir(True)
        pg.click(".page-h .btn.emergencia"); pg.wait_for_timeout(500)
        self.assertEqual([json.loads(x) for x in pedidos], [{"acao": "buscar"}])
        self.assertEqual(p.erros, [])

    def test_master_dispara_gravar_agora(self):
        p, pg, pedidos = self.abrir(True)
        self.assertIn("7 leads do Várzea", pg.inner_text(".rd-lista"))
        pg.click('[data-rodada="gravar"]'); pg.wait_for_timeout(500)
        self.assertEqual(len(pedidos), 1)
        self.assertEqual(json.loads(pedidos[0]), {"acao": "gravar"})
        self.assertEqual(p.erros, [])


class AnexosPedirPeca(unittest.TestCase):
    """Pedir peça com fotos e vídeos (assets/anexos.js, 19/11/2026)."""

    def test_foto_e_video_sobem_e_entram_no_pedido(self):
        import tempfile
        global rpc_falso
        orig = rpc_falso
        pedidos = [{"id": "p-velho", "texto": "Semifinal", "quantidade": 2, "status": "pronto", "criado_em": "2026-11-18T12:00:00Z",
                    "anexos": [{"id": "x1", "caminho": "emp-v/a/1.jpg", "tipo": "foto", "legenda": "<b>gol</b>", "ordem": 1}],
                    "pecas": [{"id": "c1", "pauta": "A virada", "formato": "carrossel", "status": "revisar", "anexo_base": "x1"}]}]

        def com_anexos(nome, args, *a, **k):
            if nome == "nexo_ideias":
                return pedidos
            if nome == "nexo_pedir_ideias":
                return {"ok": True, "id": "p-novo"}
            if nome == "nexo_anexar_ideia":
                return {"ok": True, "anexos": len(args["p_anexos"])}
            return orig(nome, args, *a, **k)
        rpc_falso = com_anexos
        pasta = tempfile.mkdtemp()
        foto, video = pathlib.Path(pasta, "jogo.png"), pathlib.Path(pasta, "lance.mp4")
        import base64
        foto.write_bytes(base64.b64decode("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=="))
        video.write_bytes(b"\x00\x00\x00\x18ftypmp42" + b"\x00" * 64)
        try:
            p = Pagina()
            try:
                pg = p.abrir("/marketing.html", 1500)
                pg.click('.menu [data-aba="ideias"]'); pg.wait_for_timeout(500)
                self.assertTrue(pg.is_visible("#axZona"), "o bloco de anexos aparece")
                self.assertIn("&lt;b&gt;gol&lt;/b&gt;", pg.inner_html(".ax-tiras"), "legenda do anexo vai escapada")
                self.assertIn("Feita a partir da", pg.inner_text(".ax-origem"))
                pg.set_input_files("#axArq", [str(foto), str(video)])
                for _ in range(50):
                    if pg.eval_on_selector_all(".ax-item.pronto", "x => x.length") == 2:
                        break
                    pg.wait_for_timeout(100)
                self.assertEqual(pg.eval_on_selector_all(".ax-item.pronto", "x => x.length"), 2, pg.inner_text("#axGrade"))
                self.assertIn("recebeu 1 foto e 1 vídeo", pg.inner_text("#axFalaTxt"))
                pg.fill(".ax-item input >> nth=0", "torcida")
                self.assertFalse(pg.is_disabled("#idPedir"))
                pg.click("#idPedir"); pg.wait_for_timeout(600)
                ligados = [a for n, a in p.args if n == "nexo_anexar_ideia"]
                self.assertEqual(len(ligados), 1)
                self.assertEqual(ligados[0]["p_pedido"], "p-novo")
                cams = [x["caminho"] for x in ligados[0]["p_anexos"]]
                self.assertTrue(cams[0].startswith("emp-v/") and cams[0].endswith(".jpg"), cams)
                self.assertTrue(cams[1].endswith(".mp4"), cams)
                self.assertEqual(ligados[0]["p_anexos"][0]["legenda"], "torcida")
                self.assertEqual(p.erros, [])
            finally:
                p.fechar()
        finally:
            rpc_falso = orig

    def test_arquivo_de_outro_tipo_e_recusado(self):
        import tempfile
        p = Pagina()
        try:
            pg = p.abrir("/marketing.html", 1500)
            pg.click('.menu [data-aba="ideias"]'); pg.wait_for_timeout(500)
            arq = pathlib.Path(tempfile.mkdtemp(), "planilha.xlsx"); arq.write_bytes(b"PK")
            pg.set_input_files("#axArq", [str(arq)]); pg.wait_for_timeout(300)
            self.assertIn("só fotos", pg.inner_text("#axErro"))
            self.assertEqual(pg.eval_on_selector_all(".ax-item", "x => x.length"), 0)
        finally:
            p.fechar()


class NomeNoTopo(unittest.TestCase):
    """O nome no topo não repete a empresa quando o nome de exibição já a traz (19/11/2026)."""

    def test_nome_da_empresa_nao_repete(self):
        global rpc_falso
        orig = rpc_falso

        def com_nome(nome, args, *a, **k):
            r = orig(nome, args, *a, **k)
            if nome == "nexo_resumo":
                r = {**r, "identidade": {"nome_exibicao": "Onça · NEXO VÁRZEA (teste)"}}
            return r
        rpc_falso = com_nome
        try:
            p = Pagina()
            try:
                pg = p.abrir("/marketing.html", 1500)
                self.assertEqual(pg.inner_text("#nomeEmpresa").upper(), "NEXO VÁRZEA (TESTE) · ONÇA")
                self.assertEqual(p.erros, [])
            finally:
                p.fechar()
        finally:
            rpc_falso = orig


class PaginasLegais(unittest.TestCase):
    """Privacidade e Termos (exigidos pelo Google e pela Meta) e o link no rodapé de todas as telas."""

    def test_links_no_rodape_e_paginas_abrem(self):
        for url, logado in (("/marketing.html", False), ("/", True)):
            p = Pagina(logado=logado)
            try:
                pg = p.abrir(url, 1500)
                hrefs = pg.eval_on_selector_all(".legal-links a", "as => as.filter(a => a.offsetParent).map(a => a.href)")
                self.assertTrue(any(h.endswith("/privacidade.html") for h in hrefs), url)
                self.assertTrue(any(h.endswith("/termos.html") for h in hrefs), url)
            finally:
                p.fechar()
        p = Pagina(logado=False)
        try:
            for pagina, texto in (("/privacidade.html", "Uso Limitado"), ("/termos.html", "Teste grátis e pagamento")):
                pg = p.abrir(pagina, 600)
                self.assertIn(texto, pg.inner_text("main"))
            self.assertEqual(p.erros, [])
        finally:
            p.fechar()

class AvisoMensalidade(unittest.TestCase):
    """Faixa vermelha no topo: 2 dias, 1 dia, vence hoje e vencida (pedido do Ricardo, 19/11/2026)."""

    def tearDown(self):
        SITUACAO.clear()

    def faixa(self, situacao):
        import datetime
        SITUACAO.update({"emp-v": {"tem_assinatura": True, "plano": "inicial", "plano_nome": "Inicial", **situacao}})
        p = Pagina()
        try:
            pg = p.abrir("/marketing.html", 1800)
            el = pg.query_selector(".plano-faixa")
            r = (el.get_attribute("class"), el.inner_text()) if el else (None, "")
            self.assertEqual(p.erros, [])
            return r
        finally:
            p.fechar()

    def em(self, dias):
        import datetime
        # meio da tarde em Brasília daqui a N dias (15:00 BRT = 18:00 UTC)
        d = datetime.datetime.now(datetime.timezone(datetime.timedelta(hours=-3))).date() + datetime.timedelta(days=dias)
        return f"{d.isoformat()}T18:00:00Z"

    def test_dois_um_e_zero_dias(self):
        for dias, texto in ((2, "vence em 2 dias"), (1, "vence amanhã"), (0, "vence hoje")):
            cls, txt = self.faixa({"status": "ativa", "acesso": "total", "periodo_ate": self.em(dias)})
            self.assertIn("urgente", cls or "", f"{dias} dias: faixa vermelha")
            self.assertIn(texto, txt)
            self.assertIn("Pagar agora", txt)

    def test_tres_dias_ainda_nao_avisa(self):
        cls, _ = self.faixa({"status": "ativa", "acesso": "total", "periodo_ate": self.em(3)})
        self.assertIsNone(cls, "com 3 dias ainda não aparece faixa")

    def test_vencida_continua_vermelha(self):
        cls, txt = self.faixa({"status": "vencida", "acesso": "aviso", "periodo_ate": self.em(-1)})
        self.assertIn("urgente", cls)
        self.assertIn("venceu", txt)

    def test_teste_gratis_acabando(self):
        cls, txt = self.faixa({"status": "teste", "acesso": "total", "dias_teste_restantes": 1, "teste_ate": self.em(1)})
        self.assertIn("urgente", cls)
        self.assertIn("termina amanhã", txt)

    def test_vitalicio_nunca_avisa(self):
        cls, _ = self.faixa({"status": "vitalicia", "acesso": "total", "periodo_ate": None})
        self.assertIsNone(cls)

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
        return p, p.abrir("/", 2000)

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
        pg = p.abrir("/marketing.html", 1500)
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
            self.assertEqual(pedidos[0][1], {"acao": "pagar", "empresa": "emp-v", "plano": "completo", "ciclo": "mensal"})
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
            pg = p.abrir("/marketing.html?pagamento=volta&order_nsu=ABCDEFGHIJKLMNOPQRSTUVWXYZ12&transaction_nsu=T-1&slug=fat9&capture_method=pix", 2500)
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
            pg = p.abrir("/marketing.html", 1500)
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
            pg = p.abrir("/#/crm", 1800)
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
            pg = p.abrir("/#/crm", 1800)
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
            pg = p.abrir("/marketing.html", 1500)
            self.assertEqual(pg.evaluate("document.querySelectorAll('.trancado').length"), 0)
            pg = p.abrir("/", 1500)
            self.assertEqual(pg.evaluate("document.querySelectorAll('.trancado').length"), 0)
            self.assertIsNone(pg.query_selector(".plano-trava"))
        finally:
            p.fechar()

    def test_plano_inicial_tranca_marketing_e_ia(self):
        SITUACAO.update({"emp-v": self.INICIAL, "emp-p": self.INICIAL})
        p = Pagina()
        try:
            pg = p.abrir("/marketing.html", 1500)
            self.assertIn("trancado", pg.get_attribute('.menu [data-aba="ideias"]', "class"))
            pg.click('.menu [data-aba="ideias"]'); pg.wait_for_timeout(300)
            txt = pg.inner_text('[data-sec="ideias"]')
            self.assertIn("disponível no plano profissional", txt.lower())
            self.assertNotIn("nexo_ideias", [n for n, a in p.args][-1:], "a função trancada não é carregada")
            pg = p.abrir("/#/crm", 1500)
            self.assertIsNone(pg.query_selector(".plano-trava"), "CRM está no plano Inicial")
            self.assertEqual(p.erros, [])
        finally:
            p.fechar()

    def test_teste_vencido_tranca_e_mostra_faixa(self):
        SITUACAO.update({"emp-p": {**self.INICIAL, "status": "teste_vencido", "acesso": "leitura"}})
        p = Pagina()
        try:
            pg = p.abrir("/#/crm", 1500)
            self.assertIn("Seu teste grátis acabou", pg.inner_text("#main"))
            self.assertIsNotNone(pg.query_selector(".plano-faixa.urgente"), "faixa vermelha")
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
            pg = p.abrir("/#/crm", 1800)
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
            pg = p.abrir("/marketing.html", 1500)
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
            pg = p.abrir("/marketing.html", 1500)
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
            pg = p.abrir("/marketing.html", 1500)
            pg.click("#spAbrir"); pg.fill("#spTxt", "xyzw"); pg.press("#spTxt", "Enter"); pg.wait_for_timeout(200)
            self.assertIsNone(pg.query_selector(".sp-zap"))
            self.assertEqual(p.erros, [])
        finally:
            p.fechar()

    def test_prospect_tem_a_faro(self):
        p = Pagina()
        try:
            pg = p.abrir("/", 2000)
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
            pg = p.abrir("/marketing.html", 1500)
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
            pg = p.abrir("/marketing.html", 1500)
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
        for url in ("/marketing.html", "/"):
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
            pg = p.abrir("/", 1500)
            pg.click("[data-criar]"); pg.wait_for_timeout(400)
            self.assertIn("ainda não está aberto", pg.inner_text(".ct-janela"))
        finally:
            p.fechar()

    def test_cadastro_guarda_dados_e_pede_confirmacao(self):
        PLANOS_PUB.append({"chave": "inicial", "nome": "Inicial", "descricao": "Prospect", "preco_centavos": 9700, "recursos": ["prospect"], "dias_teste": 3})
        p = Pagina(logado=False)
        try:
            pg = p.abrir("/marketing.html", 1500)
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
        for url in ("/marketing.html", "/"):
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
            pg = p.abrir("/marketing.html", 1500)
            self.assertIsNone(pg.query_selector(".ct-vitrine"))
        finally:
            p.fechar()

    def test_master_abre_equipe_e_convida(self):
        p = Pagina(master=True)
        try:
            pg = p.abrir("/marketing.html", 1500)
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
            pg = p.abrir("/marketing.html", 1500)
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
            pg = p.abrir("/marketing.html", 1500)
            self.assertTrue(pg.is_visible('[data-sec="equipe"]'), "o painel abre normalmente")
            self.assertEqual([e for e in p.erros if "console" not in e], [])
        finally:
            p.fechar()


class ConviteSemEmail(unittest.TestCase):
    """O NEXO não manda e-mail de convite: o dono envia pelo WhatsApp ou e-mail dele, e o link abre a conta de convidado."""

    def test_convite_pendente_tem_whatsapp_email_e_copiar(self):
        p = Pagina(master=True)
        try:
            pg = p.abrir("/marketing.html", 1500)
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
            pg = p.abrir("/?convite=ana%40cliente.com", 1800)
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
            pg = p.abrir("/marketing.html", 1500)
            pg.click("[data-criar]"); pg.wait_for_timeout(400)
            pg.click(".ct-janela [data-convidado]"); pg.wait_for_timeout(300)
            self.assertIn("Criar sua conta", pg.inner_text(".ct-janela"))
        finally:
            p.fechar()


class AbaAgenteSimples(unittest.TestCase):
    """Aba Agente em 4 passos com um botão só, que grava apenas o que mudou."""

    def abrir(self, p):
        pg = p.abrir("/marketing.html", 1500)
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


class MarketingAuditoria(unittest.TestCase):
    """Auditoria do Marketing (21/11/2026): estados claros, marca, motivo da recusa, histórico e redes."""

    def tearDown(self):
        CONTEUDOS.clear(); HISTORICO.clear(); INTEGRACOES.clear()

    def test_cartao_mostra_marca_e_estado_claro(self):
        base = {"formato": "carrossel", "origem": "agente", "midias": [], "legenda": "L"}
        CONTEUDOS.extend([{**base, "id": "a", "pauta": "Peça prospect", "status": "revisar", "marca": "prospect", "agendado_para": "2026-12-20T21:00:00Z"},
                          {**base, "id": "b", "pauta": "Peça que falhou", "status": "erro", "marca": "varzea", "agendado_para": "2026-12-21T21:00:00Z",
                           "motivo": "Meta 400 (código 9007)"}])
        p = Pagina()
        try:
            pg = p.abrir("/marketing.html", 1500)
            pg.click('.menu [data-aba="aprovar"]'); pg.wait_for_timeout(300)
            a = pg.inner_text('article[data-id="a"]'); b = pg.inner_text('article[data-id="b"]')
            self.assertIn("NEXO Prospect", a); self.assertIn("aguardando aprovação", a)
            self.assertIn("NEXO VÁRZEA", b); self.assertIn("falhou", b); self.assertIn("9007", b)
            self.assertIn("1", pg.inner_text('[data-vista="historico"]'), "a aba mostra quantas falharam")
            self.assertEqual(p.erros, [])
        finally:
            p.fechar()

    def test_recusar_pede_o_motivo_com_um_clique(self):
        CONTEUDOS.append({"id": "a", "pauta": "Dor: o juiz pago do bolso", "formato": "carrossel", "origem": "agente", "midias": [],
                          "status": "revisar", "agendado_para": "2026-12-20T21:00:00Z"})
        p = Pagina()
        try:
            pg = p.abrir("/marketing.html", 1500)
            pg.click('.menu [data-aba="aprovar"]'); pg.wait_for_timeout(300)
            pg.click('article[data-id="a"] [data-dec="recusado"]'); pg.wait_for_timeout(200)
            self.assertIn("juiz pago do bolso", pg.inner_text("dialog.mk-dialogo"))
            pg.check('dialog.mk-dialogo input[value="assunto repetido"]')
            pg.fill('dialog.mk-dialogo [name=mkd]', "já falamos do juiz")
            pg.click('dialog.mk-dialogo button[value="ok"]'); pg.wait_for_timeout(400)
            args = [a for n, a in p.args if n == "nexo_decidir_conteudo"][-1]
            self.assertEqual((args["p_decisao"], args["p_obs"]), ("recusado", "assunto repetido: já falamos do juiz"))
            self.assertIsNone(pg.query_selector("dialog.mk-dialogo"))
            self.assertEqual(p.erros, [])
        finally:
            p.fechar()

    def test_voltar_nao_recusa(self):
        CONTEUDOS.append({"id": "a", "pauta": "Peça", "formato": "post", "origem": "agente", "midias": [], "status": "revisar",
                          "agendado_para": "2026-12-20T21:00:00Z"})
        p = Pagina()
        try:
            pg = p.abrir("/marketing.html", 1500)
            pg.click('.menu [data-aba="aprovar"]'); pg.wait_for_timeout(300)
            pg.click('article[data-id="a"] [data-dec="recusado"]'); pg.wait_for_timeout(200)
            pg.click('dialog.mk-dialogo button[value="cancelar"]'); pg.wait_for_timeout(300)
            self.assertNotIn("nexo_decidir_conteudo", p.chamadas)
        finally:
            p.fechar()

    def test_historico_de_recusadas_e_falhas(self):
        HISTORICO.extend([
            {"id": "h1", "pauta": "Story: falhou", "formato": "story", "status": "erro", "marca": "varzea", "motivo": "Meta 400", "tentativas": 3, "atualizado_em": "2026-11-20T21:00:00Z"},
            {"id": "h2", "pauta": "Dor: o juiz", "formato": "carrossel", "status": "cancelado", "marca": "varzea", "motivo": "recusado no painel: assunto repetido", "atualizado_em": "2026-11-19T21:00:00Z"},
            {"id": "h3", "pauta": "<img src=x onerror=alert(1)>", "formato": "post", "status": "cancelado", "motivo": "recusado no painel: ", "atualizado_em": "2026-11-18T21:00:00Z"}])
        p = Pagina()
        try:
            pg = p.abrir("/marketing.html", 1500)
            pg.click('.menu [data-aba="aprovar"]'); pg.wait_for_timeout(300)
            pg.click('[data-sec="aprovar"] [data-vista="historico"]'); pg.wait_for_timeout(500)
            txt = pg.inner_text('[data-sec="aprovar"]')
            self.assertIn("nexo_conteudos_historico", p.chamadas)
            self.assertIn("Motivo: assunto repetido", txt); self.assertIn("3 tentativas", txt); self.assertIn("Sem motivo escrito", txt)
            self.assertEqual(pg.evaluate("document.querySelectorAll('[data-sec=aprovar] img[src=x]').length"), 0, "pauta com HTML não vira imagem")
            self.assertEqual(p.erros, [])
        finally:
            p.fechar()

    def test_inicio_mostra_redes_e_so_o_master_testa(self):
        INTEGRACOES.extend([
            {"tipo": "instagram", "status": "conectado", "conta": "@nexo.rm", "ultimo_teste_em": "2026-11-21T14:28:00Z", "ultimo_teste_ok": True,
             "checagem": {"passos": [{"chave": "app_meta", "ok": True, "detalhe": "token válido no app NEXO Agente (não vence)"}]}},
            {"tipo": "facebook_pagina", "status": "conectado", "conta": "Página", "ultimo_teste_em": "2026-11-21T14:28:00Z", "ultimo_teste_ok": False,
             "ultimo_erro": "a Página não está ligada"},
            {"tipo": "telegram", "status": "desconectado"}])
        for master in (False, True):
            p = Pagina(master=master)
            try:
                pg = p.abrir("/marketing.html", 1500)
                pg.click('.menu [data-aba="inicio"]'); pg.wait_for_timeout(600)
                box = pg.inner_text("[data-mk-redes]")
                self.assertIn("Redes conectadas", box); self.assertIn("@nexo.rm", box); self.assertIn("conectada", box)
                self.assertIn("com erro", box); self.assertIn("token não vence", box); self.assertNotIn("Telegram", box)
                self.assertIn("Última sincronização", box)
                self.assertEqual(pg.query_selector("[data-mk-testar]") is not None, master)
                self.assertEqual(p.erros, [])
            finally:
                p.fechar()

    def test_pedir_peca_com_marca(self):
        p = Pagina()
        try:
            pg = p.abrir("/marketing.html", 1500)
            pg.click('.menu [data-aba="ideias"]'); pg.wait_for_timeout(500)
            pg.fill("#idTexto", "campanha do NEXO Prospect")
            pg.select_option("#idMarca", "prospect")
            pg.click("#idPedir"); pg.wait_for_timeout(500)
            args = [a for n, a in p.args if n == "nexo_marcar_pedido"]
            self.assertEqual(args, [{"p_pedido": "ped-novo", "p_marca": "prospect"}])
            self.assertEqual(p.erros, [])
        finally:
            p.fechar()

    def test_pedir_sem_marca_nao_chama_o_banco_a_mais(self):
        p = Pagina()
        try:
            pg = p.abrir("/marketing.html", 1500)
            pg.click('.menu [data-aba="ideias"]'); pg.wait_for_timeout(500)
            pg.click("#idPedir"); pg.wait_for_timeout(500)
            self.assertIn("nexo_pedir_ideias", p.chamadas)
            self.assertNotIn("nexo_marcar_pedido", p.chamadas)
        finally:
            p.fechar()


class MasterExcluiUsuario(unittest.TestCase):
    """Master: excluir a conta de login (23/11/2026). O banco confere as travas; o painel mostra e pede o e-mail."""

    def setUp(self):
        self.guardado = list(MASTER_USUARIOS)
        MASTER_USUARIOS.clear()
        MASTER_USUARIOS.extend([
            {"id": "t1", "email": "teste@cadastro.com", "nome": None, "ultimo_login": None, "confirmado": False, "master": False, "sport": False,
             "eu": False, "motivo_nao_exclui": None, "empresas": []},
            {"id": "s1", "email": "time@sport.com", "nome": None, "ultimo_login": "2026-11-20T12:00:00Z", "confirmado": True, "master": False, "sport": True,
             "eu": False, "motivo_nao_exclui": "Tem conta no NEXO SPORT: apagar o login levaria o Sport junto.", "empresas": []},
            {"id": "m1", "email": "eu@nexo.com", "nome": None, "ultimo_login": "2026-11-23T12:00:00Z", "confirmado": True, "master": True, "sport": False,
             "eu": True, "motivo_nao_exclui": "É a sua conta.", "empresas": []}])

    def tearDown(self):
        MASTER_USUARIOS.clear(); MASTER_USUARIOS.extend(self.guardado)

    def test_lista_mostra_quem_nao_tem_empresa_e_so_oferece_excluir_a_quem_pode(self):
        p = Pagina(master=True)
        try:
            pg = p.abrir("/marketing.html", 1500)
            pg.click('.menu [data-aba="master"]'); pg.wait_for_timeout(700)
            txt = pg.inner_text(".m-usuarios")
            self.assertIn("teste@cadastro.com", txt); self.assertIn("cadastro que não terminou", txt)
            self.assertIn("NEXO SPORT", txt); self.assertIn("apagar o login levaria o Sport junto", txt)
            self.assertEqual(len(pg.query_selector_all("[data-m-excluir-us]")), 1, "só quem pode ser excluído tem o botão")
            self.assertEqual(p.erros, [])
        finally:
            p.fechar()

    def test_exclui_pedindo_o_email(self):
        p = Pagina(master=True)
        try:
            pg = p.abrir("/marketing.html", 1500)
            pg.click('.menu [data-aba="master"]'); pg.wait_for_timeout(700)
            pg.click('[data-m-excluir-us="t1"]'); pg.wait_for_timeout(300)
            self.assertIn("Não tem como desfazer", pg.inner_text(".m-janela"))
            pg.fill(".m-janela [name=confirmacao]", "outro@email.com")
            pg.click(".m-janela [type=submit]"); pg.wait_for_timeout(400)
            self.assertNotIn("nexo_master_excluir_usuario", p.chamadas, "e-mail errado não chega ao banco")
            pg.fill(".m-janela [name=confirmacao]", "TESTE@cadastro.com")
            pg.click(".m-janela [type=submit]"); pg.wait_for_timeout(600)
            args = [a for n, a in p.args if n == "nexo_master_excluir_usuario"][-1]
            self.assertEqual(args, {"p_user": "t1", "p_confirmacao": "TESTE@cadastro.com"})
            self.assertEqual(p.erros, [])
        finally:
            p.fechar()


class VendasEquipeDeOncas(unittest.TestCase):
    """Vendas: faixa "Quem trabalha aqui" com as onças de cada aba, só com o que a tela já tem (23/11/2026)."""

    def test_cada_aba_mostra_as_oncas_certas(self):
        esperado = {"inicio": ("Faro", "Lupa"), "crm": ("Faro", "Lupa"), "tarefas": ("Faro",), "campanhas": ("Faro",)}
        p = Pagina()
        try:
            for rota, nomes in esperado.items():
                pg = p.abrir(f"/#/{rota}", 1500)
                faixa = pg.inner_text(".vq")
                self.assertIn("quem trabalha aqui", faixa.lower(), rota)
                for n in nomes:
                    self.assertIn(n, faixa, f"{rota}: {n}")
                self.assertEqual(len(pg.query_selector_all(".vq .vq-onca")), len(nomes), rota)
            self.assertEqual(p.erros, [])
        finally:
            p.fechar()

    def test_fala_usa_os_dados_da_tela_sem_inventar(self):
        p = Pagina()
        try:
            pg = p.abrir("/#/crm", 1500)
            faixa = pg.inner_text(".vq")
            self.assertIn("Achei 1 empresa", faixa)          # EMPRESAS_P tem 1 empresa com contato
            self.assertIn("1 tem contato público", faixa)
            self.assertIn("1 está com nota 70 ou mais", faixa)   # pontuacao 80
            self.assertEqual(p.erros, [])
        finally:
            p.fechar()

    def test_faixa_continua_depois_de_trocar_kanban_e_tabela(self):
        p = Pagina()
        try:
            pg = p.abrir("/#/crm", 1500)
            pg.click('[data-v="tabela"]'); pg.wait_for_timeout(400)
            self.assertEqual(len(pg.query_selector_all(".vq")), 1)
            pg.click('[data-v="kanban"]'); pg.wait_for_timeout(400)
            self.assertEqual(len(pg.query_selector_all(".vq")), 1, "uma faixa só, sem duplicar")
            self.assertEqual(p.erros, [])
        finally:
            p.fechar()

    def test_ajuda_nao_tem_faixa(self):
        p = Pagina()
        try:
            pg = p.abrir("/#/ajuda", 1500)
            self.assertIsNone(pg.query_selector(".vq"))
        finally:
            p.fechar()


class ProdutosSeparados(unittest.TestCase):
    """Marketing e Prospect são produtos separados (23/11/2026): cada um com o seu nome e sem o seletor um do outro; o login é um só."""

    def test_marketing_tem_nome_proprio_e_so_um_atalho_para_o_prospect(self):
        p = Pagina()
        try:
            pg = p.abrir("/marketing.html", 1500)
            self.assertIn("NEXO Marketing", pg.inner_text(".areas.produto"))
            self.assertEqual(len(pg.query_selector_all(".areas a.pro")), 0, "não existe mais a aba Vendas dentro do Marketing")
            self.assertNotIn("Vendas", pg.inner_text(".areas"))
            self.assertIsNone(pg.query_selector("#irOutroProduto"), "sem ligação com o Prospect (25/11/2026)")
            self.assertIn("marketing", pg.inner_text("#btnMarca").lower(), "o nome ao lado do logo é o do produto")
            pg.click('.menu [data-aba="inicio"]'); pg.wait_for_timeout(500)
            self.assertNotIn("Leads em Clientes", pg.inner_text('[data-sec="inicio"]'), "leads são do Prospect")
            self.assertEqual(p.erros, [])
        finally:
            p.fechar()

    def test_prospect_tem_nome_proprio_e_nenhum_atalho_para_o_marketing(self):
        p = Pagina()
        try:
            pg = p.abrir("/#/inicio", 1500)
            self.assertIn("NEXO Prospect", pg.inner_text(".side .areas.produto"))
            self.assertNotIn("Vendas", pg.inner_text(".side .areas"))
            self.assertNotIn("Marketing", pg.inner_text(".side .areas"))
            self.assertIsNone(pg.query_selector("[data-outro-produto]"), "independente do Marketing (25/11/2026), mesmo para quem tem a Onça")
            self.assertEqual(p.erros, [])
        finally:
            p.fechar()
        p = Pagina(com_onca=False)
        try:
            pg = p.abrir("/#/inicio", 1500)
            self.assertIsNone(pg.query_selector("[data-outro-produto]"), "sem o Marketing não aparece atalho nenhum")
        finally:
            p.fechar()

    def test_kanban_do_prospect_tem_a_etapa_lead_quente(self):
        EMPRESAS_P.append({"id": "q1", "nome": "Clínica Quente", "status": "quente", "pontuacao": 90, "cidade": "Curitiba", "estado": "PR", "pais": "BR",
                           "segmento": "clínica", "whatsapp": "5541999990001", "campanhas": [{"id": "c1", "nome": "Sites", "prioridade": "alta"}]})
        p = Pagina()
        try:
            pg = p.abrir("/#/crm", 1600)
            col = pg.query_selector('section[data-col="quente"]')
            self.assertIsNotNone(col, "existe a coluna Lead quente")
            self.assertIn("Lead quente", col.inner_text())
            self.assertIn("Clínica Quente", col.inner_text())
            ordem = pg.eval_on_selector_all(".kanban section[data-col]", "xs => xs.map(x => x.dataset.col)")
            self.assertEqual(ordem.index("quente"), ordem.index("respondeu") + 1, "entre Respondeu e Proposta")
            self.assertEqual(ordem.index("proposta"), ordem.index("quente") + 1)
            self.assertEqual(p.erros, [])
        finally:
            p.fechar(); EMPRESAS_P[:] = [e for e in EMPRESAS_P if e["id"] != "q1"]


class EnderecosSeparados(unittest.TestCase):
    """nexoprospect.com é o NEXO Prospect e nexoprospect.com/marketing é o NEXO Marketing (23/11/2026)."""

    def test_endereco_antigo_do_prospect_leva_para_a_raiz_e_guarda_a_rota(self):
        p = Pagina()
        try:
            p.page.goto(BASE + "/prospect/#/crm")
            p.page.wait_for_url(re.compile(r"/#/crm$"), timeout=5000)
            self.assertNotIn("/prospect", p.page.url)
        finally:
            p.fechar()

    def test_volta_do_login_da_meta_e_do_google_vai_para_o_marketing(self):
        p = Pagina()
        try:
            p.page.goto(BASE + "/?conexao=ok&servico=google#integracoes")
            p.page.wait_for_url(re.compile(r"/marketing\?conexao=ok&servico=google#integracoes$"), timeout=5000)
        finally:
            p.fechar()

    def test_so_a_raiz_aparece_no_google(self):
        raiz = (RAIZ / "index.html").read_text(encoding="utf-8"); mk = (RAIZ / "marketing.html").read_text(encoding="utf-8")
        self.assertIn('content="index,follow"', raiz)
        self.assertIn('rel="canonical" href="https://nexoprospect.com/"', raiz)
        self.assertIn('content="noindex,nofollow"', mk)
        self.assertNotIn("canonical", mk)
        self.assertNotIn("application/ld+json", mk)
        self.assertIn("Disallow: /marketing", (RAIZ / "robots.txt").read_text(encoding="utf-8"))


class WhatsappSdrConfig(unittest.TestCase):
    """Tela WhatsApp e SDR (F3, 24/11/2026): só configura; segredo nunca volta ao navegador; ligar só com tudo pronto."""

    PLANO = {"tem_assinatura": True, "acesso": "total", "status": "ativa", "recursos": ["prospect", "prospect_sdr_whatsapp"], "limites": {}}

    def setUp(self):
        SDR_CFG.clear(); SDR_CFG.update(sdr_cfg_inicial())
        SITUACAO.clear(); SITUACAO["emp-p"] = dict(self.PLANO)

    def tearDown(self):
        SITUACAO.clear(); SDR_CFG.clear()

    def test_menu_so_aparece_para_quem_tem_o_recurso(self):
        SITUACAO["emp-p"] = {**self.PLANO, "recursos": ["prospect"]}
        p = Pagina()
        try:
            pg = p.abrir("/#/inicio", 1500)
            self.assertNotIn("WhatsApp e SDR", pg.inner_text("#nav"))
        finally:
            p.fechar()
        SITUACAO["emp-p"] = dict(self.PLANO)
        p = Pagina()
        try:
            pg = p.abrir("/#/inicio", 1500)
            self.assertIn("WhatsApp e SDR", pg.inner_text("#nav"))
        finally:
            p.fechar()

    def test_tela_diz_o_que_falta_e_o_campo_do_token_e_so_de_escrita(self):
        p = Pagina()
        try:
            pg = p.abrir("/#/whatsapp", 1800)
            txt = pg.inner_text("#main")
            self.assertIn("WhatsApp e SDR", txt); self.assertIn("Desligado", txt)
            self.assertIn("Esta tela só configura", txt)
            self.assertIn("Falta para ligar", txt); self.assertIn("Guardar o token do WhatsApp", txt)
            self.assertEqual(pg.get_attribute("#sdrTokWa", "type"), "password")
            self.assertTrue(pg.is_disabled('#sdrLlm option[value="openai"]') or pg.get_attribute('#sdrLlm option[value="openai"]', "disabled") is not None, "só a Anthropic funciona por enquanto")
            self.assertEqual(pg.get_attribute("#sdrChaveIa", "type"), "password")
            self.assertTrue(pg.is_disabled("#sdrLigar"), "não liga sem tudo pronto")
            self.assertIn("/functions/v1/nexo-sdr-webhook", pg.input_value("#sdrUrl"))
            self.assertEqual(p.erros, [])
        finally:
            p.fechar()

    def test_guardar_token_vai_para_o_banco_e_o_segredo_nao_fica_na_tela(self):
        p = Pagina()
        try:
            pg = p.abrir("/#/whatsapp", 1800)
            pg.fill("#sdrTokWa", "EAAG-segredo-9999"); pg.click('[data-sdr-cred="sdrTokWa"]'); pg.wait_for_timeout(700)
            args = [a for n, a in p.args if n == "nexo_sdr_salvar_credencial"][-1]
            self.assertEqual(args["p_tipo"], "whatsapp_business"); self.assertEqual(args["p_segredo"], "EAAG-segredo-9999")
            self.assertEqual(pg.input_value("#sdrTokWa"), "", "o campo é limpo")
            self.assertNotIn("EAAG-segredo-9999", pg.content(), "o segredo não está em lugar nenhum da página")
            self.assertIn("••••9999", pg.inner_text("#main"), "só o final aparece")
            self.assertNotIn("Guardar o token do WhatsApp", pg.inner_text("#main"), "a pendência some")
            pg.fill("#sdrChaveIa", "sk-ant-chave-1234"); pg.click('[data-sdr-cred="sdrChaveIa"]'); pg.wait_for_timeout(700)
            self.assertEqual([a for n, a in p.args if n == "nexo_sdr_salvar_credencial"][-1]["p_tipo"], "llm")
            self.assertEqual(p.erros, [])
        finally:
            p.fechar()

    def test_token_do_webhook_aparece_so_uma_vez(self):
        p = Pagina()
        try:
            pg = p.abrir("/#/whatsapp", 1800)
            pg.click("#sdrGerar"); pg.wait_for_timeout(600)
            self.assertEqual(pg.input_value("#sdrTokenValor"), "ab" * 32)
            self.assertIn("?t=" + "ab" * 32, pg.input_value("#sdrUrlCompleta"), "o endereço completo leva o token")
            self.assertTrue(pg.input_value("#sdrUrlCompleta").startswith("https://"))
            self.assertIn("não aparecem de novo", pg.inner_text("#sdrTokenNovo"))
            pg = p.abrir("/#/whatsapp", 1800); pg.reload(); pg.wait_for_timeout(1500)
            self.assertNotIn("ab" * 32, pg.content(), "depois de recarregar o token não volta")
            self.assertIn("Já existe um token", pg.inner_text("#main"))
        finally:
            p.fechar()

    def test_modo_autonomo_e_ia_puxar_conversa_exigem_confirmacao(self):
        p = Pagina()
        try:
            pg = p.abrir("/#/whatsapp", 1800)
            pg.select_option("#sdrModo", "autonomo")
            self.assertTrue(pg.is_visible("#sdrAceiteAutBox"))
            pg.click("#sdrSalvar"); pg.wait_for_timeout(400)
            self.assertNotIn("nexo_sdr_salvar", p.chamadas, "sem a confirmação nada vai ao banco")
            self.assertIn("confirmação", pg.inner_text("#toast"))
            pg.check("#sdrAceiteAut"); pg.click("#sdrSalvar"); pg.wait_for_timeout(600)
            cfg = [a for n, a in p.args if n == "nexo_sdr_salvar"][-1]["p_cfg"]
            self.assertEqual(cfg["modo"], "autonomo"); self.assertTrue(cfg["aceite_autonomo"])
            pg.uncheck("#sdrSoResp")
            self.assertTrue(pg.is_visible("#sdrAceiteAbBox"))
            n0 = len([1 for n, a in p.args if n == "nexo_sdr_salvar"])
            pg.click("#sdrSalvar"); pg.wait_for_timeout(400)
            self.assertEqual(len([1 for n, a in p.args if n == "nexo_sdr_salvar"]), n0, "puxar conversa sem a confirmação dos contatos não salva")
        finally:
            p.fechar()

    def test_ligar_so_quando_tudo_esta_pronto_e_manda_ativo(self):
        SDR_CFG.update(sdr_cfg_pronto())
        p = Pagina()
        try:
            pg = p.abrir("/#/whatsapp", 1800)
            self.assertIn("Tudo pronto para ligar", pg.inner_text("#main"))
            self.assertFalse(pg.is_disabled("#sdrLigar"))
            pg.click("#sdrLigar"); pg.wait_for_timeout(700)
            cfg = [a for n, a in p.args if n == "nexo_sdr_salvar"][-1]["p_cfg"]
            self.assertTrue(cfg["ativo"]); self.assertEqual(cfg["modo"], "sombra"); self.assertTrue(cfg["so_responde_quem_escreveu"])
            self.assertIn("Ligado · modo sombra", pg.inner_text("#main"))
            pg.click("#sdrDesligar"); pg.wait_for_timeout(700)
            self.assertFalse([a for n, a in p.args if n == "nexo_sdr_salvar"][-1]["p_cfg"]["ativo"])
            self.assertEqual(p.erros, [])
        finally:
            p.fechar()

    def test_leitor_ve_mas_nao_edita(self):
        global contexto
        original = contexto
        contexto = lambda com_onca=True, master=False: {**original(com_onca, master), "empresas": [{**e, "papel": "leitor"} for e in original(com_onca, master)["empresas"]]}
        p = Pagina()
        try:
            pg = p.abrir("/#/whatsapp", 1800)
            self.assertIn("Só o dono ou o administrador", pg.inner_text("#main"))
            for sel in ("#sdrTokWa", "#sdrPersona", "#sdrSalvar", "#sdrGerar", "#sdrModo"):
                self.assertTrue(pg.is_disabled(sel), sel)
        finally:
            p.fechar(); contexto = original


class ConversasSdr(unittest.TestCase):
    """Aba Conversas (F5, 24/11/2026): quem espera uma pessoa, resumo da IA, sugestões não enviadas, assumir e devolver."""

    PLANO = {"tem_assinatura": True, "acesso": "total", "status": "ativa", "recursos": ["prospect", "prospect_sdr_whatsapp"], "limites": {}}

    def setUp(self):
        SITUACAO.clear(); SITUACAO["emp-p"] = dict(self.PLANO)
        CONVERSAS_SDR[:] = [
            conv_sdr(1, "Clínica Alfa", "atendimento_humano", "quente", True, lead_id="q1", resumo="Quer proposta de agenda online."),
            conv_sdr(2, "Clínica Beta", "ia_ativa", "morno"),
            conv_sdr(3, "Clínica Gama", "encerrada", "frio")]
        MENSAGENS_SDR.clear()
        MENSAGENS_SDR["cv1"] = [
            {"id": 1, "direcao": "entrada", "autor": "lead", "texto": "Quanto custa a agenda online?", "status": None, "criado_em": "2026-11-24T11:50:00Z"},
            {"id": 2, "direcao": "saida", "autor": "ia", "texto": "Vou chamar alguém da equipe para te passar os valores.", "status": "sugerida", "criado_em": "2026-11-24T11:51:00Z"}]

    def tearDown(self):
        SITUACAO.clear(); CONVERSAS_SDR.clear(); MENSAGENS_SDR.clear()

    def test_aba_so_aparece_com_o_recurso_e_mostra_o_numero_de_quem_espera(self):
        SITUACAO["emp-p"] = {**self.PLANO, "recursos": ["prospect"]}
        p = Pagina()
        try:
            pg = p.abrir("/#/inicio", 1500)
            self.assertNotIn("Conversas", pg.inner_text("#nav"))
        finally:
            p.fechar()
        SITUACAO["emp-p"] = dict(self.PLANO)
        p = Pagina()
        try:
            pg = p.abrir("/#/inicio", 1800)
            self.assertIn("Conversas", pg.inner_text("#nav"))
            self.assertEqual(pg.inner_text('#nav a[href="#/conversas"] .cnt'), "1", "um lead quente aguardando")
            self.assertTrue(pg.title().startswith("(1) "), "o título da aba avisa")
        finally:
            p.fechar()

    def test_lista_mostra_primeiro_quem_aguarda_e_abre_o_resumo_e_a_transcricao(self):
        p = Pagina()
        try:
            pg = p.abrir("/#/conversas", 1800)
            txt = pg.inner_text("#main")
            self.assertIn("Aguardando você", txt); self.assertIn("Clínica Alfa", txt)
            self.assertNotIn("Clínica Beta", pg.inner_text(".cv-lista"), "a aba inicial é só de quem aguarda")
            pg.click('[data-cv-aba="todas"]'); pg.wait_for_timeout(200)
            nomes = pg.eval_on_selector_all(".cv-item b", "xs => xs.map(x => x.textContent)")
            self.assertEqual(nomes[0], "Clínica Alfa"); self.assertEqual(len(nomes), 3)
            pg.click('[data-cv-abrir="cv1"]'); pg.wait_for_timeout(500)
            det = pg.inner_text("#cvDet")
            self.assertIn("Resumo da IA", det); self.assertIn("Quer proposta de agenda online.", det); self.assertIn("Agenda só no WhatsApp", det)
            self.assertIn("Quanto custa a agenda online?", det)
            self.assertIn("Sugestão da IA, não enviada", det)
            self.assertIn("+55 41 99999-0001", det)
            self.assertEqual(p.erros, [])
        finally:
            p.fechar()

    def test_assumir_pausa_a_ia_abre_o_whatsapp_e_apaga_o_alerta(self):
        p = Pagina()
        try:
            pg = p.abrir("/#/conversas", 1800)
            pg.evaluate("window.__abertas = []; window.open = (u) => { window.__abertas.push(u); return null; }")
            pg.click('[data-cv-abrir="cv1"]'); pg.wait_for_timeout(500)
            pg.click("#cvAssumir"); pg.wait_for_timeout(700)
            self.assertEqual([u for u in pg.evaluate("window.__abertas") if u], ["https://wa.me/5541999990001"])   # (o Playwright chama window.open uma vez com null ao avaliar)
            self.assertIn("nexo_sdr_assumir", p.chamadas)
            self.assertEqual(len(pg.query_selector_all('#nav a[href="#/conversas"] .cnt')), 0, "o número some da aba")
            self.assertFalse(pg.title().startswith("("))
        finally:
            p.fechar()

    def test_devolver_para_a_ia_pede_confirmacao_e_chama_o_banco(self):
        CONVERSAS_SDR[0]["nao_lida_humano"] = False
        p = Pagina()
        try:
            pg = p.abrir("/#/conversas", 1800)
            pg.click('[data-cv-aba="voce"]'); pg.wait_for_timeout(200)
            pg.click('[data-cv-abrir="cv1"]'); pg.wait_for_timeout(500)
            pg.once("dialog", lambda d: d.dismiss())
            pg.click("#cvDevolver"); pg.wait_for_timeout(400)
            self.assertNotIn("nexo_sdr_devolver_ia", p.chamadas, "cancelar não chama o banco")
            pg.once("dialog", lambda d: d.accept())
            pg.click("#cvDevolver"); pg.wait_for_timeout(700)
            args = [a for n, a in p.args if n == "nexo_sdr_devolver_ia"][-1]
            self.assertEqual(args["p_conversa"], "cv1")
            self.assertEqual(CONVERSAS_SDR[0]["estado_ia"], "ia_ativa")
        finally:
            p.fechar()

    def test_copiar_a_sugestao_e_o_selo_no_card_do_kanban(self):
        EMPRESAS_P.append({"id": "q1", "nome": "Clínica Alfa", "status": "quente", "pontuacao": 90, "cidade": "Curitiba", "estado": "PR", "pais": "BR",
                           "segmento": "clínica", "whatsapp": "5541999990001", "campanhas": [{"id": "c1", "nome": "Sites", "prioridade": "alta"}]})
        p = Pagina()
        try:
            pg = p.abrir("/#/crm", 2000)
            card = pg.query_selector('.kc[data-id="q1"]')
            self.assertIsNotNone(card); self.assertIn("Aguardando você", card.inner_text())
            self.assertIn("aguardando", card.get_attribute("class"))
            pg = p.abrir("/#/conversas", 1800)
            pg.click('[data-cv-abrir="cv1"]'); pg.wait_for_timeout(500)
            self.assertEqual(len(pg.query_selector_all("[data-cv-copiar]")), 1)
            self.assertEqual(p.erros, [])
        finally:
            p.fechar(); EMPRESAS_P[:] = [e for e in EMPRESAS_P if e["id"] != "q1"]

    def test_leitor_ve_mas_nao_assume_nem_devolve(self):
        global contexto
        original = contexto
        contexto = lambda com_onca=True, master=False: {**original(com_onca, master), "empresas": [{**e, "papel": "leitor"} for e in original(com_onca, master)["empresas"]]}
        p = Pagina()
        try:
            pg = p.abrir("/#/conversas", 1800)
            pg.click('[data-cv-abrir="cv1"]'); pg.wait_for_timeout(500)
            self.assertIn("Resumo da IA", pg.inner_text("#cvDet"))
            self.assertEqual(len(pg.query_selector_all("#cvAssumir, #cvDevolver")), 0)
        finally:
            p.fechar(); contexto = original

    def test_sem_conversas_explica_o_que_vai_aparecer(self):
        CONVERSAS_SDR.clear()
        p = Pagina()
        try:
            pg = p.abrir("/#/conversas", 1800)
            self.assertIn("Ainda não chegou nenhuma conversa", pg.inner_text("#main"))
            self.assertEqual(p.erros, [])
        finally:
            p.fechar()


class ContatoNaFicha(unittest.TestCase):
    """Salvar à mão o WhatsApp (e o Instagram) que o Ricardo achou no perfil, no site ou no Google (25/11/2026)."""

    def setUp(self):
        FICHA_EXTRA.clear(); FALHAR.pop("contato", None)
        FICHA_EXTRA.update({"whatsapp": None, "instagram": None})

    def tearDown(self):
        FICHA_EXTRA.clear(); FALHAR.pop("contato", None)

    def abrir_ficha(self, p):
        pg = p.abrir("/#/crm", 1800)
        pg.click('.kc[data-id="e1"]')
        pg.wait_for_timeout(700)
        return pg

    def test_botao_aparece_so_quando_falta_contato(self):
        p = Pagina()
        try:
            pg = self.abrir_ficha(p)
            self.assertIn("Salvar WhatsApp", pg.inner_text("[data-add-contato]"))
            self.assertIn("Sem contato comercial público", pg.inner_text(".next"))
            FICHA_EXTRA.update({"whatsapp": "5541999990000"})
            pg.evaluate("abrirFicha('e1')"); pg.wait_for_timeout(700)
            self.assertIn("Adicionar Instagram", pg.inner_text("[data-add-contato]"))
            FICHA_EXTRA.update({"instagram": "clinicateste"})
            pg.evaluate("abrirFicha('e1')"); pg.wait_for_timeout(700)
            self.assertIsNone(pg.query_selector("[data-add-contato]"), "com os dois contatos o botão some")
            self.assertEqual(p.erros, [])
        finally:
            p.fechar()

    def test_salva_whatsapp_e_instagram_juntos_e_a_ficha_atualiza(self):
        p = Pagina()
        try:
            pg = self.abrir_ficha(p)
            pg.click("[data-add-contato]")
            self.assertTrue(pg.is_visible("#cWa") and pg.is_visible("#cIg"))
            pg.fill("#cWa", "https://wa.me/5545999123456?text=Oi")
            pg.fill("#cIg", "https://www.instagram.com/ClinicaTeste/")
            pg.click("#mSalvar")
            pg.wait_for_timeout(900)
            args = [a for n, a in p.args if n == "nexo_prospect_contato"][-1]
            self.assertEqual(args, {"p_empresa": "e1", "p_whatsapp": "https://wa.me/5545999123456?text=Oi", "p_instagram": "https://www.instagram.com/ClinicaTeste/"})
            self.assertIn("Contato salvo", pg.inner_text("#toast"))
            self.assertFalse(pg.eval_on_selector("#modal", "m => m.classList.contains('on')"), "a janelinha fecha")
            self.assertIsNotNone(pg.query_selector('[data-copia-num="5545999123456"]'), "a ficha já mostra o botão do número salvo")
            self.assertIn("@clinicateste", pg.inner_text(".next"))
            self.assertIsNone(pg.query_selector("[data-add-contato]"))
            self.assertEqual(p.erros, [])
        finally:
            p.fechar()

    def test_so_pede_o_que_falta_e_manda_nulo_no_resto(self):
        FICHA_EXTRA.update({"whatsapp": "5541999990000"})
        p = Pagina()
        try:
            pg = self.abrir_ficha(p)
            pg.click("[data-add-contato]")
            self.assertIsNone(pg.query_selector("#cWa"), "o WhatsApp que já existe não é pedido de novo")
            pg.fill("#cIg", "@clinicateste"); pg.press("#cIg", "Enter")
            pg.wait_for_timeout(900)
            args = [a for n, a in p.args if n == "nexo_prospect_contato"][-1]
            self.assertEqual(args, {"p_empresa": "e1", "p_whatsapp": None, "p_instagram": "@clinicateste"})
            self.assertEqual(p.erros, [])
        finally:
            p.fechar()

    def test_vazio_nao_chama_o_banco(self):
        p = Pagina()
        try:
            pg = self.abrir_ficha(p)
            pg.click("[data-add-contato]"); pg.click("#mSalvar"); pg.wait_for_timeout(300)
            self.assertIn("Escreva o WhatsApp ou o Instagram", pg.inner_text("#toast"))
            self.assertNotIn("nexo_prospect_contato", p.chamadas)
            self.assertTrue(pg.is_visible("#cWa"), "a janelinha continua aberta")
        finally:
            p.fechar()

    def test_recusa_do_banco_aparece_e_a_janelinha_fica_aberta(self):
        FALHAR["contato"] = "contato_invalido: esse WhatsApp já é de Padaria Alfa"
        p = Pagina()
        try:
            pg = self.abrir_ficha(p)
            pg.click("[data-add-contato]"); pg.fill("#cWa", "45999123456"); pg.click("#mSalvar"); pg.wait_for_timeout(900)
            self.assertIn("Confira o contato.", pg.inner_text("#toast"))
            self.assertIn("já é de Padaria Alfa", pg.inner_text("#toast"))
            self.assertTrue(pg.is_visible("#cWa"))
            self.assertFalse(pg.is_disabled("#mSalvar"), "dá para corrigir e tentar de novo")
        finally:
            p.fechar()

    def test_leitor_nao_ve_o_botao(self):
        global contexto
        original = contexto
        contexto = lambda com_onca=True, master=False: {**original(com_onca, master), "empresas": [{**e, "papel": "leitor"} for e in original(com_onca, master)["empresas"]]}
        p = Pagina()
        try:
            pg = self.abrir_ficha(p)
            self.assertIsNone(pg.query_selector("[data-add-contato]"))
        finally:
            p.fechar(); contexto = original



class ProspectIndependente(unittest.TestCase):
    """25/11/2026, Ricardo: o Prospect é um app independente, sem ligação com o Marketing, e tem o plano e o pagamento dele."""

    def tearDown(self):
        SITUACAO.clear(); MEU_PLANO.clear()

    def test_meu_plano_e_uma_aba_do_prospect(self):
        MEU_PLANO.update({"situacao": {"tem_assinatura": True, "plano": "profissional", "plano_nome": "Profissional", "status": "ativa",
                                       "periodo_ate": "2030-01-10T00:00:00Z", "preco_centavos": 40000},
                          "planos": [{"chave": "inicial", "nome": "Inicial", "preco_centavos": 20000, "descricao": "Prospect e pesquisa com IA"},
                                     {"chave": "profissional", "nome": "Profissional", "preco_centavos": 40000, "descricao": "Mais WhatsApp e SDR"}],
                          "pode_pedir": True, "pagamento_ligado": False})
        p = Pagina()
        try:
            pg = p.abrir("/#/plano", 1800)
            texto = pg.inner_text("#main")
            self.assertIn("Meu plano", texto)
            self.assertIn("Profissional", texto)
            self.assertIn("Seu plano atual", texto)
            self.assertNotIn("Marketing", texto)
            self.assertIn("nexo_meu_plano", p.chamadas)
            self.assertEqual(p.erros, [])
        finally:
            p.fechar()

    def test_meu_plano_pede_a_troca_do_plano(self):
        MEU_PLANO.update({"situacao": {"tem_assinatura": True, "plano": "inicial", "plano_nome": "Inicial", "status": "ativa", "preco_centavos": 20000},
                          "planos": [{"chave": "inicial", "nome": "Inicial", "preco_centavos": 20000},
                                     {"chave": "profissional", "nome": "Profissional", "preco_centavos": 40000}],
                          "pode_pedir": True, "pagamento_ligado": False})
        p = Pagina()
        try:
            pg = p.abrir("/#/plano", 1800)
            pg.on("dialog", lambda d: d.accept())
            pg.click('[data-mp-plano="profissional"]'); pg.wait_for_timeout(600)
            pedido = [a for n, a in p.args if n == "nexo_pedir_plano"][-1]
            self.assertEqual(pedido["p_plano"], "profissional")
            self.assertEqual(p.erros, [])
        finally:
            p.fechar()

    def test_volta_do_pagamento_cai_no_prospect_e_abre_meu_plano(self):
        """A função de pagamento devolve o cliente para nexoprospect.com/?pagamento=volta: a raiz agora é o Prospect."""
        MEU_PLANO.update({"situacao": {"tem_assinatura": True, "plano": "inicial", "plano_nome": "Inicial", "status": "ativa"},
                          "planos": [{"chave": "inicial", "nome": "Inicial", "preco_centavos": 20000}], "pode_pedir": True, "pagamento_ligado": True})
        p = Pagina()
        chamadas = []
        p.page.on("request", lambda r: "/functions/v1/nexo-pagamento" in r.url and chamadas.append(r.post_data))
        try:
            pg = p.abrir("/?pagamento=volta&order_nsu=ped1&transaction_nsu=tr1&slug=sl1", 1800)
            self.assertEqual(len(chamadas), 1, "o Prospect confere o pagamento na volta")
            self.assertEqual(json.loads(chamadas[0])["acao"], "conferir")
            self.assertEqual(pg.evaluate("location.hash"), "#/plano")
        finally:
            p.fechar()

    def test_recurso_fora_do_plano_leva_para_o_meu_plano_do_prospect(self):
        SITUACAO["emp-p"] = {"tem_assinatura": True, "acesso": "total", "status": "ativa", "plano": "inicial", "plano_nome": "Inicial",
                             "recursos": ["prospect_ia"], "limites": {}}   # sem o recurso "prospect": as abas ficam trancadas
        p = Pagina()
        try:
            pg = p.abrir("/#/crm", 1800)
            self.assertEqual(pg.get_attribute("#main .plano-trava a.btn", "href"), "#/plano")
            self.assertIn("plano Inicial", pg.inner_text("#main .plano-trava"))
            self.assertNotIn("Marketing", pg.inner_text("#main .plano-trava"))
            self.assertEqual(p.erros, [])
        finally:
            p.fechar()

    def test_whatsapp_e_sdr_so_aparece_no_plano_que_tem_o_recurso(self):
        SITUACAO["emp-p"] = {"tem_assinatura": True, "acesso": "total", "status": "ativa", "plano": "inicial", "plano_nome": "Inicial",
                             "recursos": ["prospect", "prospect_ia"], "limites": {}}
        p = Pagina()
        try:
            pg = p.abrir("/#/inicio", 1800)
            self.assertNotIn("WhatsApp e SDR", pg.inner_text("#nav"))
            SITUACAO["emp-p"]["recursos"] = ["prospect", "prospect_ia", "prospect_sdr_whatsapp"]
            pg = p.abrir("/?recarrega=1#/inicio", 1800)
            self.assertIn("WhatsApp e SDR", pg.inner_text("#nav"))
        finally:
            p.fechar()

    def test_cadastro_fechado_nao_promete_teste_gratis(self):
        p = Pagina(logado=False)
        try:
            pg = p.abrir("/", 1800)
            self.assertNotIn("grátis", pg.inner_text("[data-criar]").lower())
            self.assertNotIn("Teste grátis", pg.inner_text("body"))
            pg.click("[data-criar]"); pg.wait_for_timeout(400)
            self.assertIn("só por convite", pg.inner_text(".ct-janela"))
            self.assertTrue(pg.is_visible(".ct-janela [data-convidado]"), "quem recebeu convite continua entrando")
        finally:
            p.fechar()

    def test_link_do_varzea_nao_leva_para_o_marketing(self):
        h = (RAIZ / "index.html").read_text(encoding="utf-8")
        self.assertNotIn('href="marketing"', h)
        self.assertNotIn('location.href = "marketing"', h)
        self.assertNotIn("marketing#plano", (RAIZ / "assets/plano.js").read_text(encoding="utf-8"))

    def test_entrada_do_prospect_mostra_o_video_de_apresentacao_e_o_marketing_segue_com_as_cenas(self):
        """24/11/2026, Ricardo: "colocar o vídeo criado aqui no login". Um MP4 só (narração Thales + legendas), que não baixa antes do play."""
        p = Pagina(logado=False)
        try:
            pedidos = []
            p.page.on("request", lambda r: ("prospect-apresentacao.mp4" in r.url or "/assets/explicador/" in r.url and r.url.endswith(".mp3")) and pedidos.append(r.url))
            pg = p.abrir("/", 1800)
            self.assertIn("NEXO Prospect em Ação", pg.inner_text(".exp-topo"))
            self.assertEqual(pg.eval_on_selector_all(".exp video", "v => v.length"), 1)
            self.assertEqual(pg.get_attribute(".exp video", "preload"), "none", "não baixa o vídeo antes do play")
            self.assertTrue(pg.get_attribute(".exp video source", "src").endswith("assets/prospect-apresentacao.mp4"))
            self.assertIn("poster", " ".join(pg.eval_on_selector(".exp video", "v => v.getAttributeNames()")))
            self.assertIsNotNone(pg.query_selector(".exp video[controls]"))
            self.assertIn("dados de exemplo", pg.inner_text(".exp").lower())
            self.assertEqual(pg.eval_on_selector_all(".exp-cap, .exp-cena", "x => x.length"), 0, "o player de cenas saiu da entrada do Prospect")
            texto = pg.inner_text(".exp")
            for fora in ("Pedir peça", "Conteúdo", "Atendimento", "Equipe ao vivo", "Instagram"):
                self.assertNotIn(fora, texto)
            self.assertEqual(pedidos, [], "nada de vídeo nem de áudio é pedido sem o play")
            self.assertEqual(p.erros, [])
            pg = p.abrir("/marketing.html", 1800)
            texto = pg.inner_text(".exp")
            for cena in ("Pedir peça", "Conteúdo", "Atendimento"):
                self.assertIn(cena, texto, "o Marketing continua com o vídeo completo")
            self.assertIn("marketing", pg.inner_text(".exp-topo").lower())
        finally:
            p.fechar()

    def test_arquivos_do_video_de_apresentacao_do_prospect_existem(self):
        v = RAIZ / "assets" / "prospect-apresentacao.mp4"
        self.assertTrue(v.exists() and 1_000_000 < v.stat().st_size < 12_000_000, "MP4 leve (até 12 MB) para a tela de entrada")
        self.assertTrue((RAIZ / "assets" / "prospect-apresentacao-poster.jpg").exists())
        self.assertFalse((RAIZ / "assets" / "explicador" / "prospect").exists(), "as cenas antigas do Prospect saíram")

class LiberadoTudo(unittest.TestCase):
    """24/11/2026, Ricardo: cliente liberado (vitalício ou com data) tem acesso a tudo, menos o Master."""

    def test_vitalicio_marca_liberar_tudo_e_manda_liberado_true(self):
        p = Pagina(master=True)
        try:
            pg = p.abrir("/marketing.html", 1500)
            pg.click('.menu [data-aba="master"]'); pg.wait_for_timeout(600)
            pg.on("dialog", lambda d: d.accept())
            pg.click('[data-m-plano="emp-c"]')
            self.assertFalse(pg.is_checked(".m-janela [name=liberado]"), "teste comum não libera tudo")
            pg.select_option(".m-janela [name=status]", "vitalicia")
            self.assertTrue(pg.is_checked(".m-janela [name=liberado]"), "vitalício marca sozinho")
            pg.click(".m-janela [type=submit]"); pg.wait_for_timeout(600)
            args = [a for n, a in p.args if n == "nexo_master_salvar_assinatura"][-1]
            self.assertTrue(args["p_dados"]["liberado"])
            self.assertEqual(p.erros, [])
        finally:
            p.fechar()

    def test_data_em_pago_ate_marca_e_o_master_pode_desmarcar(self):
        p = Pagina(master=True)
        try:
            pg = p.abrir("/marketing.html", 1500)
            pg.click('.menu [data-aba="master"]'); pg.wait_for_timeout(600)
            pg.click('[data-m-plano="emp-c"]')
            pg.select_option(".m-janela [name=status]", "ativa")
            pg.fill(".m-janela [name=periodo_ate]", "2026-12-18")
            self.assertTrue(pg.is_checked(".m-janela [name=liberado]"), "data em 'Pago até' marca sozinho")
            pg.uncheck(".m-janela [name=liberado]")
            pg.click(".m-janela [type=submit]"); pg.wait_for_timeout(600)
            args = [a for n, a in p.args if n == "nexo_master_salvar_assinatura"][-1]
            self.assertEqual(args["p_dados"]["status"], "ativa")
            self.assertFalse(args["p_dados"]["liberado"], "quem paga e o Master não quer liberar tudo fica no plano")
        finally:
            p.fechar()

    def test_meu_plano_diz_que_esta_liberado(self):
        for situacao, esperado in (({"status": "vitalicia", "liberado": True}, "Todas as funções liberadas"),
                                   ({"status": "ativa", "liberado": True, "periodo_ate": "2027-11-25T02:59:00Z"}, "Liberado até 24/11/2027")):
            MEU_PLANO.clear()
            MEU_PLANO.update({"pode_pedir": True, "pagamento_ligado": False, "planos": PLANOS_CLIENTE,
                              "situacao": {"tem_assinatura": True, "acesso": "total", "plano": "completo", "plano_nome": "Completo", "preco_centavos": 80000, **situacao}})
            p = Pagina()
            try:
                pg = p.abrir("/#/plano", 1800)
                self.assertIn(esperado, pg.inner_text("#main"))
                self.assertEqual(p.erros, [])
            finally:
                p.fechar(); MEU_PLANO.clear()


class PlanosListaFuncoes(unittest.TestCase):
    """24/11/2026 (pedido do Ricardo): cada plano lista o que tem ligado e desligado, embaixo do botão."""

    def setUp(self):
        MEU_PLANO.clear()
        MEU_PLANO.update({"pode_pedir": True, "pagamento_ligado": True, "planos": [
            {"chave": "inicial", "nome": "Inicial", "preco_centavos": 20000, "recursos": ["prospect", "prospect_ia"],
             "limites": {"usuarios": 2, "empresas_mes": 200, "pesquisas_mes": 5, "campanhas_ativas": 2}},
            {"chave": "profissional", "nome": "Profissional", "preco_centavos": 40000, "recursos": ["prospect", "prospect_ia", "prospect_sdr_whatsapp"],
             "limites": {"usuarios": 1, "empresas_mes": 1000}},
            {"chave": "completo", "nome": "Completo", "preco_centavos": 80000, "recursos": ["prospect", "prospect_ia", "prospect_sdr_whatsapp"],
             "limites": {"usuarios": 10, "empresas_mes": 2000, "campanhas_ativas": 15}}],
            "situacao": {"tem_assinatura": True, "acesso": "total", "status": "ativa", "plano": "inicial", "plano_nome": "Inicial", "preco_centavos": 20000}})

    def tearDown(self):
        MEU_PLANO.clear()

    def test_cada_plano_mostra_ligado_e_desligado_e_os_limites_embaixo_do_botao(self):
        p = Pagina()
        try:
            pg = p.abrir("/#/plano", 1800)
            cards = pg.query_selector_all("#main .ct-v-plano")
            self.assertEqual(len(cards), 3)
            inicial, profissional, completo = (c.inner_text() for c in cards)
            self.assertIn("WhatsApp e SDR: não incluído", inicial)
            self.assertIn("Pesquisa com IA: a Faro pesquisa", inicial)
            self.assertIn("Até 2 usuários", inicial); self.assertIn("Até 200 empresas pesquisadas por mês", inicial)
            self.assertIn("WhatsApp e SDR: a IA atende no WhatsApp", profissional)
            self.assertNotIn("não incluído", profissional)
            self.assertIn("Até 1 usuário", profissional, "singular")
            self.assertIn("Pesquisas com IA por mês sem limite", completo, "limite vazio = sem limite")
            self.assertIn("Até 15 buscas ativas", completo)
            # a lista fica DEPOIS do botão (pedido do Ricardo): o botão vem antes da lista no cartão
            ordem = pg.eval_on_selector("#main .ct-v-plano", "c => { const b = c.querySelector('.btn'), l = c.querySelector('.mp-lista'); return !!(b && l && (b.compareDocumentPosition(l) & Node.DOCUMENT_POSITION_FOLLOWING)); }")
            self.assertTrue(ordem)
            self.assertEqual(p.erros, [])
        finally:
            p.fechar()

    def test_sem_o_campo_limites_a_lista_mostra_so_as_funcoes(self):
        for pl in MEU_PLANO["planos"]: pl.pop("limites")
        p = Pagina()
        try:
            pg = p.abrir("/#/plano", 1800)
            t = pg.inner_text("#main .ct-v-plano")
            self.assertIn("Vendas: clientes, buscas", t)
            self.assertNotIn("sem limite", t); self.assertNotIn("Até", t)
            self.assertEqual(p.erros, [])
        finally:
            p.fechar()


class ConectarCanais(unittest.TestCase):
    """24/11/2026 (pedido do Ricardo): cadastro do cliente + guia, uma etapa por vez, salva sozinho, diz o que falta. Nunca pede senha nem código.
    A função é global: serve para qualquer empresa com WhatsApp e SDR; o Master preenche pelo seletor de empresa."""

    PLANO = {"tem_assinatura": True, "acesso": "total", "status": "ativa", "recursos": ["prospect", "prospect_sdr_whatsapp"], "limites": {}}
    COMPLETO = {"dono_nome": "Maria Exemplo", "dono_email": "contato@empresa-exemplo.com.br", "dono_celular": "(45) 99111-2222", "empresa_nome": "Empresa Exemplo",
                "instagram_arroba": "@empresa.exemplo", "instagram_profissional": "sim", "whatsapp_numero": "(45) 9952-5268", "whatsapp_business": "sim",
                "lead_quente_whatsapp": "(45) 99999-0000"}

    def setUp(self):
        SITUACAO.clear(); SITUACAO["emp-p"] = dict(self.PLANO)
        CANAIS.update({"dados": {}, "passos": {}, "atualizado_em": None})

    def tearDown(self):
        SITUACAO.clear(); CANAIS.update({"dados": {}, "passos": {}, "atualizado_em": None})

    def salvas(self, p):
        return [a for n, a in p.args if n == "nexo_canais_salvar"]

    def test_menu_so_aparece_para_quem_tem_o_recurso(self):
        SITUACAO["emp-p"] = {**self.PLANO, "recursos": ["prospect"]}
        p = Pagina()
        try:
            self.assertNotIn("Conectar canais", p.abrir("/#/inicio", 1500).inner_text("#nav"))
        finally:
            p.fechar()
        SITUACAO["emp-p"] = dict(self.PLANO)
        p = Pagina()
        try:
            self.assertIn("Conectar canais", p.abrir("/#/inicio", 1500).inner_text("#nav"))
        finally:
            p.fechar()

    def test_comeca_na_primeira_etapa_com_progresso_o_que_falta_e_sem_campo_de_senha(self):
        p = Pagina()
        try:
            pg = p.abrir("/#/canais", 1800)
            txt = pg.inner_text("#main")
            self.assertIn("etapa 1 de 5", txt.lower()); self.assertIn("0 de 5 etapas", txt)
            self.assertIn("Nunca coloque senha ou código aqui", txt)
            self.assertEqual(len(pg.query_selector_all(".cn-chip")), 5)
            self.assertIn("Falta preencher: Nome completo e mais 3", pg.inner_text("#cnProximo"))
            self.assertTrue(pg.is_visible("#cn_dono_nome"))
            self.assertIsNone(pg.query_selector("#cn_instagram_arroba"), "só os campos da etapa de agora")
            self.assertIsNone(pg.query_selector("#main input[type=password]"), "nenhum campo de senha")
            self.assertEqual(pg.inner_text("#cnEstado").strip(), "Salva sozinho enquanto você preenche.")
            self.assertEqual(p.erros, [])
        finally:
            p.fechar()

    def test_continuar_com_campo_faltando_mostra_no_proprio_campo_e_nao_avanca(self):
        p = Pagina()
        try:
            pg = p.abrir("/#/canais", 1800)
            pg.fill("#cn_dono_nome", "Maria Exemplo")
            pg.click("#cnContinuar"); pg.wait_for_timeout(400)
            self.assertIn("etapa 1 de 5", pg.inner_text("#main").lower(), "não avançou")
            self.assertEqual(pg.inner_text('[data-erro="dono_email"]').strip(), "Preencha este campo.")
        finally:
            p.fechar()

    def test_salva_sozinho_sem_clicar_em_nada_e_so_manda_valores_validos(self):
        p = Pagina()
        try:
            pg = p.abrir("/#/canais", 1800)
            pg.fill("#cn_dono_nome", "Maria Exemplo")
            pg.fill("#cn_dono_email", "maria@")
            self.assertIn("Confira o e-mail", pg.inner_text('[data-erro="dono_email"]'))
            pg.fill("#cn_dono_celular", "123")
            self.assertIn("use o DDD", pg.inner_text('[data-erro="dono_celular"]'))
            pg.wait_for_timeout(1500)
            a = self.salvas(p)[-1]
            self.assertEqual(a["p_dados"], {"dono_nome": "Maria Exemplo"}, "e-mail e celular pela metade não vão para o banco")
            self.assertIn("Salvo", pg.inner_text("#cnEstado"))
            self.assertNotIn("senha", json.dumps(a).lower())
            self.assertEqual(p.erros, [])
        finally:
            p.fechar()

    def test_continuar_salva_avanca_e_marca_a_etapa_como_feita(self):
        p = Pagina()
        try:
            pg = p.abrir("/#/canais", 1800)
            for k in ("dono_nome", "dono_email", "dono_celular", "empresa_nome"):
                pg.fill(f"#cn_{k}", self.COMPLETO[k])
            pg.click("#cn_empresa_nome"); pg.press("#cn_empresa_nome", "Tab"); pg.wait_for_timeout(300)
            self.assertIn("Falta preencher: Perfil do Instagram", pg.inner_text("#cnProximo"), "o aviso do que falta já pula para a próxima etapa")
            pg.click("#cnContinuar"); pg.wait_for_timeout(900)
            self.assertIn("etapa 2 de 5", pg.inner_text("#main").lower())
            self.assertTrue(pg.is_visible("#cn_instagram_arroba"))
            self.assertEqual(self.salvas(p)[-1]["p_dados"]["dono_nome"], "Maria Exemplo")
            self.assertIn("✓", pg.inner_text('.cn-chip[data-etapa="0"]'))
            self.assertIn("1 de 5 etapas", pg.inner_text("#main"))
            pg.click("#cnVoltar"); pg.wait_for_timeout(400)
            self.assertEqual(pg.input_value("#cn_dono_nome"), "Maria Exemplo", "voltar mantém o que foi preenchido")
        finally:
            p.fechar()

    def test_reabrir_volta_para_a_primeira_etapa_que_falta(self):
        CANAIS["dados"] = {k: self.COMPLETO[k] for k in ("dono_nome", "dono_email", "dono_celular", "empresa_nome")}
        p = Pagina()
        try:
            pg = p.abrir("/#/canais", 1800)
            self.assertIn("etapa 2 de 5", pg.inner_text("#main").lower())
            self.assertTrue(pg.is_visible("#cn_instagram_arroba"))
        finally:
            p.fechar()

    def test_avisos_quando_o_instagram_nao_e_profissional_ou_o_whatsapp_nao_e_business(self):
        CANAIS["dados"] = dict(self.COMPLETO, instagram_profissional="nao", whatsapp_business="nao")
        p = Pagina()
        try:
            pg = p.abrir("/#/canais", 1800)
            pg.click('.cn-chip[data-etapa="1"]'); pg.wait_for_timeout(300)
            self.assertIn("Troque o Instagram para conta profissional", pg.inner_text("#main"))
            pg.click('.cn-chip[data-etapa="2"]'); pg.wait_for_timeout(300)
            self.assertIn("Instale o WhatsApp Business", pg.inner_text("#main"))
            pg.select_option("#cn_whatsapp_business", "sim"); pg.wait_for_timeout(400)
            self.assertNotIn("Instale o WhatsApp Business", pg.inner_text("#main"), "o aviso some quando a resposta muda")
        finally:
            p.fechar()

    def test_mais_dados_ficam_recolhidos_mas_abrem_sozinhos_quando_ja_tem_valor(self):
        p = Pagina()
        try:
            pg = p.abrir("/#/canais", 1800)
            self.assertFalse(pg.is_visible("#cn_cnpj"), "dados extras recolhidos")
            pg.click(".cn-mais summary"); pg.wait_for_timeout(200)
            self.assertTrue(pg.is_visible("#cn_cnpj"))
        finally:
            p.fechar()
        CANAIS["dados"] = {"site": "https://exemplo.com.br"}
        p = Pagina()
        try:
            pg = p.abrir("/#/canais", 1800)
            self.assertTrue(pg.is_visible("#cn_site"), "abre sozinho quando já tem algo")
        finally:
            p.fechar()

    def test_guia_marca_passos_salva_e_mostra_tudo_pronto(self):
        CANAIS["dados"] = dict(self.COMPLETO)
        p = Pagina()
        try:
            pg = p.abrir("/#/canais", 1800)
            pg.click('.cn-chip[data-etapa="4"]'); pg.wait_for_timeout(300)
            txt = pg.inner_text("#main")
            self.assertEqual(len(pg.query_selector_all(".cn-passo")), 5)
            for palavra in ("Criar ou entrar na conta da Meta", "Conectar o Instagram", "Conectar o WhatsApp"):
                self.assertIn(palavra, txt)
            self.assertIsNone(pg.query_selector("#cnContinuar"), "a última etapa não tem Continuar")
            pg.check('[data-cn-passo="conta_meta"]'); pg.wait_for_timeout(700)
            self.assertTrue(self.salvas(p)[-1]["p_passos"]["conta_meta"])
            for k in ("portfolio", "instagram", "whatsapp", "teste"):
                pg.check(f'[data-cn-passo="{k}"]'); pg.wait_for_timeout(500)
            self.assertIn("Tudo pronto", pg.inner_text("#main"))
            self.assertEqual(p.erros, [])
        finally:
            p.fechar()

    def test_gera_o_perfil_da_ia_so_com_o_que_foi_preenchido(self):
        CANAIS["dados"] = dict(self.COMPLETO, produtos="Produtos de limpeza", nunca_dizer="promessa de resultado ou desconto")
        p = Pagina()
        try:
            pg = p.abrir("/#/canais", 1800)
            pg.click('.cn-chip[data-etapa="3"]'); pg.wait_for_timeout(300)
            self.assertFalse(pg.is_visible("#cnPersona"))
            pg.click("#cnGerar"); pg.wait_for_timeout(200)
            t = pg.input_value("#cnPersona")
            self.assertIn("assistente virtual da Empresa Exemplo", t)
            self.assertIn("Produtos e serviços: Produtos de limpeza", t)
            self.assertIn("NUNCA diga: promessa de resultado ou desconto.", t)
            self.assertNotIn("Preços que podem ser informados", t, "campo vazio não vira linha")
            self.assertIn("você é uma assistente virtual", t)
        finally:
            p.fechar()

    def test_texto_do_cliente_nunca_vira_html(self):
        CANAIS["dados"] = {"empresa_nome": "<b>Imune</b>", "dono_nome": "<img src=x onerror=alert(1)>"}
        p = Pagina()
        try:
            pg = p.abrir("/#/canais", 1800)
            self.assertEqual(pg.input_value("#cn_dono_nome"), "<img src=x onerror=alert(1)>")
            self.assertIsNone(pg.query_selector("#main img")); self.assertIsNone(pg.query_selector("#main .cn b:text('Imune')"))
            self.assertEqual(p.erros, [])
        finally:
            p.fechar()


class PlanoAnual(unittest.TestCase):
    """24/11/2026 (pedido do Ricardo): plano anual com desconto em cada plano, escolhido em Meu plano; o Master muda o preço."""

    def setUp(self):
        MEU_PLANO.clear()
        MEU_PLANO.update({"pode_pedir": True, "pagamento_ligado": True, "planos": [
            {"chave": "inicial", "nome": "Inicial", "preco_centavos": 20000, "preco_anual_centavos": 200000, "recursos": ["prospect"]},
            {"chave": "profissional", "nome": "Profissional", "preco_centavos": 40000, "preco_anual_centavos": 384000, "recursos": ["prospect"]},
            {"chave": "completo", "nome": "Completo", "preco_centavos": 80000, "preco_anual_centavos": None, "recursos": ["prospect"]}],
            "situacao": {"tem_assinatura": True, "acesso": "total", "status": "ativa", "plano": "inicial", "plano_nome": "Inicial", "preco_centavos": 20000,
                         "periodo_ate": "2099-01-01T00:00:00Z"}})

    def tearDown(self):
        MEU_PLANO.clear()

    def test_seletor_so_aparece_com_pagamento_ligado_e_algum_plano_com_anual(self):
        MEU_PLANO["pagamento_ligado"] = False
        p = Pagina()
        try:
            self.assertIsNone(p.abrir("/#/plano", 1800).query_selector(".mp-ciclo"), "sem pagamento ligado não há anual")
        finally:
            p.fechar()
        MEU_PLANO["pagamento_ligado"] = True
        for pl in MEU_PLANO["planos"]: pl["preco_anual_centavos"] = None
        p = Pagina()
        try:
            self.assertIsNone(p.abrir("/#/plano", 1800).query_selector(".mp-ciclo"), "nenhum plano com preço anual")
        finally:
            p.fechar()

    def test_anual_mostra_preco_do_ano_economia_e_paga_com_o_ciclo(self):
        p = Pagina()
        try:
            pedidos = []
            def servidor(r):
                pedidos.append(json.loads(r.request.post_data or "{}"))
                r.fulfill(status=200, content_type="application/json", body='{"link":"https://checkout.infinitepay.io/anual"}')
            p.ctx.route("**/functions/v1/nexo-pagamento", servidor)
            p.ctx.route("https://checkout.infinitepay.io/**", lambda r: r.fulfill(status=200, content_type="text/html", body="<h1>Checkout</h1>"))
            pg = p.abrir("/#/plano", 1800)
            self.assertEqual(pg.get_attribute('[data-mp-ciclo="mensal"]', "aria-pressed"), "true", "começa no mensal")
            self.assertIn("2 meses grátis", pg.inner_text(".mp-ciclo"))
            pg.click('[data-mp-ciclo="anual"]'); pg.wait_for_timeout(300)
            cards = [c.inner_text().replace(" ", " ") for c in pg.query_selector_all("#main .ct-v-plano")]
            self.assertIn("R$ 2.000,00", cards[0]); self.assertIn("/ano", cards[0])
            self.assertIn("R$ 166,67/mês", cards[0]); self.assertIn("economize R$ 400,00", cards[0]); self.assertIn("2 meses grátis", cards[0])
            self.assertIn("R$ 3.840,00", cards[1]); self.assertIn("economize R$ 960,00", cards[1]); self.assertIn("20% de desconto", cards[1], "desconto que não é número inteiro de meses")
            self.assertIn("Só mensal", cards[2], "plano sem preço anual")
            self.assertIn("12 meses", pg.inner_text("#main"))
            self.assertIn("Pagar o anual", cards[0], "o plano atual também pode virar anual")
            with pg.expect_navigation():
                pg.click('[data-mp-pagar="profissional"]')
            self.assertEqual(pedidos[0]["ciclo"], "anual"); self.assertEqual(pedidos[0]["plano"], "profissional")
        finally:
            p.fechar()

    def test_voltar_ao_mensal_e_lembrar_a_escolha_na_sessao(self):
        p = Pagina()
        try:
            pg = p.abrir("/#/plano", 1800)
            pg.click('[data-mp-ciclo="anual"]'); pg.wait_for_timeout(300)
            pg.click('[data-mp-ciclo="mensal"]'); pg.wait_for_timeout(300)
            c0 = pg.query_selector_all("#main .ct-v-plano")[0].inner_text().replace(" ", " ")
            self.assertIn("R$ 200,00", c0); self.assertIn("/mês", c0); self.assertNotIn("economize", c0)
            pg.click('[data-mp-ciclo="anual"]'); pg.wait_for_timeout(300)
            pg.reload(); pg.wait_for_timeout(1800)
            self.assertEqual(pg.get_attribute('[data-mp-ciclo="anual"]', "aria-pressed"), "true", "a escolha fica na sessão")
            self.assertEqual(p.erros, [])
        finally:
            p.fechar()

    def test_fatura_anual_aparece_com_a_etiqueta(self):
        p = Pagina()
        try:
            p.ctx.route("**/rest/v1/rpc/nexo_minhas_faturas", lambda r: r.fulfill(status=200, content_type="application/json",
                body=json.dumps([{"competencia": "2026-11-01", "plano_nome": "Inicial", "valor_centavos": 200000, "status": "paga", "pago_em": "2026-11-24T15:00:00Z", "meio": "pix", "meses": 12}])))
            self.assertIn("anual", p.abrir("/#/plano", 1800).inner_text(".mp-fat"))
        finally:
            p.fechar()

    def test_master_edita_o_preco_anual(self):
        p = Pagina(master=True)
        try:
            pg = p.abrir("/marketing.html", 1500)
            pg.click('.menu [data-aba="master"]'); pg.wait_for_timeout(900)
            f = 'form[data-m-salvar-plano="inicial"]'
            pg.fill(f + " [name=preco_anual]", "1.920,00")
            pg.click(f + " [type=submit]"); pg.wait_for_timeout(500)
            args = [a for n, a in p.args if n == "nexo_master_salvar_plano"][-1]
            self.assertEqual(args["p_dados"]["preco_anual_centavos"], 192000)
            pg.fill(f + " [name=preco_anual]", "")
            pg.click(f + " [type=submit]"); pg.wait_for_timeout(500)
            args = [a for n, a in p.args if n == "nexo_master_salvar_plano"][-1]
            self.assertEqual(args["p_dados"]["preco_anual_centavos"], "", "vazio apaga o anual")
            self.assertEqual(p.erros, [])
        finally:
            p.fechar()


class VitrineDePlanosNoLogin(unittest.TestCase):
    """24/11/2026 (pedido do Ricardo): os planos aparecem na tela de entrada do Prospect como em Meu plano, só para olhar (cadastro fechado)."""

    def setUp(self):
        VITRINE.clear(); VITRINE.extend([
            {"chave": "inicial", "nome": "Inicial", "descricao": "Vendas: a onça Faro busca empresas.", "preco_centavos": 20000, "preco_anual_centavos": 200000,
             "recursos": ["prospect", "prospect_ia"], "limites": {"usuarios": 1, "empresas_mes": 200}},
            {"chave": "profissional", "nome": "Profissional", "descricao": "Tudo do Inicial + WhatsApp e SDR.", "preco_centavos": 40000, "preco_anual_centavos": 400000,
             "recursos": ["prospect", "prospect_ia", "prospect_sdr_whatsapp"], "limites": {"usuarios": 2}},
            {"chave": "completo", "nome": "Completo", "descricao": "Tudo, com os maiores limites.", "preco_centavos": 80000, "preco_anual_centavos": None,
             "recursos": ["prospect", "prospect_ia", "prospect_sdr_whatsapp"], "limites": {}}])
        PLANOS_PUB.clear()

    def tearDown(self):
        VITRINE.clear(); PLANOS_PUB.clear()

    def test_prospect_mostra_os_tres_planos_com_funcoes_limites_e_sem_compra(self):
        p = Pagina(logado=False)
        try:
            pg = p.abrir("/", 1800)
            self.assertTrue(pg.is_visible(".ct-vitrine.ct-info .ct-v-grade"), "os planos já aparecem abertos")
            cards = [c.inner_text().replace(" ", " ") for c in pg.query_selector_all(".ct-info .ct-v-plano")]
            self.assertEqual(len(cards), 3)
            self.assertIn("R$ 200,00", cards[0]); self.assertIn("/mês", cards[0])
            self.assertIn("WhatsApp e SDR: não incluído", cards[0])
            self.assertIn("Até 1 usuário", cards[0])
            self.assertIn("WhatsApp e SDR: a IA atende", cards[1])
            self.assertIn("Usuários sem limite", cards[2], "limite vazio = sem limite")
            t = pg.inner_text(".ct-info")
            self.assertNotIn("Começar teste grátis", t); self.assertNotIn("Assinar e pagar", t)
            self.assertIn("O acesso é por convite", t)
            self.assertEqual(len(pg.query_selector_all(".ct-info a[href*='instagram.com/nexo.rm']")), 3, "cada plano leva a falar com a NEXO")
            self.assertEqual(pg.inner_text("[data-criar]"), "Criar conta ou usar um convite", "o cadastro segue fechado")
            self.assertEqual(pg.eval_on_selector("#formLogin", "e => getComputedStyle(e).position"), "static", "o login não cobre o plano da direita ao rolar")
            self.assertEqual(p.erros, [])
        finally:
            p.fechar()

    def test_seletor_anual_mostra_o_preco_do_ano_e_a_economia(self):
        p = Pagina(logado=False)
        try:
            pg = p.abrir("/", 1800)
            self.assertIn("2 meses grátis", pg.inner_text(".ct-info .mp-ciclo"))
            pg.click('.ct-info [data-ciclo="anual"]'); pg.wait_for_timeout(300)
            cards = [c.inner_text().replace(" ", " ") for c in pg.query_selector_all(".ct-info .ct-v-plano")]
            self.assertIn("R$ 2.000,00", cards[0]); self.assertIn("/ano", cards[0]); self.assertIn("economize R$ 400,00", cards[0])
            self.assertIn("R$ 4.000,00", cards[1]); self.assertIn("economize R$ 800,00", cards[1])
            self.assertIn("Só mensal", cards[2], "plano sem anual")
            pg.click('.ct-info [data-ciclo="mensal"]'); pg.wait_for_timeout(300)
            self.assertIn("R$ 200,00", pg.query_selector_all(".ct-info .ct-v-plano")[0].inner_text().replace(" ", " "))
            self.assertEqual(p.erros, [])
        finally:
            p.fechar()

    def test_marketing_nao_mostra_os_planos_do_prospect(self):
        p = Pagina(logado=False)
        try:
            self.assertIsNone(p.abrir("/marketing.html", 1800).query_selector(".ct-info"))
        finally:
            p.fechar()

    def test_com_plano_publico_continua_a_vitrine_antiga_com_teste_gratis(self):
        PLANOS_PUB.append({"chave": "inicial", "nome": "Inicial", "descricao": "Prospect", "preco_centavos": 20000, "recursos": ["prospect"], "dias_teste": 3})
        p = Pagina(logado=False)
        try:
            pg = p.abrir("/", 1800)
            self.assertIn("Teste 3 dias grátis", pg.inner_text(".ct-v-abrir"))
            self.assertIsNone(pg.query_selector(".ct-info"), "a vitrine informativa só entra quando o cadastro está fechado")
        finally:
            p.fechar()

    def test_texto_do_plano_nunca_vira_html(self):
        VITRINE[0]["nome"] = "<img src=x onerror=alert(1)>"; VITRINE[0]["descricao"] = "<b>negrito</b>"
        p = Pagina(logado=False)
        try:
            pg = p.abrir("/", 1800)
            self.assertIsNone(pg.query_selector(".ct-info img")); self.assertIsNone(pg.query_selector(".ct-info .ct-v-desc b"))
            self.assertEqual(p.erros, [])
        finally:
            p.fechar()


class WhatsappYcloud(unittest.TestCase):
    """24/11/2026: provedor YCloud (coexistência). O cliente segue usando o WhatsApp Business no celular; a YCloud assina o webhook."""

    PLANO = {"tem_assinatura": True, "acesso": "total", "status": "ativa", "recursos": ["prospect", "prospect_sdr_whatsapp"], "limites": {}}

    def setUp(self):
        SDR_CFG.clear(); SDR_CFG.update(sdr_cfg_inicial())
        SITUACAO.clear(); SITUACAO["emp-p"] = dict(self.PLANO)

    def tearDown(self):
        SITUACAO.clear(); SDR_CFG.clear()

    def test_escolher_ycloud_troca_os_campos_e_tira_o_token_da_meta(self):
        p = Pagina()
        try:
            pg = p.abrir("/#/whatsapp", 1800)
            self.assertTrue(pg.is_visible("#sdrPhone") and pg.is_visible("#sdrTokWa") and pg.is_visible("#sdrGerar"), "Cloud API como sempre")
            pg.select_option("#sdrProv", "ycloud"); pg.wait_for_timeout(300)
            self.assertTrue(pg.is_visible("#sdrNumero"))
            for sel in ("#sdrPhone", "#sdrTokWa", "#sdrGerar"):
                self.assertIsNone(pg.query_selector(sel), f"{sel} é da Cloud API")
            self.assertTrue(pg.input_value("#sdrUrl").endswith("/functions/v1/nexo-sdr-webhook?provedor=ycloud"))
            self.assertIn("WhatsApp Business", pg.inner_text("#sdrProv + small"))
            self.assertIn("aqui não há token para colar", pg.inner_text("#main"))
            self.assertEqual(p.erros, [])
        finally:
            p.fechar()

    def test_trocar_o_provedor_nao_perde_o_que_ja_foi_digitado(self):
        p = Pagina()
        try:
            pg = p.abrir("/#/whatsapp", 1800)
            pg.fill("#sdrModelo", "claude-sonnet-5-5"); pg.fill("#sdrGestor", "(45) 99111-2222")
            pg.select_option("#sdrProv", "ycloud"); pg.wait_for_timeout(300)
            self.assertEqual(pg.input_value("#sdrModelo"), "claude-sonnet-5-5")
            self.assertEqual(pg.input_value("#sdrGestor"), "(45) 99111-2222")
        finally:
            p.fechar()

    def test_ycloud_pede_o_numero_da_empresa_e_nao_o_token(self):
        SDR_CFG.update({"provedor": "ycloud", "llm_provedor": "anthropic", "llm_modelo": "claude-sonnet-5-5", "persona_prompt": "Você é a consultora da empresa.",
                        "gestor_whatsapp": "5545991112222", "credenciais": {"llm": {"salva": True, "final": "••••egAA", "status": "pendente"}, "whatsapp_business": {"salva": False}}})
        p = Pagina()
        try:
            pg = p.abrir("/#/whatsapp", 1800)
            faltas = pg.inner_text(".sdr-falta")
            self.assertIn("Informar o número do WhatsApp da empresa", faltas)
            self.assertNotIn("token do WhatsApp", faltas)
            self.assertNotIn("Phone Number ID", faltas)
            self.assertTrue(pg.is_disabled("#sdrLigar"))
        finally:
            p.fechar()

    def test_salvar_manda_o_provedor_e_o_numero_e_o_ligar_abre_com_tudo_pronto(self):
        SDR_CFG.update({"provedor": "ycloud", "instance_id": "5545995255268", "llm_provedor": "anthropic", "llm_modelo": "claude-sonnet-5-5",
                        "persona_prompt": "Você é a consultora da empresa.", "gestor_whatsapp": "5545991112222",
                        "credenciais": {"llm": {"salva": True, "final": "••••egAA", "status": "pendente"}, "whatsapp_business": {"salva": False}}})
        p = Pagina()
        try:
            pg = p.abrir("/#/whatsapp", 1800)
            self.assertIn("Tudo pronto para ligar", pg.inner_text("#main"))
            self.assertEqual(pg.input_value("#sdrNumero"), "5545995255268")
            pg.fill("#sdrNumero", "(45) 99525-5268")
            pg.click("#sdrSalvar"); pg.wait_for_timeout(600)
            args = [a for n, a in p.args if n == "nexo_sdr_salvar"][-1]
            self.assertEqual(args["p_cfg"]["provedor"], "ycloud")
            self.assertEqual(args["p_cfg"]["instance_id"], "(45) 99525-5268")
            self.assertEqual(args["p_cfg"]["modo"], "sombra")
            self.assertEqual(p.erros, [])
        finally:
            p.fechar()

    def test_ycloud_explica_o_modo_autonomo_e_a_pausa_quando_o_cliente_responde_pelo_celular(self):
        p = Pagina()
        try:
            pg = p.abrir("/#/whatsapp", 1800)
            self.assertIsNone(pg.query_selector("#sdrAutYcloud"), "na Cloud API o texto não aparece")
            pg.select_option("#sdrProv", "ycloud"); pg.wait_for_timeout(300)
            t = pg.inner_text("#sdrAutYcloud")
            self.assertIn("quem escreve primeiro", t)
            self.assertIn("pausa", t)
            self.assertIn("Devolver para IA", t)
            self.assertIn("só sugere", t)
            self.assertEqual(p.erros, [])
        finally:
            p.fechar()
