// KNOT — Thời tiết (PHẦN 6).
// Hiệu ứng thời tiết vẽ bằng canvas particles (không cần asset ảnh).
// Các loại: sunny, rain, wind, storm. Gió ảnh hưởng chuyển động nhân vật.

export type WeatherType = "sunny" | "rain" | "wind" | "storm";

export interface WeatherParticle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
}

export interface WeatherState {
  type: WeatherType;
  windX: number;
  particleDensity: number;
  particles: WeatherParticle[];
}

const MAX_PARTICLES = 120; // giới hạn hiệu năng cho máy chủ nhỏ

function randomRange(min: number, max: number): number {
  return Math.random() * (max - min) + min;
}

/** Tạo trạng thái thời tiết mặc định (nắng, không gió). */
export function createWeather(config?: {
  type?: WeatherType;
  windX?: number;
  particleDensity?: number;
}): WeatherState {
  return {
    type: config?.type ?? "sunny",
    windX: config?.windX ?? 0,
    particleDensity: config?.particleDensity ?? 0,
    particles: [],
  };
}

/** Cập nhật partículas thời tiết theo delta time. */
export function updateWeather(
  weather: WeatherState,
  delta: number,
  viewWidth: number,
  viewHeight: number
): void {
  if (weather.type === "sunny") {
    weather.particles = [];
    return;
  }

  const spawnRate = weather.particleDensity * 60 * delta; // particles per second approx
  const toSpawn = Math.floor(spawnRate + Math.random());
  const maxCount = MAX_PARTICLES;

  for (let i = 0; i < toSpawn && weather.particles.length < maxCount; i++) {
    const type = weather.type;
    const isStorm = type === "storm";
    const isRain = type === "rain" || isStorm;
    const p: WeatherParticle = {
      x: randomRange(0, viewWidth),
      y: -10,
      vx: weather.windX * randomRange(40, 100),
      vy: isRain ? randomRange(180, 340) : randomRange(60, 140),
      life: 0,
      maxLife: randomRange(0.4, 1.2),
    };
    weather.particles.push(p);
  }

  for (const p of weather.particles) {
    p.x += p.vx * delta;
    p.y += p.vy * delta;
    p.life += delta;

    // Cuộn lại từ trên xuống khi rơi khỏi màn hình.
    if (p.y > viewHeight + 10) {
      p.y = -10;
      p.x = randomRange(0, viewWidth);
      p.life = 0;
    }
    // Cuộn ngang.
    if (p.x < -20) p.x = viewWidth + 20;
    if (p.x > viewWidth + 20) p.x = -20;
  }

  weather.particles = weather.particles.filter((p) => p.life < p.maxLife);
}

/** Vẽ partículas thời tiết lên canvas. */
export function drawWeather(
  context: CanvasRenderingContext2D,
  weather: WeatherState,
  cameraX: number,
  viewWidth: number,
  viewHeight: number
): void {
  if (weather.type === "sunny") return;

  const isStorm = weather.type === "storm";
  const isRain = weather.type === "rain" || isStorm;

  for (const p of weather.particles) {
    const alpha = 1 - p.life / p.maxLife;
    if (alpha <= 0) continue;

    context.save();
    context.globalAlpha = alpha * weather.particleDensity;

    if (isRain) {
      // Mưa: đường nét dài xanh xám.
      context.strokeStyle = "rgba(140, 180, 220, 0.6)";
      context.lineWidth = isStorm ? 2 : 1;
      context.beginPath();
      context.moveTo(p.x - cameraX, p.y);
      context.lineTo(p.x - cameraX - p.vx * 0.15, p.y + p.vy * 0.25);
      context.stroke();
    } else if (weather.type === "wind") {
      // Gió: hạt trắng nhỏ, di chuyển ngang nhanh.
      context.fillStyle = "rgba(240, 240, 240, 0.35)";
      context.fillRect(p.x - cameraX, p.y, 2, 6);
    }

    if (isStorm && Math.random() < 0.02) {
      // Chớp tia ngầu: sáng trắng tạm thời.
      context.fillStyle = "rgba(255, 255, 255, 0.15)";
      context.fillRect(0, 0, viewWidth, viewHeight);
    }

    context.restore();
  }
}

/** Lực gió áp dụng lên vận tốc ngang của người chơi (px/s²). */
export function windForce(weather: WeatherState): number {
  if (weather.type === "wind" || weather.type === "storm") {
    return weather.windX * 600;
  }
  return 0;
}
