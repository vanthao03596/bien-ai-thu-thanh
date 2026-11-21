# Biên Ải - Thủ Thành Pixel

Game thủ thành (tower defense) chạy trên trình duyệt, dựng hoàn toàn từ bộ sprite trong `td_pixel_assets/`.
Viết bằng TypeScript trên [Phaser 4](https://phaser.io) (renderer WebGL). Bộ asset được giữ nguyên, Phaser nạp thẳng file PNG và JSON trong đó.

## Chạy game

```
npm install
npm run dev        # mở http://localhost:5173
```

Các lệnh khác:

```
npm test           # 71 bài test cho đường đi, cơ chế trận đấu, phiên chơi, dữ liệu màn chơi và cân bằng
npm run build      # kiểm tra kiểu rồi đóng gói vào dist/ (đặt lên host tĩnh nào cũng chạy)
npm run preview    # chạy thử bản dist/
```

## Cách chơi

- Bấm vào ô đất trống để mở vòng chọn tháp, bấm vào tháp để nâng cấp, bán, hoặc đặt điểm tập kết (doanh trại).
- Bấm nút đầu lâu ở đầu đường để gọi đợt quái. Gọi sớm được thưởng vàng.
- Bấm vào tướng (hoặc phím `H`) rồi bấm vào bản đồ để ra lệnh di chuyển.
- Hai phép ở góc dưới trái: Mưa lửa (`1`) và Viện binh (`2`).
- `Space` tạm dừng, `F` tua nhanh x2, chuột phải hoặc `Esc` để hủy, `M` tắt tiếng.
- Lăn chuột (hoặc phím `+` / `-`) để phóng to, thu nhỏ bản đồ. Khi đang phóng to, giữ chuột trái và kéo để di chuyển khung nhìn.
- Trên màn hình cảm ứng: chạm lần đầu để xem thông tin, chạm lần nữa để xác nhận. Dùng hai ngón để phóng to, một ngón kéo để di chuyển.

Bốn loại tháp, mỗi loại ba cấp:

| Tháp | Vai trò |
|---|---|
| Tháp cung | Bắn nhanh, tầm xa, bắn được quái bay |
| Doanh trại | Ba người lính chặn quái trên đường, tự hồi sinh |
| Tháp phép | Sát thương phép, bỏ qua giáp, cấp 3 làm chậm |
| Tháp pháo | Nổ lan, không bắn được quái bay |

Giữ được từ 18/20 mạng trở lên là ba sao, từ 8 mạng là hai sao. Tiến độ lưu trong `localStorage`.

## Cấu trúc mã nguồn

```
src/
  main.ts          cấu hình Phaser.Game, nạp font rồi khởi động
  app.ts           trạng thái dùng chung (âm thanh, tiến độ) và chuyển cảnh có fade
  display.ts       tỉ lệ pixel nguyên: canvas luôn là bội số của 768x432, camera zoom theo
  assets.ts        đọc JSON của bộ asset, lập danh sách file cho loader của Phaser
  session.ts       một lượt chơi: mô phỏng + lựa chọn của người chơi, không phụ thuộc Phaser
  audio.ts         hiệu ứng âm thanh tổng hợp bằng WebAudio, phát qua sound manager của Phaser
  save.ts          lưu số sao
  data/            chỉ số quái, tháp, tướng, phép và ba màn chơi
  sim/             mô phỏng trận đấu, không phụ thuộc trình duyệt nên test được bằng Node
    world.ts       quái, lính, tháp, đạn, đợt quái, phép
    path.ts        đường đi bo góc, tô ô đường
    bot.ts         người chơi tự động (màn tiêu đề và test cân bằng)
  scenes/
    boot.ts        nạp asset kèm thanh tiến độ, đăng ký animation và font số
    battle.ts      chiến trường: chạy mô phỏng, camera (zoom, kéo, rung), filter
    hud.ts         giao diện trong trận và toàn bộ thao tác của người chơi
    menu.ts        màn tiêu đề và chọn màn, vẽ đè lên trận đấu do bot chơi
  view/
    battle-view.ts sprite của mọi thứ trên sân, đồng bộ từ mô phỏng mỗi frame
    map.ts         dựng nền tile thành texture, rải cây cỏ
    fx.ts          particle và ánh sáng cộng màu
  ui/              chữ, số bitmap, nút, panel, vòng chọn tháp, bảng tạm dừng và kết quả
tests/             test bằng Vitest
```

Mô phỏng (`sim/`) vẫn là nguồn sự thật duy nhất. Lớp hiển thị chỉ đọc trạng thái mỗi frame rồi đặt vị trí,
khung hình và độ sâu (`setDepth(y)`) cho sprite, và tự thêm phần thuần hình ảnh: particle, ánh sáng,
nháy trắng khi trúng đòn, viền sáng quanh tháp đang chọn, rung camera khi pháo nổ.

Bản đồ hiện vừa khít màn hình ở mức zoom 1. Camera đã hỗ trợ cuộn; để có bản đồ lớn hơn màn hình cần thêm
kích thước riêng cho từng màn (hiện là hằng số `MAP_COLS` / `MAP_ROWS`) và nới giới hạn khung nhìn trong `scenes/battle.ts`.

## Thêm màn chơi

Thêm một `LevelDef` vào `src/data/levels.ts`:

- `paths`: các điểm mốc theo đường lưới ô 32px, đường rộng 2 ô quanh các mốc. Nhiều đường có thể nhập làm một.
- `spawns`: mỗi đường bắt đầu từ mép bản đồ (`edge`), cổng phép (`portal`) hay hang (`cave`).
- `plots`: toạ độ các ô xây tháp. `water` và `bridges` cho sông hồ.
- `waves`: mỗi đợt gồm các nhóm `g(loại quái, số lượng, giãn cách, trễ, đường)`.

Cây, bụi, đá và hoa được rải tự động theo `seed`, tránh đường đi, ô xây và giao diện. Chạy `npm test` để kiểm tra ô xây có nằm đè lên đường hay ngoài tầm với không.
