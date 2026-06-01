// api/leads.js — Vercel Serverless Function
// 铁律：所有出口只输出 JSON，绝不输出 HTML

const https = require('https');

// ─── 唯一的响应出口 ─────────────────────────────────────────────────────────
function send(res, status, success, message) {
  const body = JSON.stringify({ success, message });
  try {
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Accept');
  } catch (_) {}
  res.status(status).end(body);
}

// ─── Google Sheets via Apps Script Webhook ─────────────────────────────────
async function writeSheets(data) {
  const url = process.env.GOOGLE_SHEETS_WEBHOOK_URL;
  if (!url) return;
  return new Promise((resolve) => {
    try {
      const payload = JSON.stringify({
        timestamp: new Date().toLocaleString('zh-CN', { timeZone: 'Australia/Sydney' }),
        name: data.name || '',
        company: data.company || '',
        email: data.email || '',
        phone: data.phone || '',
        position: data.position || '',
        message: data.message || '',
        source: 'etlink.com.au'
      });
      const u = new URL(url);
      const req = https.request({
        hostname: u.hostname,
        path: u.pathname + u.search,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(payload)
        }
      }, (r) => {
        r.resume();
        r.on('end', resolve);
      });
      req.on('error', resolve);
      req.setTimeout(8000, () => { req.destroy(); resolve(); });
      req.write(payload);
      req.end();
    } catch (_) { resolve(); }
  });
}

// ─── SendGrid Email ─────────────────────────────────────────────────────────
async function sendEmail(data) {
  const KEY = process.env.SENDGRID_API_KEY;
  const TO  = process.env.NOTIFY_EMAIL  || 'hello@etlink.com.au';
  const FROM = process.env.FROM_EMAIL   || 'noreply@etlink.com.au';
  if (!KEY) return;
  return new Promise((resolve) => {
    try {
      const htmlBody = `<div style="font-family:sans-serif;max-width:580px;margin:0 auto;padding:28px;background:#f8fafc;border-radius:10px">
<h2 style="color:#0f172a;margin:0 0 4px">ETLink 新咨询</h2>
<p style="color:#94a3b8;font-size:13px;margin:0 0 18px">来自官网联系表单</p>
<table style="width:100%;font-size:14px;border-collapse:collapse">
<tr><td style="padding:6px 0;color:#64748b;width:80px">姓名</td><td style="padding:6px 0;font-weight:600">${data.name}</td></tr>
<tr><td style="padding:6px 0;color:#64748b">公司</td><td style="padding:6px 0">${data.company||'—'}</td></tr>
<tr><td style="padding:6px 0;color:#64748b">邮箱</td><td style="padding:6px 0"><a href="mailto:${data.email}" style="color:#1A5CFF">${data.email}</a></td></tr>
<tr><td style="padding:6px 0;color:#64748b">电话</td><td style="padding:6px 0">${data.phone||'—'}</td></tr>
<tr><td style="padding:6px 0;color:#64748b">岗位</td><td style="padding:6px 0">${data.position||'—'}</td></tr>
<tr><td style="padding:6px 0;color:#64748b;vertical-align:top">需求</td><td style="padding:6px 0;line-height:1.7">${(data.message||'—').replace(/\n/g,'<br>')}</td></tr>
<tr><td style="padding:6px 0;color:#64748b">时间</td><td style="padding:6px 0;color:#94a3b8;font-size:12px">${new Date().toLocaleString('zh-CN',{timeZone:'Australia/Sydney'})}</td></tr>
</table></div>`;
      const payload = JSON.stringify({
        personalizations: [{ to: [{ email: TO }] }],
        from: { email: FROM, name: 'ETLink 官网' },
        subject: `新咨询：${data.name}${data.company ? ' · ' + data.company : ''}`,
        content: [{ type: 'text/html', value: htmlBody }]
      });
      const req = https.request({
        hostname: 'api.sendgrid.com',
        path: '/v3/mail/send',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${KEY}`,
          'Content-Length': Buffer.byteLength(payload)
        }
      }, (r) => { r.resume(); r.on('end', resolve); });
      req.on('error', resolve);
      req.setTimeout(8000, () => { req.destroy(); resolve(); });
      req.write(payload);
      req.end();
    } catch (_) { resolve(); }
  });
}

// ─── Main Handler ───────────────────────────────────────────────────────────
module.exports = async function handler(req, res) {
  // CORS preflight
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Accept');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'POST') {
    return send(res, 405, false, '仅支持 POST 请求');
  }

  // Parse body
  let data = {};
  try {
    data = typeof req.body === 'string'
      ? JSON.parse(req.body)
      : (req.body && typeof req.body === 'object' ? req.body : {});
  } catch (_) {
    return send(res, 400, false, '请求格式错误，请重新提交');
  }

  // Validate
  const name = (data.name || '').trim();
  const email = (data.email || '').trim();
  if (!name)  return send(res, 400, false, '请填写您的姓名');
  if (!email) return send(res, 400, false, '请填写您的邮箱');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
    return send(res, 400, false, '请输入有效的邮箱地址');

  // Fire integrations — failures are silent, never crash the handler
  try {
    await Promise.allSettled([writeSheets(data), sendEmail(data)]);
  } catch (_) {}

  // Always respond success if we got the data
  return send(res, 200, true, '咨询已成功提交，我们将在4个工作小时内与您联系！');
};
