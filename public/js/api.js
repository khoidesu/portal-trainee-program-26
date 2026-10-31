/**
 * API Service Layer cho Trainee Portal
 * Giao tiếp với backend Express (MongoDB hoặc Mock Database)
 * Đã tích hợp gửi Token JWT trong header Authorization để xác thực quyền Admin
 */

const API = {
  baseUrl: '/api',

  async request(path, options = {}) {
    const response = await fetch(this.baseUrl + path, { ...options, headers: this.getAuthHeaders(options.headers) });
    const result = await response.json();
    if (!response.ok || !result.success) {
      if (response.status === 401 && window.state) {
        window.state.currentUser = null;
        window.updateAuthUI?.();
      }
      throw new Error(result.message || 'Không hoàn tất được thao tác.');
    }
    return result.data;
  },

  getAccounts() { return this.request('/auth/accounts'); },
  saveAccount(id, data) { return this.request('/auth/accounts' + (id ? '/' + encodeURIComponent(id) : ''), { method: id ? 'PUT' : 'POST', body: JSON.stringify(data) }); },
  getPublicLeave() { return this.request('/requests/leave'); },
  createAssignment(data) { return this.request('/assignments', { method: 'POST', body: JSON.stringify(data) }); },
  deleteAssignment(id) { return this.request('/assignments/' + encodeURIComponent(id), { method: 'DELETE' }); },
  saveAttendance(id, code, data) { return this.request('/admin/attendance/' + encodeURIComponent(id) + '/' + encodeURIComponent(code), { method: 'PUT', body: JSON.stringify(data) }); },

  prepareTrainee(trainee) {
    if (!trainee) return trainee;
    const result = { ...trainee };
    for (const key of ['starClassification', 'rankClassification', 'starTrend', 'rankNote']) {
      if (typeof result[key] === 'string') result[key] = result[key].replace(/[\p{Extended_Pictographic}\uFE0F\u200D]/gu, '').trim();
    }
    return result;
  },

  // Lấy Headers kèm token xác thực an toàn
  getAuthHeaders(extraHeaders = {}) {
    const headers = {
      'Content-Type': 'application/json',
      ...extraHeaders
    };
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

  // Lấy danh sách Trainee cho Bảng Xếp Hạng
  async getTrainees({ search = '', track = '', sort = 'rank' } = {}) {
    try {
      const params = new URLSearchParams();
      if (search) params.append('search', search);
      if (track && track !== 'all') params.append('track', track);
      if (sort) params.append('sort', sort);

      const res = await fetch(`${this.baseUrl}/trainees?${params.toString()}`);
      const json = await res.json();
      return (json.data || []).map(trainee => this.prepareTrainee(trainee));
    } catch (err) {
      console.error('Lỗi khi fetch danh sách trainee:', err);
      return [];
    }
  },

  // Lấy chi tiết 1 Trainee cho Dashboard
  async getTraineeById(id) {
    try {
      const res = await fetch(`${this.baseUrl}/trainees/${encodeURIComponent(id)}`);
      const json = await res.json();
      return this.prepareTrainee(json.data);
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

  // Thêm mới Trainee (Admin - kèm Token)
  async createTrainee(traineeData) {
    try {
      const res = await fetch(`${this.baseUrl}/trainees`, {
        method: 'POST',
        headers: this.getAuthHeaders(),
        body: JSON.stringify(traineeData)
      });
      return await res.json();
    } catch (err) {
      return { success: false, message: 'Lỗi thêm Trainee: ' + err.message };
    }
  },

  // Cập nhật thông tin Trainee (Admin - kèm Token)
  async updateTrainee(id, updateData) {
    try {
      const res = await fetch(`${this.baseUrl}/trainees/${encodeURIComponent(id)}`, {
        method: 'PUT',
        headers: this.getAuthHeaders(),
        body: JSON.stringify(updateData)
      });
      return await res.json();
    } catch (err) {
      return { success: false, message: 'Lỗi cập nhật Trainee: ' + err.message };
    }
  },

  // Xóa Trainee (Admin - kèm Token)
  async deleteTrainee(id) {
    try {
      const res = await fetch(`${this.baseUrl}/trainees/${encodeURIComponent(id)}`, {
        method: 'DELETE',
        headers: this.getAuthHeaders()
      });
      return await res.json();
    } catch (err) {
      return { success: false, message: 'Lỗi xóa Trainee: ' + err.message };
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
      if (!res.ok || !json.success) throw new Error(json.message || 'Không tải được yêu cầu.');
      return json.data || [];
    } catch (err) {
      console.error('Lỗi khi lấy danh sách yêu cầu:', err);
      throw err;
    }
  },

  // Giải quyết yêu cầu và cấp lại mật khẩu (Admin - kèm Token)
  async resolveSupportRequest(id, newPassword) {
    try {
      const res = await fetch(`${this.baseUrl}/requests/${encodeURIComponent(id)}`, {
        method: 'PUT',
        headers: this.getAuthHeaders(),
        body: JSON.stringify({ newPassword })
      });
      return await res.json();
    } catch (err) {
      return { success: false, message: 'Lỗi xử lý yêu cầu: ' + err.message };
    }
  },

  async submitLeave(data) {
    const response = await fetch(`${this.baseUrl}/requests/leave`, {
      method: 'POST', headers: this.getAuthHeaders(), body: JSON.stringify(data)
    });
    const result = await response.json();
    if (!response.ok || !result.success) throw new Error(result.message || 'Không gửi được đơn xin nghỉ.');
    return result;
  },

  async updateLeave(id, status) {
    const response = await fetch(`${this.baseUrl}/requests/${encodeURIComponent(id)}`, {
      method: 'PUT', headers: this.getAuthHeaders(), body: JSON.stringify({ status })
    });
    return response.json();
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
      if (!res.ok || !json.success || !Array.isArray(json.data)) throw new Error(json.message || 'Không tải được câu hỏi.');
      return json.data || [];
    } catch (err) {
      console.warn('Lỗi khi fetch câu hỏi từ API:', err);
      throw err;
    }
  },

  // Trainee gửi câu hỏi mới
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

  // Trainer trả lời câu hỏi (Admin - kèm Token)
  async answerQuestion(id, answer, answeredBy = 'Trainer', answeredRole = 'Ban Tổ chức Trainee Program') {
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
  async getSchedules({ month, year } = {}) {
    const today = getVietnamDateParts();
    const res = await fetch(`${this.baseUrl}/schedules?month=${encodeURIComponent(month || today.month)}&year=${encodeURIComponent(year || today.year)}`);
    const json = await res.json();
    if (!res.ok || !json.success || !Array.isArray(json.data)) throw new Error('Không tải được lịch học.');
    return json.data;
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
      if (!res.ok || !json.success || !Array.isArray(json.data)) throw new Error('Không tải được danh sách bài tập.');
      return json.data || [];
    } catch (err) {
      console.warn('Lỗi fetch assignments từ API:', err);
      throw err;
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
  async getAssignmentSubmissions(id) {
    const response = await fetch(`${this.baseUrl}/assignments/${encodeURIComponent(id)}/submissions`);
    const result = await response.json();
    if (!response.ok || !result.success || !Array.isArray(result.data)) throw new Error(result.message || 'Không tải được phản hồi nộp bài.');
    return result.data;
  },

  async updateAssignmentSubmission(id, traineeId, data) {
    const response = await fetch(`${this.baseUrl}/assignments/${encodeURIComponent(id)}/submissions/${encodeURIComponent(traineeId)}`, {
      method: 'PUT', headers: this.getAuthHeaders(), body: JSON.stringify(data)
    });
    const result = await response.json();
    if (!response.ok || !result.success) throw new Error(result.message || 'Không lưu được xác nhận.');
    return result.data;
  },

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
