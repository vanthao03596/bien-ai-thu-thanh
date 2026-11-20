# Biên Ải - Thủ Thành Pixel

Game thủ thành (tower defense) chạy trên trình duyệt, dựng hoàn toàn từ bộ sprite trong `td_pixel_assets/`.
Viết bằng TypeScript + Canvas 2D, không dùng game engine. Bộ asset được giữ nguyên, game đọc thẳng file PNG và JSON trong đó.

## Chạy game

```
npm install
npm run dev        # mở http://localhost:5173
```

Các lệnh khác:

```
npm test           # 55 bài test cho đường đi, cơ chế trận đấu, dữ liệu màn chơi và cân bằng
npm run build      # kiểm tra kiểu rồi đóng gói vào dist/ (đặt lên host tĩnh nào cũng chạy)
npm run preview    # chạy thử bản dist/
```

## Cách chơi

- Bấm vào ô đất trống để mở vòng chọn tháp, bấm vào tháp để nâng cấp, bán, hoặc đặt điểm tập kết (doanh trại).
- Bấm nút đầu lâu ở đầu đường để gọi đợt quái. Gọi sớm được thưởng vàng.
- Bấm vào tướng (hoặc phím `H`) rồi bấm vào bản đồ để ra lệnh di chuyển.
- Hai phép ở góc dưới trái: Mưa lửa (`1`) và Viện binh (`2`).
- `Space` tạm dừng, `F` tua nhanh x2, chuột phải hoặc `Esc` để hủy, `M` tắt tiếng.
- Trên màn hình cảm ứng: chạm lần đầu để xem thông tin, chạm lần nữa để xác nhận.

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
  assets.ts        đọc JSON của bộ asset, nạp ảnh
  gfx.ts           lớp vẽ: sprite, atlas, panel 9-slice, font số, chữ
  game.ts          vòng lặp, màn hình, HUD, vòng chọn tháp, điều khiển
  audio.ts         hiệu ứng âm thanh tổng hợp bằng WebAudio (bộ asset không có âm thanh)
  save.ts          lưu số sao
  data/            chỉ số quái, tháp, tướng, phép và ba màn chơi
  sim/             mô phỏng trận đấu, không phụ thuộc trình duyệt nên test được bằng Node
    world.ts       quái, lính, tháp, đạn, đợt quái, phép
    path.ts        đường đi bo góc, tô ô đường
    bot.ts         người chơi tự động (màn tiêu đề và test cân bằng)
  render/          dựng nền tile + rải cây cỏ, vẽ cảnh theo chiều sâu
tests/             test bằng Vitest
```

## Thêm màn chơi

Thêm một `LevelDef` vào `src/data/levels.ts`:

- `paths`: các điểm mốc theo đường lưới ô 32px, đường rộng 2 ô quanh các mốc. Nhiều đường có thể nhập làm một.
- `spawns`: mỗi đường bắt đầu từ mép bản đồ (`edge`), cổng phép (`portal`) hay hang (`cave`).
- `plots`: toạ độ các ô xây tháp. `water` và `bridges` cho sông hồ.
- `waves`: mỗi đợt gồm các nhóm `g(loại quái, số lượng, giãn cách, trễ, đường)`.

Cây, bụi, đá và hoa được rải tự động theo `seed`, tránh đường đi, ô xây và giao diện. Chạy `npm test` để kiểm tra ô xây có nằm đè lên đường hay ngoài tầm với không.
