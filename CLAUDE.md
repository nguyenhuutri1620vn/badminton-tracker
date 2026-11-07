# CLAUDE.md: Ứng dụng tự chấm điểm cầu lông (v8)

Đọc `raw_requirement.md` để hiểu yêu cầu đầy đủ. File này là quy tắc làm việc và các quyết định kỹ thuật đã chốt.

## Tổng quan
Ứng dụng dùng trong buổi chơi cầu lông đánh đôi do host tổ chức, khoảng 7–8 người, 1 sân, 4 người trên sân mỗi ván. Quay và chấm điểm theo từng ván; app có thể tắt giữa các ván.

## Quyết định đã chốt
- **Thiết bị**: iPhone chỉ làm camera (sau đường biên cuối, trên cao), kết nối Continuity Camera (ưu tiên cáp USB). MacBook đặt gần đó, xử lý mọi thứ.
- **Nền tảng**: web app chạy trong Chrome trên MacBook, không backend, miễn phí 100%.
- **Stack**: TypeScript + Vite, test bằng Vitest. CV trong trình duyệt bằng MediaPipe Object Detector (EfficientDet-Lite2, lớp person) chạy theo ô. Video bằng `MediaRecorder`, ghi file qua File System Access API. Dữ liệu lưu IndexedDB trên Mac, xuất JSON/CSV.
- **Chấm điểm tự động**: suy ra đội thắng pha từ đội hình phát cầu pha kế tiếp, không theo dõi quả cầu. Nhóm chơi đứng đúng ô phát cầu theo luật.
- **Không đổi sân**: đội xác định theo nửa sân (gần/xa camera).
- **Suy ra đội thắng pha** từ 3 tín hiệu, mạnh nhất trước:
  1. Ai đứng ô nào trong mỗi đội (theo màu chấm): hai người chỉ đổi ô khi đội đó thắng pha lúc đang phát. Cần tracking giữ đúng màu suốt ván.
  2. Ô giao cầu và chẵn lẻ điểm.
  3. Số pha đếm từ chuyển động (mỗi lần cả sân dừng lại chuẩn bị phát là một pha): bằng chứng mềm, giúp engine chịu được bỏ lỡ nhiều lần phát.
  - Tín hiệu tay (người nhận giơ vợt) không còn: bộ phát hiện khung người không thấy tay; đội phát luôn do engine suy ra.
- **Engine nhiều khả năng**: giữ song song các diễn biến chưa phân biệt được, loại dần theo số lần phải suy đoán. Bảng điểm chỉ hiện tỉ số mà mọi khả năng đồng ý.
- **Phát lại**: đội hình lặp lại y hệt pha trước → popup "Phát lại?"; host xác nhận trong 5s thì không cộng điểm, hết 5s thì cộng +2 cho đội phát (thắng liền 2 pha, camera bỏ lỡ 1 lần phát).
- **Không xoay tua, không ghép đội**: host tự chọn 4 người và chia đội trước mỗi ván.
- **Theo ván**: Start bắt đầu quay và chấm từ 0-0; End xử lý pha cuối, lưu kết quả và video, về 0-0.
- **Mini map**: 4 chấm xanh, đỏ, tím, vàng; host gán người cho chấm trước khi Start.
- **Bảng điểm**: hiển thị trên màn hình Mac, có lịch sử các ván của buổi.
- **Nhận diện người**: không dùng khuôn mặt, gán tên thủ công.

## Giới hạn đã biết
- Engine xét tối đa 3 pha giữa hai lần phát nhìn thấy (bỏ lỡ tối đa 2 lần phát liên tiếp). Độ chính xác phụ thuộc mạnh vào tỉ lệ bỏ lỡ đội hình; số liệu mô phỏng trong `docs/DECISIONS.md`.

## Ngoài phạm vi MVP
Dashboard di chuyển, thống kê qua nhiều buổi, gửi kết quả cho khách, nhiều sân, theo dõi quả cầu. Thiết kế dữ liệu nên chừa chỗ (ví dụ `Player.skill` có thể null) nhưng không cài đặt.

## Nguyên tắc ưu tiên
1. **Chấm điểm phụ thuộc hoàn toàn vào camera.** Không thiết kế luồng bấm điểm thủ công trong lúc chơi (popup phát lại là xác nhận, không phải bấm điểm).
2. **Tỉ số phải chính xác.** Pha không chắc chắn được giữ ở trạng thái chờ và giải quyết bằng các lần phát cầu tiếp theo; khi có mâu thuẫn thì tính lại tỉ số từ lịch sử.
3. **Score engine tách khỏi CV.** Score engine nhận các quan sát đội hình phát cầu (kèm độ tin cậy) và tự suy ra lịch sử điểm; test được bằng dữ liệu giả lập.
4. **Sửa tỉ số chỉ là dự phòng.**
5. **Đơn giản trước, tối ưu sau.**

## Quy tắc nghiệp vụ
- Ván kết thúc khi một đội đạt 21 và hơn đối thủ ≥ 2, hoặc đạt 30.
- Đội thắng pha được 1 điểm và phát cầu pha kế tiếp.
- Đội phát cầu thắng pha: người phát đổi ô giao cầu. Đội nhận cầu thắng pha: không ai đổi chỗ.
- Điểm đội phát cầu chẵn: phát từ ô phải; lẻ: ô trái. Dùng để kiểm tra chéo.
- Pha đầu ván: đội phát trước lấy từ đội hình phát cầu đầu tiên.
- Pha cuối ván: khi host bấm End mà pha cuối chưa được ghi, gán điểm cho đội duy nhất có thể kết thúc ván; nếu không xác định được thì hỏi host.
- Undo hoàn tác đúng một pha gần nhất.
- Người chơi: thêm người đến muộn, đánh dấu người về sớm bất kỳ lúc nào.

## Kiến trúc
- Logic nghiệp vụ (score engine, bộ suy luận đội hình) là module TypeScript thuần, không phụ thuộc giao diện hay camera, có unit test.
- Dữ liệu chính: `Player`, `Session` (buổi chơi), `Match` (ván, gắn với một file video), `Rally` (pha).
- Pipeline CV (trong trình duyệt): camera → phát hiện người theo ô (điểm chân = giữa đáy khung) → homography về mét → tracker 4 màu → bộ phát hiện đội hình phát cầu và bộ đếm pha → sự kiện cho score engine. Đồng thời lưu `time, player, x_m, y_m` cho mini map và dashboard sau này.
- Giữ Mac không ngủ khi đang ghi (Wake Lock). Mất camera giữa ván thì giữ tỉ số và tiếp tục khi kết nối lại.

## Quy ước làm việc
- Trả lời và comment bằng tiếng Việt; tên biến, hàm, file code bằng tiếng Anh.
- Hỏi lại khi yêu cầu chưa rõ hoặc mâu thuẫn với nguyên tắc ưu tiên.
- Không thêm thư viện nặng nếu chưa cần cho MVP.

## Trạng thái hiện tại
- MVP đã xong 10 bước trong `docs/PLAN.md`; giai đoạn 2 (bước 11–15) để chấm được trên video thật. Đã xong 11 (phát hiện người dạng khung), 12 (đếm pha) và 13 (ngưỡng đứng yên theo độ sâu, bỏ khung bị lưới cắt). Quyết định và giới hạn: `docs/DECISIONS.md`. Hướng dẫn: `README.md`.
- Đo trên video YouTube: thấy đủ 4 người 98% khung (video phong trào 720p). Chưa đo được độ chính xác chấm điểm vì chưa có video ván thật của nhóm.
- Việc tiếp theo: bước 14 (báo khi chưa chắc), 15 (host quay ván thật, chạy Phân tích video với tỉ số thật). Trên video match2 chỉ ~1/3 lần dừng nhận ra đội hình: người chơi hay đứng ngang nhau. Hướng mới: đoán đội phát mỗi pha từ chuyển động (D61), đo bằng nhãn host gán trong Phân tích video (D60).
