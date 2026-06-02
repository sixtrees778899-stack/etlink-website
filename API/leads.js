// api/leads.js
// Vercel Serverless 函数 — 使用重新发送邮件
// 所有请求均返回JSON，界面返回HTML

const https = require('https');

function jsonResponse(res, status, success, message) {
  const body = JSON.stringify({ success, message });
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Accept');
  res.status(status).end(body);
}

异步函数 sendEmail(data) {
  const apiKey = process.env.RESEND_API_KEY;
  如果 (!apiKey) {
    console.log('[重发] 未设置 RESEND_API_KEY，跳过邮件');
    返回;
  }

  const to = process.env.NOTIFY_EMAIL || 'hello@etlink.com.au';
  // 未验证域名时用onboarding@resend.dev；验证etlink.com.au后改成自己域名
  const from = process.env.FROM_EMAIL || 'ETLink官网 <onboarding@resend.dev>';

  const html = `
<div style="font-family:sans-serif;max-width:560px;margin:0 auto;padding:28px;background:#f8fafc;border-radius:10px">
  <h2 style="color:#0f172a;margin:0 0 4px">📩 ETLink新咨询</h2>
  <p style="color:#94a3b8;font-size:13px;margin:0 0 18px">来自官网联系表单</p>
  <table style="width:100%;font-size:14px;border-collapse:collapse">
    <tr><td style="padding:6px 0;color:#64748b;width:72px;vertical-align:top">姓名</td><td style="padding:6px 0;font-weight:600;color:#0f172a">${data.name}</td></tr>
    <tr><td style="padding:6px 0;color:#64748b;vertical-align:top">公司</td><td style="padding:6px 0;color:#0f172a">${data.company || '—'}</td></tr>
    <tr><td style="padding:6px 0;color:#64748b;vertical-align:top">邮箱</td><td style="padding:6px 0"><a href="mailto:${data.email}" style="color:#1A5CFF">${data.email}</a></td></tr>
    <tr><td style="padding:6px 0;color:#64748b;vertical-align:top">电话</td><td style="padding:6px 0;color:#0f172a">${data.phone || '—'}</td></tr>
    <tr><td style="padding:6px 0;color:#64748b;vertical-align:top">岗位</td><td style="padding:6px 0;color:#0f172a">${data.position || '—'}</td></tr>
    <tr><td style="padding:6px 0;color:#64748b;vertical-align:top">需求</td><td style="padding:6px 0;color:#0f172a;line-height:1.7">${(data.message || '—').replace(/\n/g, '<br>')}</td></tr>
    <tr><td style="padding:6px 0;color:#64748b;vertical-align:top">时间</td><td style="padding:6px 0;color:#94a3b8;font-size:12px">${new Date().toLocaleString('zh-CN', { timeZone: 'Australia/Sydney' })}</td></tr>
  </table>
  <hr style="border:1px solid #e2e8f0;margin:18px 0"/>
  <p style="color:#94a3b8;font-size:12px;margin:0">ETLink · Suite 526, Level 5, 368 Sussex Street, Sydney NSW 2000</p>
</div>`;

  const payload = JSON.stringify({
    从，
    至：[至]，
    主题: `新咨询：${data.name}${data.company ? '·' + 数据.公司: ''}`,
    html
  });

  返回一个新的 Promise((resolve) => {
    尝试 {
      const req = https.request(
        {
          主机名：'api.resend.com'
          路径：'/emails'，
          方法：'POST'，
          标题：{
            '授权': `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(payload)
          }
        },
        (r) => {
          let body = '';
          r.on('data', chunk => (body += chunk));
          r.on('end', () => {
            console.log('[重新发送] HTTP', r.statusCode, body);
            解决（）;
          });
        }
      ）；
      req.on('error', (e) => { console.error('[重发] 请求错误：', e.message); resolve(); });
      req.setTimeout(10000, () => { req.destroy(); resolve(); });
      req.write(有效载荷);
      req.end();
    } catch (e) {
      console.error('[重发]捕获到错误：', e.message);
      解决（）;
    }
  });
}

module.exports = async function handler(req, res) {
  // CORS 预检
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Accept');

  如果 (req.method === 'OPTIONS') {
    res.status(200).end();
    返回;
  }

  如果 (请求方法 !== 'POST') {
    return jsonResponse(res, 405, false, '仅支持 POST 请求');
  }

  // 解析主体
  let data = {};
  尝试 {
    data = typeof req.body === 'string'
      ? JSON.parse(req.body)
      : (req.body && typeof req.body === 'object' ? req.body : {});
  } 抓住 （_） {
    return jsonResponse(res, 400, false, '请求格式错误，请重新填写后提交');
  }

  // 必填验证
  const name = (data.name || '').trim();
  const email = (data.email || '').trim();

  if (!name) return jsonResponse(res, 400, false, '请填写您的姓名');
  if (!email) return jsonResponse(res, 400, false, '请填写您的邮箱');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return jsonResponse(res, 400, false, '请输入有效的邮箱地址');
  }

  // 发送邮件（失败不影响用户，静默处理）
  尝试 {
    await sendEmail(data);
  } catch (e) {
    console.error('[handler] sendEmail 抛出错误：', e.message);
  }

  // 永远返回成功给用户
  return jsonResponse(res, 200, true, '咨询已提交成功，我们将在4个工作小时内与您联系！');
