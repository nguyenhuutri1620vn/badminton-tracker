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
| D41 | Cách duyệt video khi phân tích | Tua từng bước 1/12 giây (seek) rồi chạy pose trên khung đó | Không bỏ khung nào dù máy chậm; chậm hơn thời gian thực nhưng kết quả lặp lại được. |
| D42 | Popup phát lại khi phân tích | Coi như hết giờ (+2) | Giống khi host không bấm gì trong trận thật. |
| D43 | So với tỉ số thật | Host nhập tỉ số thật sau khi phân tích; app báo khớp/lệch; xuất JSON gồm từng lần phát (thời điểm, đội phát, ô, vị trí từng người, tỉ số sau) | Dữ liệu để tinh chỉnh tham số detector và engine. |
| D44 | Calibrate cho video cũ | Nút "Calibrate từ khung này" lấy khung hình đang dừng của video sang màn hình Calibrate | Video quay trước khi calibrate vẫn phân tích được. |
| D45 | Git | Host yêu cầu commit và push: nhánh `develop` đã push lên `origin` (repo trống nên `develop` là nhánh đầu tiên, chưa có `main`) | Theo yêu cầu host ngày 2026-11-04. |
| D46 | Danh sách kiểm tra trước buổi | Tự kiểm tra: camera (có phải iPhone), calibrate (tỉ lệ khung hình), thư mục video, model trên máy, giữ màn hình sáng, số người; host tự đánh dấu: sạc iPhone, Không làm phiền, thấy đủ 4 góc, ánh sáng | Gom mọi thứ dễ quên vào một chỗ; mục cảnh báo không chặn. |
| D47 | Đội hình giả sau ván | Engine luôn xét khả năng "ván đã kết thúc, đội hình vừa thấy là thừa" (phạt 0,5) | Người chơi đứng chờ sau ván không làm cộng thừa điểm, trừ khi họ đứng đúng y một đội hình phát cầu hợp lệ (xem giới hạn). |
| D48 | Nguồn hình thử | Nút "Dùng tab/màn hình" ở màn hình Thiết bị (chia sẻ tab qua `getDisplayMedia`) thay cho camera; dừng chia sẻ thì không tự kết nối lại | Thử app bằng video trận đấu đang phát ở tab khác khi chưa ra sân. |
| D49 | Nhận diện theo ô | Chia khung thành tối đa 6 ô theo calibrate (`planTiles`): ô nửa xa nhỏ (≈2,4 lần chiều cao người xa nhất), ô nửa gần đủ chứa trọn người sát camera, hai ô kề nhau chồng ít nhất bằng bề ngang một người. Chạy pose trên từng ô (chế độ IMAGE, tối đa 3 người mỗi ô) | Chạy thử trên video thật: cả khung hình chỉ nhận ra 1–2 người (MediaPipe thu khung về ~256 px nên người xa chỉ còn ~20 px), 0% khung thấy đủ 4 người, không chấm được điểm nào. Chia ô: 97% (video thi đấu) và 62% (video phong trào 720p, góc rộng) khung thấy đủ 4 người. Model `full`/`heavy` không giúp gì. |
| D50 | Người bị mép ô cắt | Bỏ người có thân/chân vượt ra ngoài mép ô (trừ mép trùng mép khung hình); gộp hai phát hiện cách nhau dưới 0,6 m | Ô chỉ thấy nửa người thì chân bị đoán từ hông, lệch hơn 1 m, tạo ra người thứ hai không có thật. |
| D51 | Ngưỡng tin cậy pose | 0,25 (trước là 0,4) | Người ở nửa xa nhỏ và bị lưới che chân; ngưỡng 0,2 thấy thêm ~40% người ở nửa xa. Người giả ngoài sân bị vùng nhận người và tracker loại. |
| D52 | Tốc độ phân tích video | 8 khung/giây video (trước 12) | Mỗi khung giờ chạy 6 ô (~150–220 ms trong Chrome không có màn hình); 8 khung/giây vẫn đủ cho cửa sổ đứng yên 1 giây. |
| D53 | Bộ phát hiện người | Thay MediaPipe Pose bằng MediaPipe Object Detector EfficientDet-Lite2 (lớp person, ngưỡng 0,25), điểm chân = giữa đáy khung; không thêm thư viện | Trên 100 khung video phong trào: thấy đủ 4 người 73% (pose theo ô 12%), nhanh gấp đôi. Lite0 kém hơn ở nửa xa. Bỏ D49–D51 phần pose. |
| D54 | Ô cho bộ phát hiện khung | Tối đa 3 ô, ô nửa xa ≈ 6 lần chiều cao người xa nhất, ô không dẹt hơn 16:9 (được lấn ra ngoài vùng sân để giữ tỉ lệ) | MediaPipe kéo giãn ảnh vào thành hình vuông: ô 1280×482 làm người bị bóp còn 1/3 bề ngang, nửa gần mất 55% khung. |
| D55 | Mất tín hiệu tay | Chấp nhận: đội phát luôn do engine suy ra từ ô giao cầu, vị trí và số pha | Bộ phát hiện khung không thấy tay; tín hiệu này vốn không bắt buộc. |
| D56 | Đếm pha | Đếm số lần cả sân dừng lại (trung vị tốc độ qua 0,6 s dưới 0,3 m/s, ít nhất 0,5 s, sau khi đã có người chạy trên 0,7 m/s). Số pha giữa hai lần phát nhìn thấy = 1 + số lần dừng nằm hẳn giữa (bỏ 3 s mỗi đầu) | Tách pha theo tốc độ đánh không được: người chơi phong trào đánh 0,5–1,3 m/s, ngang lúc đi bộ. Cửa sổ 1 s thì bỏ sót lần dừng ngắn 1,5 s. |
| D57 | Engine dùng số pha | Diễn biến có số pha khớp số đếm: bỏ lỡ lần phát chỉ phạt 0,3 (thay vì 1); lệch mỗi pha phạt 0,5; khi đếm được nhiều pha xét tới 6 pha giữa hai lần phát | Bằng chứng mềm: đếm sai không loại khả năng đúng. Giả lập bỏ lỡ 10% lần phát: ván đúng 55% → 85%. |
| D58 | Khung bị băng lưới cắt | Bỏ khung người có đáy nằm giữa lưới và biên cuối xa (+0,5 m) mà chiều cao dưới 1,45 lần số pixel của 1 m ngang tại chân (người đứng bình thường 1,45–1,95, trung vị 1,65). Không ước lượng lại chân từ đỉnh đầu; tracker giữ vị trí cũ khi không còn khung đủ | Video phong trào 720p (match2 từ 1:25, ngày 2026-11-07): băng lưới cắt ngang người nửa xa, khung chỉ tới băng lưới đẩy chân ra xa 1–2 m, thành người thứ hai. Bỏ đi: khung thấy từ 3 người ở nửa xa 47% → 31%, mất người xa 0,3% → 0,7%. Ước lượng chân từ đầu làm vị trí rung hơn; gộp khung trùng theo pixel không thêm gì so với gộp 0,6 m. Số lần phát nhận ra không đổi (10 → 9): nút thắt là ngưỡng đứng yên. |
| D59 | Ngưỡng đứng yên theo độ sâu | `FrameProcessor` gắn cho mỗi người số mét của 1 pixel tại chỗ đứng (`metersPerPixel`). Bộ phát hiện đội hình: ngưỡng lệch = max(0,25 m, 3 pixel). Bộ đếm pha: trừ 1 pixel khỏi quãng dịch chuyển của mỗi người | Video phong trào 720p (match2 từ 1:25, hai ván 0–296 s và 302 s–hết, ngày 2026-11-07): nửa gần 1 pixel ≈ 0,02 m, nửa xa 0,06–0,13 m; người đứng yên ở xa rung 1–3 pixel. Lần dừng 15 → 28 (ván 1) và 8 → 16 (ván 2), khớp nhịp 10–13 giây một pha; trừ từ 2 pixel thì đếm hai lần dừng cách nhau 2–3 giây. Lần phát nhận ra 6 → 9 và 3 → 5; nới tới 4–5 pixel thì sinh đội hình giả cách nhau vài giây. Ngưỡng thuần pixel không dùng được: người gần to, rung 2–4 pixel. Cho phép bỏ qua vài khung lỗi thì sinh hàng trăm đội hình giả. |
| D60 | Nhãn phát cầu và đo đội phát | Trang Phân tích video có chế độ gán nhãn: xem lại video, bấm G (đội gần phát) / X (đội xa phát) / Z (xóa nhãn gần nhất); nhãn lưu trong trình duyệt theo tên file, xuất/mở được file JSON. Bảng "So với nhãn" ghép mỗi nhãn với lần phát app nhận ra trong 3 giây, đếm đúng/sai/chưa rõ đội/bỏ lỡ/thừa | Không có nhãn thật thì không biết thay đổi nào tốt hơn. Video 720p không âm thanh thì Claude không tự gán nhãn đáng tin được (không thấy quả cầu); người xem ở tốc độ thật gán nhanh hơn. |
| D61 | Đoán đội phát từ chuyển động (thử nghiệm) | Sau mỗi lần dừng, đội rời chỗ sau (đi quá 0,5 m + 3 pixel trong 0,5 s) là đội phát; hai đội cách nhau dưới 0,3 s thì chưa rõ. Chỉ hiện trong Phân tích video và bảng so với nhãn, chưa đưa vào engine | Tín hiệu không cần đội hình chuẩn: người nhận phải di chuyển đỡ cầu, người phát vung vợt tại chỗ. Đội thắng pha n là đội phát pha n+1 nên chuỗi đội phát đủ để ra tỉ số. Trên match2 ván 1 đoán gần 17, xa 3, chưa rõ 8: lệch nhiều về đội gần, có thể do nhiễu vị trí ở xa làm đội xa "rời chỗ" sớm; chờ nhãn để kiểm chứng. |
| D62 | Calibrate khi biên cuối gần ngoài khung hình | Màn Calibrate cho chọn vạch phía gần để bấm: biên cuối, vạch giao cầu dài đánh đôi (0,76 m) hoặc vạch giao cầu ngắn; app tính homography từ 4 điểm đó rồi lưu 4 góc sân như cũ (góc gần có thể nằm ngoài ảnh). Chỉnh calibrate cũ thì tự chọn vạch đầu tiên nằm trong ảnh | Video match2 (camera trên cao, góc rộng) không thấy biên cuối gần nên không bấm được góc. Dùng vạch giao cầu dài: lưới vạch khớp sân, thấy đủ 4 người 97% khung (calibrate khác 0%). Dữ liệu lưu không đổi nên các phần khác không phải sửa. |
| D63 | Gán nhãn nhanh | Sau khi Phân tích, nút "Gán nhãn nhanh" đi lần lượt qua từng lần dừng chuẩn bị phát: phát chậm 0,5× từ 2 giây trước tới 2,5 giây sau lúc phát dự kiến (lúc đoán từ chuyển động nếu có, không thì 2 giây sau lần dừng). G/X gán rồi sang lần tiếp, S bỏ qua, R xem lại, Esc thoát; bắt đầu từ lần đầu chưa có nhãn. Không hiện đội app đoán | Gán nhãn cả video bằng tay mất khoảng 30 phút; chỉ xem quanh khoảng 44 lần dừng còn 5–10 phút. Giấu đội đoán để nhãn không bị ảnh hưởng. Lần phát app bỏ sót vẫn gán bằng G/X khi xem bình thường. |

## Giới hạn đã biết

- Sau pha cuối, nếu người chơi đứng yên đúng một đội hình phát cầu hợp lệ (đúng ô, đúng chéo, đúng vị trí theo luật) trước khi host bấm Kết thúc ván, app có thể hiểu là thêm một pha. Khắc phục: bấm Kết thúc ván ngay khi hết ván.
- Camera bỏ lỡ từ 3 lần phát liên tiếp trở lên thì engine không giải thích được và có thể sai điểm.
- Đếm pha cho biết có bao nhiêu pha nhưng không cho biết đội nào thắng từng pha: bỏ lỡ nhiều lần phát liền nhau thì engine vẫn có nhiều tỉ số khả dĩ và hỏi host lúc kết thúc ván. Các pha sau lần phát cuối cùng nhìn thấy chưa được đếm khi kết thúc ván.
- Chạy thử trên video phong trào (YouTube 30iGjvPvJ4I, 10 phút, 720p, góc rộng, ngày 2026-11-05): mới bắt được 6 lần phát. Người nửa xa chỉ cao ~45 px và bị lưới che nên chỉ thấy đủ 2 người ở 66% khung; độ lệch vị trí của họ (0,3–0,5 m) thường vượt ngưỡng đứng yên 0,25 m. Nhóm trong video cũng không đứng đúng đội hình phát cầu rõ ràng. Chưa nới ngưỡng vì không có tỉ số thật để kiểm chứng; cần video ván thật của nhóm (quay 1080p) để chỉnh ngưỡng đứng yên theo độ sâu.
- Video match2 (2026-11-07), sau D58–D59: chỉ khoảng 1/3 lần dừng nhận ra được đội hình phát cầu. Còn lại: một người chưa đứng yên hẳn (thường đang bước vào chỗ), hoặc hai người một đội đứng gần ngang nhau (cách trước–sau dưới 1 m) nên không biết ai là người phát/nhận và ô bị đoán sai. Engine vì vậy chưa chắc tỉ số. Chưa có tỉ số thật của hai ván để kiểm chứng.
