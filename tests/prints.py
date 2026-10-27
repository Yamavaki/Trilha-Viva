import asyncio, sys
from playwright.async_api import async_playwright

OUT = sys.argv[1]

async def main():
    async with async_playwright() as p:
        nav = await p.chromium.launch(args=["--autoplay-policy=no-user-gesture-required"])
        pg = await nav.new_page(viewport={"width": 2000, "height": 1500})
        erros = []
        pg.on("pageerror", lambda e: (erros.append(str(e)), print("ERRO", e)))
        pg.on("console", lambda m: print("  [c]", m.text) if m.type == "error" and "ERR_TUNNEL" not in m.text else None)
        await pg.goto("http://127.0.0.1:8765/tests/index.html")
        await pg.wait_for_function("window.__pronto === true")
        # Mais faixas na playlist para parecer com o mockup
        await pg.evaluate("""(async()=>{
          const pl = __playlistChefe;
          await pl.createEmbeddedDocuments('PlaylistSound', [
            {name:'Valsa Apagada', path:'/tests/audio/coro.ogg', flags:{'trilha-viva':{secoes:[{id:'a',nome:'A',inicio:0,termino:3,acao:'next',cor:'#6f9be0'},{id:'b',nome:'B',inicio:3,termino:6,acao:'loop',cor:'#d9b44a'},{id:'c',nome:'C',inicio:6,termino:8,acao:'stop',cor:'#b48ce6'}]}}},
            {name:'Engrenagens em Fúria', path:'/tests/audio/marcha.ogg'}]);
          await TrilhaViva.Trilha.tocarSom(pl.sounds.contents[0]);
          await TrilhaViva.Trilha.tocarSom(game.playlists.contents[1].sounds.contents[0]);
        })()""")
        await asyncio.sleep(7)
        await pg.evaluate("window.__proxPos = 20; TrilhaViva.abrir()")
        await asyncio.sleep(0.6)
        # marcar 3 faixas
        caixas = pg.locator(".tv-faixa .tv-check")
        for i in (0, 1, 3):
            await caixas.nth(i).check()
            await asyncio.sleep(0.15)
        await asyncio.sleep(0.6)
        await pg.locator("#trilha-viva-painel").screenshot(path=f"{OUT}/1-painel.png")

        await pg.evaluate("(async()=>{const c=Object.values(game.settings.get('trilha-viva','estado').camadas).find(c=>c.tipo==='musica'); await TrilhaViva.Trilha.irParaSecao(c.id,'s4','volta');})()")
        await pg.evaluate("window.__proxPos = 1000; TrilhaViva.abrirChefe()")
        await asyncio.sleep(1.5)
        await pg.locator("#trilha-viva-chefe").screenshot(path=f"{OUT}/4-chefe.png")

        som = await pg.evaluate("__playlistChefe.sounds.contents[0].uuid")
        await pg.evaluate(f"window.__proxPos = 20; TrilhaViva.abrirSecoes(fromUuidSync('{som}'))")
        await asyncio.sleep(2.0)
        ed = pg.locator(".application.trilha-viva").last
        # clicar na onda para mover o cursor
        onda = pg.locator(".tv-ed-onda")
        bb = await onda.bounding_box()
        await pg.mouse.click(bb["x"] + bb["width"] * 0.29, bb["y"] + 60)
        await asyncio.sleep(0.4)
        await ed.screenshot(path=f"{OUT}/3-secoes.png")
        await ed.locator("[data-action=close]").click()

        # Fila: tocar as marcadas
        await pg.locator("#trilha-viva-painel [data-acao=tocarMarcadas]").click()
        await asyncio.sleep(4)
        fila = pg.locator("#trilha-viva-fila")
        await pg.evaluate("document.querySelector('#trilha-viva-fila').style.left='1000px'; document.querySelector('#trilha-viva-fila').style.top='760px'")
        await fila.screenshot(path=f"{OUT}/2-fila.png")
        await pg.locator("#trilha-viva-painel").screenshot(path=f"{OUT}/1b-painel-fila.png")
        print("erros:", erros)
        await nav.close()

asyncio.run(main())
