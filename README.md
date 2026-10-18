# knot

## Chay thu MAP000001

Demo da chuyen sang Vite + TypeScript (Node.js 20.19+ de chay dev server). Code gameplay, HTML va CSS giu nguyen so voi ban web tinh truoc do.

```sh
npm install
npm run dev
```

Mo `http://localhost:5173`. Lenh khac: `npm run build` (kiem tra TypeScript va dan xuong `dist/`, ke ca `data/`, `maps/`, `assets/`), `npm run preview` (chay ban build `dist/`), `npm run typecheck`.

Tren PC dung `A`/`D` hoac phim mui ten de di chuyen, `Space` de nhay. Tren dien thoai dung cac nut ben duoi khung choi. Nhan Space/nut nhay moi lan de su dung tung luot nhay; giu phim khong kich hoat lap.

Map nam tai `maps/MAP000001/map.json`. Asset Registry va quy chuan ID nam trong `data/`. Asset Kenney duoc dung truc tiep tu `assets/source/kenney/`; file goc va cac archive khong bi sua.

## Pham vi demo

Chi co mot map thu cong. Demo co mot nhan vat, va cham nen, trong luc, nhay kep, hazard va cong thoat; khong co multiplayer, day noi, he thong cuu dong doi hoac sinh map. Xem `data/asset-id-policy.md` de biet gioi han xac minh cua asset va animation.