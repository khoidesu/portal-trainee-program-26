/**
 * API Service Layer cho Trainee Portal
 * Giao tiếp với backend Express (MongoDB hoặc Mock Database)
 * Đã tích hợp gửi Token JWT trong header Authorization để xác thực quyền Admin
 */

const API = {
  baseUrl: '/api',

  // Lấy Headers kèm token xác thực an toàn
  getAuthHeaders(extraHeaders = {}) {
    const headers = {
      'Content-Type': 'application/json',
      ...extraHeaders
    };
    try {
      const token = localStorage.getItem('uit_trainee_auth_token');
      if (token) {
        headers['Authorization'] = `Bearer ${token.trim()}`;
      }
    } catch (e) {
      console.warn('Lỗi đọc token từ localStorage:', e);
    }
    return headers;
  },

  // Lấy trạng thái kết nối DB
  async getStatus() {
    try {
      const res = await fetch(`${this.baseUrl}/status`);
      const data = await res.json();
      return data.data;
    } catch (err) {
      console.warn('Lỗi khi lấy status API:', err);
      return { activeDatabaseType: 'mock', isMongoDBConnected: false };
    }
  },

  // Lấy danh sách thực tập sinh cho Bảng Xếp Hạng
  async getTrainees({ search = '', track = '', sort = 'rank' } = {}) {
    try {
      const params = new URLSearchParams();
      if (search) params.append('search', search);
      if (track && track !== 'all') params.append('track', track);
      if (sort) params.append('sort', sort);

      const res = await fetch(`${this.baseUrl}/trainees?${params.toString()}`);
      const json = await res.json();
      return json.data || [];
    } catch (err) {
      console.error('Lỗi khi fetch danh sách trainee:', err);
      return [];
    }
  },

  // Lấy chi tiết 1 thực tập sinh cho Dashboard
  async getTraineeById(id) {
    try {
      const res = await fetch(`${this.baseUrl}/trainees/${encodeURIComponent(id)}`);
      const json = await res.json();
      return json.data;
    } catch (err) {
      console.error(`Lỗi khi fetch trainee ${id}:`, err);
      return null;
    }
  },

  // Lấy danh sách thông báo
  async getAnnouncements() {
    try {
      const res = await fetch(`${this.baseUrl}/announcements`);
      const json = await res.json();
      return json.data || [];
    } catch (err) {
      console.error('Lỗi khi fetch thông báo:', err);
      return [];
    }
  },

  // Cấu hình URI MongoDB trực tiếp (Yêu cầu quyền Admin)
  async saveMongoUri(uri) {
    try {
      const res = await fetch(`${this.baseUrl}/config/mongodb`, {
        method: 'POST',
        headers: this.getAuthHeaders(),
        body: JSON.stringify({ uri })
      });
      return await res.json();
    } catch (err) {
      return { success: false, message: err.message };
    }
  },

  // Đăng nhập hệ thống (Admin)
  async login(username, password) {
    try {
      const res = await fetch(`${this.baseUrl}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
      });
      const data = await res.json();
      if (data && data.success && data.token) {
        localStorage.setItem('uit_trainee_auth_token', data.token);
      }
      return data;
    } catch (err) {
      return { success: false, message: 'Lỗi kết nối tới máy chủ: ' + err.message };
    }
  },

  // Đổi mật khẩu tài khoản
  async changePassword(traineeId, currentPassword, newPassword) {
    try {
      const res = await fetch(`${this.baseUrl}/auth/change-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ traineeId, currentPassword, newPassword })
      });
      return await res.json();
    } catch (err) {
      return { success: false, message: 'Lỗi kết nối tới máy chủ: ' + err.message };
    }
  },

  // Thêm mới thực tập sinh (Admin - kèm Token)
  async createTrainee(traineeData) {
    try {
      const res = await fetch(`${this.baseUrl}/trainees`, {
        method: 'POST',
        headers: this.getAuthHeaders(),
        body: JSON.stringify(traineeData)
      });
      return await res.json();
    } catch (err) {
      return { success: false, message: 'Lỗi thêm sinh viên: ' + err.message };
    }
  },

  // Cập nhật thông tin thực tập sinh (Admin - kèm Token)
  async updateTrainee(id, updateData) {
    try {
      const res = await fetch(`${this.baseUrl}/trainees/${encodeURIComponent(id)}`, {
        method: 'PUT',
        headers: this.getAuthHeaders(),
        body: JSON.stringify(updateData)
      });
      return await res.json();
    } catch (err) {
      return { success: false, message: 'Lỗi cập nhật sinh viên: ' + err.message };
    }
  },

  // Xóa thực tập sinh (Admin - kèm Token)
  async deleteTrainee(id) {
    try {
      const res = await fetch(`${this.baseUrl}/trainees/${encodeURIComponent(id)}`, {
        method: 'DELETE',
        headers: this.getAuthHeaders()
      });
      return await res.json();
    } catch (err) {
      return { success: false, message: 'Lỗi xóa sinh viên: ' + err.message };
    }
  },

  // Gửi yêu cầu quên mật khẩu
  async requestForgotPassword(data) {
    try {
      const res = await fetch(`${this.baseUrl}/requests/forgot-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      });
      return await res.json();
    } catch (err) {
      return { success: false, message: 'Lỗi gửi yêu cầu: ' + err.message };
    }
  },

  // Lấy danh sách yêu cầu hỗ trợ (Admin - kèm Token)
  async getSupportRequests({ type = '', status = '' } = {}) {
    try {
      const params = new URLSearchParams();
      if (type) params.append('type', type);
      if (status) params.append('status', status);
      const res = await fetch(`${this.baseUrl}/requests?${params.toString()}`, {
        headers: this.getAuthHeaders()
      });
      const json = await res.json();
      return json.data || [];
    } catch (err) {
      console.error('Lỗi khi lấy danh sách yêu cầu:', err);
      return [];
    }
  },

  // Giải quyết yêu cầu và cấp lại mật khẩu (Admin - kèm Token)
  async resolveSupportRequest(id, newPassword = '1234') {
    try {
      const res = await fetch(`${this.baseUrl}/requests/${id}/resolve`, {
        method: 'PUT',
        headers: this.getAuthHeaders(),
        body: JSON.stringify({ newPassword })
      });
      return await res.json();
    } catch (err) {
      return { success: false, message: 'Lỗi xử lý yêu cầu: ' + err.message };
    }
  },

  // Xóa yêu cầu hỗ trợ (Admin - kèm Token)
  async deleteSupportRequest(id) {
    try {
      const res = await fetch(`${this.baseUrl}/requests/${id}`, {
        method: 'DELETE',
        headers: this.getAuthHeaders()
      });
      return await res.json();
    } catch (err) {
      return { success: false, message: 'Lỗi xóa yêu cầu: ' + err.message };
    }
  },

  // ==========================================
  // CHI TIẾT SAO BUỔI HỌC & BẢNG ĐIỂM
  // ==========================================

  // Lấy chi tiết sao từng buổi học
  async getSessionStars(traineeId) {
    try {
      const res = await fetch(`${this.baseUrl}/trainees/${encodeURIComponent(traineeId)}/session-stars`);
      const json = await res.json();
      return json.data || null;
    } catch (err) {
      console.error('Lỗi khi lấy chi tiết sao:', err);
      return null;
    }
  },

  // Admin tổng hợp và cộng sao theo buổi học (Admin - kèm Token)
  async awardSessionStars(data) {
    try {
      const res = await fetch(`${this.baseUrl}/admin/award-session-stars`, {
        method: 'POST',
        headers: this.getAuthHeaders(),
        body: JSON.stringify(data)
      });
      return await res.json();
    } catch (err) {
      return { success: false, message: 'Lỗi khi cộng sao: ' + err.message };
    }
  },

  // Admin cập nhật bảng điểm sao buổi học (Admin - kèm Token)
  async batchUpdateSessionStars(data) {
    try {
      const res = await fetch(`${this.baseUrl}/admin/batch-update-session-stars`, {
        method: 'POST',
        headers: this.getAuthHeaders(),
        body: JSON.stringify(data)
      });
      return await res.json();
    } catch (err) {
      return { success: false, message: 'Lỗi khi cập nhật bảng điểm sao buổi học: ' + err.message };
    }
  },

  // Admin xóa bản ghi cộng sao (Admin - kèm Token)
  async deleteSessionStar(traineeId, starLogId) {
    try {
      const res = await fetch(`${this.baseUrl}/admin/session-stars/${encodeURIComponent(traineeId)}/${encodeURIComponent(starLogId)}`, {
        method: 'DELETE',
        headers: this.getAuthHeaders()
      });
      return await res.json();
    } catch (err) {
      return { success: false, message: 'Lỗi khi xóa bản ghi cộng sao: ' + err.message };
    }
  },

  // ==========================================
  // DIỄN ĐÀN HỎI ĐÁP & ĐẶT CÂU HỎI (Q&A)
  // ==========================================

  // Lấy danh sách câu hỏi
  async getQuestions({ category = '', status = '', isAnonymous = '', search = '' } = {}) {
    try {
      const params = new URLSearchParams();
      if (category && category !== 'all') params.append('category', category);
      if (status && status !== 'all') params.append('status', status);
      if (isAnonymous !== '') params.append('isAnonymous', isAnonymous);
      if (search) params.append('search', search);

      const res = await fetch(`${this.baseUrl}/questions?${params.toString()}`);
      const json = await res.json();
      return json.data || [];
    } catch (err) {
      console.warn('Lỗi khi fetch câu hỏi từ API:', err);
      return [];
    }
  },

  // Sinh viên gửi câu hỏi mới
  async createQuestion(data) {
    try {
      const res = await fetch(`${this.baseUrl}/questions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      });
      return await res.json();
    } catch (err) {
      return { success: false, message: 'Lỗi kết nối máy chủ: ' + err.message };
    }
  },

  // Giảng viên / Mentor trả lời câu hỏi (Admin - kèm Token)
  async answerQuestion(id, answer, answeredBy = 'Giảng viên UIT', answeredRole = 'Ban Cố vấn & Đào tạo') {
    try {
      const res = await fetch(`${this.baseUrl}/questions/${encodeURIComponent(id)}/answer`, {
        method: 'PUT',
        headers: this.getAuthHeaders(),
        body: JSON.stringify({ answer, answeredBy, answeredRole })
      });
      return await res.json();
    } catch (err) {
      return { success: false, message: 'Lỗi khi trả lời: ' + err.message };
    }
  },

  // Bấm thích câu hỏi
  async likeQuestion(id, userId = 'anonymous') {
    try {
      const res = await fetch(`${this.baseUrl}/questions/${encodeURIComponent(id)}/like`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId })
      });
      return await res.json();
    } catch (err) {
      return { success: false, message: 'Lỗi khi thích: ' + err.message };
    }
  },

  // Xóa câu hỏi (Admin - kèm Token)
  async deleteQuestion(id) {
    try {
      const res = await fetch(`${this.baseUrl}/questions/${encodeURIComponent(id)}`, {
        method: 'DELETE',
        headers: this.getAuthHeaders()
      });
      return await res.json();
    } catch (err) {
      return { success: false, message: 'Lỗi khi xóa câu hỏi: ' + err.message };
    }
  },

  // ==========================================
  // QUẢN LÝ LỊCH HỌC (SCHEDULE APIs)
  // ==========================================
  async getSchedules({ month = 10, year = 2026 } = {}) {
    try {
      const res = await fetch(`${this.baseUrl}/schedules?month=${encodeURIComponent(month)}&year=${encodeURIComponent(year)}`);
      const json = await res.json();
      return json.data || [];
    } catch (err) {
      console.warn('Lỗi fetch schedules:', err);
      return [];
    }
  },

  async createSchedule(data) {
    try {
      const res = await fetch(`${this.baseUrl}/schedules`, {
        method: 'POST',
        headers: this.getAuthHeaders(),
        body: JSON.stringify(data)
      });
      return await res.json();
    } catch (err) {
      return { success: false, message: err.message };
    }
  },

  async updateSchedule(id, data) {
    try {
      const res = await fetch(`${this.baseUrl}/schedules/${encodeURIComponent(id)}`, {
        method: 'PUT',
        headers: this.getAuthHeaders(),
        body: JSON.stringify(data)
      });
      return await res.json();
    } catch (err) {
      return { success: false, message: err.message };
    }
  },

  async deleteSchedule(id) {
    try {
      const res = await fetch(`${this.baseUrl}/schedules/${encodeURIComponent(id)}`, {
        method: 'DELETE',
        headers: this.getAuthHeaders()
      });
      return await res.json();
    } catch (err) {
      return { success: false, message: err.message };
    }
  },

  async resetSchedules(data = {}) {
    try {
      const res = await fetch(`${this.baseUrl}/schedules/reset`, {
        method: 'POST',
        headers: this.getAuthHeaders(),
        body: JSON.stringify(data)
      });
      return await res.json();
    } catch (err) {
      return { success: false, message: err.message };
    }
  },

  // ==========================================
  // QUẢN LÝ 11 BÀI TẬP RÈN LUYỆN (ASSIGNMENTS)
  // ==========================================

  // Lấy danh sách 11 bài tập
  async getAssignments() {
    try {
      const res = await fetch(`${this.baseUrl}/assignments`);
      const json = await res.json();
      return json.data || [];
    } catch (err) {
      console.warn('Lỗi fetch assignments từ API:', err);
      return [];
    }
  },

  // Cập nhật thông tin & đường link & deadline của bài tập (Admin - kèm Token)
  async updateAssignment(id, updateData) {
    try {
      const res = await fetch(`${this.baseUrl}/assignments/${encodeURIComponent(id)}`, {
        method: 'PUT',
        headers: this.getAuthHeaders(),
        body: JSON.stringify(updateData)
      });
      return await res.json();
    } catch (err) {
      return { success: false, message: 'Lỗi kết nối máy chủ: ' + err.message };
    }
  },

  // Cập nhật đồng loạt toàn bộ 11 bài tập (Batch Admin - kèm Token)
  async batchUpdateAssignments(assignments) {
    try {
      const res = await fetch(`${this.baseUrl}/assignments/batch`, {
        method: 'POST',
        headers: this.getAuthHeaders(),
        body: JSON.stringify({ assignments })
      });
      return await res.json();
    } catch (err) {
      return { success: false, message: 'Lỗi cập nhật đồng loạt bài tập: ' + err.message };
    }
  },

  // Khôi phục 11 bài tập về mặc định (Admin - kèm Token)
  async resetAssignments() {
    try {
      const res = await fetch(`${this.baseUrl}/assignments/reset`, {
        method: 'POST',
        headers: this.getAuthHeaders()
      });
      return await res.json();
    } catch (err) {
      return { success: false, message: 'Lỗi reset bài tập: ' + err.message };
    }
  }
};

window.API = API;
