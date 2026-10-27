// Foundry VTT simulado, só o necessário para rodar a Trilha Viva num navegador comum.
(() => {
  const isObj = v => v && typeof v === "object" && !Array.isArray(v);
  function merge(a, b) {
    const out = { ...a };
    for (const [k, v] of Object.entries(b ?? {})) {
      if (k === "classes" && Array.isArray(v)) out[k] = [...new Set([...(out[k] ?? []), ...v])];
      else if (isObj(v) && isObj(out[k])) out[k] = merge(out[k], v);
      else out[k] = v;
    }
    return out;
  }
  let z = 100;
  class ApplicationV2 {
    static DEFAULT_OPTIONS = { classes: [], window: {}, position: {} };
    constructor(options = {}) {
      const chain = [];
      let c = this.constructor;
      while (c && c !== Function.prototype) {
        if (Object.prototype.hasOwnProperty.call(c, "DEFAULT_OPTIONS")) chain.unshift(c.DEFAULT_OPTIONS);
        c = Object.getPrototypeOf(c);
      }
      this.options = [...chain, options].reduce((acc, o) => merge(acc, o), {});
      this.rendered = false;
      this.minimized = false;
    }
    get id() { return this.options.id ?? (this._id ??= "app-" + Math.random().toString(36).slice(2)); }
    async _renderFrame() {
      const el = document.createElement("div");
      el.className = "application themed theme-dark " + (this.options.classes ?? []).join(" ");
      el.id = this.id;
      el.innerHTML = `<header class="window-header"><i class="window-icon"></i><h1 class="window-title">${this.options.window?.title ?? ""}</h1><button type="button" class="header-control icon" data-action="close">✕</button></header><section class="window-content"></section>`;
      return el;
    }
    async render() {
      const first = !this.rendered;
      if (first) {
        this.element = await this._renderFrame();
        document.body.append(this.element);
        const p = this.options.position ?? {};
        Object.assign(this.element.style, { position: "absolute", left: (window.__proxPos ?? 20) + "px", top: "20px", width: (p.width ?? 600) + "px", height: (p.height ?? 400) + "px", display: "flex", flexDirection: "column", zIndex: ++z });
        this.window = { header: this.element.querySelector(".window-header"), content: this.element.querySelector(".window-content") };
        this.element.querySelector("[data-action=close]").onclick = () => this.close();
      }
      const res = await this._renderHTML({}, {});
      this._replaceHTML(res, this.window.content, {});
      this.rendered = true;
      if (first) this._onFirstRender({}, {});
      this._onRender({}, {});
      return this;
    }
    _onFirstRender() {}
    _onRender() {}
    _onClose() {}
    async close() { this.element.remove(); this.rendered = false; this._onClose({}); }
    bringToFront() { this.element.style.zIndex = ++z; }
  }
  const DialogV2 = { confirm: async () => true, prompt: async () => null };

  class Colecao extends Map {
    get contents() { return [...this.values()]; }
    get size() { return super.size; }
    map(fn) { return this.contents.map(fn); }
  }
  const porUuid = new Map();
  let idn = 0;
  const rid = () => "id" + (++idn).toString(36).padStart(6, "0");
  class Som {
    constructor(pl, d) {
      Object.assign(this, { repeat: false, volume: 0.5, sort: idn, flags: {} }, d);
      this.id = rid(); this.parent = pl; this.uuid = `Playlist.${pl.id}.PlaylistSound.${this.id}`;
      porUuid.set(this.uuid, this);
    }
    getFlag(m, k) { return this.flags?.[m]?.[k]; }
    async setFlag(m, k, v) { (this.flags[m] ??= {})[k] = structuredClone(v); Hooks.callAll("updatePlaylistSound", this); }
    async unsetFlag(m, k) { delete this.flags?.[m]?.[k]; Hooks.callAll("updatePlaylistSound", this); }
    async update(d) { Object.assign(this, d); Hooks.callAll("updatePlaylistSound", this); }
    async delete() { this.parent.sounds.delete(this.id); Hooks.callAll("deletePlaylistSound", this); }
  }
  class Lista {
    constructor(d) {
      this.id = rid(); this.name = d.name; this.sort = d.sort ?? idn; this.sorting = "m";
      this.uuid = "Playlist." + this.id; this.sounds = new Colecao();
      for (const s of d.sounds ?? []) { const x = new Som(this, s); this.sounds.set(x.id, x); }
    }
    async createEmbeddedDocuments(_t, arr) { const r = arr.map(s => { const x = new Som(this, s); this.sounds.set(x.id, x); return x; }); Hooks.callAll("createPlaylistSound"); return r; }
  }
  const playlists = new Colecao();
  window.Playlist = { implementation: { create: async d => { const p = new Lista(d); playlists.set(p.id, p); Hooks.callAll("createPlaylist", p); return p; } } };
  window.__criarPlaylist = d => { const p = new Lista(d); playlists.set(p.id, p); return p; };

  const ganchos = {};
  window.Hooks = {
    on(n, f) { (ganchos[n] ??= []).push(f); },
    once(n, f) { (ganchos[n] ??= []).push(f); },
    callAll(n, ...a) { for (const f of ganchos[n] ?? []) f(...a); }
  };

  window.foundry = {
    utils: {
      randomID: (n = 16) => Array.from(crypto.getRandomValues(new Uint8Array(n)), b => "abcdefghijklmnopqrstuvwxyz0123456789"[b % 36]).join(""),
      deepClone: v => structuredClone(v)
    },
    applications: { api: { ApplicationV2, DialogV2 } }
  };

  const music = new AudioContext();
  music.gainNode = music.createGain();
  music.gainNode.connect(music.destination);
  window.__analisador = music.createAnalyser();
  window.__analisador.fftSize = 8192;
  window.__analisador.smoothingTimeConstant = 0;
  music.gainNode.connect(window.__analisador);

  const store = {}, reg = {};
  const jogador = new URLSearchParams(location.search).has("jogador");
  const canal = new BroadcastChannel("tv-estado");
  canal.onmessage = ev => {
    const { tipo, chave, valor } = ev.data;
    if (tipo === "set") { store[chave] = structuredClone(valor); reg[chave]?.onChange?.(structuredClone(valor)); }
    if (tipo === "pedir" && !jogador) for (const [k, v] of Object.entries(store)) canal.postMessage({ tipo: "set", chave: k, valor: v });
  };
  window.__pedirEstado = () => canal.postMessage({ tipo: "pedir" });
  window.__escritas = 0;
  window.game = {
    settings: {
      register(m, k, cfg) { reg[m + "." + k] = cfg; store[m + "." + k] = structuredClone(cfg.default); },
      get(m, k) { return structuredClone(store[m + "." + k]); },
      async set(m, k, v) {
        await new Promise(r => setTimeout(r, 80));
        store[m + "." + k] = structuredClone(v);
        window.__escritas++;
        reg[m + "." + k].onChange?.(structuredClone(v));
        canal.postMessage({ tipo: "set", chave: m + "." + k, valor: v });
        return v;
      }
    },
    keybindings: { register() {} },
    time: { get serverTime() { return Date.now(); } },
    audio: { music, environment: music, interface: music },
    user: { isGM: !jogador, id: jogador ? "jog" : "gm" },
    users: { activeGM: { id: "gm" } },
    modules: new Map([["trilha-viva", {}]]),
    playlists
  };
  window.fromUuidSync = u => porUuid.get(u) ?? null;
  window.ui = { notifications: { info: m => console.log("INFO", m), warn: m => console.log("AVISO", m), error: m => console.log("ERRO", m) } };

  // Frequência dominante do que está tocando agora (para conferir qual seção soa).
  window.__freq = () => {
    const a = window.__analisador;
    const d = new Float32Array(a.frequencyBinCount);
    a.getFloatFrequencyData(d);
    let bi = 0, bv = -Infinity;
    const min = Math.floor(150 / (music.sampleRate / a.fftSize));
    for (let i = min; i < d.length; i++) if (d[i] > bv) { bv = d[i]; bi = i; }
    return { hz: Math.round(bi * music.sampleRate / a.fftSize), db: Math.round(bv) };
  };
})();
