# Raw Requirement: Ứng dụng tự chấm điểm cầu lông (v8)

> Cập nhật theo các câu trả lời của host. So với v7: bỏ xoay tua và ghép đội tự động (host tự quyết), chốt nền tảng web chạy trên MacBook, chốt cách xử lý phát lại.

## Bối cảnh
- Người dùng là host cầu lông, tổ chức buổi chơi cho khoảng 7–8 khách trên **1 sân**.
- Mỗi ván có 4 người trên sân (đánh đôi, 2 đấu 2). Những người còn lại chờ.
- Số người không cố định: có buổi 8, có buổi 7. **Luôn có người đến muộn**, có người về sớm.
- Buổi chơi khoảng 2 tiếng, gồm nhiều **ván** nối tiếp nhau. App có thể tắt giữa các ván.
- **Ai vào sân, chia đội thế nào do host quyết định**, app không gợi ý hay xếp lịch.

## Thiết bị
- Người dùng chỉ có iPhone và MacBook (Apple Silicon).
- iPhone **chỉ làm camera**, đặt **sau đường biên cuối, trên cao**. MacBook đặt ngay gần đó.
- Kết nối bằng **Continuity Camera** (ưu tiên cắm cáp USB để ổn định và sạc). iPhone hiện ra như webcam của Mac.
- MacBook xử lý toàn bộ: nhận diện realtime, tính điểm, hiển thị bảng điểm và mini map, lưu dữ liệu và video.

## Nền tảng
- **Miễn phí 100%**: không dùng dịch vụ hay thư viện trả phí.
- **Web app chạy trong Chrome trên MacBook**, không cần backend.
- Dữ liệu lưu trên MacBook (IndexedDB của trình duyệt), xuất được JSON/CSV.
- Video lưu thành file vào thư mục trên Mac.

## Mục tiêu
- Chấm điểm từng pha và từng ván, hoàn toàn bằng camera.
- Quay video từng ván, gắn với timestamp của pha.
- Lịch sử các ván trong buổi.
- Mini map vị trí người chơi realtime.
- Dashboard dữ liệu di chuyển (phase sau).

## Luật chấm điểm
- Mỗi ván là **1 set 21 điểm**, rally point: đội thắng pha được đúng 1 điểm.
- Ván kết thúc khi:
  - một đội đạt 21 điểm và hơn đối thủ ít nhất 2 điểm (ví dụ 21-19, 22-20), hoặc
  - một đội đạt 30 điểm (khi 29-29, pha kế tiếp quyết định ván ở 30-29).
- **Không đổi sân**, cả trong ván lẫn giữa các ván: mỗi đội cố định một nửa sân (gần hoặc xa camera) suốt ván.
- App không cần **hiển thị** ai đang giao cầu, nhưng bên trong vẫn suy luận từ người phát và ô giao cầu.
- Có undo để hoàn tác đúng một pha gần nhất.

## Chấm điểm tự động (yêu cầu chính)
- **Chấm điểm phụ thuộc hoàn toàn vào camera.** Không có người bấm điểm trong lúc chơi.
- Nhóm chơi **đứng đúng ô phát cầu theo luật** (đã xác nhận).
- Không theo dõi quả cầu. Suy ra đội thắng pha từ **đội hình phát cầu** của pha kế tiếp:
  - Đội thắng pha sẽ phát cầu pha tiếp theo.
  - Đội đang phát cầu thắng pha: người phát đổi sang ô giao cầu bên kia (hai người cùng đội đổi chỗ); đội nhận cầu giữ nguyên.
  - Đội nhận cầu thắng pha: họ thành đội phát cầu, không ai đổi chỗ.
  - Điểm đội phát cầu chẵn: phát từ ô phải; lẻ: ô trái. Dùng để kiểm tra chéo.
- Đội được xác định theo **nửa sân** (gần/xa camera), không cần tracking danh tính chính xác để chấm điểm.
- **Pha đầu ván (0-0)**: đội phát trước được nhận ra từ đội hình phát cầu đầu tiên.
- Nhận biết đội hình phát cầu: cả 4 người gần như đứng yên khoảng 1 giây, người phát và người nhận ở hai ô giao cầu chéo nhau, gần vạch giao cầu ngắn.
- **Phát lại / đội hình lặp lại**: nếu đội hình mới giống hệt pha trước (cùng đội phát, cùng ô giao), đó có thể là phát lại, hoặc đội phát thắng liền 2 pha mà camera bỏ lỡ một lần phát. App hiện popup "Phát lại?":
  - Host xác nhận trong 5 giây: không cộng điểm.
  - Hết 5 giây không xác nhận: cộng **+2** cho đội phát cầu (thắng liền 2 pha thì người phát đổi ô 2 lần, quay về ô cũ; khớp kiểm tra chẵn lẻ).
- **Pha cuối ván**: không có lần phát cầu tiếp theo. Khi host bấm End, nếu chỉ một đội có thể kết thúc ván bằng điểm tiếp theo thì gán điểm cho đội đó; nếu không xác định được thì hỏi host.
- **Khi không chắc chắn** (đội hình sai luật, che khuất): giữ pha ở trạng thái chờ, tự giải quyết bằng các lần phát cầu tiếp theo; phát hiện mâu thuẫn thì tính lại tỉ số từ lịch sử.
- Host chỉ sửa tỉ số trong trường hợp hiếm app không tự giải quyết được.

## Người chơi
- Danh sách người chơi của buổi: thêm người đến muộn và đánh dấu người về sớm bất kỳ lúc nào.
- Nhận diện bằng cơ thể, không dùng khuôn mặt. Gán tên thủ công.

## Vòng đời một ván
1. Host chọn 4 người vào sân và gán mỗi người cho một chấm màu (xanh, đỏ, tím, vàng), đồng thời xác định đội gần và đội xa camera.
2. Host bấm **Start**: bắt đầu quay video và chấm điểm từ 0-0.
3. Host bấm **End**: xử lý pha cuối, lưu kết quả ván và file video. Tỉ số về 0-0 cho ván mới.
- Kết quả ván (đội, tỉ số, thời gian bắt đầu/kết thúc, lịch sử pha, file video) được lưu trước khi reset.
- Trong lúc quay, giữ MacBook không vào chế độ ngủ (Wake Lock).
- Nếu mất camera giữa ván, giữ nguyên tỉ số và tiếp tục khi camera kết nối lại.

## Bảng điểm và lịch sử
- Hiển thị trên màn hình MacBook (đủ cho MVP).
- Có **lịch sử các ván** của buổi: đội, tỉ số, thời gian, mở lại video.

## Mini map
- Sân thu nhỏ với 4 chấm màu xanh, đỏ, tím, vàng; vị trí cập nhật realtime từ tọa độ mét trên sân.

## Thiết lập camera
- Khung hướng dẫn để căn sân trên màn hình (chọn các góc sân để tính homography).
- Lưu khung sân đã calibrate để dùng lại khi đặt camera cùng vị trí.
- Lưu ý: camera sau biên cuối nên người ở nửa sân xa nhỏ và dễ bị người nửa gần che.

## Phân pha
### MVP
- Score engine và bộ suy luận từ đội hình phát cầu, test bằng dữ liệu giả lập.
- Pipeline CV trong trình duyệt: camera → nhận diện người → homography → phát hiện đội hình phát cầu.
- Bảng điểm, popup phát lại, undo, sửa tỉ số dự phòng.
- Mini map 4 chấm màu realtime.
- Quản lý người chơi trong buổi, Start/End ván, lưu video và lịch sử ván.
- Khung calibrate sân.

### Phase sau
- Dashboard di chuyển (quãng đường, tốc độ, heatmap, biểu đồ theo thời gian).
- Lưu người chơi và thống kê qua nhiều buổi (khách quen).
- Gửi kết quả cho khách.
- Nhiều sân.
- Theo dõi quả cầu để tăng độ chính xác.

## Câu hỏi còn mở
Không còn.
