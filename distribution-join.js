const demo = ['127.0.0.1','localhost'].includes(location.hostname) && new URLSearchParams(location.search).get('demo') === '1';
const slug = demo ? 'demo-random-invite-link-1234' : location.pathname.split('/').filter(Boolean).at(-1);
const state = document.getElementById('joinState');
const label = document.getElementById('joinLabel');
const qr = document.getElementById('joinQr');
let exchanging = false;

async function exchange(){if(exchanging)return;exchanging=true;state.textContent='正在进入 AI产品收益中心…';try{if(demo){location.href='/earnings?demo=1';return}const response=await fetch(`/api/distribution/invite?slug=${encodeURIComponent(slug)}`,{method:'POST'});const data=await response.json();if(!response.ok)throw new Error(data.message||'邀请登录失败');location.assign(data.earningsUrl)}catch(error){state.textContent=error.message;exchanging=false}}
async function check(){try{if(demo){label.textContent='邀请对象：未来科技社群 · 渠道码将在登录后生成';qr.src='/internal/sample-partner-qr.svg';state.textContent='等待微信扫码';return}const response=await fetch(`/api/distribution/invite?slug=${encodeURIComponent(slug)}`);const data=await response.json();if(!response.ok)throw new Error('邀请链接无效或已过期');label.textContent=`邀请对象：${data.invite.recipientLabel}${data.channel.number?' · 渠道码 '+data.channel.number:''}`;qr.src=`/api/distribution/invite-qr?slug=${encodeURIComponent(slug)}`;if(/MicroMessenger/i.test(navigator.userAgent))return exchange();if(data.channel.wechatBound)return exchange();state.textContent='等待微信扫码';setTimeout(check,3000)}catch(error){state.textContent=error.message}}
check();
