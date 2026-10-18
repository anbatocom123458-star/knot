# KNOT Asset ID Policy

## Quy tac

- ID la ma noi bo KNOT, khong phu thuoc ten file. Da cap ID thi khong doi, khong tai su dung, ke ca khi asset bi go bo.
- Cap ID moi theo tung category va tang dan: `Z` tile, `BG` background, `SK` skin, `AN` animation, `FX` effect, `OB` obstacle, `IT` item, `EN` enemy, `SFX` sound effect. Map dung `MAP` + 6 chu so.
- Moi tile dat trong map la mot instance rieng co `instanceId` duy nhat; `assetId` tham chieu den loai tile trong registry.
- Animation tham chieu skin bang `skinId`. Frame cua animation la cac file Kenney da kiem tra, khong phai animation tu suy dien tu ten file.
- `sourceFile` ghi ten file goc trong goi Kenney; `path` la duong dan tu root repository toi file dang duoc su dung. Di chuyen file phai cap nhat `path`, khong doi ID.
- Field chua kiem chung de `null` hoac duoc ghi ro `unknown`; khong dien gia tri suy doan.

## ID da cap

- `BG01`: background hills cua New Platformer Pack.
- `Z01`-`Z03`: ba tile grass horizontal (left, middle, right) cua New Platformer Pack.
- `Z04`-`Z06`: ba tile grass vertical (top, middle, bottom) cua New Platformer Pack, dung cho cot tuong thu cong trong map.
- `SK01`: bien the nhan vat beige.
- `AN01`-`AN03`: pose idle, cap walk hai frame, va pose jump cho `SK01`.
- `FX01`: chuoi 25 frame White puff tu Smoke Particles; tach biet voi animation nhan vat.
- `OB01`: sprite spikes.
- `EN01`-`EN03`: frame di chuyen A/B va pose thiet cua slime tu New Platformer Pack; hitbox va vung tuan tra quy dinh tung instance trong map.
- `IT01`: sprite door open duoc dung lam cong thoat demo.
- `IT02`-`IT05`: coin gold, gem yellow, bomb pickup va bomb active cung goi New Platformer Pack.

Khong cap ID cho animation fall, land hoac double-jump rieng vi goi asset da chon khong co sprite tuong ung. Nhay kep tai demo tai su dung `AN03` va kich hoat `FX01`.