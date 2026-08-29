(function() {
  var form = document.getElementById('slCheckoutForm');
  var email = document.getElementById('slEmail');
  var submit = document.getElementById('slSubmit');
  var status = document.getElementById('slStatus');
  var badge = document.getElementById('slPartnerBadge');
  var panel = document.getElementById('slWechatPanel');
  var qr = document.getElementById('slWechatQr');
  var payTitle = document.getElementById('slWechatTitle');
  var payMessage = document.getElementById('slWechatMessage');
  var payOpen = document.getElementById('slWechatOpen');
  var reset = document.getElementById('slWechatReset');
  var params = new URLSearchParams(window.location.search);
  var partnerCode = params.get('ref') || params.get('partner') || '';
  var isWechat = /MicroMessenger/i.test(navigator.userAgent || '');
  var isLocal = ['127.0.0.1', 'localhost'].includes(window.location.hostname);
  var pollTimer = 0;

  function validPartnerCode(value) {
    return /^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$/.test(String(value || ''));
  }

  function validOrderToken(value) {
    return /^wpo_[A-Za-z0-9_-]{43}$/.test(String(value || ''));
  }

  if (validPartnerCode(partnerCode) && badge) {
    badge.hidden = false;
    badge.textContent = '渠道专属入口 · ' + partnerCode.toUpperCase();
  }

  document.querySelectorAll('[data-scroll-checkout]').forEach(function(button) {
    button.addEventListener('click', function() {
      document.getElementById('checkout').scrollIntoView({ behavior: 'smooth', block: 'start' });
      window.setTimeout(function() { email.focus(); }, 450);
    });
  });

  function stopPolling() {
    if (pollTimer) window.clearInterval(pollTimer);
    pollTimer = 0;
  }

  function showPanel(options) {
    form.hidden = true;
    panel.hidden = false;
    panel.classList.toggle('is-demo', Boolean(options.demo));
    panel.classList.toggle('is-success', Boolean(options.success));
    qr.hidden = !options.qrUrl;
    qr.parentElement.hidden = !options.qrUrl && !options.demo;
    if (options.qrUrl) qr.src = options.qrUrl;
    payTitle.textContent = options.title;
    payMessage.textContent = options.message;
    payOpen.hidden = !options.paymentUrl;
    if (options.paymentUrl) payOpen.href = options.paymentUrl;
    reset.textContent = options.success ? '支付已完成' : '重新填写邮箱';
    reset.disabled = Boolean(options.success);
  }

  function showSuccess(delivered) {
    stopPolling();
    showPanel({
      success: true,
      title: '支付成功，订单已确认',
      message: delivered
        ? '第 001 期已经发送到你的邮箱，365 天 AI Skills 买手服务已开始。'
        : '订单已确认。第 001 期正在发送到你的邮箱，请稍候查收。'
    });
  }

  async function readOrder(orderToken) {
    var response = await fetch('/api/skill-store/order?ticket=' + encodeURIComponent(orderToken), {
      headers: { accept: 'application/json' }, cache: 'no-store'
    });
    var data = await response.json();
    if (!response.ok) throw new Error(data.message || '订单状态暂时无法读取。');
    return data;
  }

  function pollOrder(orderToken) {
    stopPolling();
    async function check() {
      try {
        var data = await readOrder(orderToken);
        if (data.status === 'paid') {
          showSuccess(data.delivered);
          return;
        }
        if (['expired', 'cancelled', 'refunded'].includes(data.status)) {
          stopPolling();
          payTitle.textContent = '订单已关闭';
          payMessage.textContent = '请重新填写邮箱并发起微信支付。';
        }
      } catch (error) {
        payMessage.textContent = error.message || '正在等待微信支付结果…';
      }
    }
    check();
    pollTimer = window.setInterval(check, 2500);
  }

  function showDesktopPayment(data) {
    showPanel({
      qrUrl: data.qrUrl,
      paymentUrl: data.paymentUrl,
      title: '请使用微信扫码支付',
      message: '扫码后将在微信内完成 ¥666 支付。支付成功后，本页面会自动更新。'
    });
    pollOrder(data.orderToken);
  }

  function showLocalPreview() {
    showPanel({
      demo: true,
      title: '微信支付扫码面板',
      message: '本地预览不会创建真实订单。上线后这里展示动态二维码，微信扫码后直接调起 ¥666 支付。'
    });
  }

  reset.addEventListener('click', function() {
    if (reset.disabled) return;
    stopPolling();
    panel.hidden = true;
    panel.classList.remove('is-demo', 'is-success');
    form.hidden = false;
    submit.disabled = false;
    submit.textContent = '微信支付 ¥666 →';
    status.textContent = '';
    email.focus();
  });

  var returningOrder = params.get('order') || '';
  if (validOrderToken(returningOrder) && !isLocal) {
    showPanel({
      title: '正在确认微信支付',
      message: '请不要关闭页面。系统正在等待微信支付回调并确认你的订单。'
    });
    pollOrder(returningOrder);
  }

  if (!form) return;
  form.addEventListener('submit', async function(event) {
    event.preventDefault();
    var value = String(email.value || '').trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
      status.textContent = '请填写有效邮箱。';
      email.focus();
      return;
    }
    if (isLocal) {
      showLocalPreview();
      return;
    }

    submit.disabled = true;
    submit.textContent = '正在创建微信订单…';
    status.textContent = '';
    try {
      var response = await fetch(form.dataset.endpoint, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email: value, ref: validPartnerCode(partnerCode) ? partnerCode : '' })
      });
      var data = await response.json();
      if (!response.ok || !data.paymentUrl || !validOrderToken(data.orderToken)) {
        throw new Error(data.message || '微信支付订单创建失败。');
      }
      if (isWechat || data.mode === 'wechat') {
        window.location.assign(data.paymentUrl);
        return;
      }
      showDesktopPayment(data);
    } catch (error) {
      status.textContent = error.message || '微信支付暂时不可用。';
      submit.disabled = false;
      submit.textContent = '微信支付 ¥666 →';
    }
  });

  window.addEventListener('pagehide', stopPolling);
})();
