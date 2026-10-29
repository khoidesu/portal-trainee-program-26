# 🎓 Trainee Program Portal (UIT Style) 2026

Hệ thống Cổng Thông tin & Quản trị Đào tạo Sinh viên theo chuẩn phong cách **UIT (Đại học Công nghệ Thông tin)**. Hệ thống cung cấp bảng điều khiển trực quan cho sinh viên tra cứu thời khóa biểu, điểm số, bảng xếp hạng sao tích lũy, 11 bài tập chuyên đề (kèm đếm ngược hạn nộp), hỏi đáp trực tuyến và cổng quản trị dành cho Admin.

---

## 🌟 Tính Năng Nổi Bật

- 🛡️ **Bảo Mật Cao Cấp:**
  - Xác thực phiên làm việc bằng **JWT (JSON Web Token)** tự ký với thời hạn 24 giờ.
  - Mã hóa mật khẩu bảo vệ chống tấn công Timing Attack (`crypto.timingSafeEqual`) và chuẩn mã hóa `scrypt`.
  - Rate Limiter chống tấn công Brute-force khi đăng nhập (tối đa 5 lần thử sai / phút).
  - Phòng chống XSS (`escapeRegex`, anti-XSS render), Clickjacking (`X-Frame-Options: SAMEORIGIN`), Content Sniffing (`nosniff`).
- ⚡ **Chế Độ Hybrid Database Siêu Bền Vững:**
  - Tích hợp chuẩn **MongoDB Atlas** qua Mongoose.
  - Tự động kích hoạt cơ chế **In-Memory Fallback**: Khi chưa cấu hình database hoặc mạng offline/chưa kịp whitelist IP trên Atlas, toàn bộ API và giao diện vẫn hoạt động trơn tru 100% không bị treo gián đoạn hay crash server.
- ⏱️ **Quản Lý 11 Bài Tập & Bộ Đếm Thời Gian:**
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
│   ├── assignmentRoutes.js      # API 11 bài tập & cập nhật deadline
│   ├── questionRoutes.js        # API Q&A diễn đàn trao đổi
│   ├── supportRoutes.js         # API gửi yêu cầu hỗ trợ kỹ thuật
│   └── adminRoutes.js           # API quản trị hệ thống
├── public/                      # Static Assets & Frontend
│   ├── components/              # Các khối giao diện HTML độc lập
│   │   ├── sidebar.html         # Thanh điều hướng trái
│   │   ├── navbar.html          # Thanh header trên cùng
│   │   ├── view-dashboard.html  # Màn hình tổng quan
│   │   ├── view-schedule.html   # Thời khóa biểu
│   │   ├── view-assignments.html# 11 bài tập kèm bộ đếm ngược
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

- **Node.js**: Phiên bản **>= 18.x** (Khuyên dùng bản LTS mới nhất: 20.x hoặc 22.x).
- **npm**: Phiên bản **>= 9.x** (đi kèm sẵn với Node.js).
- **Trình duyệt**: Chrome, Firefox, Edge, Safari phiên bản mới.

---

## 🚀 Hướng Dẫn Cài Đặt & Chạy Dự Án

### 🍎 Dành cho macOS / Linux

1. **Mở Terminal và clone dự án về máy:**
   ```bash
   git clone <URL_REPOSITORY_CUA_BAN>
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

### 🪟 Dành cho Windows (PowerShell / Command Prompt)

1. **Mở PowerShell hoặc Git Bash và tải dự án:**
   ```powershell
   git clone <URL_REPOSITORY_CUA_BAN>
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
| **Quản trị viên (Admin)** | `admin` | `1234` *(hoặc xem trong `.env`)* | Toàn quyền thêm/sửa/xóa sinh viên, lịch học, chấm sao, đổi deadline bài tập. |
| **Sinh viên (Trainee)** | *Không cần đăng nhập* | — | Sinh viên có thể trực tiếp tra cứu điểm số, thời khóa biểu và thứ hạng. |

---

## 🌐 Lưu Ý Về Kết Nối MongoDB Atlas

Nếu bạn sử dụng kết nối MongoDB Atlas thật trên Cloud:
1. Đăng nhập vào [MongoDB Atlas](https://cloud.mongodb.com/).
2. Vào mục **Security** -> **Network Access** -> Chọn **Add IP Address**.
3. Chọn **Allow Access from Anywhere** (`0.0.0.0/0`) hoặc thêm chính xác IP mạng hiện tại của bạn.
4. Trường hợp chưa kết nối được (mất mạng hoặc lỗi timeout), hệ thống **tự động chuyển sang chế độ In-Memory** để toàn bộ chức năng vẫn hoạt động bình thường mà không phát sinh lỗi.

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

