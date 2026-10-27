import { JanelaTV, ICONE } from "./base.mjs";
import { Trilha, itemAtual, infoCamada, camadaMusica } from "../estado.mjs";
import { MOD, esc, fmtTempo } from "../util.mjs";
import { duracaoCache, duracaoEmFila } from "../audio.mjs";
import { abrirPainel } from "./janelas.mjs";
import { playlistsOrdenadas, sonsOrdenados, buscarNaBarra } from "./painel.mjs";

const MODOS = [
  ["uma", "Tocar uma vez", "Para no fim da fila"],
  ["fila", "Repetir a fila", "Volta para a primeira"],
  ["atual", "Repetir só a atual", "Fica nesta faixa"]
];
const TRANSICOES = [[0, "Corte seco"], [1, "Crossfade 1 s"], [1.5, "Crossfade 1,5 s"], [2, "Crossfade 2 s"], [3, "Crossfade 3 s"], [5, "Crossfade 5 s"]];

export class JanelaFila extends JanelaTV {
  static DEFAULT_OPTIONS = {
    id: "trilha-viva-fila",
    window: { title: "Fila temporária" },
    position: { width: 960, height: 680 }
  };

  _durPedidas = new Set();

  cabecalho() {
    return `
      <button type="button" class="tv-link" data-acao="voltar">← Voltar às playlists</button>
      <h1 class="tv-titulo">Fila temporária</h1>
      <span class="tv-sub">montada com as faixas marcadas · some quando a música parar</span>
      <div class="tv-esp"></div>
      <button type="button" class="tv-btn-contorno-claro" data-acao="salvar" ${camadaMusica() ? "" : "disabled"}>Salvar como playlist</button>`;
  }

  corpo() {
    const c = camadaMusica();
    if (!c) {
      return `<div class="tv-raiz tv-fila"><div class="tv-vazio tv-vazio-grande">Nenhuma música tocando.<br>No painel, marque as faixas e clique em <b>Tocar marcadas como fila</b>.</div></div>`;
    }
    const atualId = itemAtual(c)?.id;
    const linhas = c.fila.map((it, i) => {
      const atual = it.id === atualId;
      let d = duracaoCache(it.src);
      if (d === undefined) { this._pedirDur(it.src); d = null; }
      return `
        <div class="tv-fila-linha ${atual ? "atual" : ""}" draggable="true" data-item="${it.id}">
          ${ICONE.arrastar}
          <span class="tv-fila-n">${i + 1}</span>
          <button type="button" class="tv-fila-texto" data-acao="tocarItem" data-item="${it.id}" title="Tocar agora">
            <span class="tv-fila-nome">${esc(it.nome)}</span>
            <span class="tv-fila-origem">${it.origem ? `de ${esc(it.origem)}` : ""}</span>
          </button>
          <span class="tv-suave tv-13">${d ? fmtTempo(d) : ""}</span>
          <button type="button" class="tv-x" data-acao="tirar" data-item="${it.id}" aria-label="Tirar da fila" title="Tirar da fila">${ICONE.x}</button>
        </div>`;
    }).join("");

    const ordem = c.ordem?.length ? c.ordem : c.fila.map(i => i.id);
    const n = ordem.indexOf(atualId) + 1;
    const inf = infoCamada(c);
    const modos = MODOS.map(([k, nome, desc]) => `
      <button type="button" class="tv-opcao ${c.modoFila === k ? "on" : ""}" data-acao="modoFila" data-modo="${k}">
        <span class="tv-opcao-nome">${nome}</span><span class="tv-opcao-desc">${desc}</span>
      </button>`).join("");
    const cf = c.crossfade ?? 1.5;
    const opcoes = TRANSICOES.some(([v]) => v === cf) ? TRANSICOES : [...TRANSICOES, [cf, `Crossfade ${String(cf).replace(".", ",")} s`]].sort((a, b) => a[0] - b[0]);

    return `
      <div class="tv-raiz tv-fila">
        <section class="tv-fila-lista" aria-label="Faixas na fila" data-rolagem="fila">
          <div class="tv-suave tv-13">Arraste para mudar a ordem</div>
          ${linhas}
          <button type="button" class="tv-tracejado tv-fila-add" data-acao="addOutra">+ Adicionar faixa de outra playlist</button>
        </section>
        <aside class="tv-fila-lado" aria-label="Como a fila toca">
          <div class="tv-agora">
            <div class="tv-suave tv-12">${c.pausa ? "Pausada" : "Tocando"} · ${n || 1} de ${c.fila.length}</div>
            <div class="tv-agora-nome">${esc(inf.item?.nome ?? "—")}</div>
            <div class="tv-barra tv-barra-clicavel" data-acao="buscar" title="Clique para tocar a partir daqui"><div data-tv-fprog style="width:${inf.dur ? (inf.pos / inf.dur) * 100 : 0}%;background:#d9b44a"></div></div>
            <div class="tv-agora-tempos"><span data-tv-fpos>${fmtTempo(inf.pos)}</span><span>${fmtTempo(inf.dur)}</span></div>
            <div class="tv-agora-botoes">
              <button type="button" class="tv-redondo" data-acao="anterior" aria-label="Anterior">${ICONE.anterior}</button>
              <button type="button" class="tv-redondo tv-redondo-ouro" data-acao="${c.pausa ? "retomar" : "pausar"}" aria-label="${c.pausa ? "Retomar" : "Pausar"}">${c.pausa ? ICONE.play("#1b0f2b") : ICONE.pausa("#1b0f2b", 18)}</button>
              <button type="button" class="tv-redondo" data-acao="proxima" aria-label="Próxima">${ICONE.proxima}</button>
            </div>
          </div>
          <div class="tv-grupo">
            <div class="tv-grupo-titulo">Repetição</div>
            ${modos}
          </div>
          <label class="tv-linha-check"><input type="checkbox" class="tv-check" data-campo="aleatorio" ${c.aleatorio ? "checked" : ""}>Aleatório</label>
          <label class="tv-linha-select">Transição entre faixas
            <select class="tv-select" data-campo="transicao" aria-label="Transição">
              ${opcoes.map(([v, r]) => `<option value="${v}" ${v === cf ? "selected" : ""}>${r}</option>`).join("")}
            </select>
          </label>
        </aside>
      </div>`;
  }

  _pedirDur(src) {
    if (this._durPedidas.has(src)) return;
    this._durPedidas.add(src);
    duracaoEmFila(src).then(() => this.pedirRender());
  }

  _onFirstRender(context, options) {
    super._onFirstRender(context, options);
    const el = this.element;
    el.addEventListener("dragstart", ev => {
      const linha = ev.target.closest?.(".tv-fila-linha");
      if (!linha) return;
      this._arrastando = linha.dataset.item;
      ev.dataTransfer.effectAllowed = "move";
      ev.dataTransfer.setData("text/plain", "");
      linha.classList.add("arrastando");
    });
    el.addEventListener("dragover", ev => {
      if (!this._arrastando) return;
      const linha = ev.target.closest?.(".tv-fila-linha");
      ev.preventDefault();
      for (const l of el.querySelectorAll(".tv-drop-antes, .tv-drop-depois")) l.classList.remove("tv-drop-antes", "tv-drop-depois");
      if (!linha || linha.dataset.item === this._arrastando) return;
      const r = linha.getBoundingClientRect();
      linha.classList.add(ev.clientY < r.top + r.height / 2 ? "tv-drop-antes" : "tv-drop-depois");
    });
    el.addEventListener("drop", ev => {
      if (!this._arrastando) return;
      ev.preventDefault();
      const linha = ev.target.closest?.(".tv-fila-linha");
      const movido = this._arrastando;
      this._arrastando = null;
      const c = camadaMusica();
      if (!c || !linha || linha.dataset.item === movido) return this.render();
      const ids = c.fila.map(i => i.id).filter(id => id !== movido);
      const r = linha.getBoundingClientRect();
      let p = ids.indexOf(linha.dataset.item);
      if (ev.clientY >= r.top + r.height / 2) p++;
      ids.splice(p, 0, movido);
      Trilha.reordenar(c.id, ids);
    });
    el.addEventListener("dragend", () => {
      if (this._arrastando) { this._arrastando = null; this.render(); }
    });
  }

  tick() {
    if (!this.rendered) return;
    const c = camadaMusica();
    if (!c) return;
    const inf = infoCamada(c);
    const b = this.element.querySelector("[data-tv-fprog]");
    if (b) b.style.width = `${inf.dur ? Math.min(100, (inf.pos / inf.dur) * 100) : 0}%`;
    const p = this.element.querySelector("[data-tv-fpos]");
    if (p) p.textContent = fmtTempo(inf.pos);
    if (this._itemVisto !== inf.item?.id) { this._itemVisto = inf.item?.id; this.pedirRender(); }
  }

  async acao(nome, el, ev) {
    const c = camadaMusica();
    if (nome === "buscar") return c && buscarNaBarra(c.id, el, ev);
    switch (nome) {
      case "voltar": return abrirPainel();
      case "salvar": return this._salvar(c);
      case "addOutra": return this._adicionar(c);
    }
    if (!c) return;
    switch (nome) {
      case "tirar": return Trilha.removerItem(c.id, el.dataset.item);
      case "tocarItem": return Trilha.tocarItem(c.id, el.dataset.item);
      case "anterior": return Trilha.pular(c.id, -1);
      case "proxima": return Trilha.pular(c.id, 1);
      case "pausar": return Trilha.pausar(c.id);
      case "retomar": return Trilha.retomar(c.id);
      case "modoFila": return Trilha.modoFila(c.id, el.dataset.modo);
    }
  }

  mudou(el) {
    const c = camadaMusica();
    if (!c) return;
    if (el.dataset.campo === "aleatorio") return Trilha.aleatorio(c.id, el.checked);
    if (el.dataset.campo === "transicao") return Trilha.definirCrossfade(c.id, Number(el.value));
  }

  async _salvar(c) {
    if (!c) return;
    const data = new Date();
    const nome = `Fila ${data.toLocaleDateString("pt-BR")} ${data.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}`;
    await Playlist.implementation.create({
      name: nome,
      sounds: c.fila.map(it => ({ name: it.nome, path: it.src, volume: 0.5, flags: { [MOD]: { tipo: it.tipo, secoes: it.secoes ?? [] } } }))
    });
    ui.notifications.info(`Playlist "${nome}" criada.`);
  }

  async _adicionar(c) {
    if (!c) return ui.notifications.warn("Toque algo primeiro para montar a fila.");
    const grupos = playlistsOrdenadas().map(pl => `
      <fieldset class="tv-dialogo-grupo"><legend>${esc(pl.name)}</legend>
        ${sonsOrdenados(pl).map(s => `<label><input type="checkbox" name="som" value="${s.uuid}"> ${esc(s.name)}</label>`).join("") || "<em>vazia</em>"}
      </fieldset>`).join("");
    const uuids = await foundry.applications.api.DialogV2.prompt({
      window: { title: "Adicionar à fila" },
      position: { width: 420 },
      content: `<div class="tv-dialogo-lista">${grupos}</div>`,
      ok: { label: "Adicionar", callback: (event, button) => [...button.form.querySelectorAll('input[name="som"]:checked')].map(i => i.value) },
      rejectClose: false
    });
    if (!uuids?.length) return;
    await Trilha.adicionarSons(c.id, uuids.map(u => fromUuidSync(u)).filter(Boolean));
  }
}

