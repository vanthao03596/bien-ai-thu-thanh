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
npm test           # 143 bài test cho đường đi, cơ chế trận đấu, kỹ năng quái, nhánh tháp, phiên chơi, gợi ý, dữ liệu màn chơi và cân bằng
npm run balance    # in bảng cân bằng: DPS trên vàng của tháp, vàng thưởng theo máu, ngân sách từng màn, kết quả của dàn bot
npm run build      # kiểm tra kiểu rồi đóng gói vào dist/ (đặt lên host tĩnh nào cũng chạy)
npm run preview    # chạy thử bản dist/
```

## Cách chơi

- Chọn độ khó (Dễ, Thường, Khó) ở màn chọn màn chơi. Sao được tính riêng cho từng độ khó.
- Bấm vào ô đất trống để mở vòng chọn tháp, bấm vào tháp để nâng cấp, bán, hoặc đặt điểm tập kết (doanh trại).
- Bán tháp hoàn 60% số vàng đã chi. Trước khi gọi đợt quái đầu tiên thì hoàn đủ 100%, cứ thoải mái thử bố cục.
- Tháp cấp 3 hiện hai nút chọn nhánh chuyên biệt. Chọn xong, hai nút đó thành hai kỹ năng, mỗi kỹ năng mua được ba bậc.
- Bấm nút đầu lâu ở đầu đường để gọi đợt quái. Gọi sớm được thưởng vàng. Rê chuột lên nút để xem đợt tới có quái gì và chúng có chiêu gì.
- Bấm vào tướng (hoặc phím `H`) rồi bấm vào bản đồ để ra lệnh di chuyển.
- Hai phép ở góc dưới trái: Mưa lửa (`1`) và Viện binh (`2`).
- `Space` tạm dừng, `F` tua nhanh x2, chuột phải hoặc `Esc` để hủy, `M` tắt tiếng.
- Lăn chuột (hoặc phím `+` / `-`) để phóng to, thu nhỏ bản đồ. Khi đang phóng to, giữ chuột trái và kéo để di chuyển khung nhìn.
- Trên màn hình cảm ứng: chạm lần đầu để xem thông tin, chạm lần nữa để xác nhận (xây, nâng cấp, bán, gọi đợt quái). Dùng hai ngón để phóng to, một ngón kéo để di chuyển.
- Điện thoại cầm dọc sẽ thấy lời nhắc xoay ngang, trận đấu tự tạm dừng. Trên Android nút "Xoay giúp tôi" bật toàn màn hình và khóa hướng ngang.
- Người chơi mới được nhắc từng bước bằng một dòng gợi ý ở cuối màn hình (xây tháp, gọi quái, điều tướng, dùng phép, nâng cấp, điểm tập kết, rẽ nhánh, gọi sớm). Mỗi gợi ý chỉ hiện đến khi làm theo hoặc hết giờ, rồi không hiện lại.

Bốn loại tháp, mỗi loại ba cấp:

| Tháp | Vai trò |
|---|---|
| Tháp cung | Sát thương vật lý. Bắn nhanh, tầm xa, bắn được quái bay, kém trước giáp dày |
| Doanh trại | Ba người lính chặn quái trên đường, tự hồi sinh |
| Tháp phép | Sát thương phép, bỏ qua giáp (bị kháng phép cản), cấp 3 làm chậm |
| Tháp pháo | Sát thương nổ, giáp chỉ cản được một nửa. Nổ lan, không bắn được quái bay |

Mỗi loại tháp ở cấp 3 rẽ thành hai nhánh cấp 4. Nhánh mở dần theo màn: màn 1 chưa có, màn 2 mở một nhánh mỗi loại, màn 3 mở đủ tám nhánh.
Bộ asset không có hình cấp 4 nên tháp chuyên biệt dùng hình cấp 3 nhuộm màu.

| Tháp gốc | Nhánh | Điểm mạnh | Hai kỹ năng |
|---|---|---|---|
| Tháp cung | Liên nỗ | Bắn dồn dập | Tên tẩm độc, Loạt tiễn |
| Tháp cung | Thần xạ | Tầm rất xa, xuyên nửa giáp | Phát chí mạng, Tên xuyên gân |
| Tháp phép | Tháp băng | Làm chậm một nửa tốc độ | Bão tuyết, Băng vỡ |
| Tháp phép | Tháp sấm | Sát thương phép cao nhất | Sét lan, Phá giáp |
| Tháp pháo | Thần công | Nổ rất rộng, rất mạnh | Đạn chùm, Dầu lửa |
| Tháp pháo | Giàn hỏa tiễn | Bắn nhanh, hạ được quái bay | Loạt hỏa tiễn, Chấn động |
| Doanh trại | Cấm vệ quân | Lính giáp nặng | Tự chữa thương, Giáp gai |
| Doanh trại | Đao khách | Lính đánh nhanh và đau | Chém lan, Phi đao |

Quái có kỹ năng riêng, mỗi loại cần một cách đối phó:

| Quái | Kỹ năng |
|---|---|
| Pháp sư bộ lạc | Hồi máu cho quái xung quanh, trừ khi đang bị lính giữ chân |
| Yêu tinh xạ thủ | Bắn lính từ xa |
| Sói ma | Lướt xuyên qua lính, gần như miễn sát thương vật lý |
| Orc cuồng nộ | Còn nửa máu thì chạy nhanh và đánh đau hơn |
| Phù thủy yểm bùa | Khóa một tháp bắn trong vài giây |
| Thầy gọi hồn | Gọi bộ xương (không cho vàng) |
| Dơi chúa | Chết thì vỡ thành ba dơi quỷ |
| Quỷ đầm lầy | Tự hồi máu khi không bị đánh |
| Tù trưởng Orc | Thúc quái xung quanh chạy nhanh hơn |
| Chúa chằn, Quỷ vương | Boss: dậm đất hạ lính; Quỷ vương còn gọi dơi và khóa tháp |

Giữ được từ 18/20 mạng trở lên là ba sao, từ 8 mạng là hai sao (tính riêng cho từng độ khó). Thắng màn cuối sẽ hiện bảng tổng kết cả chiến dịch.
Số sao, độ khó đang chọn và các gợi ý đã xem lưu trong `localStorage`; nút "Xóa tiến độ" ở màn chọn màn chơi xóa cả hai (bấm hai lần để xác nhận).

## Đưa lên mạng

`npm run build` tạo thư mục `dist/` chỉ gồm file tĩnh với đường dẫn tương đối, đặt ở host nào cũng chạy (kể cả thư mục con).

- GitHub Pages: đẩy repo lên GitHub, vào Settings > Pages chọn Source là "GitHub Actions". Workflow `.github/workflows/deploy.yml` sẽ chạy test, build và xuất bản mỗi lần đẩy lên `main`.
- itch.io hoặc host khác: nén nội dung của `dist/` (`cd dist && zip -r ../bien-ai.zip .`) rồi tải lên.

## Cấu trúc mã nguồn

```
src/
  main.ts          cấu hình Phaser.Game, nạp font rồi khởi động
  app.ts           trạng thái dùng chung (âm thanh, tiến độ) và chuyển cảnh có fade
  display.ts       tỉ lệ pixel nguyên: canvas luôn là bội số của 768x432, camera zoom theo
  assets.ts        đọc JSON của bộ asset, lập danh sách file cho loader của Phaser
  session.ts       một lượt chơi: mô phỏng + lựa chọn của người chơi, không phụ thuộc Phaser
  tips.ts          gợi ý cho người chơi mới, chọn theo tình hình trên sân, không phụ thuộc Phaser
  orientation.ts   tạm dừng và nút xoay màn hình khi điện thoại cầm dọc (lời nhắc nằm trong index.html)
  audio.ts         hiệu ứng âm thanh tổng hợp bằng WebAudio, phát qua sound manager của Phaser
  save.ts          lưu số sao và các gợi ý đã xem
  data/            chỉ số quái và kỹ năng của chúng, tháp, nhánh cấp 4, tướng, phép, độ khó và ba màn chơi
  sim/             mô phỏng trận đấu, không phụ thuộc trình duyệt nên test được bằng Node
    world.ts       quái, lính, tháp, đạn, đợt quái, phép, hiệu ứng trạng thái (chậm, độc, choáng, mòn giáp)
    path.ts        đường đi bo góc, tô ô đường
    bot.ts         người chơi tự động (màn tiêu đề và test cân bằng)
    balance.ts     số đo cân bằng tính từ dữ liệu: DPS trên vàng, vàng theo máu, ngân sách màn chơi
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
public/            favicon (cắt từ icons_16 của bộ asset)
```

Mô phỏng (`sim/`) vẫn là nguồn sự thật duy nhất. Lớp hiển thị chỉ đọc trạng thái mỗi frame rồi đặt vị trí,
khung hình và độ sâu (`setDepth(y)`) cho sprite, và tự thêm phần thuần hình ảnh: particle, ánh sáng,
nháy trắng khi trúng đòn, viền sáng quanh tháp đang chọn, rung camera khi pháo nổ.

Bản đồ hiện vừa khít màn hình ở mức zoom 1. Camera đã hỗ trợ cuộn; để có bản đồ lớn hơn màn hình cần thêm
kích thước riêng cho từng màn (hiện là hằng số `MAP_COLS` / `MAP_ROWS`) và nới giới hạn khung nhìn trong `scenes/battle.ts`.

## Cân bằng

Các quy tắc dưới đây đều có test giữ (`tests/balance.test.ts`), `npm run balance` in ra số đo hiện tại.

Sát thương có bốn loại. Giáp và kháng phép là phần trăm bị chặn (0 đến 1):

| Loại | Nguồn | Bị chặn bởi |
|---|---|---|
| Vật lý | tên, lính, tướng | toàn bộ giáp |
| Nổ | bom, hỏa tiễn | một nửa giáp |
| Phép | tháp phép, chiêu của tướng | kháng phép |
| Chuẩn | Mưa lửa, độc, dầu lửa, giáp gai | không gì cả |

- Một đòn đánh trực tiếp gây số điểm nguyên, làm tròn xuống sau giáp. Vì vậy giáp là một ngưỡng: mũi tên 4 điểm bắn vào
  Sói ma (giáp 80%) không gây gì, trong khi phép và pháo vẫn hiệu quả. Sát thương theo thời gian (độc, lửa) không làm tròn.
- Giáp của quái lưu hai số: giá trị thô (`rawArmor`) và giá trị đã kẹp trong 0..1 (`armor`), nên hiệu ứng tăng giảm giáp gỡ theo
  thứ tự nào cũng về đúng số cũ. Mỗi quái có ba hệ số nhân (`dmgFactor` gây ra, `takenFactor` nhận vào, `speedFactor` tốc độ)
  cho mọi hiệu ứng tăng giảm sức mạnh, ví dụ cơn cuồng nộ của Orc.
- Tháp bắn một mục tiêu (cung, phép) mua được 7.5 đến 9 DPS trên mỗi 100 vàng ở cả ba cấp, nâng cấp không bao giờ lời hơn xây
  mới. Nhánh cấp 4 còn 5 đến 7.5: tiền trả cho kỹ năng chứ không cho chỉ số. Tháp pháo chỉ bằng 25 đến 50% vì đổi lấy nổ lan.
- Kỹ năng tháp: bậc 1 trả giá gốc, mỗi bậc sau trả cùng một mức. Mỗi kỹ năng chỉ mạnh lên theo một trục.
- Vàng thưởng chỉ theo máu (ở mức Khó): quái nhỏ 6.3 đến 8.5 máu mỗi vàng, quái vừa 9.5 đến 11.5, quái to và boss 14.5 đến 16.
  Giáp, kháng phép, cánh hay kỹ năng không được thưởng thêm, quái do quái khác gọi ra không cho vàng.
- Độ khó: máu quái trong `data/enemies.ts` ghi ở mức Khó, mức Thường nhân 0.9, mức Dễ nhân 0.8 (boss đặt tay qua trường `eased`).
  Tháp, giá và vàng thưởng giống nhau ở mọi độ khó. Độ khó được áp vào bảng quái một lần khi vào trận (`enemiesFor`).
- Thước đo độ khó của một màn là "máu quái trên mỗi vàng có được" (vàng đầu màn cộng vàng thưởng). Số này phải tăng dần qua
  các màn: hiện là 5.8, 6.9 và 7.9 ở mức Thường.
- Dàn bốn bot (khác nhau ở thứ tự xây) chơi cả ba màn ở cả ba độ khó, đo số mạng để lọt. Dùng nó để so trước và sau mỗi lần
  chỉnh số, vì kết quả của một bot đơn lẻ dao động rất mạnh.

## Thêm màn chơi

Thêm một `LevelDef` vào `src/data/levels.ts`:

- `paths`: các điểm mốc theo đường lưới ô 32px, đường rộng 2 ô quanh các mốc. Nhiều đường có thể nhập làm một.
- `spawns`: mỗi đường bắt đầu từ mép bản đồ (`edge`), cổng phép (`portal`) hay hang (`cave`).
- `plots`: toạ độ các ô xây tháp. `water` và `bridges` cho sông hồ.
- `waves`: mỗi đợt gồm các nhóm `g(loại quái, số lượng, giãn cách, trễ, đường)`.
- `specs`: các nhánh cấp 4 được mở ở màn này. Bỏ trống thì tháp dừng ở cấp 3.

Cây, bụi, đá và hoa được rải tự động theo `seed`, tránh đường đi, ô xây và giao diện. Chạy `npm test` để kiểm tra ô xây có nằm đè lên đường hay ngoài tầm với không.

## Thêm quái và kỹ năng

Thêm một mục vào `ENEMIES` trong `src/data/enemies.ts`. Quái mới có thể dùng lại sheet có sẵn và phân biệt bằng `tint`, `scale`, `alpha`.
Máu ghi ở mức Khó, vàng thưởng lấy theo máu (xem mục Cân bằng, test sẽ báo nếu lệch).
Trường `abilities` nhận một danh sách kỹ năng, mô phỏng xử lý chung cho mọi loại quái:

| `kind` | Tác dụng |
|---|---|
| `heal` | hồi máu cho quái bị thương trong bán kính |
| `ranged` | dừng lại bắn lính trong tầm |
| `summon` | gọi quái khác ngay cạnh mình, tối đa `casts` lần |
| `split` | chết thì tách thành quái nhỏ |
| `enrage` | dưới ngưỡng máu thì tăng tốc và sát thương |
| `regen` | hồi máu sau `delay` giây không bị đánh |
| `haste` | quái xung quanh chạy nhanh hơn |
| `disable` | khóa một tháp bắn trong tầm |
| `quake` | gây sát thương mọi lính xung quanh |
| `ethereal` | lính không chặn được |

Kỹ năng có `cooldown` phát bằng animation `attack`, nên quái bay (không có animation đó) chỉ dùng được kỹ năng thụ động.
Nhánh tháp và kỹ năng tháp nằm trong `SPECS` và `SKILLS` của `src/data/towers.ts`.
