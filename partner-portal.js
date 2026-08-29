const demoVariant = new URLSearchParams(location.search).get('demo') || '';
const demoMode = ['127.0.0.1', 'localhost'].includes(location.hostname)
  && (demoVariant === '1' || demoVariant === 'bind');
const confirmRequestId = new URLSearchParams(location.search).get('confirm') || '';
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
let bindingStarted = false;

function dateLabel(value) {
  return new Intl.DateTimeFormat('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(value));
}

function imageFrom(src) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = reject;
    image.src = src;
  });
}

async function buildChannelPoster(data) {
  const canvas = $('channelPoster');
  const context = canvas.getContext('2d');
  const qr = await imageFrom(data.promotion.qr);
  context.fillStyle = '#151513';
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = '#f15d22';
  context.fillRect(0, 0, canvas.width, 18);
  context.fillStyle = '#20b8b1';
  context.fillRect(0, 18, canvas.width, 8);

  context.fillStyle = '#f15d22';
  context.fillRect(76, 74, 72, 72);
  context.fillStyle = '#ffffff';
  context.font = '700 42px system-ui';
  context.textAlign = 'center';
  context.fillText('Q', 112, 125);
  context.textAlign = 'left';
  context.font = '700 34px system-ui';
  context.fillText('TECH BRIDGE', 172, 124);

  context.fillStyle = '#f4f1eb';
  context.font = '700 76px system-ui';
  context.fillText('AI Skills', 76, 280);
  context.fillText('年度买手服务', 76, 378);
  context.fillStyle = '#aaa39a';
  context.font = '400 30px system-ui';
  context.fillText('不是信息堆砌，而是持续一年的高价值筛选', 76, 442);

  context.fillStyle = '#20201d';
  context.fillRect(76, 520, 928, 300);
  context.fillStyle = '#f4f1eb';
  context.font = '600 34px system-ui';
  ['全年 12 期精选', '每期 5-10 个高价值 Skill', '真实项目复盘与可复用工作流'].forEach((line, index) => {
    context.fillStyle = index === 0 ? '#f15d22' : index === 1 ? '#20b8b1' : '#e3ba45';
    context.fillRect(116, 578 + index * 82, 14, 14);
    context.fillStyle = '#f4f1eb';
    context.fillText(line, 160, 603 + index * 82);
  });

  context.fillStyle = '#ffffff';
  context.fillRect(76, 884, 430, 430);
  context.drawImage(qr, 100, 908, 382, 382);
  context.fillStyle = '#f4f1eb';
  context.font = '700 54px system-ui';
  context.fillText('¥666', 582, 984);
  context.fillStyle = '#aaa39a';
  context.font = '400 28px system-ui';
  context.fillText('创始版 · 一年', 582, 1034);
  context.fillStyle = '#f4f1eb';
  context.font = '600 34px system-ui';
  context.fillText('微信扫码了解并订阅', 582, 1142);
  context.fillStyle = '#777169';
  context.font = '400 22px system-ui';
  context.fillText(data.partner.displayName, 582, 1192);
  context.fillText('qiaobit.com', 582, 1234);
  $('posterPreview').src = canvas.toDataURL('image/png');
}

async function beginWechatLogin() {
  if (bindingStarted || portalData?.partner.wechatBound) return;
  bindingStarted = true;
  const status = $('withdrawStatus');
  $('wechatWithdraw').hidden = true;
  $('wechatBound').textContent = '登录中';
  if (demoMode) {
    status.textContent = '微信打开专属入口后，将静默登录并自动绑定渠道身份。';
    return;
  }
  if (!/MicroMessenger/i.test(navigator.userAgent)) {
    status.textContent = '请在微信内打开这条专属渠道入口。';
    $('wechatBound').textContent = '等待微信登录';
    return;
  }
  status.textContent = '正在登录微信并确认渠道身份…';
  try {
    const response = await fetch('/api/channel/wechat/bind-ticket', {
      method: 'POST',
      headers: { authorization: `Bearer ${tokenFromLocation()}` }
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.message || '微信登录入口创建失败。');
    if (data.alreadyBound) return location.reload();
    location.assign(data.authorizeUrl);
  } catch (error) {
    status.textContent = error.message;
    $('wechatBound').textContent = '登录失败';
  }
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
  const nextPayout = confirmRequestId
    ? { amount: 20_000, display: '¥200' }
    : (data.balance.nextPayout || data.balance.available);
  $('withdrawAmount').textContent = nextPayout.display;
  $('wechatBound').textContent = data.partner.wechatBound ? '微信已登录' : '准备登录';
  $('wechatWithdraw').disabled = data.partner.wechatBound
    ? (!confirmRequestId && nextPayout.amount < data.partner.minimumPayout.amount)
    : false;
  $('wechatWithdraw').hidden = false;
  $('wechatWithdraw').textContent = data.partner.wechatBound
    ? (confirmRequestId ? '确认领取 ¥200' : '提现')
    : '微信登录中';
  if (!data.partner.wechatBound) {
    $('withdrawHint').textContent = '首次微信登录会自动绑定当前渠道身份，其他微信不能覆盖。';
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
  buildChannelPoster(data).catch(() => { $('posterPreview').alt = '海报生成失败，请刷新重试'; });
  if (!data.partner.wechatBound) setTimeout(beginWechatLogin, 80);
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

$('saveQr').addEventListener('click', () => {
  const link = document.createElement('a');
  link.href = $('partnerQr').src;
  link.download = `${portalData?.partner.code || 'techbridge-channel'}-qr.svg`;
  link.click();
});

$('savePoster').addEventListener('click', () => {
  const link = document.createElement('a');
  link.href = $('channelPoster').toDataURL('image/png');
  link.download = `${portalData?.partner.code || 'techbridge-channel'}-poster.png`;
  link.click();
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
  if (!portalData?.partner.wechatBound) return beginWechatLogin();
  if (confirmRequestId) {
    try {
      const response = await fetch('/api/channel/payout/confirm', {
        method: 'POST',
        headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
        body: JSON.stringify({ requestId: confirmRequestId })
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.state === 'processing' ? '转账正在处理中，请稍后刷新。' : '这笔转账暂时无法确认。');
      if (data.state === 'success') {
        status.textContent = '¥200 已成功转入微信零钱。';
        return;
      }
      await requestMerchantTransfer(data);
      status.textContent = '微信已受理。到账后页面会自动更新。';
      setTimeout(() => location.reload(), 1800);
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
