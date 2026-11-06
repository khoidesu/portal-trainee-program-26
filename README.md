# 🎓 Trainee Program Portal (UIT Style) 2026

Cổng thông tin nội bộ **Trainee Program — CS UIT** dành cho Trainee, Trainer và Ban Tổ chức: lịch học, bảng sao tham gia, bài tập kèm hạn nộp, hỏi đáp, xin nghỉ và quản trị. Điểm bài tập được quản lý riêng; API công khai không trả điểm hay xếp loại bài tập.

## Xin nghỉ công khai

Form xin nghỉ gửi `POST /api/requests/leave`. Server đối chiếu MSSV/họ tên với Trainee và buổi học, lưu thời gian gửi trên máy chủ, chống gửi trùng theo Trainee/buổi/ngày và không gửi email. `GET /api/requests/leave` trả tối đa 100 đơn mới nhất đã công khai, gồm tên, MSSV, buổi, lý do, thời gian gửi và trạng thái. Không trả email, số điện thoại, khóa chống trùng hoặc dữ liệu hỗ trợ tài khoản.

Biểu mẫu ghi rõ lý do sẽ được công khai và yêu cầu người gửi xác nhận. Các đơn cũ từng được gửi riêng không tự công khai. Người có quyền xử lý xin nghỉ duyệt/từ chối ngay trên trang Xin nghỉ. Duyệt đơn không tự động cộng chuyên cần; việc điểm danh được cập nhật tại Bảng điểm.

Production vẫn cần Turnstile để chống spam. Thời gian gửi hiển thị theo giờ Việt Nam; danh sách công khai đọc từ MongoDB, không phụ thuộc lịch sử trình duyệt.

## Tài khoản và quyền sửa

Tài khoản gốc từ Quản trị gốc (tạo bằng `npm run create-admin`, lưu trong database) quản lý tài khoản tại trang Quản trị. Quản trị nội dung được sửa các nghiệp vụ; Trainer được cấp từng quyền: hồ sơ Trainee, lịch, điểm danh/sao, bài tập, Q&A hoặc xin nghỉ. Không cấp quyền quản lý tài khoản cho các tài khoản nội dung. Khóa tài khoản, đổi quyền hay đổi mật khẩu làm hết hiệu lực phiên cũ. Quyền và trạng thái được đọc lại ở API trên mỗi yêu cầu, không tin role lưu trên trình duyệt.

Chỉnh lịch tại Thời khóa biểu, thêm/xóa/sửa bài tập ở trang Bài tập, sửa Trainee tại Bảng xếp hạng, sửa điểm danh và điểm sao tại Bảng điểm, trả lời Q&A và duyệt xin nghỉ ngay tại trang tương ứng. Sau khi lưu điểm danh/sao, tổng điểm, chuyên cần và bảng xếp hạng được đọc lại từ dữ liệu đã lưu.

Quyền `assignments:manage` cho phép thêm và xóa bài tập, không giới hạn 11 bài. Bài mới được cấp mã tự động, không đổi mã các bài cũ. Xóa bài sẽ ẩn khỏi lộ trình và giữ các xác nhận bài nộp để đối chiếu; danh mục rỗng không tự khôi phục bài mẫu khi tải trang.

Bài chưa mở không cho khách/Trainee mở popup; API công khai cũng ẩn mô tả, chi tiết và link nộp. Người có quyền quản lý bài tập vẫn xem và chỉnh sửa được. Lịch học có link tài liệu tùy chọn, chỉ hiển thị khi được nhập URL http/https hợp lệ. Avatar Trainee dùng ảnh cá voi có sẵn trong project, chọn ổn định theo mã Trainee.

## Giao diện và script chỉ dành cho tài khoản đăng nhập

`public/index.html` chỉ chứa phần dành cho khách. Trang Quản trị, Hồ sơ, Bài tập, các hộp thoại sửa/xóa và nút quản lý nằm trong `private/fragments/`, còn `admin.js`/`profile.js` nằm trong `private/js/`; thư mục `private/` không được phục vụ tĩnh. Sau khi đăng nhập, frontend gọi `GET /api/ui`: máy chủ kiểm tra phiên và quyền của từng khối (bảng `SLOTS` trong `routes/uiRoutes.js`) rồi chỉ trả các khối được phép; script được tải qua `/api/ui/script/<tên>`. Khách không nhận khối nào, DevTools không thấy HTML hay script của Admin/Trainee. Thêm khối riêng mới: tạo `private/fragments/<tên>.html`, đặt `<template data-private-slot="<tên>"></template>` ở chỗ cần chèn trong `public/components/` và khai báo quyền trong `SLOTS`. Đổi quyền/đăng xuất sẽ tải lại trang để gỡ phần giao diện cũ.

Khách cũng không nhận tên bài giảng và Trainer từ API: `/api/schedules`, `/api/trainees` (sao theo buổi) và `/api/requests/leave` trả `Buổi N` thay cho tên bài giảng và bỏ tên Trainer cho đến khi đăng nhập.

## Host: Vercel + MongoDB Atlas + Resend

Express được Vercel hỗ trợ trực tiếp qua `server.js` export app. Toàn bộ frontend nằm trong `public/` được CDN phục vụ; API chạy trên Vercel Function. Repo đã có `vercel.json`, build command `npm run build`, Node 24 và region Singapore (`sin1`). Xem [Express on Vercel](https://vercel.com/docs/frameworks/backend/express).

Production không dùng fallback RAM: thiếu MongoDB hoặc kết nối lỗi thì API trả 503. Kết nối DB được tái sử dụng trong mỗi instance, giới hạn pool 5; rate limit đăng nhập và gửi đơn lưu ở MongoDB để dùng chung giữa các instance. File HTML được ghép lúc build; runtime Vercel không ghi `.env` hay `public/index.html`.

1. Tạo MongoDB Atlas Free cluster, ưu tiên region gần Singapore. Tạo database user riêng, chỉ cấp `readWrite` cho database portal. Cấu hình Network Access cho host. Với Vercel không có IP egress cố định theo mặc định, cần lựa chọn IP access phù hợp; nếu mở `0.0.0.0/0`, đó là mở mạng truy cập DB, phải dùng tài khoản riêng và mật khẩu ngẫu nhiên mạnh. Không dùng tài khoản quản trị Atlas làm database user. [Atlas Free có giới hạn 512 MB](https://www.mongodb.com/docs/atlas/reference/free-shared-limitations/).
2. Import repository của bạn trong Vercel, dùng preset Express/auto-detect. Build Command `npm run build`, Install Command `npm ci`; giữ Output Directory mặc định của preset, không cấu hình thành một static site chỉ có `public/`.
3. Đặt các biến ở Vercel Settings → Environment Variables:

   | Biến | Giá trị |
   | --- | --- |
   | `MONGODB_URI` | URI Atlas, kèm tên database |
   | `JWT_SECRET` | Chuỗi ngẫu nhiên tối thiểu 32 ký tự |
| `TRAINEE_DEFAULT_PASSWORD` | Mật khẩu tạm cho Trainee, ngẫu nhiên tối thiểu 12 ký tự (bắt buộc ở production) |
| *(không có biến admin)* | Chạy `npm run create-admin` để tạo Quản trị gốc trong database, không lưu mật khẩu trong `.env` |
   | `APP_ORIGIN` | URL HTTPS chính thức, ví dụ `https://ten-project.vercel.app`, không có dấu `/` cuối |
   | `TURNSTILE_SITE_KEY`, `TURNSTILE_SECRET_KEY` | Hai khóa widget cho hostname portal |

   Vercel tự cung cấp cờ `VERCEL`; production sẽ yêu cầu cấu hình mạnh, kể cả deployment Preview. Preview nên dùng database thử riêng và thêm URL preview cụ thể vào `APP_ORIGIN` cùng hostname Turnstile tương ứng; không trỏ preview vào dữ liệu sinh viên thật.
4. Deploy/redeploy. Nếu chưa biết tên miền khi tạo project, chọn tên project trước để xác định URL rồi thêm `APP_ORIGIN`. Thay biến môi trường xong phải redeploy.
5. Kiểm tra `/api/status`, đăng nhập `/login`, nhập dữ liệu sinh viên/lịch học chính thức từ trang quản trị; thử gửi đơn công khai và duyệt đơn. `npm run seed` chỉ kiểm tra file nhập; `npm run seed -- --apply` thay danh sách Trainee sau khi đủ dữ liệu nguồn và tự sao lưu trước khi thay.

Free không có nghĩa phù hợp mọi hình thức sử dụng. [Vercel Hobby](https://vercel.com/docs/plans/hobby) dành cho dự án cá nhân, phi thương mại; portal chính thức của Đoàn/Khoa cần xác nhận điều kiện sử dụng thay vì mặc định đủ điều kiện. Đồng thời kiểm tra quota hiện hành của Vercel, Atlas và Resend trước khi vận hành.

Phương án thay thế: [Render Free Web Service](https://render.com/docs/free), build `npm ci && npm run build`, start `npm start`, thêm `NODE_ENV=production`, `TRUST_PROXY=1` và các biến phía trên. Render Free ngủ sau 15 phút không có request, lần mở lại có thể mất khoảng một phút; filesystem cũng không bền vững. Thích hợp demo; nếu cần portal học vụ ổn định, dùng gói trả phí hoặc hạ tầng trường cấp. Không cần tách frontend sang host khác ở quy mô hiện tại.

## Kiểm tra bảo mật

Chạy `npm test` để kiểm tra cookie/session, JWT giả/hết hạn, phân quyền API, CSRF/NoSQL input, giới hạn đăng nhập, ẩn dữ liệu riêng, lưu đơn/chống trùng và xử lý lỗi email. Các bài kiểm tra không gửi email thật. Nhánh MongoDB được kiểm tra bằng driver giả lập/schema; vẫn cần kiểm thử với Atlas và khóa Resend thực trước khi đưa vào sử dụng. Chạy `npm audit --omit=dev` để kiểm tra dependency hiện tại.

Cookie admin có `HttpOnly`, `SameSite=Strict`, thêm `Secure` và tiền tố `__Host-` khi host public; thời hạn 8 giờ. Frontend không lưu JWT trong localStorage. Đổi `ADMIN_PASSWORD` hoặc `JWT_SECRET` sẽ làm token cũ mất hiệu lực. API đổi MongoDB qua web đã khóa; chỉnh biến môi trường rồi redeploy. CSP vẫn cho phép inline script để tương thích các handler HTML hiện có; không coi đây là loại bỏ hoàn toàn XSS.

---

## 🌟 Tính Năng Nổi Bật

- 🛡️ **Bảo Mật Cao Cấp:**
  - Xác thực phiên làm việc bằng **JWT (JSON Web Token)** trong cookie HttpOnly với thời hạn 8 giờ.
  - Mã hóa mật khẩu bảo vệ chống tấn công Timing Attack (`crypto.timingSafeEqual`) và chuẩn mã hóa `scrypt`.
  - Rate Limiter chống tấn công Brute-force khi đăng nhập (tối đa 5 lượt / phút, gồm lượt thành công).
  - Phòng chống XSS (`escapeRegex`, anti-XSS render), Clickjacking (`X-Frame-Options: SAMEORIGIN`), Content Sniffing (`nosniff`).
- ⚡ **Chế Độ Hybrid Database Siêu Bền Vững:**
  - Tích hợp chuẩn **MongoDB Atlas** qua Mongoose.
  - **In-Memory Fallback chỉ dành cho local/demo**. Production yêu cầu MongoDB; lỗi DB trả về 503 để không ghi nhầm hoặc làm mất đơn trong RAM.
- ⏱️ **Quản Lý Bài Tập & Bộ Đếm Thời Gian:**
  - Hiển thị thông minh: nếu còn trên 1 ngày sẽ hiển thị `x ngày x h còn lại`, nếu dưới 1 ngày hiển thị `x h x phút còn lại`.
  - Admin có toàn quyền điều chỉnh deadline cho từng bài tập.
- 🧩 **Kiến Trúc Component Modular:**
  - Frontend và Backend được chia tách thành các module/component độc lập (`public/components/`, `public/js/modules/`, `routes/`), dễ bảo trì và phân chia công việc trong nhóm.
  - Tự động lắp ráp giao diện qua script `assemble-components.js` khi khởi động server.

---

## 📂 Cấu Trúc Thư Mục Dự Án

```text
portal-tp-26/
├── config/
│   └── db.js                    # Kết nối MongoDB Atlas, Fallback In-Memory & dữ liệu mẫu
├── models/
│   ├── Trainee.js               # Mongoose Schema quản lý sinh viên
│   └── Schedule.js              # Mongoose Schema quản lý lịch học
├── routes/                      # Các Module REST API
│   ├── authRoutes.js            # Đăng nhập, đổi mật khẩu, xác thực JWT
│   ├── traineeRoutes.js         # API thông tin sinh viên, bảng xếp hạng sao
│   ├── scheduleRoutes.js        # API lịch học, thời khóa biểu
│   ├── assignmentRoutes.js      # API danh mục bài tập & cập nhật deadline
│   ├── questionRoutes.js        # API Q&A diễn đàn trao đổi
│   ├── supportRoutes.js         # API gửi yêu cầu hỗ trợ kỹ thuật
│   └── adminRoutes.js           # API quản trị hệ thống
├── public/                      # Static Assets & Frontend
│   ├── components/              # Các khối giao diện HTML độc lập
│   │   ├── sidebar.html         # Thanh điều hướng trái
│   │   ├── navbar.html          # Thanh header trên cùng
│   │   ├── view-dashboard.html  # Màn hình tổng quan
│   │   ├── view-schedule.html   # Thời khóa biểu
│   │   ├── view-assignments.html# Bài tập kèm bộ đếm ngược
│   │   ├── view-leaderboard.html# Bảng xếp hạng sao
│   │   ├── view-admin.html      # Trang quản trị
│   │   └── modals.html          # Các hộp thoại popup
│   ├── js/
│   │   ├── modules/             # Các file JS logic độc lập
│   │   └── app.js               # File nạp router frontend chính
│   └── index.html               # File trang chủ được build tự động
├── scripts/
│   └── assemble-components.js   # Script tự động ghép nối HTML components
├── utils/
│   └── security.js              # Tiện ích mã hóa scrypt, JWT, middleware phân quyền
├── .env.example                 # File cấu hình môi trường mẫu
├── .gitignore                   # Loại trừ file nhạy cảm và node_modules
├── package.json
├── server.js                    # Server Express chính (Master Entry Point)
└── README.md
```

---

## 💻 Yêu Cầu Môi Trường

- **Node.js**: Phiên bản **24.x** (theo `package.json`).
- **npm**: Phiên bản **>= 9.x** (đi kèm sẵn với Node.js).
- **Trình duyệt**: Chrome, Firefox, Edge, Safari phiên bản mới.

---

## 🚀 Hướng Dẫn Cài Đặt & Chạy Dự Án

### 🍎 Dành cho macOS / Linux

1. **Mở Terminal và clone dự án về máy:**
   ```bash
   git clone https://github.com/khoidesu/portal-trainee-program-26.git
   cd portal-tp-26
   ```

2. **Cài đặt các gói thư viện phụ thuộc:**
   ```bash
   npm install
   ```

3. **Cấu hình biến môi trường (`.env`):**
   ```bash
   cp .env.example .env
   ```
   *Mở file `.env` bằng VS Code hoặc Nano để chỉnh sửa các thông số nếu cần (như chuỗi kết nối MongoDB Atlas hoặc mật khẩu admin).*

4. **Khởi chạy ứng dụng:**
   - **Chế độ thông thường:**
     ```bash
     npm start
     ```
   - **Chế độ phát triển (Tự reload khi sửa file - Node 18+):**
     ```bash
     npm run dev
     ```

5. **Mở trình duyệt:**
   Truy cập vào: [http://localhost:3000](http://localhost:3000)

---

### Dành cho Windows (PowerShell / Command Prompt)

1. **Mở PowerShell hoặc Git Bash và tải dự án:**
   ```powershell
   git clone https://github.com/khoidesu/portal-trainee-program-26.git
   cd portal-tp-26
   ```

2. **Cài đặt các thư viện:**
   ```powershell
   npm install
   ```

3. **Tạo file cấu hình môi trường (`.env`):**
   - Trong PowerShell:
     ```powershell
     Copy-Item .env.example .env
     ```
   - Hoặc trong Command Prompt (CMD):
     ```cmd
     copy .env.example .env
     ```
   *Mở file `.env` và cập nhật thông tin nếu cần.*

4. **Khởi chạy server:**
   ```powershell
   npm start
   ```
   *(Hoặc `npm run dev` để tự động khởi động lại server khi sửa code).*

5. **Truy cập hệ thống:**
   Mở trình duyệt và vào địa chỉ: [http://localhost:3000](http://localhost:3000)

---

## 🔑 Tài Khoản Mặc Định

| Vai trò | Tên đăng nhập | Mật khẩu mặc định | Ghi chú |
| :--- | :--- | :--- | :--- |
| **Quản trị viên (Admin)** | Tên đặt khi chạy `npm run create-admin` | Mật khẩu đặt khi chạy `npm run create-admin` (chỉ lưu hash trong database) | Không còn mật khẩu admin trong `.env` hay source code. |
| **Sinh viên (Trainee)** | *Không cần đăng nhập* | — | Sinh viên có thể trực tiếp tra cứu điểm số, thời khóa biểu và thứ hạng. |

---

## 🌐 Lưu Ý Về Kết Nối MongoDB Atlas

Nếu bạn sử dụng kết nối MongoDB Atlas thật trên Cloud:
1. Đăng nhập vào [MongoDB Atlas](https://cloud.mongodb.com/).
2. Vào mục **Security** -> **Network Access** -> Chọn **Add IP Address**.
3. Thêm chính xác IP mạng hiện tại khi chạy local; cấu hình truy cập từ host theo phần triển khai phía trên.
4. Trường hợp chưa kết nối được, local dùng RAM để demo; production trả 503 và không nhận ghi dữ liệu.

---

## 👥 Hướng Dẫn Dành Cho Nhóm Phát Triển (Team Collaboration)

Để đóng góp code vào dự án mà không gây xung đột (conflict):

1. **Luôn cập nhật code mới nhất từ nhánh chính trước khi làm:**
   ```bash
   git checkout main
   git pull origin main
   ```
2. **Tạo nhánh riêng cho tính năng bạn đảm nhận:**
   ```bash
   git checkout -b feature/ten-tinh-nang
   ```
3. **Commit và Push nhánh lên GitHub:**
   ```bash
   git add .
   git commit -m "feat: mo ta ngan gon ve thay doi"
   git push origin feature/ten-tinh-nang
   ```
4. **Tạo Pull Request (PR)** trên GitHub để nhóm cùng review trước khi merge vào `main`.

---

## 📄 Bản Quyền & Giấy Phép
Dự án được xây dựng phục vụ học tập và vận hành chương trình Trainee Program 2026. Giấy phép mã nguồn mở ISC.

# Lịch học và bài nộp Microsoft Forms

- Lịch tự tính trạng thái từ ngày, giờ bắt đầu và giờ kết thúc theo UTC+7. Vercel không cần cron để đánh dấu buổi đã diễn ra. Trang cập nhật trạng thái mỗi 30 giây khi đang xem; lịch hiển thị theo tháng/năm thực tế, có dạng danh sách và lưới lịch.
- Admin sửa bài tập để thêm **Chi tiết bài tập**, link Microsoft Forms, hạn nộp và trạng thái **Đang mở / Chưa mở / Đã đóng**. Trạng thái này áp dụng cho bài chung, không phải kết quả từng Trainee. Trạng thái “completed” cũ được đọc thành “Đang mở”; dữ liệu điểm cũ vẫn giữ trong DB nhưng không đưa ra API công khai.
- Mỗi form nên có câu hỏi bắt buộc **Mã Trainee (MSSV)** và họ tên. Nếu có tài khoản Microsoft của tổ chức, bật ghi nhận tên và giới hạn một phản hồi/người. Khi đóng đợt nộp, tắt nhận phản hồi trong Microsoft Forms; trạng thái ở portal không tự đóng form bên ngoài.
- Vào **Admin → Xác nhận bài nộp Microsoft Forms**, chọn bài, đối chiếu tab Phản hồi hoặc Excel xuất từ Forms theo mã Trainee. Lưu mã phản hồi, thời điểm nộp theo UTC+7, ghi chú riêng và trạng thái: **Chưa ghi nhận → Đã nộp → Hoàn thành**, hoặc **Cần bổ sung**. Chỉ Trainer xác nhận đạt yêu cầu mới chọn Hoàn thành. Portal lưu người và thời điểm xác nhận gần nhất.
- Bước đối chiếu hiện làm thủ công, không cần thêm dịch vụ trả phí. Portal chưa tự đọc phản hồi Microsoft Forms; bấm link form không tạo bản ghi đã nộp. Các xác nhận chỉ admin được xem/sửa, không có điểm hoặc kết quả cá nhân trên trang bài tập công khai.
- Một bài nên dùng một form riêng và giữ mã phản hồi để đối chiếu. Hệ thống chặn khôi phục danh mục mẫu khi đã có xác nhận bài nộp để bảo vệ liên kết với mã bài. Local fallback chỉ lưu xác nhận trong RAM; triển khai Vercel phải dùng MongoDB để giữ dữ liệu.
- Muốn đồng bộ tự động sau này cần kết nối Microsoft Forms → luồng tự động → API được bảo vệ của portal. Cần kiểm tra giấy phép Microsoft/Power Automate và quyền tổ chức trước khi chọn cách này.

# Nhập danh sách Trainee chính thức

Dữ liệu trên máy nằm ở `data/imports/trainees.json`; file Excel nguồn, dữ liệu nhập và bản sao lưu đều bị loại khỏi Git bằng `data/imports/`. Local đọc hồ sơ và lịch giảng dạy này thay cho dữ liệu mẫu. Khi chưa nhập dữ liệu điểm danh/sao, các chỉ số để trống và không tự sinh lịch sử hoặc xếp hạng.

`npm run seed` chỉ kiểm tra MSSV trùng, email, schema, trạng thái Ngừng học, tổng điểm danh/sao và liên kết Trainer với lịch. `npm run seed -- --apply-profiles` hỗ trợ nhập riêng hồ sơ khi chưa có nguồn điểm danh. `npm run seed -- --apply` nhập dữ liệu đã xác minh từ cả hai sheet. Buổi 2 có 27 bản ghi; không tạo bản ghi hoặc đánh vắng cho ba Trainee Ngừng học không có tên trong sheet này. Giữ nguyên điểm âm và 0 sao theo cột Điểm cộng.

Khi có `MONGODB_URI`, script sao lưu hồ sơ Trainee và lịch giảng dạy cũ vào `data/imports/backups/` rồi thay cả hai trong cùng một transaction; giữ tài khoản admin và các collection khác. Khi chưa cấu hình MongoDB, script báo `local-data-only` và web sử dụng file trên máy. Sau khi đổi file nhập, khởi động lại server để nạp danh sách mới.

Lịch nhập từ Overview có 12 buổi, bỏ dòng Template. Theo xác nhận của Ban Tổ chức, các buổi online học 20:00–22:30, Bonding dự kiến 08:30–11:00. Bonding giữ cờ `isTentative`, hiển thị chưa chốt lịch và xuất iCal với trạng thái TENTATIVE. Admin có thể bỏ chọn “Lịch dự kiến” khi ngày và giờ đã được xác nhận.

