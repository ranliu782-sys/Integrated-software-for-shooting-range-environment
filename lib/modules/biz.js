'use strict';
/** 业务逻辑类靶标：越权 / 金额篡改 / 验证码缺陷 / 优惠券叠加 */
const store = require('../store');
const flags = require('../flags');
const sessions = require('../sessions');
const jwt = require('../jwt');
const { html, json, esc, parseForm, parseJSON } = require('../http-util');
const pages = require('../../views/pages');

const USERS = [
  { id: 1, username: 'alice', phone: '13900000001', role: 'user' },
  { id: 2, username: 'bob', phone: '13900000002', role: 'user' },
  { id: 3, username: 'admin', phone: '13800000001', role: 'admin' }
];

const ORDERS = [
  { id: 1001, owner: 'alice', item: '云图 智能摄像头 Pro × 1', amount: 399, status: '已支付', remark: '普通家用，已签收。' },
  { id: 1002, owner: 'alice', item: '云图 智能门锁 S2 × 1', amount: 1299, status: '已支付', remark: '安装服务已预约。' },
  {
    id: 1003,
    owner: 'admin',
    item: '云图 工业级 NVR 8 路 × 2',
    amount: 4760,
    status: '已支付',
    remark: '内部采购单，审批人已确认。运维备件箱口令：@@FLAG:biz-idor@@'
  },
  { id: 1004, owner: 'bob', item: '云图 云存储年包 1TB', amount: 199, status: '待支付', remark: '' }
];

const ENTERPRISE_PRICE = 19800;

function findUser(phone) {
  return USERS.find(u => u.phone === phone) || null;
}

/* ---------------- 登录（短信验证码） ---------------- */
function loginPage(ctx) {
  html(ctx.res, pages.loginPage({ session: sessions.get(ctx.req, ctx.res), phone: ctx.query.get('phone') || '' }));
}

function smsSend(ctx) {
  const body = parseJSON(ctx.body || Buffer.alloc(0));
  const session = sessions.get(ctx.req, ctx.res);
  const phone = String(body.phone || '').trim();
  if (!/^\d{6,15}$/.test(phone)) return json(ctx.res, { ok: false, message: '手机号格式不正确' });

  const code = String(Math.floor(100000 + Math.random() * 900000));
  session.smsCode = code;
  session.smsPhone = phone;
  // 漏洞点：验证码被一并返回在响应体里
  return json(ctx.res, {
    ok: true,
    message: '验证码已发送',
    bizId: 'sms-' + Date.now(),
    code,
    expire: 300
  });
}

function smsLogin(ctx) {
  const body = parseJSON(ctx.body || Buffer.alloc(0));
  const session = sessions.get(ctx.req, ctx.res);
  const phone = String(body.phone || '').trim();
  const code = String(body.code == null ? '' : body.code).trim();

  if (!/^\d{6,15}$/.test(phone)) return json(ctx.res, { ok: false, message: '手机号格式不正确' });

  // 漏洞点 1：空验证码直接放行；漏洞点 2：校验与会话绑定不严
  const ok = !code || code === session.smsCode;
  if (!ok) return json(ctx.res, { ok: false, message: '验证码错误' });

  const user = findUser(phone) || { id: 99, username: '用户' + phone.slice(-4), phone, role: 'user' };
  session.user = { id: user.id, username: user.username, phone: user.phone, role: user.role };
  return json(ctx.res, { ok: true, role: user.role, username: user.username, redirect: user.role === 'admin' ? '/lab/admin' : '/lab/orders' });
}

function logout(ctx) {
  const session = sessions.get(ctx.req, ctx.res);
  session.user = null;
  ctx.res.writeHead(302, { Location: '/lab' });
  ctx.res.end();
}

/* ---------------- 管理后台 ---------------- */
function admin(ctx) {
  const session = sessions.get(ctx.req, ctx.res);
  if (!session.user || session.user.role !== 'admin') {
    return html(ctx.res, pages.loginPage({ session, msg: '请先以管理员身份登录', ok: false }));
  }
  html(ctx.res, pages.adminPage({ session, flag: flags.get('biz-sms') }));
}

/* ---------------- 订单 ---------------- */
function ordersPage(ctx) {
  const session = sessions.get(ctx.req, ctx.res);
  const mine = session.user ? ORDERS.filter(o => o.owner === session.user.username) : [];
  html(ctx.res, pages.ordersPage({ session, orders: mine }));
}

function orderApi(ctx) {
  const session = sessions.get(ctx.req, ctx.res);
  if (!session.user) return json(ctx.res, { ok: false, message: '未登录' }, 401);

  const order = ORDERS.find(o => String(o.id) === String(ctx.params.id));
  if (!order) return json(ctx.res, { ok: false, message: '订单不存在' }, 404);

  // 漏洞点：只校验登录态，未校验 order.owner === session.user.username
  return json(ctx.res, {
    ok: true,
    order: {
      id: order.id,
      owner: order.owner,
      item: order.item,
      amount: order.amount,
      status: order.status,
      remark: flags.resolve(order.remark)
    }
  });
}

/* ---------------- 支付金额篡改 ---------------- */
function pay(ctx) {
  const body = parseJSON(ctx.body || Buffer.alloc(0));
  const session = sessions.get(ctx.req, ctx.res);
  const amount = Number(body.amount);
  const orderId = body.orderId || 2001;

  if (!Number.isFinite(amount)) return json(ctx.res, { ok: false, message: '金额非法' }, 400);

  // 漏洞点：直接信任客户端提交的金额
  const s = store.get();
  s.paidOrders.push({ orderId, amount, at: new Date().toISOString(), by: session.user ? session.user.username : 'guest' });
  store.save();

  const cheap = amount < ENTERPRISE_PRICE;
  return json(ctx.res, {
    ok: true,
    message: cheap ? '支付成功（服务端未校验金额与商品标价是否一致）' : '支付成功',
    orderId,
    product: '云图 企业版平台授权（50 节点）',
    listPrice: ENTERPRISE_PRICE,
    paid: amount,
    receipt: 'RCPT-' + Date.now(),
    flag: cheap ? flags.get('biz-price') : undefined
  });
}

/* ---------------- 优惠券叠加 ---------------- */
function cartPage(ctx) {
  const session = sessions.get(ctx.req, ctx.res);
  html(ctx.res, pages.cartPage({ session, total: ENTERPRISE_PRICE }));
}

function applyCoupon(ctx) {
  const form = parseForm(ctx.body || Buffer.alloc(0));
  const session = sessions.get(ctx.req, ctx.res);
  const code = String(form.code || '').trim().toUpperCase();
  const times = Math.max(1, Math.min(9999, parseInt(String(form.times || '1'), 10) || 1));

  if (code !== 'NEW100') {
    return html(ctx.res, pages.cartPage({ session, total: ENTERPRISE_PRICE, msg: '优惠券不存在或已失效', ok: false }));
  }

  // 漏洞点：使用张数由前端传入，服务端未做上限与去重校验
  const total = ENTERPRISE_PRICE - 100 * times;
  let paid = '';
  if (total <= 0) {
    paid =
      '订单已 0 元支付成功\n' +
      '抵扣明细：NEW100 × ' + times + ' = -' + 100 * times + ' 元\n' +
      '应付金额：' + total + ' 元\n' +
      '订单号：CART-' + Date.now() + '\n\n' +
      flags.get('biz-coupon');
    const s = store.get();
    s.couponRecords.push({ code, times, total, at: new Date().toISOString() });
    store.save();
  }

  html(
    ctx.res,
    pages.cartPage({
      session,
      total,
      paid,
      msg: '已使用 ' + times + ' 张 ' + code + '，抵扣 ' + 100 * times + ' 元'
    })
  );
}

function checkout(ctx) {
  html(ctx.res, pages.checkoutPage({ session: sessions.get(ctx.req, ctx.res) }));
}

/* ---------------- JWT 令牌伪造 ---------------- */
function jwtPageHandler(ctx) {
  const session = sessions.get(ctx.req, ctx.res);
  html(ctx.res, pages.jwtPage({ session, token: ctx.query.get('token') || '' }));
}

function jwtLogin(ctx) {
  const body = parseJSON(ctx.body || Buffer.alloc(0));
  const username = String(body.username || 'alice').trim();
  if (!['alice', 'bob'].includes(username)) {
    return json(ctx.res, { ok: false, message: '演示账号只有 alice / bob' });
  }
  // 登录只会签发普通用户令牌（管理员令牌只能靠伪造）
  const token = jwt.sign({ sub: username, role: 'user', iat: Math.floor(Date.now() / 1000) });
  return json(ctx.res, { ok: true, token, payload: { sub: username, role: 'user' } });
}

function jwtMe(ctx) {
  const body = parseJSON(ctx.body || Buffer.alloc(0));
  const auth = ctx.req.headers['authorization'] || '';
  const token = String(body.token || (auth.replace(/^Bearer\s+/i, '')) || '').trim();
  if (!token) return json(ctx.res, { ok: false, message: '缺少令牌' }, 401);

  const r = jwt.verify(token);
  if (!r.ok) return json(ctx.res, { ok: false, reason: r.reason }, 401);

  const isAdmin = r.payload && r.payload.role === 'admin';
  return json(ctx.res, {
    ok: true,
    alg: r.alg,
    payload: r.payload,
    role: (r.payload || {}).role,
    message: isAdmin ? '管理员鉴权通过' : '普通用户鉴权通过',
    flag: isAdmin ? flags.get('biz-jwt') : undefined
  });
}

const routes = [
  { method: 'GET', path: '/lab/login', handler: loginPage },
  { method: 'GET', path: '/lab/jwt', handler: jwtPageHandler },
  { method: 'POST', path: '/api/lab/jwt/login', handler: jwtLogin },
  { method: 'POST', path: '/api/lab/jwt/me', handler: jwtMe },
  { method: 'GET', path: '/lab/logout', handler: logout },
  { method: 'POST', path: '/api/lab/sms/send', handler: smsSend },
  { method: 'POST', path: '/api/lab/sms/login', handler: smsLogin },
  { method: 'GET', path: '/lab/admin', handler: admin },
  { method: 'GET', path: '/lab/orders', handler: ordersPage },
  { method: 'GET', path: '/api/lab/orders/:id', handler: orderApi },
  { method: 'POST', path: '/api/lab/pay', handler: pay },
  { method: 'GET', path: '/lab/cart', handler: cartPage },
  { method: 'POST', path: '/lab/cart/coupon', handler: applyCoupon },
  { method: 'GET', path: '/lab/checkout', handler: checkout }
];

module.exports = { routes };
