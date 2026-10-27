import { JanelaTV, ICONE } from "./base.mjs";
import { Trilha, lerEstado, itemAtual, infoCamada, camadaMusica, parando } from "../estado.mjs";
import { MOD, esc, fmtTempo, agora, temSecoes, secoesOrd, novoId, CORES_SECAO } from "../util.mjs";
import { carregar } from "../audio.mjs";
import { analisar, sugerirCortes, grudarBatida, grudarZero } from "../analise.mjs";
import { abrirPainel, abrirSecoes, abrirFila } from "./janelas.mjs";

const MODOS = [
  ["secao", "Repetir esta seção", "Fica em loop até você trocar"],
  ["seguir", "Seguir a música", "Passa para a próxima seção"],
  ["inteira", "Repetir a música inteira", "Toca do começo ao fim, sem seções"]
];

const ICONE_LOOP = cor => `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="${cor}" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M17 2l4 4-4 4"/><path d="M3 11V9a3 3 0 0 1 3-3h15"/><path d="M7 22l-4-4 4-4"/><path d="M21 13v2a3 3 0 0 1-3 3H3"/></svg>`;

/** Divide a música automaticamente e salva as seções na faixa. */
export async function dividirAutomaticamente(som) {
  const buf = await carregar(som.path);
  const dur = buf.duration;
  const an = analisar(buf);
  const cortes = [...new Set(sugerirCortes(an, dur, 30, 10).map(t => {
    let x = an.batidas ? grudarBatida(an, t) : t;
    x = grudarZero(buf, x);
    return Math.round(x * 1000) / 1000;
  }))].filter(t => t > 1 && t < dur - 1).sort((a, b) => a - b);
  const lim = [0, ...cortes, Math.round(dur * 1000) / 1000];
  const secoes = lim.slice(0, -1).map((ini, i) => ({
    id: novoId(), nome: `Parte ${i + 1}`, inicio: ini, termino: lim[i + 1], acao: "next", cor: CORES_SECAO[i % CORES_SECAO.length]
  }));
  if (secoes.length < 2) throw new Error("não achei mudanças claras nesta música");
  await som.setFlag(MOD, "secoes", secoes);
  await Trilha.atualizarSecoes(som.uuid, secoes);
  return secoes;
}

export class JanelaChefe extends JanelaTV {
  static DEFAULT_OPTIONS = {
    id: "trilha-viva-chefe",
    window: { title: "Controle ao vivo" },
    position: { width: 960, height: 680 }
  };

  camadaId = null;

  camada() {
    const e = lerEstado();
    const c = e.camadas?.[this.camadaId];
    if (c?.seg && !parando(c) && c.tipo === "musica") return c;
    const outra = Object.values(e.camadas ?? {}).filter(x => x.seg && !parando(x) && temSecoes(itemAtual(x))).sort((a, b) => b.criado - a.criado)[0]
      ?? camadaMusica(e);
    if (outra) this.camadaId = outra.id;
    return outra ?? null;
  }

  cabecalho() {
    const c = this.camada();
    const item = itemAtual(c);
    return `
      <button type="button" class="tv-link" data-acao="painel">← Painel</button>
      <h1 class="tv-titulo">${esc(item?.nome ?? "Controle ao vivo")}</h1>
      <span class="tv-sub">controle ao vivo · todos os jogadores ouvem em sincronia</span>
      <div class="tv-esp"></div>
      ${c?.fila?.length > 1 ? `<button type="button" class="tv-link" data-acao="fila">Fila</button>` : ""}
      ${item ? `<button type="button" class="tv-link" data-acao="editar">Editar seções</button>` : ""}`;
  }

  corpo() {
    const c = this.camada();
    const item = itemAtual(c);
    if (!c) return `<div class="tv-raiz tv-chefe"><div class="tv-vazio tv-vazio-grande">Nenhuma música tocando.<br>Toque uma música no painel.</div></div>`;
    const inf = infoCamada(c);
    this._secaoVista = inf.S?.id ?? null;
    this._itemVisto = item?.id;

    if (!temSecoes(item)) {
      return `
        <div class="tv-raiz tv-chefe">
          <div class="tv-chefe-topo">
            <div class="tv-blocos" data-tv-blocos>
              <div class="tv-bloco atual" data-acao="buscar" data-tv-bloco="inteira" data-ini="0" data-fim="${inf.dur}" style="flex-grow:1" title="Clique para tocar a partir daqui">
                <div class="tv-bloco-prog" data-tv-secprog></div>
                <span class="tv-bloco-nome" style="color:#d9b44a">Música inteira</span>
                <span class="tv-bloco-info">0:00–${fmtTempo(inf.dur)}</span>
              </div>
              <div class="tv-agulha" data-tv-agulha></div>
            </div>
            <div class="tv-status">
              <span class="tv-suave" data-tv-volta>${this._volta(inf)}</span>
              <div class="tv-esp"></div>
              <span class="tv-suave tv-12">Clique na barra para tocar a partir dali</span>
            </div>
          </div>
          <div class="tv-vazio" style="padding-top:40px">
            Esta música ainda não está dividida em seções.<br>
            Divida para poder repetir só uma parte dela com um clique.
            <div style="display:flex;gap:10px;justify-content:center;margin-top:16px">
              <button type="button" class="tv-btn-ouro tv-btn-alto" data-acao="auto">${this._dividindo ? "Analisando…" : "✦ Dividir automaticamente"}</button>
              <button type="button" class="tv-btn-campo tv-btn-alto" data-acao="editar">Dividir à mão</button>
            </div>
          </div>
        </div>`;
    }

    const secoes = secoesOrd(item);
    const S = inf.S;
    const pedido = c.prox && c.prox.quando !== "auto" ? c.prox : null;
    const naFila = pedido?.seg?.secao ?? null;
    const modoAtual = inf.seg?.secao ? inf.seg.modo : "inteira";

    const blocos = secoes.map(s => {
      const atual = s.id === S?.id;
      const loopOn = atual && modoAtual === "secao" && !c.pausa;
      const loopFila = naFila === s.id && pedido?.seg?.modo === "secao";
      return `
        <div class="tv-bloco ${atual ? "atual" : ""} ${s.id === naFila ? "fila" : ""}" data-acao="buscar" data-tv-bloco="${s.id}" data-ini="${s.inicio}" data-fim="${s.termino}" style="flex-grow:${Math.max(0.5, s.termino - s.inicio).toFixed(2)}" title="Clique para tocar a partir daqui">
          ${atual ? `<div class="tv-bloco-prog" data-tv-secprog></div>` : ""}
          <span class="tv-bloco-nome" style="color:${s.cor}">${esc(s.nome)}</span>
          <span class="tv-bloco-info">${fmtTempo(s.inicio)}–${fmtTempo(s.termino)}${s.acao === "loop" ? " · loop" : ""}</span>
          <button type="button" class="tv-bloco-loop ${loopOn ? "on" : ""} ${loopFila ? "fila" : ""}" data-acao="repetir" data-secao="${s.id}"
            title="${loopOn ? "Parar de repetir (segue a música)" : loopFila ? "Desistir" : atual ? "Repetir esta seção" : "Repetir esta seção (entra no fim da volta)"}"
            aria-label="Repetir ${esc(s.nome)}">${ICONE_LOOP(loopOn ? "#1b0f2b" : loopFila ? "#f0a48d" : "#b8a6d6")}</button>
        </div>`;
    }).join("");

    const cards = secoes.filter(s => s.id !== S?.id).map(s => {
      const idx = secoes.indexOf(s);
      const prox = secoes[idx + 1];
      const info = s.acao === "loop" && !c.livre ? "loop" : s.acao === "stop" ? "para no fim" : prox ? `segue p/ ${esc(prox.nome)}` : "fim da música";
      return `
        <div class="tv-sec-card ${s.id === naFila ? "fila" : ""}">
          <div class="tv-sec-topo">
            <span class="tv-quadrado" style="background:${s.cor}"></span>
            <span class="tv-sec-nome">${esc(s.nome)}</span>
            <span class="tv-sec-info">${info}</span>
          </div>
          <div class="tv-sec-botoes">
            <button type="button" class="tv-btn-ouro tv-btn-alto" data-acao="volta" data-secao="${s.id}">No fim da volta</button>
            <button type="button" class="tv-btn-campo tv-btn-alto" data-acao="agora" data-secao="${s.id}">Agora (crossfade)</button>
          </div>
        </div>`;
    }).join("");

    const modos = MODOS.map(([k, nome, desc]) => `
      <button type="button" class="tv-opcao ${modoAtual === k ? "on" : ""}" data-acao="modo" data-modo="${k}">
        <span class="tv-opcao-nome">${nome}</span><span class="tv-opcao-desc">${desc}</span>
      </button>`).join("");
    const cf = c.crossfade ?? 1.5;

    return `
      <div class="tv-raiz tv-chefe">
        <div class="tv-chefe-topo">
          <div class="tv-blocos" data-tv-blocos>${blocos}<div class="tv-agulha" data-tv-agulha></div></div>
          <div class="tv-status">
            <span class="tv-pill-ouro">${modoAtual === "seguir" || c.pausa ? ICONE.play("#1b0f2b") : ICONE.repetir}<span data-tv-status>${this._status(c, inf)}</span></span>
            <span class="tv-suave" data-tv-volta>${this._volta(inf)}</span>
            <div class="tv-esp"></div>
            ${c.prox ? `<span class="${pedido ? "tv-pill-fila" : "tv-pill-auto"}" data-tv-prox>${this._prox(c)}</span>` : `<span class="tv-suave tv-12">Clique na barra para tocar dali · ${ICONE_LOOP("#b8a6d6")} repete a seção</span>`}
            ${pedido ? `<button type="button" class="tv-link tv-link-suave" data-acao="cancelar">cancelar</button>` : ""}
          </div>
        </div>
        <div class="tv-chefe-corpo">
          <section class="tv-chefe-secoes" aria-label="Escolher a próxima seção" data-rolagem="secoes">
            <h2 class="tv-h3">Tocar qual seção?</h2>
            <div class="tv-sec-grade">${cards}</div>
          </section>
          <aside class="tv-chefe-lado" aria-label="Modo de repetição">
            <h2 class="tv-h3">Ao chegar no fim da seção</h2>
            ${modos}
            <label class="tv-linha-check tv-direto" title="As seções marcadas como loop no editor passam a só seguir a música">
              <input type="checkbox" class="tv-check" data-campo="direto" ${c.livre ? "checked" : ""}>Tocar direto (ignorar loops salvos)
            </label>
            <div class="tv-esp-v"></div>
            <label class="tv-cf">Crossfade
              <input type="range" min="0" max="5" step="0.5" value="${cf}" data-campo="crossfade" aria-label="Duração do crossfade">
              <span data-tv-cf>${String(cf).replace(".", ",")} s</span>
            </label>
            <div class="tv-chefe-botoes">
              <button type="button" class="tv-btn-campo tv-btn-grande" data-acao="${c.pausa ? "retomar" : "pausar"}">${c.pausa ? "Retomar" : "Pausar"}</button>
              <button type="button" class="tv-btn-perigo tv-btn-grande" data-acao="parar">Parar com fade</button>
            </div>
          </aside>
        </div>
      </div>`;
  }

  _status(c, inf) {
    const S = inf.S;
    if (c.pausa) return `Pausada${S ? ` em ${esc(S.nome)}` : ""}`;
    if (inf.seg?.secao && S) {
      if (inf.seg.modo === "secao") return `${esc(S.nome)} em loop · ${inf.volta}ª volta`;
      if (inf.seg.modo === "inteira") return `${esc(S.nome)} · depois a música inteira`;
      return `${esc(S.nome)} · tocando`;
    }
    if (inf.seg?.modo === "inteira") return `Música inteira em loop · ${inf.volta}ª volta`;
    return S ? `${esc(S.nome)} · tocando` : "Tocando";
  }

  _volta(inf) {
    const S = inf.S;
    if (inf.seg?.secao && S) return `${fmtTempo(inf.pos - S.inicio)} de ${fmtTempo(S.termino - S.inicio)} nesta volta`;
    return `${fmtTempo(inf.pos)} de ${fmtTempo(inf.dur)}`;
  }

  _prox(c) {
    const p = c.prox;
    const falta = fmtTempo(Math.max(0, (p.em - agora()) / 1000));
    const item = itemAtual(c);
    const nome = p.seg?.secao ? secoesOrd(item).find(s => s.id === p.seg.secao)?.nome : null;
    const loop = p.seg?.modo === "secao" ? " e repete" : "";
    if (p.alvo?.tipo === "ir") return "Pulando…";
    if (p.quando === "volta") return `Na fila: ${esc(nome ?? "—")}${loop} · entra no fim desta volta (em ${falta})`;
    if (p.quando === "agora") return `Na fila: ${esc(nome ?? "—")} · entrando agora`;
    if (!p.seg) return `Depois: fim da música (em ${falta})`;
    if (p.alvo?.tipo === "continuar") return `Depois: música inteira (em ${falta})`;
    if (nome && p.seg.itemId === item?.id) return `Depois: ${esc(nome)} (em ${falta})`;
    return `Depois: próxima faixa (em ${falta})`;
  }

  tick() {
    if (!this.rendered) return;
    const c = this.camada();
    if (!c) return;
    const inf = infoCamada(c);
    if ((inf.S?.id ?? null) !== this._secaoVista || inf.item?.id !== this._itemVisto) return this.pedirRender();
    const el = this.element;
    const blocoAtual = el.querySelector(`[data-tv-bloco="${inf.S?.id ?? "inteira"}"]`);
    const ini = inf.S && temSecoes(inf.item) ? inf.S.inicio : 0;
    const fim = inf.S && temSecoes(inf.item) ? inf.S.termino : inf.dur;
    const frac = Math.max(0, Math.min(1, (inf.pos - ini) / Math.max(0.01, fim - ini)));
    const prog = el.querySelector("[data-tv-secprog]");
    if (prog) prog.style.width = `${frac * 100}%`;
    const agulha = el.querySelector("[data-tv-agulha]");
    if (agulha && blocoAtual) agulha.style.left = `${blocoAtual.offsetLeft + frac * blocoAtual.offsetWidth}px`;
    const st = el.querySelector("[data-tv-status]");
    if (st) { const t = this._status(c, inf); if (st.innerHTML !== t) st.innerHTML = t; }
    const vo = el.querySelector("[data-tv-volta]");
    if (vo) vo.textContent = this._volta(inf);
    const px = el.querySelector("[data-tv-prox]");
    if (px && c.prox) { const t = this._prox(c); if (px.innerHTML !== t) px.innerHTML = t; }
  }

  async acao(nome, el, ev) {
    if (nome === "painel") return abrirPainel();
    if (nome === "fila") return abrirFila();
    const c = this.camada();
    const som = itemAtual(c) && fromUuidSync(itemAtual(c).uuid);
    if (nome === "editar") {
      if (som) abrirSecoes(som); else ui.notifications.warn("Não achei esta faixa nas playlists.");
      return;
    }
    if (!c) return;
    switch (nome) {
      case "buscar": {
        const r = el.getBoundingClientRect();
        const ini = Number(el.dataset.ini), fim = Number(el.dataset.fim);
        const frac = Math.max(0, Math.min(1, (ev.clientX - r.left) / r.width));
        return Trilha.irPara(c.id, ini + frac * (fim - ini));
      }
      case "repetir": return Trilha.repetirSecao(c.id, el.dataset.secao);
      case "volta": return Trilha.irParaSecao(c.id, el.dataset.secao, "volta");
      case "agora": return Trilha.irParaSecao(c.id, el.dataset.secao, "agora");
      case "cancelar": return Trilha.cancelarPendente(c.id);
      case "modo": return Trilha.mudarModo(c.id, el.dataset.modo);
      case "pausar": return Trilha.pausar(c.id);
      case "retomar": return Trilha.retomar(c.id);
      case "parar": return Trilha.pararCamada(c.id, 2.5);
      case "auto": {
        if (!som || this._dividindo) return;
        this._dividindo = true;
        this.render();
        try {
          const ss = await dividirAutomaticamente(som);
          ui.notifications.info(`Música dividida em ${ss.length} partes. Use o botão de repetir de cada parte.`);
        } catch (err) {
          ui.notifications.warn(`Não deu para dividir: ${err.message ?? err}`);
        }
        this._dividindo = false;
        return this.render();
      }
    }
  }

  digitando(el) {
    if (el.dataset.campo !== "crossfade") return;
    const s = this.element.querySelector("[data-tv-cf]");
    if (s) s.textContent = `${String(Number(el.value)).replace(".", ",")} s`;
  }

  mudou(el) {
    const c = this.camada();
    if (!c) return;
    if (el.dataset.campo === "crossfade") return Trilha.definirCrossfade(c.id, Number(el.value));
    if (el.dataset.campo === "direto") return Trilha.tocarDireto(c.id, el.checked);
  }
}
