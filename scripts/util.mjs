export const MOD = "trilha-viva";

/** Arquivos maiores que isso (em segundos) tocam em streaming, sem seções. */
export const LIMITE_BUFFER = 600;

export const CORES_SECAO = ["#6f9be0", "#d9b44a", "#b48ce6", "#e0866a", "#5fb3a8", "#e6a3c8", "#9bc46a", "#c9a27a"];

export const TIPOS = {
  musica: { rotulo: "Música", cor: "#d9b44a", texto: "#1b0f2b" },
  ambiente: { rotulo: "Ambiente", cor: "#5fb3a8", texto: "#0f2a26" },
  efeito: { rotulo: "Efeito", cor: "#b48ce6", texto: "#1b0f2b" }
};

export const ACOES = {
  loop: "Repetir até eu trocar",
  next: "Seguir para a próxima",
  stop: "Parar"
};

export const novoId = () => foundry.utils.randomID(12);
export const agora = () => (game.time?.serverTime ?? Date.now());

export function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

export function fmtTempo(seg) {
  seg = Math.max(0, Math.floor((Number(seg) || 0) + 1e-6));
  const h = Math.floor(seg / 3600), m = Math.floor((seg % 3600) / 60), s = seg % 60;
  return h ? `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}` : `${m}:${String(s).padStart(2, "0")}`;
}

/** Tempo de corte: m:ss, com décimo de segundo só quando faz diferença. */
export function fmtCorte(seg) {
  const d = Math.round(Math.max(0, Number(seg) || 0) * 10) / 10;
  const m = Math.floor(d / 60);
  const s = Math.round((d - m * 60) * 10) / 10;
  const inteiro = Math.abs(s - Math.round(s)) < 0.05;
  const txt = inteiro ? String(Math.round(s)).padStart(2, "0") : s.toFixed(1).padStart(4, "0");
  return `${m}:${txt}`;
}

export function parseTempo(txt) {
  if (typeof txt === "number") return txt;
  const s = String(txt ?? "").trim().replace(",", ".");
  if (!s) return NaN;
  const partes = s.split(":");
  if (partes.length > 3 || partes.some(p => p.trim() === "" || isNaN(Number(p)))) return NaN;
  return partes.reduce((acc, p) => acc * 60 + Number(p), 0);
}

export function secoesOrd(item) {
  return (item?.secoes ?? []).slice().sort((a, b) => a.inicio - b.inicio);
}
export const temSecoes = item => (item?.secoes?.length ?? 0) > 1;

/**
 * Posição dentro do arquivo de um segmento, `e` segundos depois do seu início.
 * Todo segmento toca do `offset` até `loopFim` e depois repete entre `loopIni` e `loopFim`.
 */
export function posDoSeg(seg, e, dur) {
  e = Math.max(0, e || 0);
  const L = seg.loopFim > 0 ? seg.loopFim : dur;
  const a = seg.loopIni ?? 0;
  const p = (seg.offset ?? 0) + e;
  if (!(L > 0) || p < L) return { pos: p, volta: 1 };
  const len = L - a;
  if (len <= 0.02) return { pos: L, volta: 1 };
  const k = Math.floor((p - L) / len);
  return { pos: a + (p - L) - k * len, volta: k + 2 };
}

/** Horário (do servidor, em ms) em que termina a volta atual do segmento. */
export function fimDaVolta(seg, t, dur, margem = 0.3) {
  const t0 = Math.max(t, seg.inicio);
  const { pos } = posDoSeg(seg, (t0 - seg.inicio) / 1000, dur);
  const L = seg.loopFim > 0 ? seg.loopFim : dur;
  const a = seg.loopIni ?? 0;
  let resto = L - pos;
  if (resto < margem) resto += Math.max(L - a, 0.05);
  return t0 + resto * 1000;
}

export function souGMAtivo() {
  if (!game.user?.isGM) return false;
  const ativo = game.users?.activeGM;
  return !ativo || ativo.id === game.user.id;
}

export function embaralhar(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function proximaCor(usadas) {
  return CORES_SECAO.find(c => !usadas.includes(c)) ?? CORES_SECAO[usadas.length % CORES_SECAO.length];
}

export function nomeDoArquivo(caminho) {
  let base = String(caminho).split(/[\\/]/).pop().replace(/\.[^.]+$/, "");
  try { base = decodeURIComponent(base); } catch { /* nome com % solto */ }
  base = base.replace(/[-_]+/g, " ").trim();
  return base.charAt(0).toUpperCase() + base.slice(1);
}
