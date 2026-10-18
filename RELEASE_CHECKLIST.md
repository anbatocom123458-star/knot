# KNOT — Checklist phát hành (Release Checklist)

Phiên bản: 0.4.0 (chưa phát hành). Tất cả giai đoạn 0–10 và G đã triển khai.

## Core gameplay (đã có từ Giai đoạn 6, giữ nguyên)
- [x] Vòng lặp game, physics, camera, collision
- [x] Wall slide / wall jump
- [x] Quái tuần tra, stomp, i-frame damage
- [x] Bom, coin, gem, HUD, chết/hồi sinh
- [x] 88 test đơn vị pass, typecheck sạch, build production thành công

## Giai đoạn 7 — Menu & UI (đã làm)
- [x] Main Menu: Chơi, Chọn màn, Cài đặt, Tài khoản, Đối tác (multiplayer)
- [x] Level Select từ manifest (100 mục, chỉ màn có map thật mở)
- [x] Pause / Resume / Restart / Main Menu
- [x] Victory / Game Over / Chọn màn tiếp theo (chờ nút nhấn, không auto-next-level)
- [x] Màn hình Loading và lỗi tải map
- [x] Giao diện PC + mobile (responsive CSS)
- [x] Bàn phím + cảm ứng (joystick ảo analog + nút jump/bomb)
- [x] Không khóa xoay màn hình (hỗ trợ portrait & landscape)
- [x] Pause dừng thực sự game loop; Restart reset đầy đủ trạng thái
- [x] UI tách khỏi gameplay; menu không che nút điều khiển mobile
- [x] Smoke test pass (boot, menu, level select, pause/resume, input, combat/death)

## Phần 1–3: Asset, 100 map, validator (đã làm)
- [x] Asset registry 38 assets, 2 nguồn (CC0, xác minh từ License.txt cục bộ)
- [x] Audio assets (AUD_*) đã bổ sung vào registry
- [x] ASSET_GAP.md ghi rõ asset còn thiếu (water/lava/weather/equipment/music) + URL tải chính thức
- [x] Fallback màu khi asset thiếu (không tạo asset giả)
- [x] 100 map thủ công (MAP000001–MAP000100), không sinh ngẫu nhiên
- [x] Validator 100 map: 0 lỗi (scripts/validate-maps.py)
- [x] Manifest 100 entry (data/map-manifest.json)

## Phần 4–6: Môi trường & thời tiết (đã làm)
- [x] Vùng nước: bơi/nổi/chìm, trọng lực giảm, di chuyển chậm
- [x] Vùng dung nham: sát thương tích lũy theo thời gian
- [x] Thời tiết: sunny/rain/wind/storm, canvas particles (giới hạn 120), lực gió
- [x] Schema MapData mở rộng (waterZones, lavaZones, weather, equipment)

## Phần 8: Equipment & items (đã làm)
- [x] Flying Boots, High-Jump Boots, Shield, Magnet, Healing
- [x] Trạng thái active/cooldown/charges, reset khi restart/chuyển map
- [x] Shield chặn sát thương enemy và lava; Magnet hút coin
- [x] Vẽ fallback màu nếu thiếu asset

## Phần 9: Multiplayer server-authoritative (đã làm)
- [x] WebSocket cùng cổng HTTP (server/index.js + server/multiplayer.js)
- [x] Multiplayer client (src/multiplayer-client.ts): tạo/tham gia phòng, gửi input, vẽ remote players
- [x] Tối đa 4 người/phòng, từ chối người thứ 5
- [x] Danh sách người chơi, trạng thái ready/playing/dead/finished/disconnected
- [x] Đồng bộ trạng thái qua physics tick server-side (20 tick/s)
- [x] Heartbeat, timeout, rate limit, giới hạn payload
- [x] Server log broadcast player_joined/player_left

## Phần 10 — Tài khoản, Settings, Âm thanh (đã làm)
- [x] Đăng ký / Đăng nhập / Đăng xuất (backend thực tế)
- [x] Hồ sơ / tên hiển thị
- [x] Hash mật khẩu (PBKDF2), không lưu plaintext
- [x] Bảo vệ session (HttpOnly cookie), validate đầu vào
- [x] Giới hạn đăng nhập sai (rate limit)
- [x] Không lưu secret trong frontend / không có API secret ở client
- [x] Âm lượng nhạc / hiệu ứng, bật/tắt âm thanh
- [x] Lưu tùy chọn vào sessionStorage
- [x] Tôn trọng autoplay policy trình duyệt
- [x] Loading, error, empty states

## Giai đoạn G — Triển khai cloud1ram (đã làm)
- [x] Build frontend bằng Vite (`npm run build`)
- [x] Production server Node.js tách biệt (`server/index.js`)
- [x] Port cấu hình theo biến môi trường (`PORT`)
- [x] WebSocket trên cùng cổng (multiplayer)
- [x] Health endpoint (`/health`)
- [x] SPA routing fallback
- [x] Secret trong biến môi trường (`.env`, nằm trong `.gitignore`)
- [x] Không chạy Vite dev server làm production
- [x] Hướng dẫn triển khai + rollback (`CLOUD1RAM.md`)

## Chưa làm (dành cho bản sau)
- [ ] Client-side multiplayer co-op hoàn chỉnh (dây nối, kéo/cứu đồng đội)
- [ ] Kiểm thử multiplayer với ≥2 client độc lập trên production URL thật
- [ ] Kiểm thử RAM/CPU gần production (1 GB)
- [ ] Bổ sung file asset thật cho water/lava/weather/equipment/music (theo ASSET_GAP.md)
- [ ] Kiểm tra URL production thực tế trước khi tuyên bố deploy thành công

## Quy tắc không vi phạm
- [ ] Không reset/revert/xóa công việc đã có
- [ ] Không viết lại toàn bộ game từ đầu
- [ ] Không tự sinh bản đồ / procedural generation
- [ ] Không tạo test giả / asset giả / multiplayer chỉ giao diện
- [ ] Mọi tính năng báo hoàn thành phải có bằng chứng kiểm thử
