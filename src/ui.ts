// KNOT — Stage 7 DOM screen layer. Pure UI: shows/hides menu panels and
// forwards button/keyboard events to callbacks owned by the game loop.
// The game loop never reaches into the DOM through this module's internals;
// it only calls showScreen() and receives actions via initUI() callbacks.

import type { MapManifest } from "./types";

export type ScreenName =
  | "main-menu"
  | "level-select"
  | "loading"
  | "error"
  | "pause"
  | "victory"
  | "gameover"
  | "login"
  | "register"
  | "account"
  | "settings"
  | "multiplayer";

export type UIAction =
  | "play"
  | "levelselect"
  | "back-main"
  | "pause"
  | "resume"
  | "restart"
  | "mainmenu"
  | "retry"
  | "play-next"
  | "select-map"
  | "settings"
  | "account"
  | "auth-login"
  | "auth-show-login"
  | "auth-register"
  | "auth-register-submit"
  | "auth-logout"
  | "audio-toggle"
  | "controls-layout"
  | "multiplayer"
  | "mp-create"
  | "mp-join"
  | "mp-leave"
  | "mp-start";

export type UICallbacks = Record<UIAction, (arg?: string) => void>;

let actions: UICallbacks | null = null;
let currentScreen: ScreenName | null = null;
let wired = false;

function layerElement(): HTMLElement | null {
  return document.querySelector<HTMLElement>("#screen-layer");
}

/** The screen currently shown, or null while the game is running. */
export function activeScreen(): ScreenName | null {
  return currentScreen;
}

/**
 * Show one screen panel, or null to return to gameplay. Updates the
 * `menu-open` body flag (CSS hides the touch controls while a menu is open
 * so menu panels can never sit on top of the control zone).
 */
export function showScreen(name: ScreenName | null): void {
  currentScreen = name;
  const layer = layerElement();
  if (!layer) return;
  layer.hidden = name === null;
  document.body.classList.toggle("menu-open", name !== null);
  for (const section of layer.querySelectorAll<HTMLElement>("[data-screen]")) {
    section.hidden = section.dataset.screen !== name;
  }
  if (name !== null) {
    const focusable = layer
      .querySelector<HTMLElement>(`[data-screen="${name}"]`)
      ?.querySelector<HTMLElement>("button:not([disabled])");
    focusable?.focus();
  }
}

function dispatch(action: UIAction, arg?: string): void {
  actions?.[action]?.(arg);
}

function handleKeydown(event: KeyboardEvent): void {
  if (event.code !== "Escape") return;
  if (currentScreen === "pause") dispatch("resume");
  else if (currentScreen === "level-select") dispatch("back-main");
  else if (currentScreen === "login" || currentScreen === "register" || currentScreen === "account" || currentScreen === "settings" || currentScreen === "multiplayer") dispatch("back-main");
  else if (currentScreen === null) dispatch("pause");
}

/**
 * Render the 50-level list from the manifest. Only entries that also have a
 * real map file report as playable; locked entries stay disabled, never fake.
 */
export function renderLevelList(manifest: MapManifest, playable: Set<string>): void {
  const container = document.querySelector<HTMLElement>("[data-screen=\"level-select\"] .level-list");
  if (!container) return;
  container.textContent = "";
  for (const entry of manifest.maps) {
    const button = document.createElement("button");
    button.type = "button";
    const unlocked = entry.status === "available" && playable.has(entry.id);
    button.className = "level-card";
    const lockLabel = unlocked ? entry.name : "CHƯA CÓ";
    const metaLine = unlocked
      ? `Nhóm ${entry.group} · Độ khó ${entry.difficulty} · ${entry.mechanics.join(", ")}`
      : "Map chưa được thiết kế thủ công — sẽ mở sau";
    button.innerHTML =
      `<span class="level-id"></span>` +
      `<span class="level-name"></span>` +
      `<span class="level-meta"></span>`;
    const [idEl, nameEl, metaEl] = [
      button.querySelector(".level-id"),
      button.querySelector(".level-name"),
      button.querySelector(".level-meta")
    ];
    if (idEl) idEl.textContent = entry.id;
    if (nameEl) nameEl.textContent = lockLabel;
    if (metaEl) metaEl.textContent = metaLine;
    if (unlocked) {
      button.dataset.action = "select-map";
      button.dataset.mapId = entry.id;
    } else {
      button.disabled = true;
      button.title = "Map chưa được thiết kế — sẽ mở sau";
    }
    container.appendChild(button);
  }
}

/** Fill the victory screen with the finished map name + next-map availability. */
export function renderVictory(currentMapId: string, nextMapId: string | null, nextPlayable: boolean): void {
  const victory = document.querySelector<HTMLElement>('[data-screen="victory"]');
  if (!victory) return;
  const kicker = victory.querySelector(".screen-kicker");
  if (kicker) kicker.textContent = `${currentMapId} · FIELD CLEAR`;
  const sub = victory.querySelector(".screen-sub");
  if (sub) {
    sub.textContent = nextMapId
      ? (nextPlayable ? `Màn tiếp theo: ${nextMapId}.` : `${nextMapId} chưa được thiết kế — quay lại sau.`)
      : "Bạn đã hoàn thành mọi màn đã thiết kế!";
  }
  const nextButton = victory.querySelector<HTMLButtonElement>('[data-action="play-next"]');
  if (nextButton) {
    nextButton.disabled = !(nextMapId && nextPlayable);
    if (nextButton.disabled) nextButton.title = "Màn tiếp theo chưa được thiết kế";
    else nextButton.removeAttribute("title");
  }
}

/** Show a loading or error message inside the overlay screens. */
export function setLoadingMessage(text: string): void {
  const el = document.querySelector<HTMLElement>('[data-screen="loading"] .loading-text');
  if (el) el.textContent = text;
}

export function setErrorMessage(text: string): void {
  const el = document.querySelector<HTMLElement>('[data-screen="error"] .error-text');
  if (el) el.textContent = text;
}

/** Wire every [data-action] control inside #screen-layer once. */
export function initUI(next: UICallbacks): void {
  actions = next;
  if (wired) return;
  wired = true;

  const layer = layerElement();
  if (!layer) throw new Error("Khong tim thay #screen-layer.");

  layer.addEventListener("click", (event) => {
    const target = (event.target as HTMLElement | null)?.closest<HTMLElement>("[data-action]");
    if (!target || !layer.contains(target)) return;
    // Disabled buttons must never fake a success: they dispatch nothing.
    if ((target as HTMLButtonElement).disabled === true) return;
    const action = target.dataset.action;
    if (!action) return;
    if (action === "select-map") {
      const mapId = target.dataset.mapId;
      if (mapId) dispatch("select-map", mapId);
      return;
    }
    dispatch(action as UIAction);
  });

  window.addEventListener("keydown", handleKeydown);
}

export type { MapManifestEntry, MapManifest } from "./types";
