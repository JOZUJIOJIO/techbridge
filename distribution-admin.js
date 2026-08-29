const demoMode = ['127.0.0.1', 'localhost'].includes(location.hostname) && new URLSearchParams(location.search).get('demo') === '1';
const secretKey = 'techbridge_distribution_admin';
const $ = (id) => document.getElementById(id);
let adminSecret = sessionStorage.getItem(secretKey) || '';
let dashboard = null;

const demoData = {
  success: true,
  metrics: { revenue:{display:'¥13,320'},payments:20,channels:5,customers:18,channelRevenue:{display:'¥7,992'},commissionLiability:{display:'¥600'},paidOut:{display:'¥1,200'} },
  invites:[{id:'1',recipient_label:'未来科技社群',status:'claimed',invite_slug:'k8L2ExampleRandomInviteKey',created_at:'2026-08-29T08:00:00Z',distribution_partners:{partner_code:'4827',channel_number:4827,wechat_bound_at:'2026-08-29T08:10:00Z'}}],
  channels:[{id:'1',display_name:'未来科技社群',partner_code:'4827',channel_number:4827,wechatBound:true,status:'active',joined_at:'2026-08-29T08:10:00Z'}],
  orders:[{id:'TB-001',partner_code:'4827',gross_amount:66600,commission_amount:19980,currency:'cny',status:'eligible',created_at:'2026-08-29T09:00:00Z'}],
  customers:[{email:'buyer@example.com',plan:'skill_email_365',amount_total:66600,currency:'cny',source:'4827',status:'active',created_at:'2026-08-29T09:00:00Z'}],
  products:[{id:'p1',slug:'ai-skills-annual',name:'AI Skills 年度买手服务',summary:'全年至少12期高价值AI Skills。',landing_path:'/skills',price_amount:66600,currency:'cny',default_commission_amount:19980,status:'active'}]
};

function money(amount, currency='cny'){return new Intl.NumberFormat('zh-CN',{style:'currency',currency:currency.toUpperCase(),minimumFractionDigits:0}).format(Number(amount||0)/100)}
function date(value){return value?new Intl.DateTimeFormat('zh-CN',{month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hour12:false}).format(new Date(value)):'-'}
function tag(value){return `<span class="tag ${value}">${value}</span>`}
function headers(){return {'x-distribution-admin':adminSecret,'content-type':'application/json'}}

async function api(method='GET',body){const response=await fetch('/api/admin/distribution',{method,headers:headers(),...(body?{body:JSON.stringify(body)}:{})});const data=await response.json().catch(()=>({}));if(!response.ok)throw new Error(data.message||data.error||'请求失败');return data}

function render(data){dashboard=data;$('mRevenue').textContent=data.metrics.revenue.display;$('mPayments').textContent=data.metrics.payments;$('mChannels').textContent=data.metrics.channels;$('mCustomers').textContent=data.metrics.customers;$('mChannelRevenue').textContent=data.metrics.channelRevenue.display;$('mPaidOut').textContent=data.metrics.paidOut.display;
  $('inviteRows').innerHTML=data.invites.map(invite=>`<tr><td>${invite.recipient_label}</td><td><code>${invite.distribution_partners?.channel_number||'-'}</code></td><td>${tag(invite.status)}</td><td>${date(invite.created_at)}</td><td><button class="copy-btn" data-copy="${location.origin}/join/${invite.invite_slug}">复制邀请</button></td></tr>`).join('');
  $('channelRows').innerHTML=data.channels.map(channel=>`<tr><td>${channel.display_name}</td><td><code>${channel.channel_number||channel.partner_code}</code></td><td>${channel.wechatBound?'已登录':'未登录'}</td><td>${tag(channel.status)}</td><td>${date(channel.joined_at||channel.created_at)}</td></tr>`).join('');
  $('orderRows').innerHTML=data.orders.map(order=>`<tr><td><code>${String(order.id).slice(0,12)}</code></td><td>${order.partner_code||'-'}</td><td>${money(order.gross_amount,order.currency)}</td><td>${money(order.commission_amount,order.currency)}</td><td>${tag(order.status)}</td><td>${date(order.created_at)}</td></tr>`).join('');
  $('customerRows').innerHTML=data.customers.map(customer=>`<tr><td>${customer.email}</td><td>${customer.plan||'-'}</td><td>${money(customer.amount_total,customer.currency)}</td><td>${customer.partner_code||customer.source||'-'}</td><td>${tag(customer.status)}</td><td>${date(customer.created_at)}</td></tr>`).join('');
  $('productRows').innerHTML=data.products.map(product=>`<article class="product-card"><small>${product.status.toUpperCase()} · ${product.slug}</small><h3>${product.name}</h3><p>${product.summary||''}</p><dl><div><dt>售价</dt><dd>${money(product.price_amount,product.currency)}</dd></div><div><dt>默认渠道收入</dt><dd>${money(product.default_commission_amount,product.currency)}</dd></div></dl></article>`).join('');
  document.querySelectorAll('[data-copy]').forEach(button=>button.onclick=async()=>{await navigator.clipboard.writeText(button.dataset.copy);button.textContent='已复制';setTimeout(()=>button.textContent='复制邀请',1000)});
  $('daLogin').hidden=true;$('daApp').hidden=false;$('daLogout').hidden=false;
}

async function load(){if(demoMode)return render(demoData);if(!adminSecret)return;try{render(await api())}catch(error){sessionStorage.removeItem(secretKey);adminSecret='';$('daLoginStatus').textContent='管理员密码无效。'}}
$('daLoginForm').onsubmit=async event=>{event.preventDefault();adminSecret=$('daKey').value.trim();sessionStorage.setItem(secretKey,adminSecret);$('daLoginStatus').textContent='正在读取…';await load()};
$('daLogout').onclick=()=>{sessionStorage.removeItem(secretKey);location.reload()};
document.querySelectorAll('[data-tab]').forEach(button=>button.onclick=()=>{document.querySelectorAll('[data-tab]').forEach(item=>item.classList.toggle('active',item===button));document.querySelectorAll('[data-panel]').forEach(panel=>panel.classList.toggle('active',panel.dataset.panel===button.dataset.tab))});
$('newInvite').onclick=()=>$('inviteDialog').showModal();
$('createInvite').onclick=async()=>{const label=$('inviteLabel').value.trim();if(!label)return;$('createInvite').disabled=true;$('inviteStatus').textContent='正在生成…';try{const data=demoMode?{inviteUrl:'https://skills.siliconstory.cn/join/demo-random-link',channelNumber:4827}:await api('POST',{action:'create_invite',recipientLabel:label});await navigator.clipboard.writeText(data.inviteUrl);$('inviteStatus').textContent=`渠道码 ${data.channelNumber}，邀请链接已复制。`;if(!demoMode)render(await api())}catch(error){$('inviteStatus').textContent=error.message}finally{$('createInvite').disabled=false}};
$('newProduct').onclick=()=>$('productDialog').showModal();
$('createProduct').onclick=async()=>{const payload={action:'create_product',name:$('productName').value,slug:$('productSlug').value,landingPath:$('productPath').value,priceAmount:Number($('productPrice').value)*100,commissionAmount:Number($('productCommission').value)*100,summary:$('productSummary').value};$('createProduct').disabled=true;try{if(!demoMode){await api('POST',payload);render(await api())}$('productDialog').close()}catch(error){$('productStatus').textContent=error.message}finally{$('createProduct').disabled=false}};
load();
