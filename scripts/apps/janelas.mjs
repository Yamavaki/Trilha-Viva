import { abertas } from "./base.mjs";
import { Painel } from "./painel.mjs";
import { JanelaFila } from "./fila.mjs";
import { JanelaChefe } from "./chefe.mjs";
import { EditorSecoes, editoresAbertos } from "./secoes.mjs";

let painel = null, fila = null, chefe = null;

function soMestre() {
  if (game.user?.isGM) return true;
  ui.notifications?.warn("A Trilha Viva é controlada pelo Mestre.");
  return false;
}

function mostrar(app) {
  if (app.rendered) { app.trazerParaFrente(); app.render(); }
  else app.render({ force: true });
  return app;
}

export function abrirPainel() {
  if (!soMestre()) return;
  painel ??= new Painel();
  return mostrar(painel);
}

export function abrirFila() {
  if (!soMestre()) return;
  fila ??= new JanelaFila();
  return mostrar(fila);
}

export function abrirChefe(camadaId = null) {
  if (!soMestre()) return;
  chefe ??= new JanelaChefe();
  if (camadaId) chefe.camadaId = camadaId;
  return mostrar(chefe);
}

export function abrirSecoes(som) {
  if (!soMestre() || !som) return;
  const existente = [...editoresAbertos].find(e => e.som.uuid === som.uuid);
  return mostrar(existente ?? new EditorSecoes(som));
}

export function renderizarTodas() {
  for (const app of abertas) {
    if (app instanceof EditorSecoes) continue;
    app.pedirRender();
  }
}

export function tickTodas() {
  for (const app of abertas) {
    try { app.tick(); } catch (err) { console.error("Trilha Viva |", err); }
  }
}

export function srcsDosEditores() {
  return new Set([...editoresAbertos].map(e => e.src));
}
