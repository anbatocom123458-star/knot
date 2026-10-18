// @vitest-environment happy-dom
// Stage 7: DOM screen layer behavior — show/hide, action dispatch, disabled
// buttons dispatching nothing, and Escape navigation.
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { activeScreen, initUI, showScreen, type UICallbacks } from "./ui";

const FIXTURE = `
<div id="screen-layer" class="screen-layer" hidden>
  <section class="screen" data-screen="main-menu" hidden>
    <button type="button" data-action="play">Chơi</button>
    <button type="button" data-action="levelselect">Chọn màn</button>
    <button type="button" data-action="restart" disabled>Cài đặt</button>
  </section>
  <section class="screen" data-screen="level-select" hidden>
    <button type="button" data-action="back-main">Quay lại</button>
    <button type="button" data-action="play" disabled>MAP000002</button>
  </section>
  <section class="screen" data-screen="pause" hidden>
    <button type="button" data-action="resume">Tiếp tục</button>
    <button type="button" data-action="mainmenu">Menu chính</button>
  </section>
  <section class="screen" data-screen="victory" hidden>
    <button type="button" data-action="retry">Chơi lại</button>
  </section>
  <section class="screen" data-screen="gameover" hidden>
    <button type="button" data-action="retry">Chơi lại</button>
    <button type="button" data-action="mainmenu">Menu chính</button>
  </section>
</div>`;

function freshActions(): UICallbacks {
  return {
    play: vi.fn(),
    levelselect: vi.fn(),
    "back-main": vi.fn(),
    pause: vi.fn(),
    resume: vi.fn(),
    restart: vi.fn(),
    mainmenu: vi.fn(),
    retry: vi.fn(),
    "play-next": vi.fn(),
    "select-map": vi.fn(),
    settings: vi.fn(),
    account: vi.fn(),
    "auth-login": vi.fn(),
    "auth-show-login": vi.fn(),
    "auth-register": vi.fn(),
    "auth-register-submit": vi.fn(),
    "auth-logout": vi.fn(),
    "audio-toggle": vi.fn(),
    "controls-layout": vi.fn(),
    multiplayer: vi.fn(),
    "mp-create": vi.fn(),
    "mp-join": vi.fn(),
    "mp-leave": vi.fn(),
    "mp-start": vi.fn(),
  };
}

let actions: UICallbacks;

beforeAll(() => {
  document.body.innerHTML = FIXTURE;
});

beforeEach(() => {
  showScreen(null);
  document.body.classList.remove("menu-open");
  actions = freshActions();
  initUI(actions); // rewires module callbacks; wiring itself is once-only
});

function screen(name: string): HTMLElement {
  const element = document.querySelector<HTMLElement>(`[data-screen="${name}"]`);
  if (!element) throw new Error(`missing screen ${name}`);
  return element;
}

describe("showScreen", () => {
  it("shows only the requested panel and flags the body", () => {
    showScreen("pause");
    expect(document.querySelector<HTMLElement>("#screen-layer")?.hidden).toBe(false);
    expect(screen("pause").hidden).toBe(false);
    expect(screen("main-menu").hidden).toBe(true);
    expect(screen("victory").hidden).toBe(true);
    expect(document.body.classList.contains("menu-open")).toBe(true);
    expect(activeScreen()).toBe("pause");
  });

  it("hides everything and clears the body flag when returning to the game", () => {
    showScreen("victory");
    showScreen(null);
    expect(document.querySelector<HTMLElement>("#screen-layer")?.hidden).toBe(true);
    expect(screen("victory").hidden).toBe(true);
    expect(document.body.classList.contains("menu-open")).toBe(false);
    expect(activeScreen()).toBeNull();
  });

  it("focuses the first enabled button of the shown screen", () => {
    showScreen("main-menu");
    expect(document.activeElement).toBe(screen("main-menu").querySelector("button:not([disabled])"));
  });
});

describe("button dispatch", () => {
  it("forwards clicks on enabled buttons", () => {
    showScreen("main-menu");
    screen("main-menu").querySelector<HTMLButtonElement>('[data-action="play"]')?.click();
    expect(actions.play).toHaveBeenCalledTimes(1);
  });

  it("never dispatches from disabled buttons (no fake success)", () => {
    showScreen("main-menu");
    screen("main-menu").querySelector<HTMLButtonElement>("button[disabled]")?.click();
    expect(actions.restart).not.toHaveBeenCalled();
    showScreen("level-select");
    screen("level-select").querySelector<HTMLButtonElement>("button[disabled]")?.click();
    expect(actions.play).not.toHaveBeenCalled();
  });
});

describe("escape key navigation", () => {
  function pressEscape() {
    window.dispatchEvent(new KeyboardEvent("keydown", { code: "Escape" }));
  }

  it("pauses from gameplay, resumes from pause, goes back from level select", () => {
    showScreen(null); // gameplay
    pressEscape();
    expect(actions.pause).toHaveBeenCalledTimes(1);
    showScreen("pause");
    pressEscape();
    expect(actions.resume).toHaveBeenCalledTimes(1);
    showScreen("level-select");
    pressEscape();
    expect(actions["back-main"]).toHaveBeenCalledTimes(1);
  });

  it("does nothing on the main menu, victory and game over", () => {
    showScreen("main-menu");
    pressEscape();
    showScreen("victory");
    pressEscape();
    showScreen("gameover");
    pressEscape();
    expect(actions.pause).not.toHaveBeenCalled();
    expect(actions.resume).not.toHaveBeenCalled();
  });
});
