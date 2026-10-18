# Triển khai KNOT lên CloudCode cloud1ram (1 GB RAM)

Tài liệu này hướng dẫn vận hành triển khai bản production của KNOT trên máy chủ
mục tiêu: **CloudCode cloud1ram, Node.js, RAM 1 GB**.

## 1. Điều kiện trước khi triển khai

* Xác minh quyền truy cập server (SSH hoặc console quản trị của CloudCode).
* Xác minh runtime Node.js đã cài (`node --version`, khuyến nghị Node 18+).
* Xác minh port trống (mặc định 3001, có thể thay bằng `PORT`).
* Xác minh dung lượng disk đủ cho `dist/` + `node_modules` (khoảng 200–500 MB).
* Không ghi đè dự án hoặc cấu hình hiện có trên server.
* Chuẩn bị kế hoạch rollback (xem mục 7).

## 2. Cấu trúc sau build

```
knot/
├── dist/              # Frontend production build (Vite)
│   ├── index.html     # SPA entry
│   └── bundle/        # JS/CSS + assets sao chép
├── server/
│   ├── index.js       # HTTP production server (API + static + SPA fallback)
│   └── auth.js        # Auth module (session in-memory, pbkdf2 hash)
├── .env               # Biến môi trường (KHÔNG commit)
├── .env.example       # Mẫu biến môi trường
├── package.json       # Scripts: build, server, start
└── ...
```

## 3. Biến môi trường (chỉ ở server)

Tạo file `.env` từ `.env.example` và điền giá trị thật. Không đưa secret vào
frontend. Ví dụ:

```
PORT=3001
HOST=0.0.0.0
SESSION_COOKIE_NAME=knot_session
KNOT_ADMIN_SECRET=change_me_to_a_strong_random_string
```

`KNOT_ADMIN_SECRET` là tùy chọn. Nếu không set, các admin endpoint sẽ bị vô hiệu
hoặc không có. `SESSION_COOKIE_NAME` nên đổi từ giá trị mặc định trong
production.

## 4. Cách chạy

### 4.1 Build frontend (làm một lần, trên máy build hoặc server)

```bash
cd /path/to/knot
npm install --omit=dev   # hoặc npm install nếu cần build tool trên server
npm run build            # tsc --noEmit && vite build → dist/
```

`npm run build` sẽ typecheck (tsc --noEmit) rồi build Vite. `dist/` sẽ chứa
frontend tĩnh. Plugin Vite sẽ sao chép `data/`, `maps/`, `assets/` vào `dist/`.

### 4.2 Chạy production server

```bash
cd /path/to/knot
export NODE_ENV=production
npm run server           # node server/index.js
```

Server lắng nghe trên `$PORT` (mặc định 3001). Nó cung cấp:
* `GET /health` — health endpoint (trả JSON `{ ok: true, service: "knot", ... }`).
* `POST /api/auth/register` — đăng ký.
* `POST /api/auth/login` — đăng nhập (set HttpOnly session cookie).
* `POST /api/auth/logout` — đăng xuất.
* `GET /api/auth/me` — thông tin phiên hiện tại.
* `GET /api/auth/session` — kiểm tra phiên.
* Static files từ `dist/` + SPA fallback (tất cả route không phải `/api` và
  `/health` trả `dist/index.html`).

### 4.3 Không chạy Vite dev server làm production

Không chạy `npm run dev` / `vite` trên server production. Chỉ dùng
`npm run server` sau `npm run build`.

### 4.4 Process manager (khuyên dùng)

Để server tự restart khi crash và khởi động cùng hệ thống, dùng `systemd`
hoặc `PM2`. Ví dụ systemd unit (`/etc/systemd/system/knot.service`):

```
[Unit]
Description=KNOT game server
After=network.target

[Service]
Type=simple
WorkingDirectory=/path/to/knot
EnvironmentFile=/path/to/knot/.env
ExecStart=/usr/bin/node server/index.js
Restart=always
RestartSec=5
User=knot
# Giới hạn RAM cho an toàn trên 1 GB
MemoryMax=768M

[Install]
WantedBy=multi-user.target
```

Sau đó:
```bash
sudo systemctl daemon-reload
sudo systemctl enable knot
sudo systemctl start knot
sudo systemctl status knot
```

Logs: `journalctl -u knot -f`.

## 5. Kiểm tra sau khi triển khai

| Mục | Cách kiểm tra |
|-----|---------------|
| Health endpoint | `curl http://<host>:<PORT>/health` |
| SPA route | Mở `http://<host>:<PORT>/` trong trình duyệt, kiểm tra menu chính hiện |
| Asset 404 | Mở DevTools → Network, đảm bảo không có yêu cầu asset trả 404 |
| API auth | `curl -X POST http://<host>:<PORT>/api/auth/register ...` |
| Session cookie | Kiểm tra cookie `knot_session` có `HttpOnly`, `SameSite=Lax` |
| Logs | `journalctl -u knot` hoặc stdout của process |
| Restart | `sudo systemctl restart knot`, sau đó kiểm tra `/health` |

## 6. Bảo mật

* Secret chỉ nằm trong biến môi trường server (`.env`), không commit vào Git.
* Không có debug panel, test endpoint, hoặc tài khoản thử nghiệm trong build
  production.
* Mật khẩu được hash bằng PBKDF2 (SHA-512, 100 000 lần lặp), không lưu plaintext.
* Session cookie là `HttpOnly`, `SameSite=Lax`; `Secure` nếu `NODE_ENV=production`.
* Rate limit đăng nhập sai (5 lần → khóa 15 phút).
* Chỉ chạy một HTTP server cần thiết.

## 7. Kế hoạch rollback

Trước khi triển khai phiên bản mới:
1. Sao lưu thư mục build đang hoạt động: `cp -r dist dist.backup.<date>`.
2. Sao lưu `.env` và `server/`.
3. Nếu build mới bị lỗi, khôi phục:
   ```bash
   sudo systemctl stop knot
   rm -rf dist
   mv dist.backup.<date> dist
   sudo systemctl start knot
   ```

## 8. Giới hạn RAM 1 GB

* Server dùng session in-memory (Map). Mỗi phiên consumes vài KB. Với 1 GB RAM,
  có thể phục vụ hàng nghìn phiên đơn lẻ. Nếu cần nhiều instance, phải thay
  session store bằng Redis / database và cập nhật tài liệu vận hành.
* Không tự khẳng định khả năng chịu tải cho multiplayer 4 client đồng thời cho
  đến khi đã chạy thử nghiệm thực tế trên server mục tiêu.

## 9. Bước cần người vận hành thực hiện (nếu không có quyền truy cập)

1. Truyền mã nguồn (không bao `node_modules`, `dist`, `.env`) lên server.
2. Tạo `.env` từ `.env.example` và điền `PORT`, `SESSION_COOKIE_NAME`,
   `KNOT_ADMIN_SECRET`.
3. Chạy `npm install --omit=dev` rồi `npm run build`.
4. Thiết lập systemd/PM2 và khởi động service.
5. Kiểm tra `http://<host>:<PORT>/health` và mở trang game trong trình duyệt.
