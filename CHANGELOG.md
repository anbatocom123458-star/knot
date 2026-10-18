# KNOT — Changelog

## [0.4.0] — Chưa phát hành (Fix mobile controls, visual quality, multiplayer client)

### Thêm
* Multiplayer client (src/multiplayer-client.ts): WebSocket đến server cùng origin, tạo/tham gia phòng (mã 6 ký tự, tối đa 4 người), gửi input điều khiển mỗi frame, vẽ người chơi khác trên canvas (hình chữ nhật màu + tên), heartbeat/server-authoritative do server xử lý.
* Nút "Đối tác" trên menu chính để vào phòng/tạo phòng.

### Sửa
* **Joystick di động**: dead zone giảm (0.15 → 0.1), làm mượt vector (SMOOTHING 0.35), núm to hơn (62×62px), đế to hơn (150×150px), pointer capture gắn đúng phần tử chứa listener → núm di chuyển theo ngón tay và reset đúng khi nhả, không nhảy vị trí khi kéo ra ngoài đế.
* **Bố cục điều khiển di động**: `.controls` là overlay tuyệt đối nằm bên trong `.game-shell` (trên canvas), joystick dưới bên trái, nút nhảy/bom cụm riêng dưới bên phải, không chồng lấn hitbox.
* **Không khóa xoay màn hình**: xóa `.landscape-hint` và media query `max-aspect-ratio`, cho phép chơi cả portrait và landscape.
* **Máu lên trên cùng trái**: HUD vẽ HP và bom ở góc trên trái canvas (thay vì dưới cùng).
* **Nút nhảy bên phải**: nút JUMP nằm cụm riêng bên phải, cách joystick rõ ràng, không bị chồng lấn.
* **Map đẹp hơn**: vẽ viền nền (strokeRect) cho mỗi platform block, không thay đổi dữ liệu 100 map.
* **Không auto-next-level**: màn Victory hiển thị nút "Màn tiếp theo" để người chơi chủ động chọn.
* Loại emoji tim trong HUD, vẽ pixel-heart bằng canvas.

### Giữ lại
* 88 test đơn vị (81 cũ + 7 joystick mới).
* 100 map thủ công, validator 100/100 map (0 lỗi).
* Vite + TypeScript, typecheck sạch, production build OK.

