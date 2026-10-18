// KNOT — Joystick ảo cho điều khiển cảm ứng (PHẦN 7).
// Hoạt động song song với bàn phím (PC). Joystick chỉ cung cấp trục ngang (left/right);
// nút nhảy/bom giữ nguyên dưới dạng nút bấm riêng.
//
// Nguyên bản lỗi: setPointerCapture được gọi trên phần tử container (#joystick) trong
// khi listener pointermove/pointerup gắn trên .joystick-base. Sau khi bắt capture,
// sự kiện pointer được chuyển hướng về phần tử capture (#joystick, là tổ tiên), nên
// listener trên .joystick-base không bao giờ nhận được → núm joystick không di chuyển
// và không bao giờ reset khi nhả ngón tay. Sửa: gắn capture cùng phần tử chứa listener.

export interface JoystickState {
  x: number; // -1 (trái) đến 1 (phải), đã chuẩn hóa
  y: number; // -1 (xuống) đến 1 (lên), đã chuẩn hóa (được giữ để mở rộng sau)
  active: boolean; // người chơi đang giữ joystick
}

export interface JoystickVector {
  x: number;
  y: number;
  /** Có vượt qua dead zone hay không. */
  active: boolean;
}

// Vùng không phản hồi gần trung tâm. Giá trị nhỏ hơn → joystick nhạy hơn,
// vẫn lọc được các rung tay nhẹ khi ngón tay đặt gần trung tâm.
const DEAD_ZONE = 0.1;

// Hệ số làm mượt vector đầu vào (0 = cứng, gần 1 = mượt). Giúp nhân vật không
// bị run nhẹ khi joystick nằm sát ranh giới dead zone.
const SMOOTHING = 0.35;

let state: JoystickState = { x: 0, y: 0, active: false };
let filtered: JoystickState = { x: 0, y: 0, active: false };
let onAxisChange: ((axis: number) => void) | null = null;
let activePointerId: number | null = null;
let resetActiveJoystick: (() => void) | null = null;

/** Trục ngang hiện tại của joystick (0 nếu nằm trong dead zone), đã làm mượt. */
export function getJoystickAxis(): number {
  return Math.abs(filtered.x) > DEAD_ZONE ? filtered.x : 0;
}

/** Trục dọc hiện tại (được giữ để mở rộng media sau). */
export function getJoystickVertical(): number {
  return Math.abs(filtered.y) > DEAD_ZONE ? filtered.y : 0;
}

/** Vector đầu vào đã chuẩn hóa (dài tối đa 1), đã làm mượt. */
export function getJoystickVector(): JoystickVector {
  return { x: filtered.x, y: filtered.y, active: filtered.active };
}

export function isJoystickActive(): boolean {
  return filtered.active;
}

/** Reset joystick về trạng thái trung tâm (dùng khi mất focus hoặc thoát gameplay). */
export function resetJoystick(): void {
  resetActiveJoystick?.();
}

/** Tạo và gắn joystick vào phần tử container. */
export function initJoystick(
  container: HTMLElement,
  options?: { onAxisChange?: (axis: number) => void }
): void {
  onAxisChange = options?.onAxisChange ?? null;

  // Xóa nội dung cũ (nếu có) rồi tạo cấu trúc joystick.
  container.innerHTML = "";
  container.classList.add("joystick-container");
  container.style.touchAction = "none";

  const base = document.createElement("div");
  base.className = "joystick-base";
  const knob = document.createElement("div");
  knob.className = "joystick-knob";
  base.appendChild(knob);
  container.appendChild(base);
  resetActiveJoystick = () => {
    const pointerId = activePointerId;
    activePointerId = null;
    if (pointerId !== null) {
      try {
        if (base.hasPointerCapture(pointerId)) base.releasePointerCapture(pointerId);
      } catch {
        // Pointer capture may already have been released by the browser.
      }
    }
    state = { x: 0, y: 0, active: false };
    filtered = { x: 0, y: 0, active: false };
    knob.style.transform = "translate(0, 0)";
    base.classList.remove("is-active");
    container.classList.remove("is-active");
    onAxisChange?.(0);
  };

  const baseRect = () => base.getBoundingClientRect();
  const center = () => {
    const r = baseRect();
    return { cx: r.left + r.width / 2, cy: r.top + r.height / 2, radius: r.width / 2 };
  };

  function updateFromClient(clientX: number, clientY: number): void {
    const { cx, cy, radius } = center();
    let dx = clientX - cx;
    let dy = clientY - cy;
    const dist = Math.hypot(dx, dy);
    const maxDist = radius * 0.7; // núm không vượt quá 70% bán kính đế
    if (dist > maxDist) {
      const scale = maxDist / dist;
      dx *= scale;
      dy *= scale;
    }
    state.x = dx / maxDist;
    state.y = dy / maxDist;
    state.active = true;

    // Làm mượt vector để chuyển động chắc chắn, không nhảy run khi nằm gần dead zone.
    filtered.x += (state.x - filtered.x) * SMOOTHING;
    filtered.y += (state.y - filtered.y) * SMOOTHING;
    filtered.active = true;

    const knobSize = knob.offsetWidth;
    knob.style.transform = `translate(${dx - knobSize / 2}px, ${dy - knobSize / 2}px)`;
    base.classList.add("is-active");
    container.classList.add("is-active");

    const axis = getJoystickAxis();
    onAxisChange?.(axis);
  }

  const start = (clientX: number, clientY: number, pointerId: number): void => {
    if (activePointerId !== null) return;
    activePointerId = pointerId;
    try {
      // Bắt capture TRÊN chính phần tử chứa listener (base) để sự kiện pointermove/
      // pointerup sau này được chuyển hướng về chính base, không bị trôi sang tổ tiên.
      base.setPointerCapture(pointerId);
    } catch {
      // Một số trình duyệt không cho bắt capture chưa qua over; vẫn xử lý bình thường.
    }
    updateFromClient(clientX, clientY);
  };

  const move = (clientX: number, clientY: number): void => {
    if (activePointerId === null) return;
    updateFromClient(clientX, clientY);
  };

  const end = (pointerId: number): void => {
    if (pointerId !== activePointerId) return;
    resetJoystick();
  };

  // Tất cả listener gắn trên `base` (cùng phần tử dùng setPointerCapture).
  base.addEventListener("pointerdown", (event) => {
    event.preventDefault();
    start(event.clientX, event.clientY, event.pointerId);
  });
  base.addEventListener("pointermove", (event) => {
    if (event.pointerId !== activePointerId) return;
    event.preventDefault();
    move(event.clientX, event.clientY);
  });
  base.addEventListener("pointerup", (event) => end(event.pointerId));
  base.addEventListener("pointercancel", (event) => end(event.pointerId));
  base.addEventListener("lostpointercapture", (event) => end(event.pointerId));

  // Ngăn joystick làm cuộn trang trên thiết bị cảm ứng (phụ trợ touch-action: none).
  container.addEventListener(
    "touchmove",
    (event) => {
      event.preventDefault();
    },
    { passive: false }
  );
}

window.addEventListener("blur", resetJoystick);
window.addEventListener("resize", resetJoystick);
window.addEventListener("orientationchange", resetJoystick);
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "hidden") resetJoystick();
});
