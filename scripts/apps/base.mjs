const { ApplicationV2 } = foundry.applications.api;

export const abertas = new Set();

/**
 * Janela base da Trilha Viva: o cabeçalho do mockup vai dentro da barra de título
 * do Foundry (para arrastar e fechar continuarem funcionando).
 */
export class JanelaTV extends ApplicationV2 {
  static DEFAULT_OPTIONS = {
    classes: ["trilha-viva"],
    window: { resizable: true, minimizable: true, icon: false },
    position: { width: 960, height: 680 }
  };

  _interagindo = false;
  _renderPendente = false;

  cabecalho() { return ""; }
  corpo() { return ""; }
  tick() {}
  acao() {}
  mudou() {}
  digitando() {}

  async _renderHTML() {
    return { cab: this.cabecalho(), corpo: this.corpo() };
  }

  _replaceHTML(res, content) {
    const rolagem = {};
    for (const el of content.querySelectorAll("[data-rolagem]")) rolagem[el.dataset.rolagem] = el.scrollTop;
    content.innerHTML = res.corpo;
    for (const el of content.querySelectorAll("[data-rolagem]")) {
      if (rolagem[el.dataset.rolagem]) el.scrollTop = rolagem[el.dataset.rolagem];
    }
    if (this._cab) this._cab.innerHTML = res.cab;
  }

  async _renderFrame(options) {
    const frame = await super._renderFrame(options);
    const header = frame.querySelector(".window-header");
    if (header) {
      this._cab = document.createElement("div");
      this._cab.className = "tv-cab";
      const titulo = header.querySelector(".window-title");
      if (titulo) titulo.after(this._cab); else header.prepend(this._cab);
      // Botões e controles do cabeçalho não podem iniciar o "arrastar janela".
      for (const tipo of ["pointerdown", "mousedown", "dblclick"]) {
        this._cab.addEventListener(tipo, ev => {
          if (ev.target.closest("button, input, select, a, label, [data-acao]")) ev.stopPropagation();
        });
      }
    }
    return frame;
  }

  _onFirstRender(context, options) {
    super._onFirstRender?.(context, options);
    abertas.add(this);
    const el = this.element;
    el.addEventListener("click", ev => {
      const a = ev.target.closest("[data-acao]");
      if (!a || !el.contains(a) || a.disabled) return;
      ev.preventDefault();
      this.acao(a.dataset.acao, a, ev);
    });
    el.addEventListener("change", ev => this.mudou(ev.target, ev));
    el.addEventListener("input", ev => this.digitando(ev.target, ev));
    el.addEventListener("pointerdown", ev => {
      if (!ev.target.matches?.('input[type="range"]')) return;
      this._interagindo = true;
      window.addEventListener("pointerup", () => {
        this._interagindo = false;
        if (this._renderPendente) this.pedirRender();
      }, { once: true });
    });
  }

  _onClose(options) {
    super._onClose?.(options);
    abertas.delete(this);
  }

  pedirRender() {
    if (!this.rendered) return;
    if (this._interagindo) { this._renderPendente = true; return; }
    this._renderPendente = false;
    clearTimeout(this._tRender);
    this._tRender = setTimeout(() => this.render(), 40);
  }

  trazerParaFrente() {
    if (this.minimized) this.maximize?.();
    this.bringToFront?.();
  }
}

/* Ícones (SVG inline, sem depender de fontes de ícones) */
export const ICONE = {
  musica: `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#d9b44a" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>`,
  play: cor => `<svg width="14" height="14" viewBox="0 0 24 24" fill="${cor}" aria-hidden="true"><path d="M7 4l13 8-13 8z"/></svg>`,
  pausa: (cor, t = 14) => `<svg width="${t}" height="${t}" viewBox="0 0 24 24" fill="${cor}" aria-hidden="true"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>`,
  parar: (cor, t = 12) => `<svg width="${t}" height="${t}" viewBox="0 0 24 24" fill="${cor}" aria-hidden="true"><rect x="5" y="5" width="14" height="14" rx="1.5"/></svg>`,
  anterior: `<svg width="16" height="16" viewBox="0 0 24 24" fill="#efe6ff" aria-hidden="true"><path d="M18 5L8 12l10 7zM6 5h2v14H6z"/></svg>`,
  proxima: `<svg width="16" height="16" viewBox="0 0 24 24" fill="#efe6ff" aria-hidden="true"><path d="M6 5l10 7-10 7zM16 5h2v14h-2z"/></svg>`,
  lista: `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#efe6ff" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/></svg>`,
  x: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#b8a6d6" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>`,
  arrastar: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#7d68a3" stroke-width="2" aria-hidden="true"><path d="M4 8h16M4 16h16"/></svg>`,
  repetir: `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#1b0f2b" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M17 2l4 4-4 4"/><path d="M3 11V9a3 3 0 0 1 3-3h15"/><path d="M7 22l-4-4 4-4"/><path d="M21 13v2a3 3 0 0 1-3 3H3"/></svg>`
};
