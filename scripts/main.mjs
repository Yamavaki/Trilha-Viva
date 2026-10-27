import { MOD } from "./util.mjs";
import { ESTADO_PADRAO, Trilha, lerEstado } from "./estado.mjs";
import { motor } from "./motor.mjs";
import { definirProtecao } from "./audio.mjs";
import { abrirPainel, abrirFila, abrirChefe, abrirSecoes, renderizarTodas, tickTodas, srcsDosEditores } from "./apps/janelas.mjs";

Hooks.once("init", () => {
  game.settings.register(MOD, "estado", {
    scope: "world",
    config: false,
    type: Object,
    default: foundry.utils.deepClone(ESTADO_PADRAO),
    onChange: valor => {
      motor.definirEstado(valor);
      renderizarTodas();
    }
  });

  game.keybindings.register(MOD, "abrir", {
    name: "Abrir o painel da Trilha Viva",
    editable: [{ key: "KeyM", modifiers: ["Shift"] }],
    restricted: true,
    onDown: () => { abrirPainel(); return true; }
  });
});

Hooks.once("ready", () => {
  motor.aoPromover = (id, proxId) => Trilha.promover(id, proxId);
  definirProtecao(() => new Set([...motor.srcsEmUso(), ...srcsDosEditores()]));
  motor.definirEstado(lerEstado());
  setInterval(tickTodas, 250);

  const api = {
    abrir: abrirPainel,
    abrirFila,
    abrirChefe,
    abrirSecoes,
    /** Para macros: TrilhaViva.secao("Fase final") ou TrilhaViva.secao("Fase final", "agora") */
    secao: (nome, quando = "volta") => Trilha.irParaSecaoPorNome(nome, quando),
    pararTudo: () => Trilha.pararTudo(),
    Trilha
  };
  const mod = game.modules.get(MOD);
  if (mod) mod.api = api;
  globalThis.TrilhaViva = api;
});

Hooks.on("trilhaVivaTocando", () => renderizarTodas());

for (const gancho of ["createPlaylist", "updatePlaylist", "deletePlaylist", "createPlaylistSound", "updatePlaylistSound", "deletePlaylistSound"]) {
  Hooks.on(gancho, () => renderizarTodas());
}

/* Botão "Trilha Viva" na aba de playlists */
Hooks.on("renderPlaylistDirectory", (app, html) => {
  if (!game.user?.isGM) return;
  const el = html instanceof HTMLElement ? html : html?.[0];
  if (!el || el.querySelector(".trilha-viva-abrir")) return;
  const botao = document.createElement("button");
  botao.type = "button";
  botao.className = "trilha-viva-abrir";
  botao.innerHTML = `<i class="fa-solid fa-music" inert></i> Trilha Viva`;
  botao.addEventListener("click", ev => { ev.preventDefault(); abrirPainel(); });
  const lugar = el.querySelector(".header-actions") ?? el.querySelector(".directory-header") ?? el;
  lugar.append(botao);
});
