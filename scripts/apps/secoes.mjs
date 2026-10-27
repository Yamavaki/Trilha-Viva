import { JanelaTV } from "./base.mjs";
import { Trilha } from "../estado.mjs";
import { MOD, ACOES, CORES_SECAO, esc, fmtTempo, fmtCorte, parseTempo, novoId, proximaCor, posDoSeg, LIMITE_BUFFER } from "../util.mjs";
import { carregar, duracao, contexto, saidaDe } from "../audio.mjs";
import { analisar, sugerirCortes, cortesChefe, grudarBatida, grudarZero } from "../analise.mjs";

const MIN_SECAO = 0.25;

const MODELO_CHEFE = [
  ["Introdução", "next"],
  ["Fase 1", "loop"],
  ["Transição", "next"],
  ["Fase final", "loop"],
  ["Encerramento", "stop"]
];

export const editoresAbertos = new Set();

export class EditorSecoes extends JanelaTV {
  static DEFAULT_OPTIONS = {
    window: { title: "Seções da música" },
    position: { width: 960, height: 680 }
  };

  constructor(som, options = {}) {
    super({ id: `trilha-viva-secoes-${som.id}`, ...options });
    this.som = som;
    this.secoes = foundry.utils.deepClone(som.getFlag(MOD, "secoes") ?? []);
    this.carregando = true;
    this.cursor = 0;
    this.grudar = true;
    this.alterado = false;
    editoresAbertos.add(this);
    this._carregar();
  }

  get src() { return this.som.path; }

  async _carregar() {
    try {
      const d = await duracao(this.som.path);
      if (d > LIMITE_BUFFER) throw new Error(`este arquivo tem ${fmtTempo(d)}; seções funcionam em arquivos de até ${LIMITE_BUFFER / 60} minutos`);
      this.buf = await carregar(this.som.path);
      this.dur = this.buf.duration;
      await new Promise(r => setTimeout(r, 30));
      this.analise = analisar(this.buf);
      if (!this.analise.batidas) this.grudar = false;
      this._normalizar();
    } catch (err) {
      console.error("Trilha Viva |", err);
      this.erro = err.message ?? String(err);
    }
    this.carregando = false;
    if (this.rendered) this.render();
  }

  /** Mantém as seções lado a lado cobrindo a música toda. */
  _normalizar() {
    const dur = this.dur;
    let ss = this.secoes.filter(s => Number.isFinite(s.inicio)).sort((a, b) => a.inicio - b.inicio);
    if (!ss.length) ss = [{ id: novoId(), nome: "Música inteira", inicio: 0, termino: dur, acao: "next", cor: CORES_SECAO[0] }];
    ss[0].inicio = 0;
    for (let i = 0; i < ss.length; i++) {
      ss[i].termino = i < ss.length - 1 ? ss[i + 1].inicio : dur;
      ss[i].id ??= novoId();
      ss[i].nome ||= `Parte ${i + 1}`;
      ss[i].acao = ACOES[ss[i].acao] ? ss[i].acao : "next";
      ss[i].cor ||= CORES_SECAO[i % CORES_SECAO.length];
    }
    ss = ss.filter((s, i) => i === 0 || s.termino - s.inicio >= MIN_SECAO * 0.99 || i === ss.length - 1);
    for (let i = 0; i < ss.length; i++) ss[i].termino = i < ss.length - 1 ? ss[i + 1].inicio : dur;
    this.secoes = ss;
  }

  _ajustar(t) {
    let x = t;
    if (this.grudar && this.analise?.batidas) x = grudarBatida(this.analise, x);
    if (this.buf) x = grudarZero(this.buf, x);
    return x;
  }

  _aplicarCortes(cortes, modelo = null) {
    const dur = this.dur;
    const cs = [...new Set(cortes.map(t => Math.round(this._ajustar(t) * 1000) / 1000))]
      .filter(t => t > MIN_SECAO && t < dur - MIN_SECAO).sort((a, b) => a - b);
    const lim = [0, ...cs, dur];
    this.secoes = lim.slice(0, -1).map((ini, i) => {
      const m = modelo?.[i];
      return { id: novoId(), nome: m?.[0] ?? `Parte ${i + 1}`, inicio: ini, termino: lim[i + 1], acao: m?.[1] ?? "next", cor: CORES_SECAO[i % CORES_SECAO.length] };
    });
    this.alterado = true;
  }

  cabecalho() {
    return `
      <h1 class="tv-titulo">Seções da música</h1>
      <span class="tv-cab-nome">${esc(this.som.name)}</span>
      <span class="tv-sub">${this.dur ? fmtTempo(this.dur) : ""}</span>
      <div class="tv-esp"></div>
      <button type="button" class="tv-btn-ouro" data-acao="salvar" ${this.buf ? "" : "disabled"}>Salvar seções${this.alterado ? " •" : ""}</button>`;
  }

  corpo() {
    if (this.carregando) return `<div class="tv-raiz tv-editor"><div class="tv-vazio tv-vazio-grande">Carregando e analisando a música…</div></div>`;
    if (this.erro) return `<div class="tv-raiz tv-editor"><div class="tv-vazio tv-vazio-grande">Não deu para abrir esta faixa:<br>${esc(this.erro)}</div></div>`;
    const dur = this.dur;
    const pc = t => `${((t / dur) * 100).toFixed(3)}%`;
    const rotulos = this.secoes.map(s => `<div class="tv-ed-rotulo" style="left:${pc(s.inicio)};width:${pc(s.termino - s.inicio)};color:${s.cor}">${esc(s.nome)}</div>`).join("");
    const cortes = this.secoes.slice(1).map((s, i) => `<div class="tv-ed-corte" data-tv-corte="${i}" style="left:${pc(s.inicio)};--cor:${s.cor}" title="Arraste para ajustar"></div>`).join("");
    const bpm = this.analise?.batidas?.bpm;
    const tempos = [0, 0.25, 0.5, 0.75, 1].map(f => `<span>${fmtTempo(dur * f)}</span>`).join("");
    const ultima = this.secoes.length - 1;
    const linhas = this.secoes.map((s, i) => `
      <div class="tv-ed-linha">
        <button type="button" class="tv-ed-cor" style="background:${s.cor}" data-acao="ouvirSecao" data-i="${i}" title="Ouvir esta seção em loop" aria-label="Ouvir ${esc(s.nome)} em loop"></button>
        <input type="text" class="tv-input" data-campo="nome" data-i="${i}" value="${esc(s.nome)}" aria-label="Nome da seção">
        <input type="text" class="tv-input" data-campo="inicio" data-i="${i}" value="${fmtCorte(s.inicio)}" aria-label="Início" ${i === 0 ? "disabled" : ""}>
        <input type="text" class="tv-input" data-campo="termino" data-i="${i}" value="${fmtCorte(s.termino)}" aria-label="Fim" ${i === ultima ? "disabled" : ""}>
        <label class="tv-ed-loop"><input type="checkbox" class="tv-check" data-campo="loop" data-i="${i}" ${s.acao === "loop" ? "checked" : ""}>em loop</label>
        <select class="tv-select" data-campo="acao" data-i="${i}" aria-label="Ao terminar">
          ${Object.entries(ACOES).map(([k, r]) => `<option value="${k}" ${s.acao === k ? "selected" : ""}>${r}</option>`).join("")}
        </select>
        <button type="button" class="tv-x" data-acao="remover" data-i="${i}" title="Juntar com a seção vizinha" aria-label="Remover seção" ${this.secoes.length < 2 ? "disabled" : ""}>×</button>
      </div>`).join("");
    const tocando = !!this._previa;

    return `
      <div class="tv-raiz tv-editor">
        <div class="tv-ed-topo">
          <div class="tv-ed-rotulos">${rotulos}</div>
          <div class="tv-ed-onda" data-tv-onda title="Clique para tocar a partir daqui">
            <canvas class="tv-ed-desenho" aria-hidden="true"></canvas>
            ${cortes}
            <div class="tv-ed-cursor" style="left:${pc(this.cursor)}"></div>
          </div>
          <div class="tv-ed-tempos">${tempos}</div>
          <div class="tv-ed-ferramentas">
            <button type="button" class="tv-btn-campo tv-ed-ouvir" data-acao="ouvir">${tocando ? "❚❚ Parar" : "▶ Ouvir daqui"}</button>
            <button type="button" class="tv-btn-contorno" data-acao="marcar"><span>+ Marcar corte aqui (<span class="tv-ed-rotulo-cursor">${fmtCorte(this.cursor)}</span>)</span></button>
            <button type="button" class="tv-btn-campo" data-acao="sugerir" title="Analisa a música e propõe onde ela muda">✦ Sugerir cortes</button>
            <button type="button" class="tv-btn-campo" data-acao="modelo" title="Introdução, Fase 1, Transição, Fase final e Encerramento">Modelo: música de chefe</button>
            <button type="button" class="tv-pilula ${this.grudar ? "on" : ""}" data-acao="grudar" ${bpm ? "" : "disabled"}>${bpm ? `Grudar no tempo (≈ ${Math.round(bpm)} BPM)` : "Tempo não detectado"}</button>
          </div>
          <div class="tv-ed-dica">Arraste as bordas coloridas para ajustar. Os cortes "grudam" no tempo mais próximo para a emenda não pular. Clique no quadradinho colorido para ouvir a seção em loop.</div>
        </div>
        <section class="tv-ed-lista" aria-label="Lista de seções" data-rolagem="lista">
          <div class="tv-ed-cabecalho"><span></span><span>Seção</span><span>Início</span><span>Fim</span><span>Repetir</span><span>Ao terminar</span><span></span></div>
          ${linhas}
        </section>
      </div>`;
  }

  _onRender(context, options) {
    super._onRender?.(context, options);
    const onda = this.element.querySelector(".tv-ed-onda");
    this._ref = onda ? {
      onda,
      desenho: onda.querySelector("canvas.tv-ed-desenho"),
      cursor: onda.querySelector(".tv-ed-cursor"),
      rotulo: this.element.querySelector(".tv-ed-rotulo-cursor")
    } : null;
    if (!onda) return;
    this._desenhar();
    this._obs?.disconnect();
    this._obs = new ResizeObserver(() => this._desenhar());
    this._obs.observe(onda);
    onda.addEventListener("pointerdown", ev => this._pointerOnda(ev));
  }

  _desenhar() {
    const onda = this._ref?.onda;
    const cv = this._ref?.desenho;
    if (!cv || !this.analise) return;
    const w = onda.clientWidth, h = onda.clientHeight;
    if (!w || !h) return;
    const dpr = window.devicePixelRatio || 1;
    cv.width = Math.round(w * dpr);
    cv.height = Math.round(h * dpr);
    const g = cv.getContext("2d");
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, w, h);
    const dur = this.dur;
    for (const s of this.secoes) {
      const x0 = (s.inicio / dur) * w, x1 = (s.termino / dur) * w;
      g.fillStyle = `${s.cor}22`;
      g.fillRect(x0, 0, x1 - x0, h);
      g.fillStyle = s.cor;
      g.fillRect(x0, 0, 2, h);
    }
    const ax = 6, ay = 10, aw = w - 12, ah = h - 20;
    const passo = 8, gap = 2;
    const n = Math.max(8, Math.floor((aw + gap) / passo));
    const bw = (aw - (n - 1) * gap) / n;
    const onda2 = this.analise.onda, NB = onda2.length;
    for (let i = 0; i < n; i++) {
      const b0 = Math.floor((i / n) * NB), b1 = Math.max(b0 + 1, Math.floor(((i + 1) / n) * NB));
      let m = 0;
      for (let b = b0; b < b1; b++) m += onda2[b];
      m /= (b1 - b0);
      const alt = Math.max(0.08, Math.min(1, m)) * ah;
      const t = ((i + 0.5) / n) * dur;
      const s = this.secoes.find(x => t >= x.inicio && t < x.termino) ?? this.secoes.at(-1);
      g.fillStyle = s.cor;
      g.fillRect(ax + i * (bw + gap), ay + (ah - alt) / 2, bw, alt);
    }
  }

  _atualizarPosicoes() {
    const el = this.element;
    if (!el) return;
    const dur = this.dur;
    const pc = t => `${((t / dur) * 100).toFixed(3)}%`;
    el.querySelectorAll(".tv-ed-rotulo").forEach((r, i) => {
      const s = this.secoes[i];
      if (!s) return;
      r.style.left = pc(s.inicio);
      r.style.width = pc(s.termino - s.inicio);
    });
    el.querySelectorAll(".tv-ed-corte").forEach((c, i) => { const s = this.secoes[i + 1]; if (s) c.style.left = pc(s.inicio); });
    el.querySelectorAll('[data-campo="inicio"]').forEach(inp => { inp.value = fmtCorte(this.secoes[Number(inp.dataset.i)]?.inicio); });
    el.querySelectorAll('[data-campo="termino"]').forEach(inp => { inp.value = fmtCorte(this.secoes[Number(inp.dataset.i)]?.termino); });
    this._desenhar();
  }

  _moverCorte(i, t) {
    const a = this.secoes[i], b = this.secoes[i + 1];
    if (!a || !b) return;
    t = Math.max(a.inicio + MIN_SECAO, Math.min(b.termino - MIN_SECAO, t));
    a.termino = t;
    b.inicio = t;
    this.alterado = true;
  }

  _pointerOnda(ev) {
    if (ev.button !== 0) return;
    const onda = ev.currentTarget;
    const rect = onda.getBoundingClientRect();
    const tempoEm = x => Math.max(0, Math.min(this.dur, ((x - rect.left) / rect.width) * this.dur));
    const corte = ev.target.closest(".tv-ed-corte");
    if (corte) {
      ev.preventDefault();
      const i = Number(corte.dataset.tvCorte);
      let ultimo = this.secoes[i + 1].inicio;
      const mover = e => { ultimo = tempoEm(e.clientX); this._moverCorte(i, ultimo); this._atualizarPosicoes(); };
      const soltar = () => {
        window.removeEventListener("pointermove", mover);
        this._moverCorte(i, this._ajustar(this.secoes[i + 1].inicio));
        this.render();
      };
      window.addEventListener("pointermove", mover);
      window.addEventListener("pointerup", soltar, { once: true });
      return;
    }
    // Clique na onda: passa a tocar dali
    this.cursor = tempoEm(ev.clientX);
    const tocava = !!this._previa;
    this._ouvir(this.cursor);
    this._atualizarCursor();
    if (!tocava) this._atualizarBotaoOuvir();
  }

  _atualizarCursor() {
    const el = this.element;
    if (!el || !this.dur) return;
    const r = this._ref;
    if (r?.cursor) r.cursor.style.left = `${(this.cursor / this.dur) * 100}%`;
    if (r?.rotulo) r.rotulo.textContent = fmtCorte(this.cursor);
  }

  /* ---------- prévia local (só o Mestre ouve) ---------- */

  _ouvir(de, loop = null) {
    this._pararPrevia();
    const ctx = contexto("musica");
    const src = ctx.createBufferSource();
    src.buffer = this.buf;
    const g = ctx.createGain();
    g.gain.value = 0.8;
    src.connect(g).connect(saidaDe(ctx));
    if (loop) { src.loop = true; src.loopStart = loop[0]; src.loopEnd = loop[1]; }
    const t0 = ctx.currentTime + 0.03;
    src.start(t0, de);
    const previa = { src, g, ctx, t0, de, loop };
    src.onended = () => {
      if (this._previa === previa) { this._previa = null; this._atualizarBotaoOuvir(); }
    };
    this._previa = previa;
    const quadro = () => {
      if (this._previa !== previa) return;
      const e = ctx.currentTime - t0;
      const seg = { offset: de, loopIni: loop?.[0] ?? 0, loopFim: loop?.[1] ?? this.dur };
      this.cursor = loop ? posDoSeg(seg, e, this.dur).pos : Math.min(this.dur, de + Math.max(0, e));
      this._atualizarCursor();
      requestAnimationFrame(quadro);
    };
    requestAnimationFrame(quadro);
  }

  _atualizarBotaoOuvir() {
    const b = this.element?.querySelector(".tv-ed-ouvir");
    if (b) b.textContent = this._previa ? "❚❚ Parar" : "▶ Ouvir daqui";
  }

  _pararPrevia() {
    const p = this._previa;
    this._previa = null;
    if (!p) return;
    try { p.src.stop(); p.src.disconnect(); p.g.disconnect(); } catch { /* ok */ }
  }

  async acao(nome, el) {
    const i = Number(el.dataset.i);
    switch (nome) {
      case "ouvir":
        if (this._previa) this._pararPrevia(); else this._ouvir(this.cursor >= this.dur - 0.1 ? 0 : this.cursor);
        return this._atualizarBotaoOuvir();
      case "ouvirSecao": {
        const s = this.secoes[i];
        if (!s) return;
        this._ouvir(s.inicio, [s.inicio, s.termino]);
        return this._atualizarBotaoOuvir();
      }
      case "marcar": return this._marcar();
      case "sugerir": {
        if (this.secoes.length > 1 && !(await this._confirmar("Trocar as seções atuais pelos cortes sugeridos?"))) return;
        this._aplicarCortes(sugerirCortes(this.analise, this.dur));
        return this.render();
      }
      case "modelo": {
        if (this.secoes.length > 1 && !(await this._confirmar("Trocar as seções atuais pelo modelo de música de chefe?"))) return;
        this._aplicarCortes(cortesChefe(this.analise, this.dur), MODELO_CHEFE);
        return this.render();
      }
      case "grudar": this.grudar = !this.grudar; return this.render();
      case "remover": return this._remover(i);
      case "salvar": return this._salvar();
    }
  }

  _marcar() {
    const t = this._ajustar(this.cursor);
    const k = this.secoes.findIndex(s => t > s.inicio + MIN_SECAO && t < s.termino - MIN_SECAO);
    if (k < 0) return ui.notifications.warn("Muito perto de um corte que já existe.");
    const s = this.secoes[k];
    const nova = { id: novoId(), nome: "Nova seção", inicio: t, termino: s.termino, acao: s.acao === "stop" ? "stop" : "next", cor: proximaCor(this.secoes.map(x => x.cor)) };
    if (s.acao === "stop") s.acao = "next";
    s.termino = t;
    this.secoes.splice(k + 1, 0, nova);
    this.alterado = true;
    this.render();
  }

  _remover(i) {
    if (this.secoes.length < 2) return;
    if (i > 0) this.secoes[i - 1].termino = this.secoes[i].termino;
    else this.secoes[1].inicio = 0;
    this.secoes.splice(i, 1);
    this.alterado = true;
    this.render();
  }

  mudou(el) {
    const i = Number(el.dataset.i);
    const s = this.secoes[i];
    if (!s) return;
    switch (el.dataset.campo) {
      case "nome": s.nome = el.value.trim() || s.nome; this.alterado = true; return this.render();
      case "inicio":
      case "termino": {
        const t = parseTempo(el.value);
        if (!Number.isFinite(t)) { ui.notifications.warn("Use o formato minutos:segundos, ex.: 1:02 ou 1:02.5"); return this.render(); }
        this._moverCorte(el.dataset.campo === "inicio" ? i - 1 : i, t);
        return this.render();
      }
      case "loop": s.acao = el.checked ? "loop" : "next"; this.alterado = true; return this.render();
      case "acao": s.acao = el.value; this.alterado = true; return this.render();
    }
  }

  async _confirmar(texto) {
    return foundry.applications.api.DialogV2.confirm({ window: { title: "Seções" }, content: `<p>${esc(texto)}</p>` });
  }

  async _salvar() {
    const limpas = this.secoes.map(s => ({
      id: s.id, nome: s.nome, cor: s.cor, acao: s.acao,
      inicio: Math.round(s.inicio * 1000) / 1000, termino: Math.round(s.termino * 1000) / 1000
    }));
    if (limpas.length <= 1) await this.som.unsetFlag(MOD, "secoes");
    else await this.som.setFlag(MOD, "secoes", limpas);
    await Trilha.atualizarSecoes(this.som.uuid, limpas.length <= 1 ? [] : limpas);
    this.alterado = false;
    ui.notifications.info(limpas.length <= 1 ? "Seções removidas: a faixa toca inteira." : `${limpas.length} seções salvas em "${this.som.name}".`);
    this.render();
  }

  _onClose(options) {
    super._onClose(options);
    this._pararPrevia();
    this._obs?.disconnect();
    editoresAbertos.delete(this);
  }
}
