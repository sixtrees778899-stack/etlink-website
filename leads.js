// api/leads.js — Vercel Serverless Function
// 所有响应严格返回 JSON，不允许返回 HTML

const https = require('https');

// 强制所有响应为 JSON
function jsonRes(res, status, body) {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.status(status).end(JSON.stringify(body));
}

// Google Sheets via Apps Script Webhook
async function writeSheets(data) {
  const url = process.env.GOOGLE_SHEETS_WEBHOOK_URL;
  if (!url) return { ok: false, reason: 'GOOGLE_SHEETS_WEBHOOK_URL not set' };
  return new Promise((resolve) => {
    try {
      const body = JSON.stringify({
        timestamp: new Date().toLocaleString('zh-CN', { timeZone: 'Australia/Sydney' }),
        name: data.name || '',
        company: data.company || '',
        email: data.email || '',
        phone: data.phone || '',
        position: data.position || '',
        budget: data.budget || '',
        message: data.message || '',
        source: 'etlink.com.au'
      });
      const u = new URL(url);
      const req = https.request({
        hostname: u.hostname,
        path: u.pathname + u.search,
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) }
      }, (r) => {
        let d = '';
        r.on('data', c => d += c);
        r.on('end', () => resolve({ ok: true }));
      });
      req.on('error', (e) => resolve({ ok: false, reason: e.message }));
      req.setTimeout(8000, () => { req.destroy(); resolve({ ok: false, reason: 'timeout' }); });
      req.write(body);
      req.end();
    } catch (e) {
      resolve({ ok: false, reason: e.message });
    }
  });
}

// SendGrid email
async function sendEmail(data) {
  const KEY = process.env.SENDGRID_API_KEY;
  const TO = process.env.NOTIFY_EMAIL || 'hello@etlink.com.au';
  const FROM = process.env.FROM_EMAIL || 'noreply@etlink.com.au';
  if (!KEY) return { ok: false, reason: 'SENDGRID_API_KEY not set' };

  const html = `
<div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:32px;background:#f8fafc;border-radius:12px">
  <h2 style="color:#0f172a;margin:0 0 4px">ETLink 新咨询</h2>
  <p style="color:#94a3b8;font-size:13px;margin:0 0 20px">来自官网联系表单</p>
  <hr style="border:1px solid #e2e8f0;margin:0 0 20px"/>
  <table style="width:100%;border-collapse:collapse;font-size:14px">
    <tr><td style="padding:7px 0;color:#64748b;width:90px">姓名</td><td style="padding:7px 0;font-weight:600;color:#0f172a">${data.name}</td></tr>
    <tr><td style="padding:7px 0;color:#64748b">公司</td><td style="padding:7px 0;color:#0f172a">${data.company||'—'}</td></tr>
    <tr><td style="padding:7px 0;color:#64748b">邮箱</td><td style="padding:7px 0"><a href="mailto:${data.email}" style="color:#1A5CFF">${data.email}</a></td></tr>
    <tr><td style="padding:7px 0;color:#64748b">电话</td><td style="padding:7px 0;color:#0f172a">${data.phone||'—'}</td></tr>
    <tr><td style="padding:7px 0;color:#64748b">岗位</td><td style="padding:7px 0;color:#0f172a">${data.position||'—'}</td></tr>
    <tr><td style="padding:7px 0;color:#64748b">预算</td><td style="padding:7px 0;color:#0f172a">${data.budget||'暂未确定'}</td></tr>
    <tr><td style="padding:7px 0;color:#64748b;vertical-align:top">需求</td><td style="padding:7px 0;color:#0f172a;line-height:1.7">${(data.message||'—').replace(/\n/g,'<br>')}</td></tr>
    <tr><td style="padding:7px 0;color:#64748b">时间</td><td style="padding:7px 0;color:#94a3b8;font-size:12px">${new Date().toLocaleString('zh-CN',{timeZone:'Australia/Sydney'})}</td></tr>
  </table>
  <hr style="border:1px solid #e2e8f0;margin:20px 0"/>
  <p style="color:#94a3b8;font-size:12px;margin:0">ETLink · Suite 526, Level 5, 368 Sussex Street, Sydney NSW 2000</p>
</div>`;

  return new Promise((resolve) => {
    try {
      const emailPayload = JSON.stringify({
        personalizations: [{ to: [{ email: TO }] }],
        from: { email: FROM, name: 'ETLink 官网' },
        subject: `新咨询：${data.name}${data.company ? ' · ' + data.company : ''}`,
        content: [{ type: 'text/html', value: html }]
      });
      const req = https.request({
        hostname: 'api.sendgrid.com',
        path: '/v3/mail/send',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${KEY}`,
          'Content-Length': Buffer.byteLength(emailPayload)
        }
      }, (r) => {
        let d = '';
        r.on('data', c => d += c);
        r.on('end', () => {
          if (r.statusCode >= 200 && r.statusCode < 300) resolve({ ok: true });
          else resolve({ ok: false, reason: `SendGrid ${r.statusCode}` });
        });
      });
      req.on('error', (e) => resolve({ ok: false, reason: e.message }));
      req.setTimeout(8000, () => { req.destroy(); resolve({ ok: false, reason: 'email timeout' }); });
      req.write(emailPayload);
      req.end();
    } catch (e) {
      resolve({ ok: false, reason: e.message });
    }
  });
}

module.exports = async function handler(req, res) {
  // CORS preflight
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return jsonRes(res, 405, { success: false, message: '仅支持 POST 请求' });

  // Parse body safely
  let data;
  try {
    data = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
  } catch (e) {
    return jsonRes(res, 400, { success: false, message: '请求格式错误' });
  }

  // Validate required fields
  if (!data.name || !data.name.trim()) return jsonRes(res, 400, { success: false, message: '请填写您的姓名' });
  if (!data.email || !data.email.trim()) return jsonRes(res, 400, { success: false, message: '请填写您的邮箱' });
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email.trim())) return jsonRes(res, 400, { success: false, message: '请输入有效的邮箱地址' });

  // Fire integrations in parallel — non-blocking failures
  const [sheetsResult, emailResult] = await Promise.allSettled([
    writeSheets(data),
    sendEmail(data)
  ]);

  // Log results server-side (Vercel logs)
  console.log('Sheets:', sheetsResult.status, sheetsResult.value || sheetsResult.reason);
  console.log('Email:', emailResult.status, emailResult.value || emailResult.reason);

  // Always return success to user if we received the submission
  return jsonRes(res, 200, {
    success: true,
    message: '咨询已成功提交，我们将在4个工作小时内与您联系！'
  });
};
