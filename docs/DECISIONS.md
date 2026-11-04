# Nhật ký quyết định

Quyết định do Claude tự chọn theo đề xuất khi làm theo `docs/PLAN.md`. Host có thể đổi bất kỳ mục nào.

## Đã chốt cùng host
- Web app trong Chrome trên MacBook, không backend, miễn phí 100%.
- Continuity Camera, iPhone sau biên cuối trên cao.
- Không đổi sân; host tự chọn người và chia đội; phát lại hết 5 giây thì +2.
- Engine theo dõi ai đứng ô nào trong mỗi đội và xử lý trường hợp bỏ lỡ lần phát (kể cả trường hợp mất điểm).

## Claude tự quyết

| # | Câu hỏi | Quyết định | Lý do |
|---|---|---|---|
| D1 | Framework giao diện | Preact + `@preact/preset-vite` | ~4 KB, cú pháp như React, đủ cho vài màn hình; không cần thư viện nặng. |
| D2 | Thư viện IndexedDB | Dùng API gốc, tự viết wrapper Promise nhỏ; test bằng `fake-indexeddb` (chỉ dev) | Ít phụ thuộc. |
| D3 | Định dạng video | `video/mp4` nếu `MediaRecorder.isTypeSupported`, ngược lại `video/webm;codecs=vp9` | Chrome mới ghi được mp4, mở được bằng QuickTime. |
| D4 | Lưu file video | File System Access API (`showDirectoryPicker`), lưu handle trong IndexedDB; không có quyền thì tải file về | Ghi thẳng vào thư mục trên Mac, không giới hạn dung lượng trình duyệt. |
| D5 | Mô hình pose | MediaPipe PoseLandmarker lite, `numPoses = 6`, GPU delegate, file model trong `public/models` | Miễn phí, chạy trong trình duyệt, nhiều người; 6 để không bỏ sót khi có người đứng ngoài sân. |
| D6 | Calibrate | Host bấm 4 góc sân đánh đôi, homography DLT | Đơn giản, đủ chính xác cho sân phẳng. |
| D7 | Gán màu người chơi | Xanh + đỏ = đội gần camera, tím + vàng = đội xa. Host bấm vào từng người trên khung hình để gán màu lúc Start; tracker giữ màu theo người gần nhất trong cùng nửa sân | Không đổi sân nên chỉ có thể nhầm màu trong cùng một đội. |
| D8 | Tín hiệu tay | Cổ tay cao hơn vai trên ảnh = giơ vợt | Tín hiệu phụ, engine không phụ thuộc vào nó. |
| D9 | Tham số engine | Phạt vị trí không khớp 1.5, giữ khả năng dự phòng trong biên 2, xét tối đa 3 pha giữa hai lần phát, phạt đội hình sau khi ván kết thúc 0.5 | Chọn theo mô phỏng 200–300 ván (xem phần số liệu). Cần chỉnh lại bằng video thật. |
| D10 | Lưu sự kiện engine | Lưu toàn bộ sự kiện của ván vào IndexedDB ngay khi phát sinh; tỉ số luôn tính lại từ sự kiện | Mở lại app giữa ván không mất gì. |
| D11 | Log vị trí | Lấy mẫu 10 lần/giây, lưu theo ván | Đủ cho mini map xem lại và dashboard sau này. |
| D12 | Commit git | Claude không tự commit; host commit khi muốn | Theo quy tắc chỉ commit khi host yêu cầu. |
| D13 | Chạy thử không cần camera | Có nguồn vị trí giả lập trong app | Kiểm tra toàn bộ luồng trước khi có video thật. |
| D14 | Tên người chơi trùng | Không cho 2 người đang có mặt trùng tên (không phân biệt hoa thường) | Tránh nhầm khi gán màu. |
| D15 | Người về sớm bấm nhầm | Cho phép "quay lại" | Sửa thao tác nhầm. |
| D16 | Số ván đã chơi | Hiển thị số ván của từng người khi chọn người vào sân (chỉ tham khảo, không tự xếp) | Host tự quyết, nhưng có số liệu để công bằng. |
| D17 | Không ghi được video | Vẫn chấm điểm, hiện cảnh báo | Chấm điểm quan trọng hơn video. |
| D18 | Mở lại app giữa ván | Khôi phục tỉ số từ sự kiện đã lưu; video phần sau ghi vào file mới có hậu tố `_tiep` | Không thể nối tiếp file video đã đóng. |
| D19 | Tên file video | `van-03_2026-11-03_19-05.mp4` (số ván, ngày, giờ bắt đầu) | Dễ tìm, sắp xếp đúng thứ tự. |
| D20 | End khi đang có popup phát lại | Coi như hết giờ (không phải phát lại) rồi mới xử lý pha cuối | Nhất quán với quy tắc 5 giây. |
| D21 | Cổng dev server | 5179 (5173 đang bị app khác của host dùng) | Tránh xung đột. |
| D22 | Gợi ý chọn người | Màn hình chuẩn bị ván xếp người ít ván nhất lên đầu; bấm lần lượt gán xanh, đỏ, tím, vàng | Nhanh, vẫn để host quyết. |
| D23 | Giả lập trong app | Hiện "tỉ số thật của giả lập" cạnh tỉ số app chấm; tua nhanh bằng cách phát nhiều khung mỗi nhịp | Kiểm tra độ chính xác ngay trên giao diện. |
| D24 | Giao diện | Nền tối, số điểm rất lớn để đọc từ xa; đội xa bên trái, đội gần bên phải; mini map đội gần ở dưới | Đặt Mac cạnh sân cho người chơi nhìn. |
| D25 | Ghi video theo đoạn | `MediaRecorder` ghi mỗi 2 giây một đoạn, ghi thẳng vào file trong thư mục đã chọn | Tắt app đột ngột chỉ mất vài giây cuối; không giữ cả video trong RAM. |
| D26 | Chất lượng video | Xin 1920×1080, 30 fps, 5 Mbps | ~2,2 GB mỗi giờ; đủ rõ để xem lại và phân tích. |
| D27 | Camera mất giữa ván | Tự kết nối lại mỗi 2 giây; video ghi tiếp sang file `_phan2`, `_phan3`; tỉ số giữ nguyên | Không mất dữ liệu đã có. |
| D28 | Chưa chọn thư mục | Video được tải về Downloads khi kết thúc ván | Vẫn có video dù host quên chọn thư mục. |
| D29 | Màn hình "Thiết bị" | Gộp kết nối camera, thư mục video, trạng thái giữ màn hình sáng; danh sách kiểm tra trước buổi sẽ thêm vào đây ở bước 10 | Một chỗ chuẩn bị trước buổi. |
| D30 | Thứ tự bấm góc | Gần-trái, gần-phải, xa-phải, xa-trái (nhìn từ camera), có kiểm tra tứ giác lồi để bắt lỗi bấm sai thứ tự | Gốc tọa độ ở góc gần-trái, trục y hướng ra xa camera. |
| D31 | Khung hướng dẫn căn camera | Khi camera bật, vẽ lưới vạch sân của profile đang dùng lên hình trực tiếp; host xoay iPhone đến khi lưới trùng vạch | Dùng lại calibrate cũ mà không phải bấm lại 4 góc. |
| D32 | Ảnh để calibrate | Chụp một khung hình từ camera (để bấm trên ảnh đứng yên), hoặc mở ảnh, hoặc ảnh sân mẫu để thử | Người chơi đi lại không làm khó bấm góc. |
| D33 | Cảnh báo độ phân giải | Báo khi độ phân giải camera khác lúc calibrate | Tọa độ pixel đổi theo độ phân giải. |
| D34 | Gán màu lúc đầu ván | Tự động: trong mỗi nửa sân, người bên trái camera nhận màu đầu (xanh, tím); host bấm "Đổi xanh ↔ đỏ" / "Đổi tím ↔ vàng" nếu ngược | Bấm từng người trên hình mất thời gian; gán ngược chỉ làm sai tên trên mini map, không làm sai tỉ số (engine chỉ so vị trí tương đối). |
| D35 | Điểm chạm sân | Trung điểm mắt cá và gót; bị che thì ước lượng từ hông và vai (độ tin cậy thấp) | Homography chỉ đúng cho điểm nằm trên mặt sân. |
| D36 | Vùng nhận người | Sân đánh đôi cộng 1 m hai bên, 2 m sau biên cuối; ngoài vùng này bỏ qua (người chờ, khán giả) | Người chơi hay lùi sau biên cuối. |
| D37 | Giữ vị trí khi bị che | Giữ vị trí cũ tối đa 1,5 giây | Đủ để bộ phát hiện đội hình vẫn thấy 4 người khi bị che ngắn. |
| D38 | Model pose | Ưu tiên file `public/models/pose_landmarker_lite.task` (tải bằng `npm run model`), không có thì lấy từ CDN của Google; wasm chép vào `public/mediapipe` khi chạy `npm run dev`/`build` | Chạy được ở sân không có internet nếu tải model trước. |
| D39 | Tần số CV | 12 khung/giây | Đủ cho vị trí người chơi, nhẹ cho Mac khi đồng thời ghi video. |
| D40 | Giả lập | Người chơi di chuyển liên tục giữa các đội hình (không dịch chuyển tức thời) | Để test được cả tracker; phát hiện được lỗi đếm thừa khi người chơi đứng yên giữa pha. |
