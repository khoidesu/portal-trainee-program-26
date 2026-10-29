/**
 * Dữ liệu mẫu (Mock Data) cho Cổng thông tin Trainee Program
 * Khi chưa kết nối MongoDB Atlas/Local, hệ thống tự động sử dụng nguồn dữ liệu này.
 */

const mockTrainees = [
  {
    traineeId: "25520918",
    fullName: "Khôi Trương Trần Anh",
    avatar: "https://api.dicebear.com/9.x/avataaars/svg?seed=25520918&backgroundColor=b6e3f4,c0aede,d1d4f9,ffd5dc,ffdfbf",
    email: "khoi.tta@trainee.uit.edu.vn",
    batch: "KHMT2025.2",
    track: "Khoa Khoa học Máy tính",
    department: "Khoa học Máy tính",
    status: "Đang học",
    cohortYear: "2025",
    academicYear: "2026-2027",
    
    // Chỉ số KPI trang chủ (Legacy metrics)
    cumulativeGpa: 8.67,
    gpaClassification: "Tốt",
    gpaTrend: "-14.8% so với HK trước",
    gpaTrendIsPositive: false,
    
    completedCredits: 52,
    totalCredits: 126,
    creditsPercent: 41.3,
    actualCredits: 44,
    
    trainingScore: 98.0,
    trainingClassification: "Xuất sắc",
    
    previousSemesterGpa: 7.82,
    previousSemesterNote: "Chưa có dữ liệu HK trước -trước",

    // ========================================================
    // CÁC BIẾN DASHBOARD MỚI (DỄ DÀNG LINK SYNC ADMIN & DATABASE)
    // ========================================================
    accumulatedStars: 28, // 1. Sao tích luỹ (hiện số lượng sao nhận được)
    starClassification: "Hạng Vàng ⭐⭐⭐",
    starTrend: "+4 sao tuần này",
    starTrendIsPositive: true,
    
    attendedSessions: 42, // 2. Số buổi học đã tham gia
    totalSessions: 45, // Tổng số buổi học
    attendanceRate: 93.3, // Tỷ lệ chuyên cần (%)
    attendanceNote: "Đã tham gia: 42 buổi · Vắng: 3 buổi (có phép)",
    
    assignmentScore: 9.6, // 3. Điểm bài tập
    assignmentClassification: "Xuất sắc",
    completedAssignments: 14, // Số bài tập đã nộp
    totalAssignments: 15, // Tổng số bài tập
    assignmentNote: "Đạt 14/15 bài tập · Đạt yêu cầu 100%",
    
    currentRank: 1, // 4. Thứ hạng xếp loại
    totalStudentsInRank: 12,
    rankClassification: "🥇 Quán quân Trainee",
    rankNote: "Hạng 1 / 12 sinh viên · Dẫn đầu toàn khóa",
    
    // Cố vấn học tập
    mentor: {
      name: "Nguyễn Bích Vân",
      role: "Cố vấn học tập & Mentor Trainee",
      email: "vannb@uit.edu.vn",
      phone: "0904607220",
      avatarInitial: "NV"
    },
    
    // Thời khóa biểu hôm nay (Thứ Ba · 27/10/2026)
    scheduleToday: [
      {
        time: "07:30 – 10:45",
        period: "Tiết 1-4",
        title: "Toán cho khoa học máy tính",
        courseCode: "CS115.R12",
        type: "LÝ THUYẾT",
        room: "C208",
        instructor: "Dương Việt Hùng"
      },
      {
        time: "13:30 – 16:30",
        period: "Tiết 6-9",
        title: "Kiến trúc Microservices & MongoDB",
        courseCode: "SE324.T01",
        type: "THỰC HÀNH",
        room: "Lab 502",
        instructor: "ThS. Đỗ Tuấn Anh"
      }
    ],
    
    // Dịch vụ / Yêu cầu đang xử lý
    pendingRequests: [
      {
        id: "REQ-2026-089",
        title: "Đăng ký đề tài Capstone Trainee & Cấp tài nguyên Cloud MongoDB",
        date: "24/10/2026",
        status: "Đang tiếp nhận",
        statusType: "pending"
      },
      {
        id: "REQ-2026-061",
        title: "Giấy xác nhận thực tập sinh chương trình Kỹ sư Trainee 2026",
        date: "20/10/2026",
        status: "Đã hoàn thành",
        statusType: "completed"
      }
    ],
    
    // Diễn biến GPA
    gpaHistory: [
      { semester: "1-25", semesterGpa: 9.05, cumulativeGpa: 9.05 },
      { semester: "2-25", semesterGpa: 9.30, cumulativeGpa: 9.18 },
      { semester: "3-25", semesterGpa: 8.67, cumulativeGpa: 8.95 }
    ],
    
    // Xếp hạng Trainee
    rank: 4,
    completedTasks: 18,
    totalTasks: 24,
    skills: ["Python", "Machine Learning", "MongoDB", "Data Structures", "FastAPI"],
    bio: "Đam mê nghiên cứu Computer Vision và hệ thống phân tán. Đang hoàn thành giai đoạn 2 chương trình Kỹ sư Trainee."
  },
  {
    traineeId: "25520104",
    fullName: "Lê Hoàng Minh Quân",
    avatar: "https://api.dicebear.com/9.x/avataaars/svg?seed=25520104&backgroundColor=b6e3f4,c0aede,d1d4f9,ffd5dc,ffdfbf",
    email: "quan.lhm@trainee.uit.edu.vn",
    batch: "KTPM2025.1",
    track: "Khoa Kỹ thuật Phần mềm",
    department: "Kỹ thuật Phần mềm",
    status: "Đang học",
    cohortYear: "2025",
    academicYear: "2026-2027",
    cumulativeGpa: 9.45,
    gpaClassification: "Xuất sắc",
    gpaTrend: "+6.8% so với HK trước",
    gpaTrendIsPositive: true,
    completedCredits: 60,
    totalCredits: 126,
    creditsPercent: 47.6,
    actualCredits: 56,
    trainingScore: 99.0,
    trainingClassification: "Xuất sắc",
    previousSemesterGpa: 9.20,
    previousSemesterNote: "Thành tích dẫn đầu khóa",
    mentor: {
      name: "TS. Trần Văn Thuận",
      role: "Trưởng bộ môn KTPM",
      email: "thuantv@uit.edu.vn",
      phone: "0908123456",
      avatarInitial: "TT"
    },
    scheduleToday: [
      {
        time: "08:00 – 11:15",
        period: "Tiết 2-5",
        title: "DevOps & Cloud Native Architecture",
        courseCode: "SE401.L11",
        type: "THỰC HÀNH",
        room: "Lab 301",
        instructor: "TS. Trần Văn Thuận"
      }
    ],
    pendingRequests: [],
    gpaHistory: [
      { semester: "1-25", semesterGpa: 9.20, cumulativeGpa: 9.20 },
      { semester: "2-25", semesterGpa: 9.50, cumulativeGpa: 9.35 },
      { semester: "3-25", semesterGpa: 9.45, cumulativeGpa: 9.40 }
    ],
    rank: 1,
    completedTasks: 24,
    totalTasks: 24,
    skills: ["Node.js", "React", "Docker", "Kubernetes", "MongoDB", "TypeScript"],
    bio: "Top 1 Trainee Program. Hoàn thành 100% mục tiêu Sprint và có 2 bài nghiên cứu quốc tế."
  },
  {
    traineeId: "25520842",
    fullName: "Nguyễn Hà My",
    avatar: "https://api.dicebear.com/9.x/avataaars/svg?seed=25520842&backgroundColor=b6e3f4,c0aede,d1d4f9,ffd5dc,ffdfbf",
    email: "my.nh@trainee.uit.edu.vn",
    batch: "HTTT2025.2",
    track: "Khoa Hệ thống Thông tin",
    department: "Hệ thống Thông tin",
    status: "Đang học",
    cohortYear: "2025",
    academicYear: "2026-2027",
    cumulativeGpa: 9.22,
    gpaClassification: "Xuất sắc",
    gpaTrend: "+3.2% so với HK trước",
    gpaTrendIsPositive: true,
    completedCredits: 56,
    totalCredits: 126,
    creditsPercent: 44.4,
    actualCredits: 50,
    trainingScore: 97.5,
    trainingClassification: "Xuất sắc",
    previousSemesterGpa: 9.00,
    previousSemesterNote: "Duy trì phong độ ổn định",
    mentor: {
      name: "ThS. Huỳnh Mai Phương",
      role: "Cố vấn Enterprise Systems",
      email: "phuonghm@uit.edu.vn",
      phone: "0918765432",
      avatarInitial: "HP"
    },
    scheduleToday: [
      {
        time: "13:30 – 16:30",
        period: "Tiết 6-9",
        title: "Phân tích Dữ liệu Doanh nghiệp & MongoDB Aggregation",
        courseCode: "IS210.M12",
        type: "LÝ THUYẾT",
        room: "B104",
        instructor: "ThS. Huỳnh Mai Phương"
      }
    ],
    pendingRequests: [],
    gpaHistory: [
      { semester: "1-25", semesterGpa: 9.00, cumulativeGpa: 9.00 },
      { semester: "2-25", semesterGpa: 9.15, cumulativeGpa: 9.08 },
      { semester: "3-25", semesterGpa: 9.22, cumulativeGpa: 9.14 }
    ],
    rank: 2,
    completedTasks: 22,
    totalTasks: 24,
    skills: ["Data Modeling", "MongoDB", "PowerBI", "SQL", "Python", "Data Pipeline"],
    bio: "Top 2 Trainee. Chuyên gia thiết kế mô hình dữ liệu NoSQL và phân tích luồng vận hành."
  },
  {
    traineeId: "25520419",
    fullName: "Phạm Đăng Khoa",
    avatar: "https://api.dicebear.com/9.x/avataaars/svg?seed=25520419&backgroundColor=b6e3f4,c0aede,d1d4f9,ffd5dc,ffdfbf",
    email: "khoa.pd@trainee.uit.edu.vn",
    batch: "KHMT2025.1",
    track: "Khoa Khoa học Máy tính",
    department: "Khoa học Máy tính",
    status: "Đang học",
    cohortYear: "2025",
    academicYear: "2026-2027",
    cumulativeGpa: 8.95,
    gpaClassification: "Tốt",
    gpaTrend: "+4.1% so với HK trước",
    gpaTrendIsPositive: true,
    completedCredits: 54,
    totalCredits: 126,
    creditsPercent: 42.8,
    actualCredits: 48,
    trainingScore: 96.0,
    trainingClassification: "Xuất sắc",
    previousSemesterGpa: 8.60,
    previousSemesterNote: "Tăng trưởng tốt trong các kỳ gần đây",
    mentor: {
      name: "Nguyễn Bích Vân",
      role: "Cố vấn học tập & Mentor Trainee",
      email: "vannb@uit.edu.vn",
      phone: "0904607220",
      avatarInitial: "NV"
    },
    scheduleToday: [
      {
        time: "07:30 – 10:45",
        period: "Tiết 1-4",
        title: "Xử lý Ngôn ngữ Tự nhiên & LLM",
        courseCode: "CS338.O11",
        type: "THỰC HÀNH",
        room: "Lab 501",
        instructor: "TS. Nguyễn Lưu Thùy Ngân"
      }
    ],
    pendingRequests: [],
    gpaHistory: [
      { semester: "1-25", semesterGpa: 8.70, cumulativeGpa: 8.70 },
      { semester: "2-25", semesterGpa: 8.85, cumulativeGpa: 8.78 },
      { semester: "3-25", semesterGpa: 8.95, cumulativeGpa: 8.86 }
    ],
    rank: 3,
    completedTasks: 21,
    totalTasks: 24,
    skills: ["AI/NLP", "PyTorch", "Python", "MongoDB Vector Search", "LangChain"],
    bio: "Top 3 Trainee. Trọng tâm nghiên cứu Generative AI & Retrieval-Augmented Generation."
  },
  {
    traineeId: "25520332",
    fullName: "Vũ Thị Thúy Vy",
    avatar: "https://api.dicebear.com/9.x/avataaars/svg?seed=25520332&backgroundColor=b6e3f4,c0aede,d1d4f9,ffd5dc,ffdfbf",
    email: "vy.vtt@trainee.uit.edu.vn",
    batch: "KTPM2025.2",
    track: "Khoa Kỹ thuật Phần mềm",
    department: "Kỹ thuật Phần mềm",
    status: "Đang học",
    cohortYear: "2025",
    academicYear: "2026-2027",
    cumulativeGpa: 8.58,
    gpaClassification: "Tốt",
    gpaTrend: "-1.2% so với HK trước",
    gpaTrendIsPositive: false,
    completedCredits: 50,
    totalCredits: 126,
    creditsPercent: 39.7,
    actualCredits: 44,
    trainingScore: 95.0,
    trainingClassification: "Xuất sắc",
    previousSemesterGpa: 8.70,
    previousSemesterNote: "Phong độ học tập tốt",
    mentor: {
      name: "TS. Trần Văn Thuận",
      role: "Trưởng bộ môn KTPM",
      email: "thuantv@uit.edu.vn",
      phone: "0908123456",
      avatarInitial: "TT"
    },
    scheduleToday: [],
    pendingRequests: [],
    gpaHistory: [
      { semester: "1-25", semesterGpa: 8.50, cumulativeGpa: 8.50 },
      { semester: "2-25", semesterGpa: 8.70, cumulativeGpa: 8.60 },
      { semester: "3-25", semesterGpa: 8.58, cumulativeGpa: 8.59 }
    ],
    rank: 5,
    completedTasks: 17,
    totalTasks: 24,
    skills: ["Vue.js", "Java Spring Boot", "PostgreSQL", "MongoDB", "TailwindCSS"],
    bio: "Fullstack developer năng động, chuyên trách mảng thiết kế UI/UX và REST API."
  },
  {
    traineeId: "25520771",
    fullName: "Trần Đình Gia Huy",
    avatar: "https://api.dicebear.com/9.x/avataaars/svg?seed=25520771&backgroundColor=b6e3f4,c0aede,d1d4f9,ffd5dc,ffdfbf",
    email: "huy.tdg@trainee.uit.edu.vn",
    batch: "MMT2025.1",
    track: "Khoa Mạng Máy tính & An toàn TT",
    department: "An toàn Thông tin",
    status: "Đang học",
    cohortYear: "2025",
    academicYear: "2026-2027",
    cumulativeGpa: 8.45,
    gpaClassification: "Khá Giỏi",
    gpaTrend: "+5.0% so với HK trước",
    gpaTrendIsPositive: true,
    completedCredits: 48,
    totalCredits: 126,
    creditsPercent: 38.1,
    actualCredits: 42,
    trainingScore: 94.0,
    trainingClassification: "Xuất sắc",
    previousSemesterGpa: 8.05,
    previousSemesterNote: "Tiến bộ vượt bậc về an ninh mạng",
    mentor: {
      name: "ThS. Lê Kim Bảo",
      role: "Cố vấn Cyber Security",
      email: "baolk@uit.edu.vn",
      phone: "0933221144",
      avatarInitial: "KB"
    },
    scheduleToday: [],
    pendingRequests: [],
    gpaHistory: [
      { semester: "1-25", semesterGpa: 8.00, cumulativeGpa: 8.00 },
      { semester: "2-25", semesterGpa: 8.05, cumulativeGpa: 8.03 },
      { semester: "3-25", semesterGpa: 8.45, cumulativeGpa: 8.21 }
    ],
    rank: 6,
    completedTasks: 16,
    totalTasks: 24,
    skills: ["Cyber Security", "Penetration Testing", "Linux Admin", "MongoDB Hardening", "Go"],
    bio: "Đạt giải nhì kỳ thi Sinh viên An toàn Thông tin phía Nam. Chuyên viên bảo mật hạ tầng."
  },
  {
    traineeId: "25520993",
    fullName: "Hoàng Ngọc Ánh",
    avatar: "https://api.dicebear.com/9.x/avataaars/svg?seed=25520993&backgroundColor=b6e3f4,c0aede,d1d4f9,ffd5dc,ffdfbf",
    email: "anh.hn@trainee.uit.edu.vn",
    batch: "KHMT2025.2",
    track: "Khoa Khoa học Máy tính",
    department: "Trí tuệ Nhân tạo",
    status: "Đang học",
    cohortYear: "2025",
    academicYear: "2026-2027",
    cumulativeGpa: 8.35,
    gpaClassification: "Khá Giỏi",
    gpaTrend: "+2.1% so với HK trước",
    gpaTrendIsPositive: true,
    completedCredits: 48,
    totalCredits: 126,
    creditsPercent: 38.1,
    actualCredits: 40,
    trainingScore: 93.5,
    trainingClassification: "Tốt",
    previousSemesterGpa: 8.18,
    previousSemesterNote: "Điểm nghiên cứu đạt loại A",
    mentor: {
      name: "Nguyễn Bích Vân",
      role: "Cố vấn học tập & Mentor Trainee",
      email: "vannb@uit.edu.vn",
      phone: "0904607220",
      avatarInitial: "NV"
    },
    scheduleToday: [],
    pendingRequests: [],
    gpaHistory: [
      { semester: "1-25", semesterGpa: 8.10, cumulativeGpa: 8.10 },
      { semester: "2-25", semesterGpa: 8.18, cumulativeGpa: 8.14 },
      { semester: "3-25", semesterGpa: 8.35, cumulativeGpa: 8.25 }
    ],
    rank: 7,
    completedTasks: 15,
    totalTasks: 24,
    skills: ["Deep Learning", "TensorFlow", "Scikit-Learn", "MongoDB Atlas Search"],
    bio: "Đam mê khai phá dữ liệu lớn và thuật toán phân loại tự động."
  },
  {
    traineeId: "25520654",
    fullName: "Đỗ Quốc Bảo",
    avatar: "https://api.dicebear.com/9.x/avataaars/svg?seed=25520654&backgroundColor=b6e3f4,c0aede,d1d4f9,ffd5dc,ffdfbf",
    email: "bao.dq@trainee.uit.edu.vn",
    batch: "KTPM2025.1",
    track: "Khoa Kỹ thuật Phần mềm",
    department: "Kỹ thuật Phần mềm",
    status: "Đang học",
    cohortYear: "2025",
    academicYear: "2026-2027",
    cumulativeGpa: 8.15,
    gpaClassification: "Khá",
    gpaTrend: "-0.5% so với HK trước",
    gpaTrendIsPositive: false,
    completedCredits: 46,
    totalCredits: 126,
    creditsPercent: 36.5,
    actualCredits: 42,
    trainingScore: 90.0,
    trainingClassification: "Tốt",
    previousSemesterGpa: 8.20,
    previousSemesterNote: "Cần cải thiện tốc độ giao task",
    mentor: {
      name: "TS. Trần Văn Thuận",
      role: "Trưởng bộ môn KTPM",
      email: "thuantv@uit.edu.vn",
      phone: "0908123456",
      avatarInitial: "TT"
    },
    scheduleToday: [],
    pendingRequests: [],
    gpaHistory: [
      { semester: "1-25", semesterGpa: 8.00, cumulativeGpa: 8.00 },
      { semester: "2-25", semesterGpa: 8.20, cumulativeGpa: 8.10 },
      { semester: "3-25", semesterGpa: 8.15, cumulativeGpa: 8.12 }
    ],
    rank: 8,
    completedTasks: 14,
    totalTasks: 24,
    skills: ["Flutter", "Dart", "MongoDB Realm", "Firebase", "Node.js"],
    bio: "Mobile App Developer với kinh nghiệm xây dựng ứng dụng theo dõi học tập đa nền tảng."
  }
];

const mockAnnouncements = [
  {
    id: "news-01",
    title: "Thông báo về việc báo cáo tiến độ Sprint 3 & Đánh giá định kỳ Trainee Program 2026",
    summary: "Tất cả thực tập sinh hoàn tất nộp code repository và slide báo cáo trước 23:59 ngày 31/10/2026.",
    category: "Học vụ",
    date: "26/10/2026",
    isNewItem: true,
    link: "#"
  },
  {
    id: "news-02",
    title: "Workshop chuyên sâu: Tối ưu hóa MongoDB Atlas & Vector Search cho ứng dụng AI",
    summary: "Diễn giả khách mời từ Solution Architect chia sẻ cách thiết kế Schema NoSQL tối ưu chịu tải cao.",
    category: "Sự kiện",
    date: "25/10/2026",
    isNewItem: true,
    link: "#"
  },
  {
    id: "news-03",
    title: "Kết quả đăng ký tín chỉ và phân bổ đề tài tốt nghiệp đợt 1 năm học 2026-2027",
    summary: "Sinh viên tra cứu danh sách GVHD và khung thời gian làm việc trực tiếp tại trang web bộ môn.",
    category: "Thông báo",
    date: "22/10/2026",
    isNewItem: false,
    link: "#"
  }
];

// Tự động bổ sung các biến chỉ số mới cho tất cả Trainee mẫu (sẵn sàng sync Admin & DB)
mockTrainees.forEach((t, i) => {
  if (t.accumulatedStars === undefined) {
    t.accumulatedStars = Math.round((t.cumulativeGpa || 8.5) * 3.5);
  }
  if (!t.starClassification) {
    t.starClassification = t.accumulatedStars >= 30 ? "Hạng Kim Cương ⭐⭐⭐⭐" : t.accumulatedStars >= 24 ? "Hạng Vàng ⭐⭐⭐" : "Hạng Bạc ⭐⭐";
  }
  if (!t.starTrend) {
    t.starTrend = "+4 sao tuần này";
  }
  if (t.starTrendIsPositive === undefined) {
    t.starTrendIsPositive = true;
  }
  
  if (t.attendedSessions === undefined) {
    t.attendedSessions = 40 + (i % 5);
  }
  if (t.totalSessions === undefined) {
    t.totalSessions = 45;
  }
  if (t.attendanceRate === undefined) {
    t.attendanceRate = Math.round((t.attendedSessions / t.totalSessions) * 1000) / 10;
  }
  if (t.absentExcused === undefined) {
    t.absentExcused = Math.max(t.totalSessions - t.attendedSessions, 0);
  }
  if (t.absentUnexcused === undefined) {
    t.absentUnexcused = 0;
  }
  t.attendanceNote = `Đã tham gia: <span>${t.attendedSessions}</span> buổi · Vắng có phép: <span>${t.absentExcused}</span> · Không phép: <span>${t.absentUnexcused}</span>`;
  
  if (t.assignmentScore === undefined) {
    t.assignmentScore = Number(((t.trainingScore ? t.trainingScore / 10 : 9.5)).toFixed(1));
  }
  if (!t.assignmentClassification) {
    t.assignmentClassification = t.assignmentScore >= 9.0 ? "Xuất sắc" : "Giỏi";
  }
  if (t.completedAssignments === undefined) {
    t.completedAssignments = t.completedTasks || 14;
  }
  if (t.totalAssignments === undefined) {
    t.totalAssignments = 15;
  }
  if (!t.assignmentNote) {
    t.assignmentNote = `Đạt ${t.completedAssignments}/${t.totalAssignments} bài tập · Đạt yêu cầu 100%`;
  }
  
  if (t.currentRank === undefined) {
    t.currentRank = t.rank || (i + 1);
  }
  if (t.totalStudentsInRank === undefined) {
    t.totalStudentsInRank = mockTrainees.length;
  }
  if (!t.rankClassification) {
    t.rankClassification = t.currentRank === 1 ? "🥇 Quán quân Trainee" : t.currentRank === 2 ? "🥈 Á quân Trainee" : t.currentRank === 3 ? "🥉 Hạng 3 Trainee" : `Top ${t.currentRank}`;
  }
  if (!t.rankNote) {
    t.rankNote = `Hạng ${t.currentRank} / ${mockTrainees.length} sinh viên · ${t.track}`;
  }

  if (!t.password) {
    t.password = "1234";
  }
  if (!t.role) {
    t.role = "student";
  }
});

module.exports = {
  mockTrainees,
  mockAnnouncements
};
