# Kế hoạch hoàn thành MVP

Mỗi bước có tiêu chí "xong khi". Vòng lặp tự động làm bước đầu tiên chưa đánh dấu `[x]`, cập nhật file này khi xong.
Quyết định phát sinh ghi trong `docs/DECISIONS.md`.

## Kiến trúc tổng quát

```
iPhone (Continuity Camera)
   │ getUserMedia
   ▼
CameraSource ──► MediaRecorder ──► file video từng ván (thư mục do host chọn)
   │ khung hình 10–15 fps
   ▼
PoseLandmarker (MediaPipe, GPU) ──► điểm chân + cổ tay/vai của tối đa 6 người
   ▼
Homography (4 góc sân đã calibrate) ──► tọa độ mét
   ▼
CourtTracker: lọc người trong sân, gán 4 chấm màu (đội gần/xa cố định theo nửa sân)
   ├──► mini map + log vị trí (time, player, x_m, y_m)
   ▼
ServeFormationDetector ──► ServeObservation
   ▼
MatchEngine (nhiều khả năng) ──► tỉ số, popup phát lại, pha cuối
   ▼
MatchController ──► lưu Match/Rally vào IndexedDB, bảng điểm, lịch sử
```

Mã nguồn:
- `src/core/`: logic thuần, có unit test (engine, detector, homography, tracker, session, controller).
- `src/data/`: IndexedDB repository, xuất JSON/CSV.
- `src/media/`: camera, ghi video, wake lock, lưu file.
- `src/cv/`: MediaPipe pose, pipeline khung hình, nguồn giả lập.
- `src/ui/`: giao diện Preact.

## Các bước

- [x] **1. Score engine và bộ phát hiện đội hình phát cầu**
  Xong khi: engine nhiều khả năng, theo dõi vị trí từng người, xét chuỗi tối đa 3 pha giữa hai lần phát; mô phỏng cả ván pass.

- [x] **2. Mô hình dữ liệu và lưu trữ**
  - Kiểu `Player`, `Session`, `Match`, `RallyRecord`, `PositionSample`, `CalibrationProfile`.
  - `Repository` trên IndexedDB (API gốc, không thư viện): CRUD session, player, match, lưu sự kiện engine của ván để tính lại tỉ số sau khi tắt app.
  - Xuất JSON toàn bộ buổi, CSV kết quả ván và CSV vị trí.
  - Xong khi: test với `fake-indexeddb` pass, typecheck sạch.

- [x] **3. Quản lý buổi chơi (logic thuần)**
  - Tạo buổi, thêm người (kể cả đến muộn), đánh dấu về sớm, đổi tên.
  - Chuẩn bị ván: chọn 4 người, gán màu (xanh, đỏ, tím, vàng), xác định đội gần/xa (xanh + đỏ = gần, tím + vàng = xa).
  - Xong khi: unit test các ràng buộc (đủ 4 người khác nhau, người đã về không được chọn).

- [x] **4. MatchController (logic thuần, có test bằng fake)**
  - Start: tạo Match, bắt đầu ghi video, reset engine về 0-0.
  - Nhận ServeObservation → engine → lưu sự kiện; phát sự kiện cho UI.
  - Popup phát lại: đếm 5 giây, hết giờ gửi `isReplay = false`.
  - Undo, sửa tỉ số, End (tự gán pha cuối hoặc hỏi host), lưu kết quả trước khi reset.
  - Khôi phục ván đang dở khi mở lại app (từ sự kiện đã lưu).
  - Xong khi: test luồng đầy đủ với camera/ghi hình giả.

- [x] **5. Giao diện (Preact)**
  - Màn hình: Buổi chơi (danh sách người), Chuẩn bị ván, Đang chơi (bảng điểm lớn, mini map, popup, undo, sửa tỉ số, End), Lịch sử ván (xem lại video), Calibrate, Kiểm tra trước buổi.
  - Chế độ giả lập: nguồn vị trí giả để chạy thử toàn bộ app không cần camera.
  - Xong khi: chạy `npm run dev`, đi hết luồng một ván bằng chế độ giả lập trong trình duyệt.
  - Đã kiểm tra: ván giả lập x10 trong Chrome, app chấm 22-20 khớp tỉ số thật của giả lập, lưu vào Lịch sử.

- [x] **6. Camera, ghi video, giữ máy không ngủ**
  - Chọn thiết bị camera (ưu tiên tên chứa "iPhone"), 1280×720 hoặc 1920×1080.
  - `MediaRecorder` mp4 nếu Chrome hỗ trợ, ngược lại webm; ghi theo ván, lưu vào thư mục chọn bằng File System Access API (lưu handle để dùng lại), dự phòng tải về.
  - Wake Lock khi đang ghi; mất camera giữa ván thì giữ tỉ số, thử kết nối lại.
  - Xong khi: test phần thuần (chọn định dạng, tên file), chạy thử với webcam trong trình duyệt.
  - Đã kiểm tra: test đơn vị cho định dạng, chọn camera, ghi theo đoạn, lưu thư mục, wake lock; màn hình Thiết bị báo lỗi đúng khi bị chặn camera. **Chưa thử với camera thật** (khung trình duyệt của Claude chặn camera): host cần thử trong Chrome.

- [x] **7. Calibrate sân**
  - Homography 4 điểm (DLT, giải hệ 8×8) ảnh ↔ mét, có test.
  - Màn hình calibrate: bấm 4 góc sân đánh đôi trên khung hình, vẽ lưới sân chiếu ngược để kiểm tra, lưu profile, dùng lại.
  - Xong khi: test homography (sai số < 1 cm với điểm tổng hợp), màn hình hoạt động với ảnh tĩnh.
  - Đã kiểm tra: bấm 4 góc trên ảnh sân mẫu, lưới chiếu ngược trùng vạch, lưu và đặt làm profile đang dùng; ván mới tự gắn calibrate đang dùng.

- [x] **8. Pipeline CV realtime**
  - MediaPipe PoseLandmarker (model lite, file model đặt trong `public/models` để chạy offline), `numPoses = 6`, chạy 10–15 fps.
  - Điểm chân = trung điểm hai mắt cá; `handRaised` = cổ tay cao hơn vai.
  - CourtTracker: lọc người trong sân (+ biên 0.5 m), gán màu theo nửa sân và người gần nhất, giữ ID khi bị che ngắn.
  - Nối vào detector, engine, mini map, log vị trí.
  - Xong khi: test tracker bằng dữ liệu giả; chạy được với webcam.
  - Đã kiểm tra: test trích pose, tracker (giữ màu, người bị che, người ngoài sân, đổi màu), và chạy trọn 3 ván từ pose giả lập (có 2 người đứng ngoài sân) ra đúng tỉ số; MediaPipe tải và chạy trong Chrome. **Chưa thử với người thật** (khung trình duyệt của Claude chặn camera).

- [ ] **9. Phân tích video có sẵn (để tinh chỉnh bằng video thật)**
  - Màn hình mở file video đã quay, chạy pipeline, xuất dòng thời gian quan sát và tỉ số, so với tỉ số host nhập tay.
  - Xong khi: chạy được trên một video bất kỳ, xuất JSON quan sát.

- [ ] **10. Hoàn thiện**
  - Danh sách kiểm tra trước buổi (camera, pin, ánh sáng, calibrate, thư mục lưu).
  - `README.md` hướng dẫn cài đặt và sử dụng bằng tiếng Việt.
  - `npm run build` sạch, toàn bộ test pass, kiểm tra luồng trong trình duyệt.
