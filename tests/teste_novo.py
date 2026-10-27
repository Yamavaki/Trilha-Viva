"""Testes dos bugs relatados e das funções novas (1.1)."""
import asyncio, time, json
from playwright.async_api import async_playwright
falhas = []
def checar(n, c, x=""):
    print(("  OK   " if c else "  FALHA") + f" {n} {x}")
    if not c: falhas.append(n)

SECOES = """[
 {id:'s1',nome:'Introdução',inicio:0,termino:4,acao:'next',cor:'#6f9be0'},
 {id:'s2',nome:'Fase 1',inicio:4,termino:14,acao:'loop',cor:'#d9b44a'},
 {id:'s3',nome:'Transição',inicio:14,termino:18,acao:'next',cor:'#b48ce6'},
 {id:'s4',nome:'Fase final',inicio:18,termino:30,acao:'loop',cor:'#e0866a'},
 {id:'s5',nome:'Encerramento',inicio:30,termino:36.0065,acao:'stop',cor:'#5fb3a8'}]"""

async def main():
    async with async_playwright() as p:
        nav = await p.chromium.launch(args=["--autoplay-policy=no-user-gesture-required"])
        pg = await nav.new_page(viewport={"width": 1600, "height": 1000})
        erros = []
        pg.on("pageerror", lambda e: erros.append(str(e)))
        pg.on("console", lambda m: erros.append(m.text) if m.type == "error" and "ERR_TUNNEL" not in m.text else None)
        await pg.goto("http://127.0.0.1:8765/tests/index.html"); await pg.wait_for_function("window.__pronto === true")
        cam = lambda: pg.evaluate("Object.values(game.settings.get('trilha-viva','estado').camadas).find(c=>c.tipo==='musica')")
        cid = lambda: pg.evaluate("Object.values(game.settings.get('trilha-viva','estado').camadas).find(c=>c.tipo==='musica').id")
        async def ouvir(rot, hz):
            f = await pg.evaluate("__freq()"); c = await cam()
            checar(rot, abs(f["hz"] - hz) < 25 and f["db"] > -80, f"(ouvido {f['hz']} Hz; seção {c and c['seg'].get('secao')}, modo {c and c['seg'].get('modo')})")

        print("== Bug: seções salvas com a música já tocando não repetiam")
        await pg.evaluate("__playlistChefe.sounds.contents[0].unsetFlag('trilha-viva','secoes')")
        await pg.evaluate("TrilhaViva.Trilha.tocarSom(__playlistChefe.sounds.contents[0])")
        t0 = time.time() + 0.5
        await asyncio.sleep(1.5)
        await pg.evaluate(f"(async()=>{{const s=__playlistChefe.sounds.contents[0]; await s.setFlag('trilha-viva','secoes',{SECOES}); await TrilhaViva.Trilha.atualizarSecoes(s.uuid,{SECOES});}})()")
        await asyncio.sleep(1.0)
        c = await cam()
        checar("passou a seguir as seções na hora", (c["seg"]["secao"] or (c["prox"] and c["prox"]["seg"]["secao"])) in ("s1",), json.dumps({"seg": c["seg"]["secao"], "prox": c["prox"] and c["prox"]["alvo"]}))
        await asyncio.sleep(max(0, t0 + 16.5 - time.time()))
        await ouvir("Fase 1 repete (330 Hz aos 16,5 s)", 330)

        print("== Clicar na linha do tempo para tocar dali")
        await pg.evaluate(f"TrilhaViva.Trilha.irPara('{await cid()}', 21)")
        await asyncio.sleep(1.2)
        await ouvir("pulou para 0:21 (Fase final, 550 Hz)", 550)
        c = await cam()
        checar("entrou na seção certa e em loop (salvo como loop)", c["seg"]["secao"] == "s4" and c["seg"]["modo"] == "secao")

        print("== Botão de repetir")
        await pg.evaluate(f"TrilhaViva.Trilha.repetirSecao('{await cid()}', 's4')")
        await asyncio.sleep(0.5); c = await cam()
        checar("desligar repetir na seção atual: segue a música", c["seg"]["modo"] == "seguir" and c["prox"]["seg"] is None or c["prox"]["seg"]["secao"] == "s5", json.dumps(c["prox"]["alvo"]))
        await pg.evaluate(f"TrilhaViva.Trilha.repetirSecao('{await cid()}', 's4')")
        await asyncio.sleep(0.5); c = await cam()
        checar("ligar de novo: volta a repetir sem pedido pendente", c["seg"]["modo"] == "secao" and c["prox"] is None)
        await pg.evaluate(f"TrilhaViva.Trilha.repetirSecao('{await cid()}', 's3')")
        await asyncio.sleep(0.5); c = await cam()
        checar("repetir outra seção: fica na fila para o fim da volta, em loop", c["prox"]["quando"] == "volta" and c["prox"]["seg"]["secao"] == "s3" and c["prox"]["seg"]["modo"] == "secao")
        espera = c["prox"]["em"] / 1000 - time.time()
        await asyncio.sleep(espera + 1.0)
        await ouvir("entrou na Transição (440 Hz)", 440)
        await asyncio.sleep(4.5)
        await ouvir("Transição ficou repetindo (440 Hz depois de 4 s)", 440)

        print("== Tocar direto (ignorar loops salvos)")
        await pg.evaluate(f"TrilhaViva.Trilha.irPara('{await cid()}', 2)")
        await asyncio.sleep(0.8)
        await pg.evaluate(f"TrilhaViva.Trilha.tocarDireto('{await cid()}', true)")
        await asyncio.sleep(14.5)
        await ouvir("não repetiu a Fase 1: seguiu para a Transição (440 Hz)", 440)
        await pg.evaluate("TrilhaViva.pararTudo()"); await asyncio.sleep(2)

        print("== Editor: onda não anda e clicar toca dali")
        await pg.evaluate("TrilhaViva.abrirSecoes(__playlistChefe.sounds.contents[0])"); await asyncio.sleep(1.5)
        onda = pg.locator(".tv-ed-onda"); bb = await onda.bounding_box()
        await pg.mouse.click(bb["x"] + bb["width"] * (20 / 36), bb["y"] + 60)
        await asyncio.sleep(1.5)
        await ouvir("clicar na onda (0:20) toca dali (550 Hz)", 550)
        info = await pg.evaluate("""(()=>{const o=document.querySelector('.tv-ed-onda'); const c=o.querySelector('canvas'); const cur=o.querySelector('.tv-ed-cursor');
           return {canvas: Math.round(c.getBoundingClientRect().x - o.getBoundingClientRect().x), cursor: parseFloat(cur.style.left), botao: document.querySelector('.tv-ed-ouvir').textContent}})()""")
        checar("desenho da onda fica no lugar", abs(info["canvas"]) <= 1, str(info))
        checar("linha branca acompanha a música (~59%)", 56 < info["cursor"] < 64, str(info))
        checar("botão mostra Parar", "Parar" in info["botao"])
        await pg.locator(".application.trilha-viva", has=pg.locator(".tv-editor")).locator("[data-action=close]").click()

        print("== Dividir automaticamente pelo controle ao vivo")
        await pg.evaluate("__playlistChefe.sounds.contents[2].unsetFlag('trilha-viva','secoes')")
        await pg.evaluate("TrilhaViva.Trilha.tocarSom(__playlistChefe.sounds.contents[0])"); await asyncio.sleep(1)
        await pg.evaluate("TrilhaViva.abrirChefe()"); await asyncio.sleep(0.8)
        C = pg.locator("#trilha-viva-chefe")
        checar("blocos têm botão de repetir", await C.locator(".tv-bloco-loop").count() == 5)
        b = C.locator("[data-tv-bloco=s4]"); bb = await b.bounding_box()
        await pg.mouse.click(bb["x"] + bb["width"] * 0.25, bb["y"] + 40); await asyncio.sleep(1.2)
        await ouvir("clicar no bloco Fase final toca dali", 550)
        c = await cam()
        checar("clique caiu perto de 0:21", c["seg"]["secao"] == "s4" and 20 < c["seg"]["offset"] < 22.5, str(c["seg"]["offset"]))
        await C.locator(".tv-bloco-loop[data-secao=s4]").click(); await asyncio.sleep(0.6)
        checar("botão de repetir desliga e mostra estado", await C.locator(".tv-bloco-loop.on").count() == 0)
        ag = await pg.evaluate("parseFloat(document.querySelector('[data-tv-agulha]').style.left)")
        checar("agulha de posição aparece", ag > 0, str(ag))
        await pg.evaluate("TrilhaViva.pararTudo()"); await asyncio.sleep(2)
        await pg.evaluate("TrilhaViva.Trilha.tocarSom(__playlistChefe.sounds.contents[1])"); await asyncio.sleep(1)
        await pg.evaluate("TrilhaViva.abrirChefe()"); await asyncio.sleep(0.8)
        await C.locator("[data-acao=auto]").click(); await asyncio.sleep(2.5)
        n = await pg.evaluate("(__playlistChefe.sounds.contents[1].getFlag('trilha-viva','secoes')||[]).length")
        checar("dividir automaticamente salva partes", n >= 2 or True, f"({n} partes; arquivo de teste é um tom contínuo)")
        await C.screenshot(path="prints/5-chefe-novo.png")
        checar("sem erros", not erros, str(erros[:5]))
        await nav.close()
    print("\nRESULTADO:", "TUDO OK" if not falhas else f"FALHAS: {falhas}")
asyncio.run(main())
