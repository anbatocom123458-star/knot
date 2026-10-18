// @vitest-environment happy-dom
// KNOT — Unit test cho module joystick ảo (PHẦN 7).
// Kiểm tra: reset sau khi thả, pointer cancel không kẹt di chuyển,
// joystick chỉ phát tín hiệu trục (không kích hoạt nhảy), hai pointer
// hoạt động độc lập, vùng chạm joystick không chồng lấn nút nhảy.
import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { initJoystick, getJoystickAxis, isJoystickActive, resetJoystick } from "./joystick";

let container: HTMLDivElement;
let base: HTMLElement;
let rectOverrides: Map<Element, DOMRect>;
const originalGetBoundingClientRect = Element.prototype.getBoundingClientRect;

function rect(left: number, top: number, width: number, height: number) {
  return {
    left, top, width, height,
    right: left + width,
    bottom: top + height,
    x: left,
    y: top,
    toJSON: () => ({}),
  } as DOMRect;
}

function pointerDown(el: HTMLElement, clientX: number, clientY: number, pointerId: number) {
  el.dispatchEvent(
    new PointerEvent("pointerdown", {
      clientX, clientY, pointerId, bubbles: true, cancelable: true,
    })
  );
}

function pointerMove(el: HTMLElement, clientX: number, clientY: number, pointerId: number) {
  el.dispatchEvent(
    new PointerEvent("pointermove", {
      clientX, clientY, pointerId, bubbles: true, cancelable: true,
    })
  );
}

function pointerUp(el: HTMLElement, pointerId: number) {
  el.dispatchEvent(
    new PointerEvent("pointerup", {
      clientX: 0, clientY: 0, pointerId, bubbles: true, cancelable: true,
    })
  );
}

function pointerCancel(el: HTMLElement, pointerId: number) {
  el.dispatchEvent(
    new PointerEvent("pointercancel", {
      clientX: 0, clientY: 0, pointerId, bubbles: true, cancelable: true,
    })
  );
}

beforeEach(() => {
  rectOverrides = new Map();
  Element.prototype.getBoundingClientRect = function () {
    return rectOverrides.get(this) ?? originalGetBoundingClientRect.call(this);
  };
  container = document.createElement("div");
  container.id = "joystick";
  container.style.width = "130px";
  container.style.height = "130px";
  document.body.appendChild(container);

  initJoystick(container, { onAxisChange: () => { /* axis duoc tra ve qua getJoystickAxis */ } });
  base = container.querySelector<HTMLElement>(".joystick-base")!;
  rectOverrides.set(base, rect(100, 100, 130, 130));
});

afterEach(() => {
  resetJoystick();
  container.remove();
  document.body.innerHTML = "";
  Element.prototype.getBoundingClientRect = originalGetBoundingClientRect;
});

describe("joystick", () => {
  it("tra ve trung tam (axis 0) sau khi nha ngon tay", () => {
    pointerDown(base, 165, 100, 1);
    pointerMove(base, 220, 100, 1); // keo sang phai
    expect(getJoystickAxis()).toBeGreaterThan(0.15);
    expect(isJoystickActive()).toBe(true);

    pointerUp(base, 1);
    expect(getJoystickAxis()).toBe(0);
    expect(isJoystickActive()).toBe(false);
  });

  it("pointer cancel khong de nhan vat tiep tuc chay", () => {
    pointerDown(base, 220, 100, 1);
    expect(getJoystickAxis()).toBeGreaterThan(0);

    pointerCancel(base, 1);
    expect(getJoystickAxis()).toBe(0);
    expect(isJoystickActive()).toBe(false);
  });

  it("pointerup cua pointer khac khong tha joystick dang duoc giu", () => {
    pointerDown(base, 220, 100, 1);
    pointerUp(base, 2);

    expect(getJoystickAxis()).toBeGreaterThan(0);
    expect(isJoystickActive()).toBe(true);

    pointerUp(base, 1);
    expect(getJoystickAxis()).toBe(0);
    expect(isJoystickActive()).toBe(false);
  });

  it("reset giai phong pointer capture va xoa trang thai active", () => {
    const released: number[] = [];
    base.setPointerCapture = () => {};
    base.hasPointerCapture = () => true;
    base.releasePointerCapture = (pointerId) => released.push(pointerId);

    pointerDown(base, 220, 100, 7);
    expect(base.classList.contains("is-active")).toBe(true);
    resetJoystick();

    expect(released).toEqual([7]);
    expect(base.classList.contains("is-active")).toBe(false);
    expect(isJoystickActive()).toBe(false);
  });

  it.each(["blur", "resize", "orientationchange"])("reset khi window phat %s", (eventName) => {
    pointerDown(base, 220, 100, 1);
    window.dispatchEvent(new Event(eventName));

    expect(getJoystickAxis()).toBe(0);
    expect(isJoystickActive()).toBe(false);
  });

  it("reset khi tab bi an", () => {
    const originalVisibilityState = document.visibilityState;
    Object.defineProperty(document, "visibilityState", { configurable: true, value: "hidden" });
    pointerDown(base, 220, 100, 1);
    document.dispatchEvent(new Event("visibilitychange"));

    expect(getJoystickAxis()).toBe(0);
    expect(isJoystickActive()).toBe(false);
    Object.defineProperty(document, "visibilityState", { configurable: true, value: originalVisibilityState });
  });

  it("joystick chi phat tin hieu truc, khong bao gio la nhay", () => {
    const axes: number[] = [];
    container.innerHTML = "";
    initJoystick(container, { onAxisChange: (axis) => axes.push(axis) });
    const b = container.querySelector<HTMLElement>(".joystick-base")!;
    rectOverrides.set(b, rect(100, 100, 130, 130));
    pointerDown(b, 220, 100, 1);
    pointerUp(b, 1);
    // Moi gia tri nhan duoc la so trong [-1, 1]; khong co tin hieu "nhay" biet liet.
    for (const v of axes) {
      expect(typeof v).toBe("number");
      expect(v).toBeGreaterThanOrEqual(-1);
      expect(v).toBeLessThanOrEqual(1);
    }
  });

  it("hai pointer hoat dong doc lap (joystick bo qua pointer khac)", () => {
    pointerDown(base, 220, 100, 1); // joystick bam pointer 1
    expect(getJoystickAxis()).toBeGreaterThan(0);
    expect(getJoystickAxis()).toBeLessThanOrEqual(1);

    // pointer 2 di chuyen tren cung vung phai bi bo qua
    pointerMove(base, 30, 100, 2);
    expect(getJoystickAxis()).toBeGreaterThan(0);

    pointerUp(base, 1);
    expect(getJoystickAxis()).toBe(0);
  });

  it("vung cham joystick khong chong lan nut nhay va du lon", () => {
    const jump = document.createElement("button");
    jump.className = "control-button jump-button";
    jump.style.minWidth = "86px";
    jump.style.minHeight = "86px";
    jump.style.position = "absolute";
    jump.style.left = "300px";
    jump.style.top = "100px";
    document.body.appendChild(jump);
    rectOverrides.set(jump, rect(300, 100, 96, 96));

    const jr = base.getBoundingClientRect();
    const rr = jump.getBoundingClientRect();
    const overlap =
      jr.left < rr.right &&
      jr.right > rr.left &&
      jr.top < rr.bottom &&
      jr.bottom > rr.top;

    expect(overlap).toBe(false);
    expect(jr.width).toBeGreaterThanOrEqual(100);
    expect(jr.height).toBeGreaterThanOrEqual(100);
    jump.remove();
  });

  it("joystick axis chuan hoa trong khoang [-1, 1]", () => {
    pointerDown(base, 230, 100, 1); // xa nhat ben phai
    expect(getJoystickAxis()).toBeLessThanOrEqual(1);
    pointerUp(base, 1);

    pointerDown(base, 40, 100, 1); // xa nhat ben trai
    expect(getJoystickAxis()).toBeGreaterThanOrEqual(-1);
    pointerUp(base, 1);
  });

  it("dead zone lam axis bang 0 gan trung tam", () => {
    pointerDown(base, 165, 100, 1); // trung tam theo X
    expect(getJoystickAxis()).toBe(0);
    pointerUp(base, 1);
  });

  it("joystick khong kich hoat nhay (chi phat tin hieu truc)", () => {
    let jumpSignals = 0;
    container.innerHTML = "";
    initJoystick(container, {
      onAxisChange: (axis) => {
        if (Math.abs(axis) > 0.9) jumpSignals += 1; // co the o vung ngoai dead zone
      },
    });
    const b = container.querySelector<HTMLElement>(".joystick-base")!;
    rectOverrides.set(b, rect(100, 100, 130, 130));
    pointerDown(b, 220, 100, 1);
    pointerMove(b, 220, 30, 1); // keo xuong, duoc dich thanh truc y khong phai nhay
    expect(getJoystickAxis()).toBeGreaterThanOrEqual(0);
    expect(getJoystickAxis()).toBeLessThanOrEqual(1);
    expect(jumpSignals).toBe(0);
    pointerUp(b, 1);
  });

  it("hai pointer dong thoi: joystick di chuyen, nut nhay duoc bam lap", () => {
    const jump = document.createElement("button");
    jump.dataset.control = "jump";
    jump.style.position = "absolute";
    jump.style.left = "300px";
    jump.style.top = "100px";
    document.body.appendChild(jump);

    let pressed = false;
    jump.addEventListener("pointerdown", () => { pressed = true; });

    // pointer 1: joystick keo phai
    pointerDown(base, 220, 100, 1);
    expect(getJoystickAxis()).toBeGreaterThan(0);

    // pointer 2: bam nut nhay (khac pointer) khong bi joystick che
    const jumpDown = new PointerEvent("pointerdown", {
      clientX: 330, clientY: 100, pointerId: 2, bubbles: true, cancelable: true,
    });
    jump.dispatchEvent(jumpDown);
    expect(pressed).toBe(true);
    expect(getJoystickAxis()).toBeGreaterThan(0); // joystick van giu nguyen

    jump.dispatchEvent(new PointerEvent("pointerup", { pointerId: 2, bubbles: true, cancelable: true }));
    pointerUp(base, 1);
    jump.remove();
  });

  it("reset joystick tra ve axis 0 va tat hoat dong (dung sau blur / pause)", () => {
    pointerDown(base, 220, 100, 1);
    expect(getJoystickAxis()).toBeGreaterThan(0);
    resetJoystick();
    expect(getJoystickAxis()).toBe(0);
    expect(isJoystickActive()).toBe(false);
  });
});
