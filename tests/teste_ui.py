"""Cliques de verdade nas janelas: painel, menu do botão direito, editor de seções, controle ao vivo e fila."""
import asyncio, json
from playwright.async_api import async_playwright
falhas = []
def checar(n, c, x=""):
    print(("  OK   " if c else "  FALHA") + f" {n} {x}")
    if not c: falhas.append(n)

async def main():
    async with async_playwright() as p:
        nav = await p.chromium.launch(args=["--autoplay-policy=no-user-gesture-required"])
        pg = await nav.new_page(viewport={"width": 2000, "height": 1500})
        erros = []
        pg.on("pageerror", lambda e: erros.append(str(e)))
        pg.on("console", lambda m: erros.append(m.text) if m.type == "error" and "ERR_TUNNEL" not in m.text else None)
        await pg.goto("http://127.0.0.1:8765/tests/index.html"); await pg.wait_for_function("window.__pronto === true")
        est = lambda: pg.evaluate("game.settings.get('trilha-viva','estado')")

        print("== Painel")
        await pg.evaluate("TrilhaViva.abrir()"); await asyncio.sleep(0.5)
        P = pg.locator("#trilha-viva-painel")
        await P.locator(".tv-faixa").nth(1).locator("[data-acao=tocar]").click(); await asyncio.sleep(1.2)
        e = await est(); cs = list(e["camadas"].values())
        checar("▶ toca a faixa (Marcha, repetir)", len(cs) == 1 and cs[0]["modoFila"] == "atual")
        checar("linha fica dourada", await P.locator(".tv-faixa.tocando").count() == 1)
        await P.locator(".tv-faixa").nth(0).locator("[data-acao=tocar]").click(); await asyncio.sleep(2.5)
        e = await est(); cs = [c for c in e["camadas"].values()]
        checar("outra música substitui a anterior (crossfade)", len(cs) == 1 and cs[0]["fila"][0]["nome"].startswith("Tema"), str([c["fila"][0]["nome"] for c in cs]))
        await P.locator("[data-acao=playlist]").nth(1).click(); await asyncio.sleep(0.3)
        await P.locator(".tv-faixa [data-acao=tocar]").first.click(); await asyncio.sleep(1.2)
        e = await est()
        checar("ambiente toca por cima (2 camadas)", len(e["camadas"]) == 2)
        checar("dois cards em 'Tocando agora'", await P.locator(".tv-card").count() == 2)
        # volume
        rng = P.locator(".tv-card input[data-campo=volume]").first
        await rng.fill("30"); await rng.dispatch_event("change"); await asyncio.sleep(0.5)
        e = await est(); vols = sorted(round(c["volume"], 2) for c in e["camadas"].values())
        checar("volume da camada salva", 0.3 in vols, str(vols))

        print("== Menu do botão direito: mudar tipo")
        await P.locator("[data-acao=playlist]").nth(0).click(); await asyncio.sleep(0.3)
        await P.locator(".tv-faixa").nth(2).click(button="right"); await asyncio.sleep(0.3)
        checar("menu abre", await P.locator(".tv-menu").count() == 1)
        await P.locator(".tv-menu [data-tipo=efeito]").click(); await asyncio.sleep(0.4)
        tipo = await pg.evaluate("__playlistChefe.sounds.contents[2].getFlag('trilha-viva','tipo')")
        checar("tipo virou Efeito", tipo == "efeito")
        checar("tag mostra Efeito", "Efeito" in await P.locator(".tv-faixa").nth(2).inner_text())

        print("== Controle ao vivo")
        await P.locator("[data-acao=abrirChefe]").click(); await asyncio.sleep(0.6)
        C = pg.locator("#trilha-viva-chefe")
        checar("janela de controle abriu", await C.count() == 1)
        await C.locator("[data-acao=volta][data-secao=s4]").click(); await asyncio.sleep(0.6)
        checar("aviso 'Na fila' aparece", "Na fila: Fase final" in await C.inner_text())
        await C.locator("[data-acao=cancelar]").click(); await asyncio.sleep(0.6)
        e = await est(); mus = [c for c in e["camadas"].values() if c["tipo"] == "musica"][0]
        checar("cancelar tira o pedido", not (mus["prox"] and mus["prox"]["quando"] != "auto"))
        await C.locator("[data-acao=modo][data-modo=seguir]").click(); await asyncio.sleep(0.6)
        e = await est(); mus = [c for c in e["camadas"].values() if c["tipo"] == "musica"][0]
        checar("modo 'Seguir a música' agenda a próxima seção", mus["prox"] and mus["prox"]["seg"] and mus["prox"]["seg"]["secao"] in ("s2", "s3"), json.dumps(mus["prox"]["alvo"]) if mus["prox"] else "")
        cf = C.locator("input[data-campo=crossfade]")
        await cf.fill("3"); await cf.dispatch_event("change"); await asyncio.sleep(0.5)
        e = await est(); mus = [c for c in e["camadas"].values() if c["tipo"] == "musica"][0]
        checar("crossfade salvo", mus["crossfade"] == 3)
        await C.locator("[data-acao=pausar]").click(); await asyncio.sleep(0.6)
        checar("botão vira Retomar", await C.locator("[data-acao=retomar]").count() == 1)
        await C.locator("[data-acao=retomar]").click(); await asyncio.sleep(0.6)

        print("== Editor de seções")
        await C.locator("[data-acao=editar]").click(); await asyncio.sleep(1.5)
        E = pg.locator(".application.trilha-viva", has=pg.locator(".tv-editor"))
        checar("editor abriu com 5 seções", await E.locator(".tv-ed-linha").count() == 5)
        onda = E.locator(".tv-ed-onda"); bb = await onda.bounding_box()
        await pg.mouse.click(bb["x"] + bb["width"] * (8 / 36), bb["y"] + 60); await asyncio.sleep(0.2)
        await E.locator("[data-acao=marcar]").click(); await asyncio.sleep(0.3)
        checar("marcar corte cria a 6ª seção", await E.locator(".tv-ed-linha").count() == 6)
        cortes = await pg.evaluate("[...document.querySelectorAll('.tv-ed-linha input[data-campo=inicio]')].map(i=>i.value)")
        checar("corte grudou no tempo (8 s → 0:08)", "0:08" in cortes, str(cortes))
        # arrastar o corte de 14 s para ~16 s
        h = E.locator(".tv-ed-corte").nth(2); hb = await h.bounding_box()
        await pg.mouse.move(hb["x"] + hb["width"] / 2, hb["y"] + 40); await pg.mouse.down()
        await pg.mouse.move(bb["x"] + bb["width"] * (16.2 / 36), bb["y"] + 40, steps=8); await pg.mouse.up(); await asyncio.sleep(0.4)
        cortes = await pg.evaluate("[...document.querySelectorAll('.tv-ed-linha input[data-campo=inicio]')].map(i=>i.value)")
        checar("arrastar move o corte e gruda (16 s)", "0:16" in cortes or "0:16.5" in cortes or "0:16.0" in cortes, str(cortes))
        # remover a seção criada
        await E.locator(".tv-ed-linha").nth(2).locator("[data-acao=remover]").click(); await asyncio.sleep(0.3)
        checar("remover junta com a vizinha", await E.locator(".tv-ed-linha").count() == 5)
        # editar tempo digitando
        inp = E.locator(".tv-ed-linha").nth(3).locator("input[data-campo=inicio]")
        await inp.fill("0:18"); await inp.dispatch_event("change"); await asyncio.sleep(0.3)
        # modelo de chefe
        await E.locator("[data-acao=modelo]").click(); await asyncio.sleep(0.4)
        nomes = await pg.evaluate("[...document.querySelectorAll('.tv-ed-linha input[data-campo=nome]')].map(i=>i.value)")
        ini = await pg.evaluate("[...document.querySelectorAll('.tv-ed-linha input[data-campo=inicio]')].map(i=>i.value)")
        checar("modelo de chefe monta as 5 seções nos lugares certos", nomes == ["Introdução", "Fase 1", "Transição", "Fase final", "Encerramento"] and ini == ["0:00", "0:04", "0:14", "0:18", "0:30"], f"{nomes} {ini}")
        lp = await pg.evaluate("[...document.querySelectorAll('.tv-ed-linha input[data-campo=loop]')].map(i=>i.checked)")
        checar("Fase 1 e Fase final em loop", lp == [False, True, False, True, False], str(lp))
        # ouvir seção (prévia local)
        await E.locator("[data-acao=ouvirSecao]").nth(1).click(); await asyncio.sleep(0.6)
        checar("prévia toca", "Parar" in await E.locator("[data-acao=ouvir]").inner_text())
        await E.locator("[data-acao=ouvir]").click(); await asyncio.sleep(0.2)
        # sugerir cortes
        await E.locator("[data-acao=sugerir]").click(); await asyncio.sleep(0.3)
        n = await E.locator(".tv-ed-linha").count()
        checar("sugerir cortes gera seções", n >= 2, f"({n})")
        await E.locator("[data-acao=modelo]").click(); await asyncio.sleep(0.3)
        await E.locator("[data-acao=salvar]").click(); await asyncio.sleep(0.8)
        fl = await pg.evaluate("__playlistChefe.sounds.contents[0].getFlag('trilha-viva','secoes').map(s=>[s.nome, s.inicio])")
        checar("salvar grava as seções na faixa", len(fl) == 5 and fl[3][0] == "Fase final", str(fl))
        e = await est(); mus = [c for c in e["camadas"].values() if c["tipo"] == "musica"][0]
        checar("música tocando recebe as seções novas", [s["nome"] for s in mus["fila"][0]["secoes"]] == [x[0] for x in fl])

        print("== Fila")
        await E.locator("[data-action=close]").click(); await C.locator("[data-action=close]").click(); await asyncio.sleep(0.3)
        await P.locator(".tv-faixa .tv-check").nth(1).check(); await asyncio.sleep(0.2)
        await P.locator(".tv-faixa .tv-check").nth(2).check(); await asyncio.sleep(0.2)
        await P.locator("[data-acao=tocarMarcadas]").click(); await asyncio.sleep(2.5)
        F = pg.locator("#trilha-viva-fila")
        checar("fila abriu com 2 faixas", await F.locator(".tv-fila-linha").count() == 2)
        await F.locator("[data-acao=modoFila][data-modo=fila]").click(); await asyncio.sleep(0.5)
        await F.locator("[data-acao=proxima]").click(); await asyncio.sleep(2.5)
        e = await est(); mus = [c for c in e["camadas"].values() if c["tipo"] == "musica"][0]
        atual = [i["nome"] for i in mus["fila"] if i["id"] == mus["seg"]["itemId"]]
        checar("próxima pula para a 2ª faixa", atual == ["Coro das Auroras"], str(atual))
        # arrastar para reordenar
        a = F.locator(".tv-fila-linha").nth(1); b = F.locator(".tv-fila-linha").nth(0)
        await a.drag_to(b, target_position={"x": 40, "y": 5}); await asyncio.sleep(0.6)
        e = await est(); mus = [c for c in e["camadas"].values() if c["tipo"] == "musica"][0]
        checar("arrastar reordena a fila", [i["nome"] for i in mus["fila"]] == ["Coro das Auroras", "Marcha das Tintas"], str([i["nome"] for i in mus["fila"]]))
        await F.locator(".tv-check[data-campo=aleatorio]").check(); await asyncio.sleep(0.5)
        e = await est(); mus = [c for c in e["camadas"].values() if c["tipo"] == "musica"][0]
        checar("aleatório liga", mus["aleatorio"] is True)
        await F.locator("[data-acao=tirar]").nth(1).click(); await asyncio.sleep(0.5)
        checar("tirar da fila", await F.locator(".tv-fila-linha").count() == 1)

        print("== Parar tudo")
        await F.locator("[data-action=close]").click(); await asyncio.sleep(0.3)
        await P.locator("[data-acao=pararTudo]").click(); await asyncio.sleep(2.5)
        e = await est()
        checar("parar tudo", len(e["camadas"]) == 0)
        checar("sem erros no console", not erros, str(erros[:5]))
        await nav.close()
    print("\nRESULTADO:", "TUDO OK" if not falhas else f"FALHAS: {falhas}")
asyncio.run(main())
