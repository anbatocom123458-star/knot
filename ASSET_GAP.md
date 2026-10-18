# KNOT — Asset Gap Analysis (PHẦN 1)

Tài liệu ghi nhận trạng thái asset pipeline và những file cần người vận hành bổ sung
trước khi triển khai water/lava/weather/equipment (PHẦN 4-6, PHẦN 8).

## 1. Asset registry hiện tại (đã xác minh)

Tổng: 38 assets, 2 nguồn (new-platformer-pack, smoke-particles).
License: CC0 (xác minh từ License.txt cục bộ của mỗi gói).

| Nhóm | Asset IDs | File thật tồn tại |
|------|-----------|-------------------|
| Background | BG01, BG02 (trời) | ✅ |
| Terrain/tile | Z01, Z02, Z03, Z04, Z05, Z06 | ✅ |
| Player skin/anim | SK01, AN01, AN02, AN03 | ✅ |
| Enemy | EN01, EN02, EN03 | ✅ |
| Item | IT01 (exit), IT02 (coin), IT03 (gem), IT04 (bomb), IT05 (bomb_active) | ✅ |
| Obstacle | OB01 (spikes) | ✅ |
| Effect | FX01 (smoke puff, 25 frames) | ✅ |
| Audio (SFX) | AUD_JUMP, AUD_JUMP_HIGH, AUD_COIN, AUD_GEM, AUD_THROW, AUD_DISAPPEAR, AUD_HURT, AUD_MAGIC, AUD_SELECT, AUD_BUMP | ✅ |
| Equipment | EQP_SHIELD, EQP_MAGNET, EQP_HIGH_JUMP_BOOTS, EQP_FLYING_BOOTS, EQP_HEALING, EQP_BOMB | ❌ (pending, render bằng fallback màu) |

## 2. Asset CHƯA có trong kho cục bộ (cần bổ sung)

Nhóm asset này **không có file thật** trong `assets/source/`. Theo quy tắc, KHÔNG tạo registry giả. Người vận hành phải tải từ nguồn chính thức và đặt vào đường dẫn tương ứng.

### Nước (Water) — PHẦN 4
Cần: mặt nước, dòng chảy, thác nước, bọt nước.
Nguồn gợi ý: https://kenney.nl/assets/pixel-platformer (có tiles nước) hoặc gói water dedicado.
File cần: `assets/source/kenney/<gói>/Sprites/Tiles/.../water_*.png`, `.../water_flow_*.png`, `.../waterfall_*.png`

### Dung nham (Lava) — PHẦN 5
Cần: bề mặt dung nham, đá nóng, nứt, hiệu ứng bắn tóe.
Nguồn gợi ý: https://kenney.nl/assets/pixel-platformer-blocks (có stone/rock tiles) hoặc gói lava dedicado.
File cần: `assets/source/kenney/<gói>/Sprites/Tiles/.../lava_*.png`, `.../lava_flow_*.png`

### Thời tiết (Weather) — PHẦN 6
Cần: mưa, tuyết, sương mù, hiệu ứng sấm chớp.
Nguồn gợi ý: smoke-particles đã có (black smoke, explosion, flash) có thể tái sử dụng cho sấm chớp. Cần thêm mưa/tuyết.
File cần: `assets/source/kenney/<gói>/Particles/rain_*.png`, `snow_*.png`, `.../lightning_*.png`

### Trang bị/Equipment — PHẦN 8
Cần: giày bay, giày nhảy cao, khiên, nam châm, tim hồi phục, icon inventory.
Nguồn gợi ý: new-platformer-pack Vector/HUD có `hud_heart.svg`, `hud_coin.svg`; cần các sprite equipment dedicated.
File cần: `assets/source/kenney/<gói>/Sprites/Items/.../boots_*.png`, `shield_*.png`, `magnet_*.png`, `heart_*.png`

### Nhạc nền (Music)
Hiện tại chỉ có SFX (AUD_*). Chưa có nhạc nền menu/gameplay/victory.
File cần: `assets/source/kenney/<gói>/Audio/Music/.../*.ogg`

## 3. Fallback khi asset thiếu

Game sẽ sử dụng vẽ hình chữ nhật màu thay vì ảnh khi asset ID không tìm thấy hoặc file không load được:
- Nước: hình chữ nhật màu xanhRGB(60, 140, 200) trong suốt
- Dung nham: hình chữ nhật màu đỏ-orange RGB(220, 60, 0) có nhấp nháy
- Thời tiết: hạt nhỏ vẽ bằng canvas (không cần asset ảnh)
- Equipment: hình chữ nhật màu kết hợp biểu tượng đơn giản

## 4. URL tải chính thức (cần người vận hành tự tải)

* https://kenney.nl/assets/new-platformer-pack (đã có cục bộ, CC0)
* https://kenney.nl/assets/pixel-platformer
* https://kenney.nl/assets/pixel-platformer-blocks
* https://kenney.nl/assets/smoke-particles (đã có cục bộ, CC0)

## 5. Lưu ý vận hành

* Không tự tuyên bố license đã xác minh nếu chưa đọc License.txt của gói mới.
* Không đổi ID asset cũ mà không có migration rõ ràng.
* Sau khi bổ sung file, cập nhật `data/asset-registry.json` và chạy validator + smoke test.
