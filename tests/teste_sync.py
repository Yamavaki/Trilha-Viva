"""Mestre e jogador em abas separadas: o jogador entra no meio e precisa ouvir a mesma seção, no mesmo tempo."""
import asyncio, time
from playwright.async_api import async_playwright
falhas = []
def checar(n, c, x=""):
    print(("  OK   " if c else "  FALHA") + f" {n} {x}")
    if not c: falhas.append(n)
async def main():
    async with async_playwright() as p:
        nav = await p.chromium.launch(args=["--autoplay-policy=no-user-gesture-required"])
        ctx = await nav.new_context()
        gm = await ctx.new_page()
        erros = []
        for pg, nome in ((gm, "GM"),):
            pg.on("pageerror", lambda e, n=nome: erros.append(f"{n}: {e}"))
        await gm.goto("http://127.0.0.1:8765/tests/index.html"); await gm.wait_for_function("window.__pronto === true")
        await gm.evaluate("TrilhaViva.Trilha.tocarSom(__playlistChefe.sounds.contents[0])")
        t0 = time.time() + 0.5
        await asyncio.sleep(7)
        jog = await ctx.new_page()
        jog.on("pageerror", lambda e: erros.append(f"JOG: {e}"))
        await jog.goto("http://127.0.0.1:8765/tests/index.html?jogador=1"); await jog.wait_for_function("window.__pronto === true")
        await asyncio.sleep(2)
        # posição de reprodução nos dois: comparar via estado + relógio do contexto de áudio
        pos = """(() => { const m = window.__motor; const v=[...m.vivos.values()][0]; if(!v||!v.atual) return null;
           const ctx=v.atual.voz.ctx; return {seg: v.atual.seg.secao, e: ctx.currentTime - v.atual.ancora, ok: !!v.atual}; })()"""
        await gm.evaluate("import('/scripts/motor.mjs').then(m=>window.__motor=m.motor)")
        await jog.evaluate("import('/scripts/motor.mjs').then(m=>window.__motor=m.motor)")
        await asyncio.sleep(0.3)
        a, b = await asyncio.gather(gm.evaluate(pos), jog.evaluate(pos))
        print("   GM", a, "| JOG", b)
        f1, f2 = await asyncio.gather(gm.evaluate("__freq()"), jog.evaluate("__freq()"))
        checar("jogador que entrou no meio ouve a Fase 1", abs(f2["hz"] - 330) < 25 and abs(f1["hz"] - 330) < 25, f"(GM {f1['hz']} Hz, jogador {f2['hz']} Hz)")
        checar("mesmo ponto da música (diferença < 60 ms)", a and b and abs(a["e"] - b["e"]) < 0.06, f"({abs(a['e']-b['e'])*1000:.0f} ms)" if a and b else "")
        await gm.evaluate("(async()=>{const c=Object.values(game.settings.get('trilha-viva','estado').camadas)[0]; await TrilhaViva.Trilha.irParaSecao(c.id,'s4','volta');})()")
        em = await gm.evaluate("Object.values(game.settings.get('trilha-viva','estado').camadas)[0].prox.em")
        await asyncio.sleep(max(0, em/1000 - time.time() + 1.0))
        f1, f2 = await asyncio.gather(gm.evaluate("__freq()"), jog.evaluate("__freq()"))
        checar("os dois trocaram para a Fase final juntos", abs(f1["hz"] - 550) < 25 and abs(f2["hz"] - 550) < 25, f"(GM {f1['hz']} Hz, jogador {f2['hz']} Hz)")
        a, b = await asyncio.gather(gm.evaluate(pos), jog.evaluate(pos))
        checar("continuam alinhados depois da troca", a and b and a["seg"] == b["seg"] == "s4" and abs(a["e"] - b["e"]) < 0.06, f"({abs(a['e']-b['e'])*1000:.0f} ms)" if a and b else "")
        sj = await jog.evaluate("game.settings.get('trilha-viva','estado').rev")
        sg = await gm.evaluate("game.settings.get('trilha-viva','estado').rev")
        checar("jogador recebe o mesmo estado", sj == sg, f"(rev {sg}/{sj})")
        await gm.evaluate("TrilhaViva.pararTudo()")
        await asyncio.sleep(2.5)
        f2 = await jog.evaluate("__freq()")
        checar("parar tudo silencia o jogador", f2["db"] < -90, f"({f2['db']} dB)")
        checar("sem erros", not erros, str(erros))
        await nav.close()
    print("\nRESULTADO:", "TUDO OK" if not falhas else f"FALHAS: {falhas}")
asyncio.run(main())
