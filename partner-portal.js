const demoVariant = new URLSearchParams(location.search).get('demo') || '';
const demoMode = ['127.0.0.1', 'localhost'].includes(location.hostname)
  && (demoVariant === '1' || demoVariant === 'bind');
const tokenKey = 'techbridge_partner_portal_token';

function tokenFromLocation() {
  const hash = new URLSearchParams(location.hash.replace(/^#/, ''));
  const token = hash.get('token') || '';
  if (token) {
    sessionStorage.setItem(tokenKey, token);
    history.replaceState(null, '', `${location.pathname}${location.search}`);
  }
  return token || sessionStorage.getItem(tokenKey) || '';
}

const demoData = {
  success: true,
  partner: { displayName: '未来科技社群', tier: 'standard', commission: { display: '¥200' }, payoutDelayDays: 8, payoutMethod: 'wechat_balance', minimumPayout: { amount: 10000, display: '¥100' }, wechatBound: true },
  promotion: { link: 'https://qiaobit.com/s/future-tech', qr: '/internal/sample-partner-qr.svg' },
  balance: { available: { amount: 40000, display: '¥400' }, pending: { display: '¥200' }, withdrawn: { display: '¥600' }, nextPayout: { amount: 20000, display: '¥200' } },
  orders: [
    { id: 'TB-26082921', createdAt: '2026-08-29T01:20:00Z', gross: { display: '¥666' }, commission: { display: '¥200' }, status: 'pending' },
    { id: 'TB-26082011', createdAt: '2026-08-20T06:08:00Z', gross: { display: '¥666' }, commission: { display: '¥200' }, status: 'available' },
    { id: 'TB-26081206', createdAt: '2026-08-12T10:32:00Z', gross: { display: '¥666' }, commission: { display: '¥200' }, status: 'withdrawn' }
  ]
};

const statusLabels = { pending: 'T+8 待结算', available: '可提现', withdrawing: '提现中', withdrawn: '已提现', cancelled: '已取消' };
const $ = (id) => document.getElementById(id);
let portalData = null;

function dateLabel(value) {
  return new Intl.DateTimeFormat('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(value));
}

function render(data) {
  portalData = data;
  $('partnerName').textContent = `${data.partner.displayName}，你好。`;
  $('partnerTier').textContent = `${data.partner.tier === 'strategic' ? '战略渠道' : '标准渠道'} · ${data.partner.commission.display} / 单`;
  $('availableAmount').textContent = data.balance.available.display;
  $('pendingAmount').textContent = data.balance.pending.display;
  $('withdrawnAmount').textContent = data.balance.withdrawn.display;
  $('partnerLink').textContent = data.promotion.link;
  $('partnerQr').src = data.promotion.qr;
  $('openProduct').href = data.promotion.link;
  const nextPayout = data.balance.nextPayout || data.balance.available;
  $('withdrawAmount').textContent = nextPayout.display;
  $('wechatBound').textContent = data.partner.wechatBound ? '已绑定' : '未绑定';
  $('wechatWithdraw').disabled = data.partner.wechatBound
    ? nextPayout.amount < data.partner.minimumPayout.amount
    : false;
  $('wechatWithdraw').textContent = data.partner.wechatBound ? '确认收款到微信零钱' : '绑定微信';
  if (!data.partner.wechatBound) {
    $('withdrawHint').textContent = '该邀请只绑定当前渠道资格。首次绑定成功后，其他微信不能覆盖。';
  }
  if (new URLSearchParams(location.search).get('wechat') === 'bound') {
    $('withdrawStatus').textContent = data.partner.wechatBound ? '微信身份绑定成功。' : '微信绑定正在同步，请稍后刷新。';
  }

  const body = $('ordersBody');
  body.replaceChildren(...data.orders.map((order) => {
    const row = document.createElement('tr');
    const values = [order.id, dateLabel(order.createdAt), order.gross.display, order.commission.display];
    const labels = ['订单', '成交时间', '成交金额', '你的收入'];
    for (const [index, value] of values.entries()) {
      const cell = document.createElement('td');
      cell.textContent = value;
      cell.dataset.label = labels[index];
      row.append(cell);
    }
    const status = document.createElement('td');
    status.dataset.label = '状态';
    const badge = document.createElement('span');
    badge.className = `badge ${order.status}`;
    badge.textContent = statusLabels[order.status] || order.status;
    status.append(badge);
    row.append(status);
    return row;
  }));
  $('ordersEmpty').hidden = data.orders.length > 0;
  $('portal').setAttribute('aria-busy', 'false');
  $('portalContent').hidden = false;
}

function showError(message) {
  $('partnerName').textContent = '无法进入渠道中心';
  $('partnerTier').textContent = 'ACCESS DENIED';
  $('portalError').textContent = message;
  $('portalError').hidden = false;
  $('portal').setAttribute('aria-busy', 'false');
}

async function load() {
  if (demoMode) {
    const data = demoVariant === 'bind'
      ? { ...demoData, partner: { ...demoData.partner, wechatBound: false } }
      : demoData;
    return render(data);
  }
  const token = tokenFromLocation();
  if (!token) return showError('请使用 Tech Bridge 为你生成的专属邀请链接进入。');
  const response = await fetch('/api/partner-portal/summary', { headers: { authorization: `Bearer ${token}` } });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) return showError(data.message || '专属访问链接无效或已过期。');
  render(data);
}

function requestMerchantTransfer(data) {
  return new Promise((resolve, reject) => {
    if (typeof window.WeixinJSBridge === 'undefined') return reject(new Error('请在微信内打开本页面完成提现。'));
    window.WeixinJSBridge.invoke('requestMerchantTransfer', {
      mchId: data.merchantId,
      appId: data.appId,
      package: data.packageInfo
    }, (result) => {
      const message = String(result?.err_msg || '');
      if (message.endsWith(':ok')) resolve(result);
      else reject(new Error(message.includes('cancel') ? '你已取消确认收款。' : '微信确认收款未完成，请稍后重试。'));
    });
  });
}

$('copyLink').addEventListener('click', async (event) => {
  await navigator.clipboard.writeText($('partnerLink').textContent);
  event.currentTarget.textContent = '已复制';
  setTimeout(() => { event.currentTarget.textContent = '复制链接'; }, 1200);
});

$('wechatWithdraw').addEventListener('click', async (event) => {
  const button = event.currentTarget;
  const status = $('withdrawStatus');
  button.disabled = true;
  status.textContent = '正在创建提现申请…';
  if (demoMode) {
    const message = portalData?.partner.wechatBound
      ? '本地演示：将拉起微信官方确认收款页；当前未发生真实转账。'
      : '本地演示：将进入硅基物语服务号完成微信身份绑定。';
    setTimeout(() => { status.textContent = message; button.disabled = false; }, 500);
    return;
  }
  const token = tokenFromLocation();
  if (!portalData?.partner.wechatBound) {
    try {
      const response = await fetch('/api/channel/wechat/bind-ticket', {
        method: 'POST',
        headers: { authorization: `Bearer ${token}` }
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.message || '微信绑定入口创建失败。');
      if (data.alreadyBound) return location.reload();
      location.assign(data.authorizeUrl);
    } catch (error) {
      status.textContent = error.message;
      button.disabled = false;
    }
    return;
  }
  const idempotencyKey = `wd_${crypto.randomUUID().replaceAll('-', '')}`;
  try {
    const response = await fetch('/api/partner-portal/withdraw', {
      method: 'POST',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify({ idempotencyKey })
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.message || '提现申请失败。');
    await requestMerchantTransfer(data);
    status.textContent = '微信已受理。到账后余额会自动更新。';
    setTimeout(() => location.reload(), 1800);
  } catch (error) {
    status.textContent = error.message;
    button.disabled = false;
  }
});

load().catch(() => showError('渠道中心暂时无法加载，请稍后重试。'));
