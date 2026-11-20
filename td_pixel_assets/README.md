# TD Pixel Pack: bộ asset Tower Defense phong cách pixel

Bộ sprite pixel art gốc cho game thủ thành theo phong cách Kingdom Rush. Toàn bộ hình được vẽ mới bằng code (thư mục `_generator/`), không lấy hình từ Kingdom Rush hay pack nào khác.

Mở `preview.html` bằng trình duyệt để xem mọi animation và màn demo ghép từ chính các asset này.

## Quy cách chung

| Mục | Quy cách |
|---|---|
| Kích thước gốc | 1× (pixel thật). Muốn to hơn thì phóng bằng số nguyên (2×, 3×, 4×) và **tắt lọc ảnh** (nearest / point filter) |
| Tile | 32×32 |
| Quái / lính / hero | khung 32×32, chân ở y = 30. Ogre 48×48, boss 64×64 |
| Tháp | khung 64×64, anchor (32, 57) = điểm chạm đất |
| Hướng nhìn | Sprite `*_side` quay **sang phải**. Đi sang trái thì lật X (flipX) |
| Ánh sáng | Từ trên-trái, viền tối `#1d1322`, bảng màu ở `palette.png` / `palette.json` |

## Định dạng file

Mỗi sprite sheet có một file `.png` (lưới đều, **mỗi hàng là một animation**) và một file `.json` cùng tên:

- `frames`: dạng TexturePacker "JSON Hash", Phaser / PixiJS đọc trực tiếp. Tên khung là `<tên>_<animation>_<số khung>`.
- `animations`: `row`, `frames`, `fps`, `loop`, `frameNames`, cùng các mốc như `hitFrame` (khung gây sát thương), `releaseFrame` (khung nhả đạn), `spawnFrame` (khung lính ra cửa).
- `meta.anchor`: điểm neo theo pixel (thường là điểm chân chạm đất).
- Tháp có thêm `unitSlots` (vị trí cung thủ / pháp sư đứng trên tháp), `projectileOrigin` (miệng pháo) hoặc `spawnPoint` (cửa doanh trại).

Atlas tĩnh (`props/props_static`, `ui/icons_16`, `ui/buttons`, `ui/hud`) dùng cùng định dạng JSON Hash, đóng gói nhiều sprite khác cỡ vào một ảnh.

## Danh sách

**Quái** (`enemies/`): goblin, orc, skeleton, shaman (niệm phép hồi máu), dark_knight, wolf, bat (bay, cần vẽ `effects/shadow_small` dưới đất), ogre 48px, demon_boss 64px có cánh.
Animation: `idle`, `walk_side`, `walk_down`, `walk_up`, `attack`, `death`. Bat có `fly` và `death`. Mỗi JSON quái có `suggestedStats` (HP, tốc độ, vàng) để tham khảo cân bằng.

**Hero & lính** (`heroes/`, `units/`): hero_paladin (thêm `special`), soldier của doanh trại, archer_unit (16×16, bắn 3 hướng: side / down / up), mage_unit (idle, cast).

**Tháp** (`towers/`), mỗi loại có 3 cấp:
- `archer_tower_l1..l3`: idle (cờ bay). Cung thủ là sprite riêng, đặt theo `unitSlots`.
- `mage_tower_l1..l3`: idle (cầu phép trôi), attack (tụ phép).
- `artillery_tower_l1..l3`: idle, attack (giật nòng, chớp lửa, khói).
- `barracks_l1..l3`: idle, door (mở cửa thả lính).
- `build_plot` (ô trống, có trạng thái hover) và `construction` (giàn giáo đang xây, 8 khung).

**Đạn** (`projectiles/`): arrow (8 và 16 hướng dựng sẵn, khỏi xoay pixel art), magic_bolt, bomb, fireball, heal_orb.

**Hiệu ứng** (`effects/`): explosion, magic_hit, hit_spark, smoke_puff, dust, coin_spin, upgrade_sparkle, heal, flame, portal (cổng ra quái), soul, hero_respawn, slow_rune, shadow_small / medium / large.

**Tile** (`tiles/`):
- `terrain_path`: 3 kiểu cỏ, cỏ hoa, cỏ bụi, 3 kiểu đất, cùng 13 ô autotile cho đường đất.
- `terrain_water`: 13 ô autotile nước có bờ cát, mỗi ô 4 khung chuyển động.

Tên ô autotile: `TL T TR / L C R / BL B BR` là mép ngoài của vùng đường. `iTL iTR iBL iBR` là góc lõm, đặt tên theo góc còn cỏ. Mọi ô dùng chung một đường viền tuần hoàn nên ghép kiểu gì cũng liền. Đường nên rộng ít nhất 2 ô.

Cách chọn ô cho một ô đường (4 hướng N/S/W/E là có đường hay không):
```
!N && !W -> TL   !N && !E -> TR   !S && !W -> BL   !S && !E -> BR
!N -> T   !S -> B   !W -> L   !E -> R
đủ 4 hướng: thiếu chéo NW -> iTL, NE -> iTR, SW -> iBL, SE -> iBR, còn lại -> C
```

**Trang trí** (`props/`): cây sồi, cây thông, tall grass (có bản đung đưa), lửa trại, cổng thành (điểm quái cần tới, có cờ bay), cùng atlas tĩnh gồm bụi cây, đá, gốc cây, nấm, hoa, hàng rào, biển chỉ đường, thùng, hòm, xương, cầu gỗ, giếng, lều, cột đổ nát, hang.

**UI** (`ui/`): 26 icon 16×16, nút tròn và nút chữ nhật (mỗi nút 3 trạng thái normal / pressed / disabled), ô xây tháp trong menu vòng (có bản khóa), panel 9-slice (gỗ, đá, giấy, góc 16px), thanh máu và thanh máu boss, vùng bắn, con trỏ, nút gọi đợt (nhấp nháy), cờ tập kết, font số.

## Dùng nhanh

**Phaser 3**
```js
// preload
this.load.atlas('goblin', 'enemies/goblin.png', 'enemies/goblin.json');
// create: số khung và fps lấy từ mục "animations" trong JSON
this.anims.create({ key: 'goblin_walk_side',
  frames: this.anims.generateFrameNames('goblin', { prefix: 'goblin_walk_side_', start: 0, end: 5 }),
  frameRate: 10, repeat: -1 });
// pixel art: game config { pixelArt: true }
```

**Godot 4**: tạo `SpriteFrames`, chọn "Add frames from sprite sheet", nhập số cột / hàng theo `frameWidth` / `frameHeight` trong JSON, mỗi hàng là một animation. Texture Filter đặt `Nearest`.

**Unity**: Sprite Mode = Multiple, Slice theo Grid By Cell Size bằng `frameWidth`×`frameHeight`, Filter Mode = Point, Compression = None, Pivot lấy từ `meta.anchor`.

## Sửa và vẽ lại

Thư mục `_generator/` chứa mã Python đã vẽ toàn bộ bộ này (cần Python 3, `numpy` và `pillow`):
```
cd _generator
python3 build.py        # vẽ lại toàn bộ vào _generator/out/td_pixel_assets
python3 gen_preview.py  # tạo lại preview.html
```
Đổi màu ở `px.py` (bảng `P`), đổi thông số quái ở `roster.py` (kích thước, vũ khí, khiên, mũ, áo choàng, cánh), tháp ở `towers.py`, hiệu ứng ở `fx.py`, tile và trang trí ở `tiles.py`, UI ở `ui.py`.
