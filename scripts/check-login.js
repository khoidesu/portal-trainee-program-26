/**
 * Chẩn đoán đăng nhập: cho biết đang kết nối database nào và mật khẩu nhập vào có khớp hash trong DB không.
 * Không in mật khẩu hay hash ra màn hình.
 *
 *   npm run check-login -- --username=doankhoa.khmt
 *   (hoặc: node scripts/check-login.js --username=doankhoa.khmt)
 */
require('dotenv').config();
const readline = require('readline');
const mongoose = require('mongoose');
const Account = require('../models/Account');
const { verifyPassword } = require('../utils/security');

function ask(question) {
  return new Promise(resolve => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    rl._writeToOutput = text => { if (text.includes(question)) process.stdout.write(question); };
    rl.question(question, answer => { rl.close(); process.stdout.write('\n'); resolve(answer); });
  });
}

async function main() {
  const args = Object.fromEntries(process.argv.slice(2).map(arg => {
    const [key, value] = arg.replace(/^--/, '').split('=');
    return [key, value === undefined ? true : value];
  }));
  if (!process.env.MONGODB_URI) throw new Error('Thiếu MONGODB_URI.');
  const username = String(args.username || await ask('Tên đăng nhập: ')).trim().toLowerCase();
  const password = await ask('Mật khẩu cần thử: ');

  const options = { serverSelectionTimeoutMS: 15000 };
  try {
    await mongoose.connect(process.env.MONGODB_URI, options);
  } catch (error) {
    // Một số nhà mạng/router/VPN chặn DNS SRV (querySrv ECONNREFUSED): thử lại bằng DNS công cộng.
    if (!/querySrv|queryTxt/.test(`${error.syscall || ''} ${error.message || ''}`)) throw error;
    console.warn('DNS hiện tại không phân giải được bản ghi SRV của MongoDB, thử lại với DNS 8.8.8.8 / 1.1.1.1...');
    require('dns').setServers(['8.8.8.8', '1.1.1.1']);
    await mongoose.disconnect().catch(() => {});
    await mongoose.connect(process.env.MONGODB_URI, options);
  }
  console.log(`Database đang dùng: "${mongoose.connection.name}"`);

  const account = await Account.findOne({ username }).select('+password').lean();
  if (!account) {
    console.log(`Không có tài khoản "${username}" trong database này.`);
    return;
  }
  console.log(`Tìm thấy: role=${account.role}, isOwner=${account.isOwner}, active=${account.active}`);
  if (password !== password.trim()) console.log('CẢNH BÁO: mật khẩu có dấu cách ở đầu/cuối; hệ thống sẽ không bao giờ khớp. Hãy đặt lại mật khẩu không có dấu cách.');
  const passwordMatches = verifyPassword(password, account.password);
  console.log(passwordMatches
    ? 'KẾT QUẢ DATABASE: mật khẩu KHỚP.'
    : 'KẾT QUẢ DATABASE: mật khẩu KHÔNG khớp. Hãy chạy: npm run create-admin -- --reset');

  if (passwordMatches) {
    try {
      const statusResponse = await fetch('http://127.0.0.1:3000/api/status', { signal: AbortSignal.timeout(5000) });
      const statusBody = await statusResponse.json();
      console.log(`Website local: ${statusBody.data?.isMongoDBConnected ? 'đang dùng MongoDB' : 'đang dùng fallback'}, HTTP ${statusResponse.status}.`);
      const loginResponse = await fetch('http://127.0.0.1:3000/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
        signal: AbortSignal.timeout(10000)
      });
      const loginBody = await loginResponse.json();
      console.log(loginResponse.ok && loginBody.success
        ? `KẾT QUẢ API WEBSITE: đăng nhập THÀNH CÔNG (HTTP ${loginResponse.status}).`
        : `KẾT QUẢ API WEBSITE: THẤT BẠI (HTTP ${loginResponse.status}) — ${loginBody.message || 'Không rõ nguyên nhân'}`);
    } catch (error) {
      console.log(`Không kiểm tra được website local tại cổng 3000: ${error.message}`);
    }
  }
}

main().catch(error => { console.error('Lỗi:', error.message); process.exitCode = 1; })
  .finally(() => mongoose.disconnect().catch(() => {}));
