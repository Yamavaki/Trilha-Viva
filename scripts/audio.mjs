import { LIMITE_BUFFER } from "./util.mjs";

const buffers = new Map();   // src -> { promessa, buf, usado }
const duracoes = new Map();  // src -> segundos
const pendDur = new Map();   // src -> Promise<number>
let protecao = () => new Set();
let ctxProprio = null;

/** Contexto de áudio do Foundry para o tipo (respeita o volume de Música/Ambiente/Interface de cada jogador). */
export function contexto(tipo = "musica") {
  const a = game.audio;
  const cand = tipo === "ambiente" ? a?.environment : tipo === "efeito" ? a?.interface : a?.music;
  for (const c of [cand, a?.music]) if (c && typeof c.createBufferSource === "function") return c;
  if (!ctxProprio) {
    ctxProprio = new AudioContext();
    const retomar = () => ctxProprio.resume().catch(() => {});
    document.addEventListener("pointerdown", retomar, { once: true });
    document.addEventListener("keydown", retomar, { once: true });
  }
  return ctxProprio;
}

export const saidaDe = ctx => ctx.gainNode ?? ctx.destination;

export function aguardarContexto(ctx) {
  if (ctx.state === "running") return Promise.resolve();
  return new Promise(res => {
    const h = () => {
      if (ctx.state !== "running") return;
      ctx.removeEventListener("statechange", h);
      res();
    };
    ctx.addEventListener("statechange", h);
    ctx.resume?.().catch(() => {});
  });
}

export function definirProtecao(fn) { protecao = fn; }

export function carregar(src) {
  let r = buffers.get(src);
  if (!r) {
    r = { usado: Date.now(), buf: null };
    r.promessa = (async () => {
      const resp = await fetch(src);
      if (!resp.ok) throw new Error(`não consegui baixar o áudio (erro ${resp.status})`);
      const dados = await resp.arrayBuffer();
      const buf = await contexto("musica").decodeAudioData(dados);
      r.buf = buf;
      duracoes.set(src, buf.duration);
      limparCache();
      return buf;
    })();
    r.promessa.catch(() => buffers.delete(src));
    buffers.set(src, r);
  }
  r.usado = Date.now();
  return r.promessa;
}

/** Mantém no máximo ~20 min de áudio decodificado que não esteja em uso. */
function limparCache() {
  const protegidos = protecao();
  const livres = [...buffers.entries()].filter(([src, r]) => r.buf && !protegidos.has(src)).sort((a, b) => a[1].usado - b[1].usado);
  let total = livres.reduce((s, [, r]) => s + r.buf.duration, 0);
  while (total > 1200 && livres.length) {
    const [src, r] = livres.shift();
    total -= r.buf.duration;
    buffers.delete(src);
  }
}

export const duracaoCache = src => duracoes.get(src);

export function duracao(src) {
  if (duracoes.has(src)) return Promise.resolve(duracoes.get(src));
  if (!pendDur.has(src)) {
    const p = new Promise(res => {
      const el = new Audio();
      el.preload = "metadata";
      let feito = false;
      const fim = v => {
        if (feito) return;
        feito = true;
        clearTimeout(t);
        el.removeAttribute("src");
        try { el.load(); } catch { /* ok */ }
        res(v);
      };
      el.addEventListener("loadedmetadata", () => fim(Number.isFinite(el.duration) ? el.duration : NaN));
      el.addEventListener("error", () => fim(NaN));
      const t = setTimeout(() => fim(NaN), 10000);
      el.src = src;
    }).then(async d => {
      if (!(d > 0)) {
        try { d = (await carregar(src)).duration; } catch { d = 0; }
      }
      if (!duracoes.has(src)) duracoes.set(src, d);
      pendDur.delete(src);
      return duracoes.get(src);
    });
    pendDur.set(src, p);
  }
  return pendDur.get(src);
}

/** Duração exata (a do áudio decodificado) para arquivos tocados por buffer. */
export async function duracaoReal(src) {
  const d = await duracao(src);
  if (d > 0 && d <= LIMITE_BUFFER) {
    try { return (await carregar(src)).duration; } catch { return d; }
  }
  return d;
}

/* Fila com limite de 3 leituras de duração ao mesmo tempo (lista de faixas). */
let ativos = 0;
const esperando = [];
export function duracaoEmFila(src) {
  if (duracoes.has(src)) return Promise.resolve(duracoes.get(src));
  return new Promise(res => {
    const rodar = () => {
      ativos++;
      duracao(src).then(res, () => res(0)).finally(() => {
        ativos--;
        esperando.shift()?.();
      });
    };
    if (ativos < 3) rodar(); else esperando.push(rodar);
  });
}
