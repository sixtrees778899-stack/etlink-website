// api/leads.js — Vercel Serverless Function
// 表单提交 → Google Sheets + SendGrid 邮件通知

const https = require('https');

function postJSON(url, payload) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify(payload);
    const u = new URL(url);
    const req = https.request({
      hostname: u.hostname, path: u.pathname + u.search,
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) }
    }, (res) => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => resolve({ status: res.statusCode, body: d }));
    });
    req.on('error', reject);
    req.write(body); req.end();
  });
}

async function sendEmail(data) {
  const KEY = process.env.SENDGRID_API_KEY;
  const TO = process.env.NOTIFY_EMAIL || 'hello@etlink.com.au';
  const FROM = process.env.FROM_EMAIL || 'noreply@etlink.com.au';
  if (!KEY) { console.warn('SENDGRID_API_KEY not set'); return; }

  const body = JSON.stringify({
    personalizations: [{ to: [{ email: TO }] }],
    from: { email: FROM, name: 'ETLink 官网' },
    subject: `新咨询：${data.name}${data.company ? ' · ' + data.company : ''}`,
    content: [{
      type: 'text/html',
      value: `<div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:32px;background:#f8fafc;border-radius:12px">
        <h2 style="color:#0f172a;margin-bottom:4px">ETLink 新咨询</h2>
        <p style="color:#94a3b8;font-size:13px;margin-top:0">来自官网联系表单</p>
        <hr style="border:1px solid #e2e8f0;margin:20px 0"/>
        <table style="width:100%;border-collapse:collapse">
          <tr><td style="padding:8px 0;color:#64748b;font-size:13px;width:100px">姓名</td><td style="padding:8px 0;font-weight:600;color:#0f172a">${data.name}</td></tr>
          <tr><td style="padding:8px 0;color:#64748b;font-size:13px">公司</td><td style="padding:8px 0;color:#0f172a">${data.company || '—'}</td></tr>
          <tr><td style="padding:8px 0;color:#64748b;font-size:13px">邮箱</td><td style="padding:8px 0"><a href="mailto:${data.email}" style="color:#1A5CFF">${data.email}</a></td></tr>
          <tr><td style="padding:8px 0;color:#64748b;font-size:13px">岗位</td><td style="padding:8px 0;color:#0f172a">${data.position || '—'}</td></tr>
          <tr><td style="padding:8px 0;color:#64748b;font-size:13px;vertical-align:top">需求</td><td style="padding:8px 0;color:#0f172a;line-height:1.7">${(data.message||'—').replace(/\n/g,'<br>')}</td></tr>
          <tr><td style="padding:8px 0;color:#64748b;font-size:13px">时间</td><td style="padding:8px 0;color:#94a3b8;font-size:12px">${new Date().toLocaleString('zh-CN',{timeZone:'Australia/Sydney'})}</td></tr>
        </table>
        <hr style="border:1px solid #e2e8f0;margin:20px 0"/>
        <p style="color:#94a3b8;font-size:12px;margin:0">ETLink · Suite 526, Level 5, 368 Sussex Street, Sydney NSW 2000</p>
      </div>`
    }]
  });

  return new Promise((resolve) => {
    const req = https.request({
      hostname: 'api.sendgrid.com', path: '/v3/mail/send', method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${KEY}`, 'Content-Length': Buffer.byteLength(body) }
    }, (res) => { let d=''; res.on('data',c=>d+=c); res.on('end',()=>resolve(d)); });
    req.on('error', e => { console.error('Email error:', e); resolve(null); });
    req.write(body); req.end();
  });
}

async function writeSheets(data) {
  const URL = process.env.GOOGLE_SHEETS_WEBHOOK_URL;
  if (!URL) { console.warn('GOOGLE_SHEETS_WEBHOOK_URL not set'); return; }
  try {
    await postJSON(URL, {
      timestamp: new Date().toLocaleString('zh-CN', { timeZone: 'Australia/Sydney' }),
      name: data.name, company: data.company || '',
      email: data.email, position: data.position || '',
      message: data.message || '', source: 'etlink.com.au'
    });
  } catch(e) { console.error('Sheets error:', e); }
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ success: false, message: 'Method not allowed' });

  const data = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
  if (!data.name || !data.email) return res.status(400).json({ success: false, message: '请填写姓名和邮箱' });
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email)) return res.status(400).json({ success: false, message: '请输入有效邮箱地址' });

  await Promise.allSettled([writeSheets(data), sendEmail(data)]);
  return res.status(200).json({ success: true, message: '咨询已提交，我们将尽快与您联系！' });
};
