"""Teste funcional da Trilha Viva num Chromium real, com Foundry simulado.
Confere pelo som (frequência dominante) qual seção está tocando em cada momento."""
import asyncio, json, sys, time
from playwright.async_api import async_playwright

URL = "http://127.0.0.1:8765/tests/index.html"
falhas = []

def checar(nome, cond, extra=""):
    print(("  OK   " if cond else "  FALHA") + f" {nome} {extra}")
    if not cond:
        falhas.append(nome)

async def main():
    async with async_playwright() as p:
        nav = await p.chromium.launch(args=["--autoplay-policy=no-user-gesture-required"])
        pg = await nav.new_page()
        erros = []
        pg.on("console", lambda m: (erros.append(m.text) if m.type == "error" and "ERR_TUNNEL" not in m.text else None, print("   [console]", m.type, m.text) if m.type in ("error", "warning") or m.text.startswith(("AVISO", "ERRO")) else None))
        pg.on("pageerror", lambda e: (erros.append(str(e)), print("   [pageerror]", e)))
        await pg.goto(URL)
        await pg.wait_for_function("window.__pronto === true", timeout=15000)

        async def estado():
            return await pg.evaluate("game.settings.get('trilha-viva','estado')")
        async def freq():
            return await pg.evaluate("__freq()")
        async def camada():
            e = await estado()
            cs = list(e["camadas"].values())
            return cs[0] if cs else None
        t0 = [0.0]
        async def esperar_ate(s):
            falta = t0[0] + s - time.time()
            if falta > 0:
                await asyncio.sleep(falta)
        async def ouvir(rot, hz_esperado, tol=25):
            f = await freq()
            c = await camada()
            sec = c and c["seg"] and c["seg"].get("secao")
            checar(rot, abs(f["hz"] - hz_esperado) <= tol and f["db"] > -80, f"(ouvido {f['hz']} Hz, {f['db']} dB; seção {sec})")

        print("\n== 1. Música com seções: Introdução → Fase 1 em loop")
        await pg.evaluate("TrilhaViva.Trilha.tocarSom(__playlistChefe.sounds.contents[0])")
        t0[0] = time.time() + 0.5
        await esperar_ate(2.0); await ouvir("Introdução toca (220 Hz)", 220)
        await esperar_ate(6.5); await ouvir("Fase 1 toca (330 Hz)", 330)
        c = await camada()
        checar("estado em Fase 1 com loop", c["seg"]["secao"] == "s2" and c["seg"]["modo"] == "secao" and c["prox"] is None, json.dumps({k: c["seg"][k] for k in ("secao", "modo")}))
        await esperar_ate(16.0); await ouvir("Fase 1 repetiu em vez de seguir (330 Hz aos 16 s)", 330)

        print("\n== 2. Trocar para Fase final no fim da volta")
        await pg.evaluate("(async()=>{const c=Object.values(game.settings.get('trilha-viva','estado').camadas)[0]; await TrilhaViva.Trilha.irParaSecao(c.id,'s4','volta');})()")
        c = await camada()
        espera = (c["prox"]["em"] / 1000) - time.time()
        checar("pedido marcado para o fim da volta", c["prox"]["quando"] == "volta" and 4 < espera < 9, f"(entra em {espera:.1f} s)")
        await asyncio.sleep(max(0, espera - 0.8)); await ouvir("ainda Fase 1 logo antes da troca", 330)
        await asyncio.sleep(1.8); await ouvir("Fase final entrou no fim da volta (550 Hz)", 550)
        c = await camada()
        checar("estado em Fase final", c["seg"]["secao"] == "s4" and c["prox"] is None)

        print("\n== 3. Encerramento agora (crossfade) e parar sozinho no fim")
        await pg.evaluate("(async()=>{const c=Object.values(game.settings.get('trilha-viva','estado').camadas)[0]; await TrilhaViva.Trilha.irParaSecao(c.id,'s5','agora');})()")
        await asyncio.sleep(2.5); await ouvir("Encerramento tocando (660 Hz)", 660)
        c = await camada()
        checar("Encerramento planeja parar no fim", c["seg"]["secao"] == "s5" and c["prox"] and c["prox"]["alvo"]["tipo"] == "parar")
        await asyncio.sleep(5.5)
        e = await estado()
        checar("camada removida depois do fim", len(e["camadas"]) == 0, f"({len(e['camadas'])} camadas)")
        f = await freq(); checar("silêncio depois do fim", f["db"] < -90, f"({f['db']} dB)")

        print("\n== 4. Modo 'seguir a música' a partir da Fase 1")
        await pg.evaluate("TrilhaViva.Trilha.tocarSom(__playlistChefe.sounds.contents[0])")
        t0[0] = time.time() + 0.5
        await esperar_ate(6.0)
        await pg.evaluate("(async()=>{const c=Object.values(game.settings.get('trilha-viva','estado').camadas)[0]; await TrilhaViva.Trilha.mudarModo(c.id,'seguir');})()")
        await esperar_ate(15.5); await ouvir("seguiu para Transição (440 Hz)", 440)
        await esperar_ate(19.5); await ouvir("Transição emendou na Fase final (550 Hz)", 550)
        c = await camada()
        checar("Fase final voltou ao loop dela", c["seg"]["secao"] == "s4" and c["seg"]["modo"] == "secao")

        print("\n== 5. Repetir a música inteira")
        await pg.evaluate("(async()=>{const c=Object.values(game.settings.get('trilha-viva','estado').camadas)[0]; await TrilhaViva.Trilha.mudarModo(c.id,'inteira');})()")
        c = await camada()
        checar("modo inteira agenda continuar depois da seção", c["prox"] and c["prox"]["alvo"]["tipo"] == "continuar", json.dumps(c["prox"]["alvo"]) if c["prox"] else "")
        # Fase final começou ~19.5 s → termina em ~31.5; depois toca Encerramento (660) e volta ao início (220)
        await esperar_ate(33.0); await ouvir("continuou para o Encerramento (660 Hz)", 660)
        await esperar_ate(38.5); await ouvir("voltou ao começo da música (220 Hz)", 220)
        await pg.evaluate("TrilhaViva.pararTudo()")
        await asyncio.sleep(2.5)

        print("\n== 6. Fila com crossfade e repetir a fila")
        await pg.evaluate("TrilhaViva.Trilha.tocarFila([__playlistChefe.sounds.contents[1], __playlistChefe.sounds.contents[2]])")
        t0[0] = time.time() + 0.5
        await esperar_ate(3); await ouvir("primeira da fila (800 Hz)", 800)
        c = await camada()
        checar("fila agenda a próxima com crossfade", c["prox"] and c["prox"]["alvo"]["tipo"] == "faixa" and c["prox"]["fade"] == 1.5)
        await esperar_ate(13.5); await ouvir("segunda da fila (1000 Hz)", 1000)
        await pg.evaluate("(async()=>{const c=Object.values(game.settings.get('trilha-viva','estado').camadas)[0]; await TrilhaViva.Trilha.modoFila(c.id,'fila');})()")
        await esperar_ate(20.0); await ouvir("repetiu a fila: voltou para a primeira (800 Hz)", 800)

        print("\n== 7. Camada de ambiente por cima e pausar/retomar")
        amb = await pg.evaluate("(async()=>{await TrilhaViva.Trilha.tocarSom(game.playlists.contents[1].sounds.contents[0]); return Object.keys(game.settings.get('trilha-viva','estado').camadas).length})()")
        checar("duas camadas ao mesmo tempo", amb == 2, f"({amb})")
        mus = await pg.evaluate("Object.values(game.settings.get('trilha-viva','estado').camadas).find(c=>c.tipo==='musica').id")
        await pg.evaluate(f"TrilhaViva.Trilha.pausar('{mus}')")
        await asyncio.sleep(0.8)
        c = (await estado())["camadas"][mus]
        checar("pausada guarda a posição", c["pausa"] is not None and c["pausa"]["pos"] > 0, json.dumps(c["pausa"]))
        await pg.evaluate(f"TrilhaViva.Trilha.retomar('{mus}')")
        await asyncio.sleep(1.2)
        f = await freq()
        checar("retomou tocando", f["db"] > -80, f"({f['hz']} Hz)")
        await pg.evaluate("TrilhaViva.pararTudo()")
        await asyncio.sleep(2.5)
        e = await estado()
        checar("parar tudo limpou as camadas", len(e["camadas"]) == 0)

        print("\n== 8. Análise do editor (tempo e sugestões)")
        an = await pg.evaluate("""(async()=>{
          const {carregar} = await import('/scripts/audio.mjs');
          const A = await import('/scripts/analise.mjs');
          const buf = await carregar('/tests/audio/chefe.ogg');
          const t = performance.now(); const an = A.analisar(buf); const ms = performance.now()-t;
          return {ms, bpm: an.batidas?.bpm, picos: an.picos.slice(0,6).map(p=>Math.round(p.t*10)/10), sug: A.sugerirCortes(an, buf.duration).map(x=>Math.round(x*10)/10), chefe: A.cortesChefe(an, buf.duration).map(x=>Math.round(x*10)/10)};
        })()""")
        print("   ", an)
        checar("tempo detectado ≈ 120 BPM", an["bpm"] and abs(an["bpm"] - 120) < 3)
        checar("modelo de chefe acha os 4 cortes reais (4, 14, 18, 30)", all(abs(a - b) < 1.6 for a, b in zip(an["chefe"], [4, 14, 18, 30])), str(an["chefe"]))

        print("\nErros no console:", len(erros))
        for e in erros[:10]:
            print("   ", e)
        if erros:
            falhas.append("erros no console")
        await nav.close()
    print("\nRESULTADO:", "TUDO OK" if not falhas else f"{len(falhas)} FALHA(S): {falhas}")

asyncio.run(main())
