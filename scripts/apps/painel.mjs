import { JanelaTV, ICONE } from "./base.mjs";
import { Trilha, lerEstado, itemAtual, infoCamada, parando } from "../estado.mjs";
import { MOD, TIPOS, esc, fmtTempo, temSecoes, nomeDoArquivo } from "../util.mjs";
import { duracaoCache, duracaoEmFila } from "../audio.mjs";
import { motor } from "../motor.mjs";
import { abrirFila, abrirChefe, abrirSecoes } from "./janelas.mjs";

const EXTENSOES = [".ogg", ".oga", ".opus", ".mp3", ".wav", ".flac", ".m4a", ".aac", ".webm"];

export function playlistsOrdenadas() {
  return (game.playlists?.contents ?? []).slice().sort((a, b) => (a.sort ?? 0) - (b.sort ?? 0) || a.name.localeCompare(b.name, "pt-BR"));
}

export function sonsOrdenados(pl) {
  const sons = pl.sounds.contents.slice();
  return pl.sorting === "a"
    ? sons.sort((a, b) => a.name.localeCompare(b.name, "pt-BR"))
    : sons.sort((a, b) => (a.sort ?? 0) - (b.sort ?? 0) || a.name.localeCompare(b.name, "pt-BR"));
}

const FP = () => foundry.applications.apps?.FilePicker?.implementation ?? globalThis.FilePicker?.implementation ?? globalThis.FilePicker;

/** Texto da linha de status de uma camada ("Seção: Fase 1 · repetindo (3ª volta)"…). */
export function textoInfo(c) {
  if (c.pausa) return "Pausada";
  if (parando(c)) return "Parando…";
  const inf = infoCamada(c);
  const seg = inf.seg;
  if (inf.S && seg?.secao) {
    const nome = `<span class="tv-ouro">${esc(inf.S.nome)}</span>`;
    if (seg.modo === "secao") return `Seção: ${nome} · repetindo (${inf.volta}ª volta)`;
    if (seg.modo === "inteira") return `Seção: ${nome} · depois a música inteira`;
    return `Seção: ${nome} · tocando`;
  }
  if (seg?.modo === "inteira") return `Música inteira em loop · ${inf.volta}ª volta`;
  if (c.fila.length > 1) {
    const ordem = c.ordem?.length ? c.ordem : c.fila.map(i => i.id);
    const n = ordem.indexOf(seg?.itemId) + 1;
    return `Fila · ${n || 1} de ${c.fila.length}${c.modoFila === "atual" ? " · repetindo a faixa" : ""}`;
  }
  if (c.modoFila === "atual") return "Repetindo a faixa · sem fim";
  return "Toca uma vez";
}

/** Clique numa barra de progresso: toca a partir daquele ponto (seção atual ou faixa inteira). */
export function buscarNaBarra(camadaId, el, ev) {
  const c = lerEstado().camadas?.[camadaId];
  if (!c || !ev) return;
  const r = el.getBoundingClientRect();
  const frac = Math.max(0, Math.min(1, (ev.clientX - r.left) / r.width));
  const inf = infoCamada(c);
  const t = inf.S && inf.seg?.secao ? inf.S.inicio + frac * (inf.S.termino - inf.S.inicio) : frac * inf.dur;
  return Trilha.irPara(camadaId, t);
}

export function progressoCamada(c) {
  const inf = infoCamada(c);
  if (inf.S && inf.seg?.secao) return Math.max(0, Math.min(1, (inf.pos - inf.S.inicio) / Math.max(0.01, inf.S.termino - inf.S.inicio)));
  return inf.dur > 0 ? Math.max(0, Math.min(1, inf.pos / inf.dur)) : 0;
}

export class Painel extends JanelaTV {
  static DEFAULT_OPTIONS = {
    id: "trilha-viva-painel",
    window: { title: "Trilha Viva" },
    position: { width: 960, height: 680 }
  };

  playlistId = null;
  marcadas = new Map();
  _durPedidas = new Set();
  _menu = null;

  get playlist() {
    const lista = playlistsOrdenadas();
    return lista.find(p => p.id === this.playlistId) ?? lista[0] ?? null;
  }

  marcadasDe(pl) {
    if (!this.marcadas.has(pl.id)) this.marcadas.set(pl.id, new Set());
    const set = this.marcadas.get(pl.id);
    for (const id of [...set]) if (!pl.sounds.get(id)) set.delete(id);
    return set;
  }

  cabecalho() {
    const e = lerEstado();
    return `
      ${ICONE.musica}
      <h1 class="tv-titulo">Trilha Viva</h1>
      <span class="tv-sub">Painel do Mestre</span>
      <div class="tv-esp"></div>
      <label class="tv-volgeral">Volume geral
        <input type="range" min="0" max="100" value="${Math.round((e.volumeGeral ?? 0.8) * 100)}" data-campo="volumeGeral" aria-label="Volume geral">
      </label>
      <button type="button" class="tv-btn-perigo" data-acao="pararTudo">Parar tudo</button>`;
  }

  corpo() {
    const e = lerEstado();
    const pl = this.playlist;
    const camadas = Object.values(e.camadas ?? {}).filter(c => c.seg).sort((a, b) => a.criado - b.criado);
    const porUuid = new Map();
    for (const c of camadas) {
      const it = itemAtual(c);
      if (it && !parando(c)) porUuid.set(it.uuid, c);
    }

    const nav = playlistsOrdenadas().map(p => `
      <button type="button" class="tv-nav-item ${p.id === pl?.id ? "ativo" : ""}" data-acao="playlist" data-id="${p.id}">
        <span class="tv-nav-nome">${esc(p.name)}</span><span class="tv-nav-qtd">${p.sounds.size}</span>
      </button>`).join("");

    let meio;
    if (!pl) {
      meio = `<div class="tv-vazio">Nenhuma playlist ainda.<br>Crie uma em <b>+ Nova playlist</b>.</div>`;
    } else {
      const sons = sonsOrdenados(pl);
      const marc = this.marcadasDe(pl);
      const linhas = sons.map(som => this._linhaFaixa(som, porUuid.get(som.uuid), marc.has(som.id))).join("");
      meio = `
        <div class="tv-faixas-topo">
          <h2 class="tv-h2">${esc(pl.name)}</h2>
          <span class="tv-suave tv-13">${sons.length} ${sons.length === 1 ? "faixa" : "faixas"} · ${marc.size} ${marc.size === 1 ? "marcada" : "marcadas"}</span>
          <div class="tv-esp"></div>
          <button type="button" class="tv-btn-ouro" data-acao="tocarMarcadas" ${marc.size ? "" : "disabled"}>Tocar marcadas como fila</button>
        </div>
        <div class="tv-lista" data-rolagem="faixas">
          ${linhas || `<div class="tv-vazio">Playlist vazia. Adicione faixas abaixo.</div>`}
          <div class="tv-lista-add">
            <button type="button" class="tv-tracejado" data-acao="addFaixa">+ Adicionar faixa</button>
            <button type="button" class="tv-tracejado" data-acao="addPasta">+ Adicionar pasta inteira</button>
          </div>
        </div>`;
    }

    const cards = camadas.map(c => this._card(c)).join("");
    return `
      <div class="tv-raiz tv-painel">
        <nav class="tv-nav" aria-label="Playlists" data-rolagem="nav">
          <div class="tv-nav-rotulo">Playlists do mundo</div>
          ${nav}
          <div class="tv-esp-v"></div>
          <button type="button" class="tv-tracejado tv-nav-nova" data-acao="novaPlaylist">+ Nova playlist</button>
        </nav>
        <section class="tv-faixas" aria-label="Faixas da playlist">${meio}</section>
        <aside class="tv-aside" aria-label="Tocando agora" data-rolagem="aside">
          <div class="tv-aside-topo">
            <h2 class="tv-h3">Tocando agora</h2>
            <span class="tv-suave tv-12">${camadas.length ? `${camadas.length} ${camadas.length === 1 ? "camada" : "camadas ao mesmo tempo"}` : "nada tocando"}</span>
          </div>
          ${cards}
          <div class="tv-esp-v"></div>
          <div class="tv-dica-rodape">Clique em ▶ numa faixa para somar uma camada. Músicas trocam entre si; ambientes e efeitos tocam por cima.</div>
        </aside>
        ${this._menu ? this._htmlMenu() : ""}
      </div>`;
  }

  _linhaFaixa(som, c, marcada) {
    const secoes = som.getFlag(MOD, "secoes") ?? [];
    const nSec = secoes.length > 1 ? secoes.length : 0;
    const tipo = som.getFlag(MOD, "tipo") ?? "musica";
    let info = "—";
    if (c?.pausa) info = nSec ? `${nSec} seções · pausada` : "Pausada";
    else if (c && nSec) {
      const inf = infoCamada(c);
      const modo = inf.seg?.modo;
      const estado = !inf.S ? "tocando"
        : modo === "secao" ? `${esc(inf.S.nome)} em loop`
          : modo === "inteira" ? "música inteira" : `${esc(inf.S.nome)} tocando`;
      info = `${nSec} seções · ${estado}`;
    } else if (nSec) info = `${nSec} seções`;
    else if (som.repeat) info = "Repetir a faixa";
    else if (c) info = "Tocando";

    let dur = duracaoCache(som.path);
    if (dur === undefined) { this._pedirDur(som.path); dur = null; }
    const tocando = !!c && !c.pausa;
    const tag = nSec
      ? `<button type="button" class="tv-tag tv-tag-secoes" data-acao="secoes" data-som="${som.uuid}" title="Editar seções">Seções</button>`
      : `<button type="button" class="tv-tag" data-acao="secoes" data-som="${som.uuid}" title="Dividir em seções">${TIPOS[tipo]?.rotulo ?? "Música"}</button>`;
    return `
      <div class="tv-faixa ${tocando ? "tocando" : ""}" data-som="${som.uuid}">
        <input type="checkbox" class="tv-check" data-campo="marcar" data-id="${som.id}" aria-label="Marcar para a fila" ${marcada ? "checked" : ""}>
        <button type="button" class="tv-play" data-acao="tocar" data-som="${som.uuid}" aria-label="${tocando ? "Parar" : "Tocar"}" title="${tocando ? "Parar" : "Tocar"}">${ICONE.play(tocando ? "#1b0f2b" : "#d9b44a")}</button>
        <div class="tv-faixa-texto">
          <div class="tv-faixa-nome">${esc(som.name)}</div>
          <div class="tv-faixa-info">${info}</div>
        </div>
        ${tag}
        <span class="tv-dur">${dur ? fmtTempo(dur) : ""}</span>
      </div>`;
  }

  _card(c) {
    const item = itemAtual(c);
    const t = TIPOS[c.tipo] ?? TIPOS.musica;
    const prog = Math.round(progressoCamada(c) * 1000) / 10;
    let abrir = "";
    if (c.tipo === "musica") {
      abrir = `<button type="button" class="tv-card-abrir" data-acao="abrirChefe" data-camada="${c.id}">${temSecoes(item) ? "Abrir controle de seções" : "Abrir controle"}</button>
        <button type="button" class="tv-icone-btn" data-acao="abrirFila" aria-label="Abrir fila" title="Abrir fila">${ICONE.lista}</button>`;
    } else abrir = `<div class="tv-esp"></div>`;
    return `
      <div class="tv-card" style="border-color:${t.cor}">
        <div class="tv-card-topo">
          <span class="tv-card-nome">${esc(item?.nome ?? "—")}</span>
          <span class="tv-badge" style="background:${t.cor};color:${t.texto}">${t.rotulo}</span>
        </div>
        <div class="tv-card-info" data-tv-info="${c.id}">${textoInfo(c)}</div>
        <div class="tv-barra tv-barra-clicavel" data-acao="buscar" data-camada="${c.id}" title="Clique para tocar a partir daqui"><div data-tv-prog="${c.id}" style="width:${prog}%;background:${t.cor}"></div></div>
        <div class="tv-card-acoes">
          ${abrir}
          <button type="button" class="tv-icone-btn" data-acao="${c.pausa ? "retomar" : "pausar"}" data-camada="${c.id}" aria-label="${c.pausa ? "Retomar" : "Pausar"}" title="${c.pausa ? "Retomar" : "Pausar"}">${c.pausa ? ICONE.play("#efe6ff") : ICONE.pausa("#efe6ff")}</button>
          <button type="button" class="tv-icone-btn" data-acao="pararCamada" data-camada="${c.id}" aria-label="Parar" title="Parar">${ICONE.parar("#f0a48d")}</button>
        </div>
        <label class="tv-card-vol">Volume
          <input type="range" min="0" max="100" value="${Math.round((c.volume ?? 0.7) * 100)}" data-campo="volume" data-camada="${c.id}" aria-label="Volume de ${esc(item?.nome ?? "")}" style="accent-color:${t.cor}">
        </label>
      </div>`;
  }

  _htmlMenu() {
    const som = fromUuidSync(this._menu.uuid);
    if (!som) return "";
    const tipo = som.getFlag(MOD, "tipo") ?? "musica";
    const marca = cond => `<span class="tv-menu-marca">${cond ? "✓" : ""}</span>`;
    return `
      <div class="tv-menu" style="left:${this._menu.x}px;top:${this._menu.y}px" role="menu">
        <button type="button" data-acao="menuSecoes">${marca(false)}Editar seções</button>
        <div class="tv-menu-sep"></div>
        <div class="tv-menu-rot">Tipo</div>
        ${Object.entries(TIPOS).map(([k, v]) => `<button type="button" data-acao="menuTipo" data-tipo="${k}">${marca(tipo === k)}${v.rotulo}</button>`).join("")}
        <div class="tv-menu-sep"></div>
        <button type="button" data-acao="menuRepetir">${marca(som.repeat)}Repetir a faixa</button>
        <button type="button" data-acao="menuRemover" class="tv-menu-perigo">${marca(false)}Remover da playlist</button>
      </div>`;
  }

  _pedirDur(src) {
    if (this._durPedidas.has(src)) return;
    this._durPedidas.add(src);
    duracaoEmFila(src).then(() => this.pedirRender());
  }

  _onFirstRender(context, options) {
    super._onFirstRender(context, options);
    this.element.addEventListener("contextmenu", ev => {
      const linha = ev.target.closest(".tv-faixa[data-som]");
      if (!linha) return;
      ev.preventDefault();
      const raiz = this.element.querySelector(".tv-raiz").getBoundingClientRect();
      this._menu = { uuid: linha.dataset.som, x: Math.min(ev.clientX - raiz.left, raiz.width - 200), y: Math.min(ev.clientY - raiz.top, raiz.height - 230) };
      this.render();
    });
    this.element.addEventListener("pointerdown", ev => {
      if (this._menu && !ev.target.closest(".tv-menu")) { this._menu = null; this.render(); }
    }, true);
  }

  tick() {
    if (!this.rendered) return;
    const e = lerEstado();
    for (const c of Object.values(e.camadas ?? {})) {
      const info = this.element.querySelector(`[data-tv-info="${c.id}"]`);
      if (info) {
        const txt = textoInfo(c);
        if (info.innerHTML !== txt) info.innerHTML = txt;
      }
      const barra = this.element.querySelector(`[data-tv-prog="${c.id}"]`);
      if (barra) barra.style.width = `${progressoCamada(c) * 100}%`;
    }
  }

  async acao(nome, el, ev) {
    const camada = el.dataset.camada;
    switch (nome) {
      case "playlist": this.playlistId = el.dataset.id; this._menu = null; return this.render();
      case "novaPlaylist": return this._novaPlaylist();
      case "tocar": { const som = fromUuidSync(el.dataset.som); if (som) await Trilha.tocarSom(som); return; }
      case "tocarMarcadas": {
        const pl = this.playlist;
        if (!pl) return;
        const marc = this.marcadasDe(pl);
        const sons = sonsOrdenados(pl).filter(s => marc.has(s.id));
        await Trilha.tocarFila(sons);
        return abrirFila();
      }
      case "secoes": { const som = fromUuidSync(el.dataset.som); if (som) abrirSecoes(som); return; }
      case "pararTudo": return Trilha.pararTudo();
      case "pausar": return Trilha.pausar(camada);
      case "retomar": return Trilha.retomar(camada);
      case "pararCamada": return Trilha.pararCamada(camada, 1);
      case "abrirChefe": return abrirChefe(camada);
      case "abrirFila": return abrirFila();
      case "buscar": return buscarNaBarra(camada, el, ev);
      case "addFaixa": return this._addFaixa();
      case "addPasta": return this._addPasta();
      case "menuSecoes": case "menuTipo": case "menuRepetir": case "menuRemover": return this._acaoMenu(nome, el);
    }
  }

  async _acaoMenu(nome, el) {
    const som = fromUuidSync(this._menu?.uuid);
    this._menu = null;
    if (!som) return this.render();
    if (nome === "menuSecoes") { this.render(); return abrirSecoes(som); }
    if (nome === "menuTipo") {
      await som.setFlag(MOD, "tipo", el.dataset.tipo);
      await Trilha.atualizarTipo(som.uuid, el.dataset.tipo);
      return;
    }
    if (nome === "menuRepetir") return som.update({ repeat: !som.repeat });
    if (nome === "menuRemover") {
      const ok = await foundry.applications.api.DialogV2.confirm({
        window: { title: "Remover faixa" },
        content: `<p>Remover <b>${esc(som.name)}</b> da playlist? O arquivo continua na pasta.</p>`
      });
      if (ok) return som.delete();
      return this.render();
    }
  }

  mudou(el) {
    const campo = el.dataset.campo;
    if (campo === "marcar") {
      const pl = this.playlist;
      if (!pl) return;
      const set = this.marcadasDe(pl);
      if (el.checked) set.add(el.dataset.id); else set.delete(el.dataset.id);
      return this.render();
    }
    if (campo === "volumeGeral") return Trilha.volumeGeral(Number(el.value) / 100);
    if (campo === "volume") return Trilha.volume(el.dataset.camada, Number(el.value) / 100);
  }

  digitando(el) {
    if (el.dataset.campo === "volumeGeral") motor.volumeLocal(null, Number(el.value) / 100);
    if (el.dataset.campo === "volume") motor.volumeLocal(el.dataset.camada, Number(el.value) / 100);
  }

  async _novaPlaylist() {
    const nome = await foundry.applications.api.DialogV2.prompt({
      window: { title: "Nova playlist" },
      content: `<label style="display:flex;flex-direction:column;gap:6px">Nome da playlist<input name="nome" type="text" autofocus placeholder="Ex.: Chefes"></label>`,
      ok: { label: "Criar", callback: (event, button) => button.form.elements.nome.value.trim() },
      rejectClose: false
    });
    if (!nome) return;
    const pl = await Playlist.implementation.create({ name: nome });
    this.playlistId = pl?.id ?? this.playlistId;
    this.render();
  }

  _addFaixa() {
    const pl = this.playlist;
    if (!pl) return ui.notifications.warn("Crie uma playlist primeiro.");
    new (FP())({
      type: "audio",
      callback: path => pl.createEmbeddedDocuments("PlaylistSound", [{ name: nomeDoArquivo(path), path, volume: 0.5 }])
    }).render(true);
  }

  _addPasta() {
    const pl = this.playlist;
    if (!pl) return ui.notifications.warn("Crie uma playlist primeiro.");
    const Classe = FP();
    new Classe({
      type: "folder",
      callback: async (pasta, picker) => {
        try {
          const fonte = picker?.activeSource ?? (String(pasta).includes("forge-vtt.com") ? "forgevtt" : "data");
          const res = await Classe.browse(fonte, pasta, { extensions: EXTENSOES });
          const existentes = new Set(pl.sounds.map(s => s.path));
          const novos = (res.files ?? []).filter(f => EXTENSOES.some(x => f.toLowerCase().endsWith(x)) && !existentes.has(f));
          if (!novos.length) return ui.notifications.info("Nenhum áudio novo nessa pasta.");
          await pl.createEmbeddedDocuments("PlaylistSound", novos.map(path => ({ name: nomeDoArquivo(path), path, volume: 0.5 })));
          ui.notifications.info(`${novos.length} faixa(s) adicionada(s).`);
        } catch (err) {
          console.error("Trilha Viva |", err);
          ui.notifications.error("Não consegui ler essa pasta.");
        }
      }
    }).render(true);
  }
}
