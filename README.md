# Badminton Tracker

Ứng dụng tự chấm điểm cầu lông đánh đôi bằng camera, dùng trong buổi chơi do host tổ chức (7–8 người, 1 sân).
iPhone làm camera, MacBook chạy app trong Chrome: nhận diện người chơi, tự cộng điểm, hiện bảng điểm và mini map, ghi video từng ván.

Miễn phí hoàn toàn, chạy trên máy, không cần server.

## Cách app chấm điểm

App không theo dõi quả cầu. Nó nhìn **đội hình phát cầu** trước mỗi pha và suy ra đội thắng pha trước, theo luật đánh đôi:

- Đội thắng pha sẽ phát cầu pha tiếp theo.
- Đội đang phát thắng thì hai người của đội đó đổi ô cho nhau; đội nhận thắng thì không ai đổi chỗ.
- Điểm chẵn phát ô phải, lẻ phát ô trái.

App theo dõi ai đứng ô nào trong mỗi đội (4 chấm màu), nên hầu như mọi pha đều suy ra được mà không cần biết ai cầm cầu.
Khi chưa chắc, app giữ nhiều khả năng và tự loại dần ở các lần phát sau. Chi tiết và số liệu mô phỏng: `docs/DECISIONS.md`.

**Điều kiện để chấm đúng:** người chơi đứng đúng ô phát cầu theo luật, không đổi sân trong ván, camera thấy rõ cả 4 người khi phát cầu.

## Cài đặt (một lần)

Cần: MacBook có Node.js 20 trở lên, Chrome, iPhone cùng Apple ID (Continuity Camera, macOS 13 trở lên).

```bash
npm install
```

Tải mô hình phát hiện người về máy (EfficientDet-Lite2, khoảng 12 MB) để dùng ở sân không có internet:

```bash
npm run model
```

## Chạy app

```bash
npm run dev
```

Mở Chrome tại http://localhost:5179.

## Trước mỗi buổi chơi

Vào màn hình **Thiết bị** và làm theo danh sách kiểm tra:

1. **Đặt iPhone** sau biên cuối, trên cao, nghiêng xuống sao cho thấy trọn 4 góc sân. Cắm sạc, bật Không làm phiền.
2. **Kết nối camera**: bấm "Kết nối camera", cho phép Chrome dùng camera. App tự chọn iPhone nếu thấy.
3. **Chọn thư mục lưu video** (chỉ lần đầu; app nhớ cho các lần sau).
4. **Calibrate** (màn hình Calibrate):
   - Lần đầu ở một vị trí đặt camera: bấm "Chụp khung hình camera", rồi bấm lần lượt 4 góc sân đánh đôi: gần-trái, gần-phải, xa-phải, xa-trái (nhìn từ camera). Kéo điểm để chỉnh cho lưới vàng trùng vạch sân. Lưu.
   - Các lần sau: mở Calibrate, xoay iPhone đến khi lưới vàng trùng vạch sân là xong.

## Trong buổi chơi

1. **Người chơi**: bấm "Bắt đầu buổi chơi", thêm tên. Người đến muộn thêm bất kỳ lúc nào; người về sớm bấm "Về sớm".
2. **Chuẩn bị ván**: bấm 4 người theo thứ tự xanh, đỏ (đội gần camera), tím, vàng (đội xa). Người ít ván nhất được xếp lên đầu để tham khảo. Bấm **Start**: app bắt đầu ghi video, tỉ số 0-0.
3. **Đang chơi**: bấm **"Chấm bằng camera"**. Đặt Mac cho người chơi nhìn được bảng điểm.
   - Điểm được cộng khi camera thấy lần phát cầu **tiếp theo** (vì vậy điểm cập nhật trễ một nhịp, đó là bình thường).
   - Popup **"Phát lại?"**: khi đội hình giống hệt lần trước. Bấm "Đúng, phát lại" nếu là phát lại; không bấm gì trong 5 giây thì app cộng 2 điểm cho đội phát.
   - Tên trên mini map bị ngược thì bấm "Đổi xanh ↔ đỏ" hoặc "Đổi tím ↔ vàng" (không ảnh hưởng tỉ số).
   - "Hoàn tác pha gần nhất" và "Sửa tỉ số" chỉ dùng khi app sai.
4. Hết ván bấm **Kết thúc ván**: app tự cộng pha cuối nếu chỉ một đội có thể thắng; nếu không thì hỏi host. Kết quả và video được lưu.
5. **Lịch sử**: xem kết quả, xem lại video, xuất JSON/CSV.

Tắt app giữa ván cũng không mất tỉ số: mở lại là app khôi phục ván đang dở (video phần sau ghi vào file `_tiep`).

## Chạy thử không cần camera

Ở màn hình Đang chơi, bấm **"Chạy giả lập"**: 4 người ảo chơi một ván theo đúng luật. App hiện "tỉ số thật của giả lập" cạnh tỉ số app chấm để so.

## Phân tích video đã quay

Màn hình **Phân tích video**: mở file video, bấm "Phân tích". App chạy lại toàn bộ nhận diện và chấm điểm, hiện từng lần phát (bấm để nhảy tới chỗ đó trong video), so với tỉ số thật bạn nhập, và xuất JSON.
Video quay trước khi calibrate thì dừng ở khung có sân rõ, bấm "Calibrate từ khung này".

Đây là công cụ để kiểm tra độ chính xác trên video thật và tinh chỉnh tham số.

## Xử lý sự cố

| Hiện tượng | Cách xử lý |
|---|---|
| Không thấy camera iPhone | Mở khóa iPhone, đặt gần Mac, cùng Apple ID, bật Wi‑Fi và Bluetooth. Cắm cáp cho ổn định. |
| "Chưa cho phép dùng camera" | Bấm biểu tượng camera trên thanh địa chỉ Chrome, chọn Cho phép. |
| Mất camera giữa ván | App giữ tỉ số và tự kết nối lại mỗi 2 giây; video ghi tiếp sang file `_phan2`. |
| Điểm không tự cộng | Xem dòng "x/4 người" ở màn hình Đang chơi: dưới 4 nghĩa là camera không thấy đủ người. Kiểm tra góc camera, ánh sáng, calibrate. |
| Tỉ số hiện "Đang chờ xác định" | App chưa phân biệt được hai khả năng; sẽ tự rõ sau vài lần phát. Nếu đến lúc kết thúc ván vẫn chưa rõ, app hỏi host. |
| Không lưu được video vào thư mục | Màn hình Thiết bị: bấm "Cấp quyền ghi" hoặc chọn lại thư mục. |

## Phát triển

```bash
npm test          # chạy toàn bộ test
npm run typecheck # kiểm tra kiểu
npm run build     # build bản chạy tĩnh vào dist/
```

Cấu trúc mã nguồn:

| Thư mục | Nội dung |
|---|---|
| `src/core/` | Luật điểm, score engine, bộ phát hiện đội hình phát cầu, homography (thuần, có test) |
| `src/app/` | Buổi chơi, MatchController, AppModel, danh sách kiểm tra |
| `src/data/` | IndexedDB, xuất JSON/CSV |
| `src/media/` | Camera, ghi video, lưu file, giữ màn hình sáng |
| `src/cv/` | Phát hiện người theo ô (MediaPipe Object Detector), tracker 4 màu, giả lập, phân tích video |
| `src/ui/` | Giao diện Preact |
| `docs/` | Kế hoạch (`PLAN.md`) và nhật ký quyết định (`DECISIONS.md`) |

Yêu cầu gốc: `raw_requirement.md`. Quy tắc làm việc: `CLAUDE.md`.

## Giới hạn hiện tại

- Đã thử trên video YouTube: nhận ra đủ 4 người ở 62–97% khung hình, nhưng chưa có video ván thật của nhóm để đo độ chính xác chấm điểm. Quay ván đầu tiên ở 1080p rồi đo bằng màn hình Phân tích video.
- Người ở nửa sân xa nhỏ và hay bị lưới che chân, nên đặt camera càng cao càng tốt.
- Engine xét tối đa 3 pha giữa hai lần phát nhìn thấy. Camera bỏ lỡ nhiều đội hình liên tiếp thì có thể sai điểm.
- Hết ván nên bấm **Kết thúc ván** ngay: nếu người chơi tình cờ đứng yên đúng một đội hình phát cầu hợp lệ trước khi bấm, app có thể cộng thêm một pha.
- Một sân, một buổi; chưa có thống kê qua nhiều buổi, dashboard di chuyển, cân bằng trình độ.
