# knot

## Chay thu MAP000001

Demo dang chay tren Vite + TypeScript (Node.js 20.19+). Gameplay, HTML va CSS giu nguyen trong so voi ban web tinh truoc, bo sung them Stage 6 (gameplay).

```sh
npm install
npm run dev
```

Mo `http://localhost:5173`. Lenh khac: `npm run build` (kiem tra TypeScript va dan xuong `dist/`, ke ca `data/`, `maps/`, `assets/`), `npm run preview` (chay ban build `dist/`), `npm run typecheck`, `npm test` (vitest, unit test logic).

### Dieu khien

- PC: `A`/`D` hoac phim mui ten di chuyen, `Space` nhay / nhay kep / nhay tuong, `B` nem bom.
- Mobile: nut ben duoi khung choi (`←`, `→`, `↑ JUMP`, `✱ BOMB`). Nhan Space/nut nhay moi lan de su dung tung luot nhay; giu phim khong kich hoat lap.

### Gameplay (Stage 6)

- Wall slide + wall jump: ap vao tuong khi dang roi thi truot cham, nhan Space de nhay ban vao khoang trong; co thoi gian chan re-grab ngay sau moi lan nhay tuong.
- Quai slime tuan tra theo vung thiet ke tay trong map; cham tuong hoac dot bien thi dao nguoc, khong roi khoi platform.
- Giem dau quai: roi xuong dinh quai = quai chet + ban nay; cham sang ben = mat 1 mau va bi day lui, co i-frame 1.2s (khong trung sat thuong nhieu lan trong cung va cham) + hieu ung nhap nhay.
- HP 3 tim, chet het mau hoac roi vao hut/bay gai = respawn.
- Vat pham: coin, gem, bom (nhặt trong map); bom nay duoc nem bang `B`/nut BOMB, no sau 1s, sat thuong quai trong ban kinh 64px.
- HUD: tim, so bom, so coin/gem tren canvas; loi phan hoi hien tai `#status`.

### Kiem thu

- `npm test`: 62 unit test cho collision, jump/wall logic, enemy patrol/stomp, item, bomb, combat (vitest).
- `npm run build`: TypeScript khong loi + build production.
- Smoke test headless (can 1 lan `npx playwright install chromium --only-shell`):

```sh
npm run preview &          # chay ban build
node scripts/gameplay-smoke.mjs
```

- `scripts/png-bounds.ts`: do bounding box alpha PNG (phuc vu dat hitbox).

Map nam tai `maps/MAP000001/map.json` (ke ca `enemies`, `items` thiet ke tay). Asset Registry va quy chuan ID nam trong `data/`. Asset Kenney duoc dung truc tiep tu `assets/source/kenney/`; file goc va cac archive khong bi sua.

## Pham vi demo

Chi co mot map thu cong (khong sinh map). Demo co nhan vat, va cham nen, trong luc, nhay kep, nhay tuong, gai, quai tuan tra, giem dau, bom, vat pham va cong thoat; khong co multiplayer, day noi, he thong cuu dong doi hoac tien trinh luu server. Xem `data/asset-id-policy.md` de biet gioi han xac minh cua asset va animation.