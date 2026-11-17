"""Fotos dos painéis com o Supabase falso dos testes. Uso: python testes/fotos.py PASTA PREFIXO"""
import sys, pathlib
sys.path.insert(0, str(pathlib.Path(__file__).parent))
import test_paineis as T
pasta, pre = pathlib.Path(sys.argv[1]), sys.argv[2]
temas = sys.argv[3].split(",") if len(sys.argv) > 3 else ["escuro"]
T.setUpModule()
try:
    for tema in temas:
        for nome, url, w in [("system", "/index.html", 1440), ("prospect", "/prospect/", 1440), ("system-cel", "/index.html", 390), ("prospect-cel", "/prospect/", 390)]:
            pg = T.Pagina(local={"nexo.tema": tema, **({"nexo.cor": sys.argv[4]} if len(sys.argv) > 4 else {})})
            pg.page.set_viewport_size({"width": w, "height": 900})
            page = pg.abrir(url, 1500)
            page.screenshot(path=str(pasta / f"{pre}-{tema}-{nome}.png"))
            print(tema, nome, "erros:", pg.erros, "lateral:", page.evaluate("document.documentElement.scrollWidth-innerWidth"))
            pg.fechar()
finally:
    T.tearDownModule()
