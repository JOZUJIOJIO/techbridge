(function() {
  var form = document.getElementById('slCheckoutForm');
  var email = document.getElementById('slEmail');
  var submit = document.getElementById('slSubmit');
  var status = document.getElementById('slStatus');
  var badge = document.getElementById('slPartnerBadge');
  var partnerCode = new URLSearchParams(window.location.search).get('partner') || '';

  if (/^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$/.test(partnerCode) && badge) {
    badge.hidden = false;
    badge.textContent = '场景合伙人专属入口 · ' + partnerCode.toUpperCase();
  }

  document.querySelectorAll('[data-scroll-checkout]').forEach(function(button) {
    button.addEventListener('click', function() {
      document.getElementById('checkout').scrollIntoView({ behavior: 'smooth', block: 'start' });
      window.setTimeout(function() { email.focus(); }, 450);
    });
  });

  if (!form) return;
  form.addEventListener('submit', async function(event) {
    event.preventDefault();
    var value = String(email.value || '').trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
      status.textContent = '请填写有效邮箱。';
      email.focus();
      return;
    }
    submit.disabled = true;
    submit.textContent = '正在创建安全订单…';
    status.textContent = '';
    try {
      var response = await fetch(form.dataset.endpoint, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email: value, plan: 'skill_email_365', source: partnerCode ? 'partner-skill-letter' : 'skill-letter-page' })
      });
      var data = await response.json();
      if (!response.ok || !data.checkoutUrl) throw new Error(data.message || '订单创建失败。');
      window.location.assign(data.checkoutUrl);
    } catch (error) {
      status.textContent = error.message || '支付接口暂时不可用。';
      submit.disabled = false;
      submit.textContent = '前往 Stripe 安全支付 →';
    }
  });
})();
