/**
 * Tạo / đặt lại tài khoản Quản trị gốc TRỰC TIẾP trong MongoDB.
 * Mật khẩu không nằm trong .env, source code hay biến môi trường: chỉ lưu hash scrypt trong database.
 *
 * Cách dùng (chạy trên máy bạn, cần MONGODB_URI trong .env hoặc biến môi trường):
 *   npm run create-admin                          # hỏi tên đăng nhập + mật khẩu (ẩn khi gõ)
 *   npm run create-admin -- --username=quanly     # chọn tên đăng nhập
 *   npm run create-admin -- --generate            # sinh mật khẩu ngẫu nhiên, chỉ in ra MỘT lần
 *   npm run create-admin -- --reset               # đặt lại mật khẩu cho Quản trị gốc đã có
 */
require('dotenv').config();
const crypto = require('crypto');
const readline = require('readline');
const mongoose = require('mongoose');
const Account = require('../models/Account');
const { hashPassword, KNOWN_WEAK_PASSWORDS, CONTENT_PERMISSIONS } = require('../utils/security');

function validatePassword(password) {
  if (typeof password !== 'string' || password.length < 8 || password.length > 256) return 'Mật khẩu cần 8–256 ký tự.';
  if (KNOWN_WEAK_PASSWORDS.has(password.toLowerCase())) return 'Mật khẩu này nằm trong danh sách đã lộ, hãy chọn mật khẩu khác.';
  return null;
}

function ask(question, { hidden = false } = {}) {
  return new Promise(resolve => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    if (hidden) {
      rl._writeToOutput = text => { if (text.includes(question)) process.stdout.write(question); };
    }
    rl.question(question, answer => { rl.close(); if (hidden) process.stdout.write('\n'); resolve(answer); });
  });
}

// Một số nhà mạng/router/VPN chặn truy vấn DNS SRV (lỗi querySrv ECONNREFUSED) nên không phân giải được
// chuỗi mongodb+srv://. Khi đó thử lại một lần bằng DNS công cộng của Google và Cloudflare.
async function connectWithDnsFallback() {
  const options = { serverSelectionTimeoutMS: 15000 };
  try {
    await mongoose.connect(process.env.MONGODB_URI, options);
  } catch (error) {
    const dnsFailure = /^query(Srv|Txt)$/.test(error.syscall || '') || /querySrv|queryTxt/.test(error.message || '');
    if (!dnsFailure) throw error;
    console.warn('DNS hiện tại không phân giải được bản ghi SRV của MongoDB, thử lại với DNS 8.8.8.8 / 1.1.1.1...');
    require('dns').setServers(['8.8.8.8', '1.1.1.1']);
    await mongoose.disconnect().catch(() => {});
    await mongoose.connect(process.env.MONGODB_URI, options);
  }
}

async function main() {
  const args = Object.fromEntries(process.argv.slice(2).map(arg => {
    const [key, value] = arg.replace(/^--/, '').split('=');
    return [key, value === undefined ? true : value];
  }));
  if (!process.env.MONGODB_URI) throw new Error('Thiếu MONGODB_URI.');

  const username = String(args.username || (await ask('Tên đăng nhập quản trị (không dùng "admin"): '))).trim().toLowerCase();
  if (!/^[a-z0-9][a-z0-9_.-]{2,79}$/.test(username)) throw new Error('Tên đăng nhập không hợp lệ (3–80 ký tự a-z, 0-9, _ . -).');
  if (username === 'admin') throw new Error('Không dùng tên "admin" vì quá dễ đoán.');

  let password;
  let generated = false;
  if (args.generate) {
    password = crypto.randomBytes(18).toString('base64url');
    generated = true;
  } else {
    password = await ask('Mật khẩu (tối thiểu 8 ký tự): ', { hidden: true });
    if (password !== await ask('Nhập lại mật khẩu: ', { hidden: true })) throw new Error('Hai lần nhập mật khẩu không khớp.');
  }
  const problem = validatePassword(password);
  if (problem) throw new Error(problem);

  await connectWithDnsFallback();
  try { await Account.init(); }
  catch (error) { console.warn('Bỏ qua lỗi đồng bộ index (không ảnh hưởng việc tạo admin):', error.message.split('.')[0]); }
  const existing = await Account.findOne({ isOwner: true }).select('_id username').lean();
  const taken = await Account.findOne({ username }).select('_id isOwner').lean();

  if (existing && !args.reset) throw new Error(`Đã có Quản trị gốc "${existing.username}". Dùng --reset để đặt lại mật khẩu.`);
  if (taken && !taken.isOwner) throw new Error('Tên đăng nhập này đang thuộc tài khoản khác.');

  if (existing) {
    // Đặt lại: đổi hash + tăng sessionVersion để mọi phiên cũ hết hiệu lực ngay.
    await Account.updateOne({ _id: existing._id }, {
      $set: { username, password: hashPassword(password), active: true, mustChangePassword: false, lastPasswordChangeAt: new Date() },
      $inc: { sessionVersion: 1 }
    });
    console.log(`Đã đặt lại mật khẩu cho Quản trị gốc "${username}". Mọi phiên đăng nhập cũ đã bị thu hồi.`);
  } else {
    await Account.create({
      username, fullName: 'Quản trị hệ thống', password: hashPassword(password), role: 'admin', isOwner: true,
      permissions: [...CONTENT_PERMISSIONS], active: true, mustChangePassword: false
    });
    console.log(`Đã tạo Quản trị gốc "${username}" trong database.`);
  }
  if (generated) console.log(`\nMật khẩu (chỉ hiện một lần, hãy lưu vào trình quản lý mật khẩu):\n${password}\n`);
}

if (require.main === module) {
  main().then(() => mongoose.disconnect()).catch(error => {
    console.error('Lỗi:', error.message);
    process.exitCode = 1;
    mongoose.disconnect().catch(() => {});
  });
}

module.exports = { validatePassword };