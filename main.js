// === Shared scroll scheduler — one listener + one rAF dispatches all per-frame work ===
var TBScroll = (function() {
    var cbs = [];
    var ticking = false;
    function run() {
        var y = window.scrollY;
        for (var i = 0; i < cbs.length; i++) {
            try { cbs[i](y); } catch (e) {}
        }
        ticking = false;
    }
    window.addEventListener('scroll', function() {
        if (!ticking) { ticking = true; requestAnimationFrame(run); }
    }, { passive: true });
    return { add: function(cb) { cbs.push(cb); cb(window.scrollY); } };
})();

function TBTrack(eventName, metadata) {
    if (window.TBAnalytics && typeof window.TBAnalytics.track === 'function') {
        window.TBAnalytics.track(eventName, metadata || {});
    }
}

// Scroll Reveal (also observe dividers)
const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
        if (entry.isIntersecting) entry.target.classList.add('visible');
    });
}, { threshold: 0.1 });
document.querySelectorAll('.reveal, .section-divider').forEach(el => observer.observe(el));

// === 1. Counter Animation ===
(function() {
    const counters = document.querySelectorAll('.stat-accent');
    // Reduced motion: keep the final numbers as authored, skip the count-up.
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    let animated = false;

    const counterObserver = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting && !animated) {
                animated = true;
                counters.forEach(counter => {
                    const text = counter.textContent;
                    const match = text.match(/(\d+)(.*)/);
                    if (!match) return;
                    const target = parseInt(match[1]);
                    const suffix = match[2]; // e.g. "M+", "+"
                    const duration = 2000;
                    const start = performance.now();

                    function update(now) {
                        const elapsed = now - start;
                        const progress = Math.min(elapsed / duration, 1);
                        // Ease out cubic
                        const ease = 1 - Math.pow(1 - progress, 3);
                        const current = Math.round(target * ease);
                        counter.textContent = current + suffix;
                        if (progress < 1) requestAnimationFrame(update);
                    }
                    counter.textContent = '0' + suffix;
                    requestAnimationFrame(update);
                });
            }
        });
    }, { threshold: 0.5 });

    const statsBar = document.querySelector('.stats-bar');
    if (statsBar) counterObserver.observe(statsBar);
})();

// === 2. Cursor Glow — 已移除（交互减法：全站指针效果只保留卡片 spotlight 与 hero parallax） ===

// === 3. Language Toggle (A2: scoped, not global; C4: persists to localStorage) ===
(function() {
    function setLang(lang) {
        var btn = document.getElementById('langToggle');
        if (btn) btn.textContent = lang === 'en' ? '中' : 'EN';
        document.documentElement.lang = lang === 'en' ? 'en' : 'zh-CN';
        document.querySelectorAll('[data-lang]').forEach(function(el) {
            el.style.display = el.getAttribute('data-lang') === lang ? '' : 'none';
        });
        try { localStorage.setItem('tb-lang', lang); } catch(e) {}
    }

    function toggleLang() {
        var btn = document.getElementById('langToggle');
        var isZh = btn && btn.textContent === 'EN';
        setLang(isZh ? 'en' : 'zh');
    }

    // Restore saved language preference
    try {
        var saved = localStorage.getItem('tb-lang');
        if (saved === 'en') setLang('en');
    } catch(e) {}

    // Bind lang toggle buttons (desktop + mobile)
    var langBtn = document.getElementById('langToggle');
    if (langBtn) langBtn.addEventListener('click', toggleLang);
    var mobileLangBtn = document.getElementById('mobileLangToggle');
    if (mobileLangBtn) mobileLangBtn.addEventListener('click', toggleLang);

    // Expose for command palette
    window._toggleLang = toggleLang;
})();

// === 4. Back to Top (A3: passive) ===
(function() {
    var btn = document.getElementById('backToTop');
    if (!btn) return;
    btn.addEventListener('click', function() {
        window.scrollTo({ top: 0, behavior: 'smooth' });
    });
    TBScroll.add(function(y) {
        if (y > window.innerHeight) btn.classList.add('show');
        else btn.classList.remove('show');
    });
})();

// === 5. Mobile Menu (A1: moved from inline onclick) ===
(function() {
    var menu = document.getElementById('mobileMenu');
    if (!menu) return;

    var openBtn = document.getElementById('hamburgerBtn');
    var closeBtn = document.getElementById('mobileMenuClose');

    if (openBtn) openBtn.addEventListener('click', function() { menu.classList.add('open'); });
    if (closeBtn) closeBtn.addEventListener('click', function() { menu.classList.remove('open'); });

    menu.querySelectorAll('.mobile-menu-link').forEach(function(link) {
        link.addEventListener('click', function() { menu.classList.remove('open'); });
    });
})();

// === 6. Unified Video Player (mutual exclusion · closable · keyboard-accessible) ===
(function() {
    var current = null; // { cover, player, closeBtn }

    function closeCurrent() {
        if (!current) return;
        var c = current;
        current = null;
        if (c.player && c.player.parentNode) c.player.parentNode.removeChild(c.player);
        if (c.closeBtn && c.closeBtn.parentNode) c.closeBtn.parentNode.removeChild(c.closeBtn);
        c.cover.classList.remove('playing');
        c.cover.setAttribute('aria-pressed', 'false');
    }

    function makePlayer(cover) {
        var bvid = cover.getAttribute('data-bvid');
        var src = cover.getAttribute('data-video');
        var el;
        if (bvid) {
            el = document.createElement('iframe');
            el.src = 'https://player.bilibili.com/player.html?bvid=' + bvid + '&autoplay=1&danmaku=0&high_quality=1';
            el.setAttribute('allowfullscreen', 'true');
            el.allow = 'accelerometer;autoplay;clipboard-write;encrypted-media;gyroscope;picture-in-picture';
            el.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;border:none;z-index:2;';
        } else {
            el = document.createElement('video');
            el.src = src;
            el.controls = true;
            el.autoplay = true;
            el.playsInline = true;
            el.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;object-fit:cover;z-index:2;background:#000;';
        }
        return el;
    }

    function makeCloseBtn() {
        var b = document.createElement('button');
        b.type = 'button';
        b.className = 'video-close-btn';
        b.setAttribute('aria-label', '关闭视频');
        b.innerHTML = '<svg viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>';
        return b;
    }

    function openCover(cover) {
        if (current && current.cover === cover) return;
        closeCurrent(); // mutual exclusion — never two videos playing at once
        if (getComputedStyle(cover).position === 'static') cover.style.position = 'relative';
        var player = makePlayer(cover);
        var closeBtn = makeCloseBtn();
        cover.appendChild(player);
        cover.appendChild(closeBtn);
        cover.classList.add('playing');
        cover.setAttribute('aria-pressed', 'true');
        current = { cover: cover, player: player, closeBtn: closeBtn };
        closeBtn.addEventListener('click', function(e) {
            e.stopPropagation();
            closeCurrent();
        });
    }

    var covers = document.querySelectorAll('[data-bvid], .latest-cover-wrap[data-video], .product-video-cover[data-video]');
    covers.forEach(function(cover) {
        cover.setAttribute('role', 'button');
        cover.setAttribute('tabindex', '0');
        cover.setAttribute('aria-pressed', 'false');
        if (!cover.getAttribute('aria-label')) {
            var label = cover.parentNode && cover.parentNode.querySelector('.topic-video-source, .latest-title, .product-name');
            cover.setAttribute('aria-label', '播放视频' + (label ? '：' + label.textContent.trim() : ''));
        }
        cover.addEventListener('click', function() { openCover(cover); });
        cover.addEventListener('keydown', function(e) {
            if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openCover(cover); }
        });
    });

    // ESC closes the open video (alongside the global ESC handler for modals)
    document.addEventListener('keydown', function(e) {
        if (e.key === 'Escape') closeCurrent();
    });
})();

// === 6b. WeChat Modal (A1: moved from inline onclick) ===
(function() {
    var modal = document.getElementById('wechatModal');
    if (!modal) return;

    var openLinks = document.querySelectorAll('#openWechatLink, .open-wechat-link');
    var closeBtn = document.getElementById('wechatModalClose');

    openLinks.forEach(function(openLink) {
        function openModal(e) { e.preventDefault(); modal.classList.add('open'); }
        openLink.addEventListener('click', openModal);
        // Keyboard support for role="button" cards (Enter / Space)
        openLink.addEventListener('keydown', function(e) {
            if (e.key === 'Enter' || e.key === ' ') openModal(e);
        });
    });
    if (closeBtn) {
        closeBtn.addEventListener('click', function() { modal.classList.remove('open'); });
    }
    modal.addEventListener('click', function(e) {
        if (e.target === modal) modal.classList.remove('open');
    });
})();

// === 6c. Mini App Modal (Sucaitong entry) ===
(function() {
    var modal = document.getElementById('miniappModal');
    if (!modal) return;

    var openLinks = document.querySelectorAll('.open-miniapp-link');
    var closeBtn = document.getElementById('miniappModalClose');

    openLinks.forEach(function(openLink) {
        function openModal(e) { e.preventDefault(); modal.classList.add('open'); }
        openLink.addEventListener('click', openModal);
        // Keyboard support for role="button" cards (Enter / Space)
        openLink.addEventListener('keydown', function(e) {
            if (e.key === 'Enter' || e.key === ' ') openModal(e);
        });
    });
    if (closeBtn) {
        closeBtn.addEventListener('click', function() { modal.classList.remove('open'); });
    }
    modal.addEventListener('click', function(e) {
        if (e.target === modal) modal.classList.remove('open');
    });
})();

// === 6e. Cooperation inquiry ===
(function() {
    var modal = document.getElementById('inquiryModal');
    var form = document.getElementById('inquiryForm');
    if (!modal || !form) return;

    var dialog = modal.querySelector('.inquiry-dialog');
    var openButtons = document.querySelectorAll('.open-inquiry-link');
    var closeButton = document.getElementById('inquiryModalClose');
    var submitButton = document.getElementById('inquirySubmit');
    var submitAnother = document.getElementById('inquirySubmitAnother');
    var status = document.getElementById('inquiryStatus');
    var success = document.getElementById('inquirySuccess');
    var firstField = document.getElementById('inquiryName');
    var previousFocus = null;
    var submitting = false;

    function isLocalPreview() {
        return window.location.protocol === 'file:' || /^(localhost|127\.0\.0\.1)$/.test(window.location.hostname);
    }

    function openModal() {
        previousFocus = document.activeElement;
        modal.classList.add('open');
        modal.setAttribute('aria-hidden', 'false');
        document.body.classList.add('inquiry-modal-open');
        window.setTimeout(function() { if (firstField) firstField.focus(); }, 120);
    }

    function closeModal() {
        modal.classList.remove('open');
        modal.setAttribute('aria-hidden', 'true');
        document.body.classList.remove('inquiry-modal-open');
        if (previousFocus && previousFocus.focus) previousFocus.focus();
    }

    function showSuccess() {
        form.hidden = true;
        success.hidden = false;
        dialog.classList.add('is-success');
        TBTrack('collab_success');
        var heading = success.querySelector('h3');
        if (heading) heading.focus({ preventScroll: true });
    }

    function resetForm() {
        form.reset();
        form.hidden = false;
        success.hidden = true;
        dialog.classList.remove('is-success');
        status.textContent = '';
        status.className = 'inquiry-status';
        if (firstField) firstField.focus();
    }

    openButtons.forEach(function(button) {
        button.addEventListener('click', function(event) {
            event.preventDefault();
            openModal();
        });
    });

    if (closeButton) closeButton.addEventListener('click', closeModal);
    if (submitAnother) submitAnother.addEventListener('click', resetForm);
    modal.addEventListener('click', function(event) {
        if (event.target === modal) closeModal();
    });

    modal.addEventListener('keydown', function(event) {
        if (event.key === 'Escape') {
            closeModal();
            return;
        }
        if (event.key !== 'Tab') return;
        var focusable = Array.prototype.slice.call(dialog.querySelectorAll('button:not([hidden]), input:not([type="hidden"]):not([tabindex="-1"]), select, textarea'))
            .filter(function(element) { return !element.disabled && element.offsetParent !== null; });
        if (!focusable.length) return;
        var first = focusable[0];
        var last = focusable[focusable.length - 1];
        if (event.shiftKey && document.activeElement === first) {
            event.preventDefault();
            last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
            event.preventDefault();
            first.focus();
        }
    });

    form.addEventListener('submit', async function(event) {
        event.preventDefault();
        if (submitting) return;
        if (!form.checkValidity()) {
            form.reportValidity();
            return;
        }

        var data = new FormData(form);
        var payload = {
            cooperationType: data.get('cooperationType'),
            contactName: data.get('contactName'),
            company: data.get('company'),
            contactMethod: data.get('contactMethod'),
            budget: data.get('budget'),
            timeline: data.get('timeline'),
            need: data.get('need'),
            website: data.get('website'),
            source: 'qiaobit-homepage'
        };

        submitting = true;
        submitButton.disabled = true;
        submitButton.textContent = '正在提交…';
        status.textContent = '';
        status.className = 'inquiry-status';

        try {
            TBTrack('collab_submit', { cooperationType: payload.cooperationType });
            if (isLocalPreview()) {
                await new Promise(function(resolve) { window.setTimeout(resolve, 420); });
                showSuccess();
                return;
            }
            var response = await fetch(form.dataset.endpoint, {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify(payload)
            });
            var result = await response.json().catch(function() { return {}; });
            if (!response.ok) throw new Error(result.message || '提交失败，请稍后重试。');
            showSuccess();
        } catch (error) {
            status.textContent = error.message || '提交失败，请稍后重试。';
            status.classList.add('is-error');
        } finally {
            submitting = false;
            submitButton.disabled = false;
            submitButton.innerHTML = '提交申请 <span>→</span>';
        }
    });
})();

// === 6g. BTX intelligent reception ===
(function() {
    var trigger = document.getElementById('floatingSubscribe');
    var layer = document.getElementById('btxChatLayer');
    var panel = document.getElementById('btxChatPanel');
    var backdrop = document.getElementById('btxChatBackdrop');
    var closeButton = document.getElementById('btxChatClose');
    var backToTopButton = document.getElementById('backToTop');
    var grabber = document.getElementById('btxSheetGrabber');
    var header = panel && panel.querySelector('.btx-chat-header');
    var messages = document.getElementById('btxChatMessages');
    var quickActions = document.getElementById('btxQuickActions');
    var form = document.getElementById('btxChatForm');
    var input = document.getElementById('btxChatInput');
    if (!trigger || !layer || !panel || !messages || !form || !input) return;

    var previousFocus = null;
    var responseTimer = null;
    var currentTyping = null;
    var closeTimer = null;
    var sheetFrame = 0;
    var sheetY = 0;
    var sheetVelocity = 0;
    var dragState = null;
    var heroIsVisible = true;
    var quietZoneIsVisible = false;
    var mobileSheetQuery = window.matchMedia('(max-width: 768px)');
    var reduceMotionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    var routes = {
        membership: {
            text: 'AI Skills 年度买手服务创始价为 ¥666，有效期 365 天，不自动续费。每月至少 1 期，每期精选 5–10 个经过审计与实测的 Skills，并提供中文买手笔记、原创 Skill Pack 和进阶实践社群。',
            actions: [{ label: '查看第一期并加入', action: 'member' }]
        },
        cooperation: {
            text: '可以。先用约 2 分钟说明目标、预算和启动时间，提交后需求会进入合作申请流程，再由人工评估和联系。',
            actions: [{ label: '提交合作需求', action: 'inquiry' }]
        },
        products: {
            text: '官网集中展示了已上线的 AI 产品、内容项目与智能硬件。你可以先浏览产品，再从具体项目进入体验或联系。',
            actions: [{ label: '浏览产品', action: 'products' }]
        },
        jarvis: {
            text: 'Jarvis 是 Tech Bridge 的独立视觉 HUD 体验。它会在新页面开启，并在你同意后请求摄像头权限。',
            actions: [{ label: '启动 Jarvis', action: 'jarvis' }]
        },
        human: {
            text: '可以转人工。请先说明目标、预算和启动时间，需求会进入合作申请流程，再由人工评估并联系你。这里不会进入付费会员通道。',
            actions: [{ label: '填写人工咨询', action: 'inquiry' }]
        },
        policy: {
            text: '官网只负责公开介绍、合作申请和项目导航，不直接处理独立产品付款。AI Skills 等产品的交付与退款以各自独立站规则为准。',
            actions: [{ label: '查看服务政策', action: 'policy' }]
        },
        fallback: {
            text: '这个问题超出了 BTX 当前已确认的官网信息。请提交具体需求，后续由人工评估并联系你。',
            actions: [{ label: '提交人工咨询', action: 'inquiry' }]
        }
    };

    function scrollMessages() {
        window.requestAnimationFrame(function() {
            messages.scrollTop = messages.scrollHeight;
        });
    }

    function appendMessage(sender, text, actions) {
        var message = document.createElement('div');
        message.className = 'btx-message btx-message-' + sender;

        var label = document.createElement('span');
        label.className = 'btx-message-label';
        label.textContent = sender === 'bot' ? 'BTX' : '你';
        message.appendChild(label);

        var paragraph = document.createElement('p');
        paragraph.textContent = text;
        message.appendChild(paragraph);

        if (actions && actions.length) {
            var actionGroup = document.createElement('div');
            actionGroup.className = 'btx-message-actions';
            actions.forEach(function(item) {
                var actionButton = document.createElement('button');
                actionButton.type = 'button';
                actionButton.dataset.btxAction = item.action;
                actionButton.textContent = item.label;
                actionGroup.appendChild(actionButton);
            });
            message.appendChild(actionGroup);
        }

        messages.appendChild(message);
        scrollMessages();
        return message;
    }

    function appendTyping() {
        var typing = document.createElement('div');
        typing.className = 'btx-message btx-message-bot btx-message-typing';
        typing.setAttribute('aria-label', 'BTX 正在回复');
        typing.innerHTML = '<span></span><span></span><span></span>';
        messages.appendChild(typing);
        scrollMessages();
        return typing;
    }

    function detectIntent(value) {
        var text = value.trim();
        if (/jarvis|hud|手势|视线|摄像头/i.test(text)) return 'jarvis';
        if (/会员|订阅|邮件|9[.。]?9|技能/.test(text)) return 'membership';
        if (/合作|咨询|培训|品牌|硬件|报价|预算|项目|落地/.test(text)) return 'cooperation';
        if (/产品|作品|做过|案例|矩阵/.test(text)) return 'products';
        if (/人工|微信|联系|客服|林雪妮|真人/.test(text)) return 'human';
        if (/退款|支付|付款|交付|发票|条款|隐私/.test(text)) return 'policy';
        return 'fallback';
    }

    function answer(intent) {
        var route = routes[intent] || routes.fallback;
        window.clearTimeout(responseTimer);
        if (currentTyping && currentTyping.parentNode) {
            currentTyping.parentNode.removeChild(currentTyping);
        }
        currentTyping = appendTyping();
        responseTimer = window.setTimeout(function() {
            if (currentTyping && currentTyping.parentNode) {
                currentTyping.parentNode.removeChild(currentTyping);
            }
            currentTyping = null;
            appendMessage('bot', route.text, route.actions);
        }, 420);
    }

    function isMobileSheet() {
        return mobileSheetQuery.matches;
    }

    function setSheetY(value) {
        sheetY = Math.max(-72, Number.isFinite(value) ? value : 0);
        panel.style.setProperty('--btx-sheet-y', sheetY.toFixed(2) + 'px');
    }

    function cancelSheetAnimation() {
        if (sheetFrame) window.cancelAnimationFrame(sheetFrame);
        sheetFrame = 0;
    }

    function springSheetTo(target, initialVelocity, onComplete) {
        cancelSheetAnimation();
        if (reduceMotionQuery.matches) {
            setSheetY(target);
            if (onComplete) onComplete();
            return;
        }

        var position = sheetY;
        var velocity = Number.isFinite(initialVelocity) ? initialVelocity : sheetVelocity;
        var lastTime = performance.now();
        var stiffness = 420;
        var damping = 36;

        function step(now) {
            var delta = Math.min((now - lastTime) / 1000, 0.032);
            lastTime = now;
            var acceleration = (-stiffness * (position - target)) - (damping * velocity);
            velocity += acceleration * delta;
            position += velocity * delta;
            sheetVelocity = velocity;
            setSheetY(position);

            if (Math.abs(position - target) < 0.5 && Math.abs(velocity) < 8) {
                setSheetY(target);
                sheetVelocity = 0;
                sheetFrame = 0;
                if (onComplete) onComplete();
                return;
            }
            sheetFrame = window.requestAnimationFrame(step);
        }

        sheetFrame = window.requestAnimationFrame(step);
    }

    function syncTriggerVisibility() {
        var shouldHide = heroIsVisible || quietZoneIsVisible || layer.classList.contains('is-open') || layer.classList.contains('is-closing');
        var wasHidden = trigger.classList.contains('is-context-hidden');
        trigger.classList.toggle('is-context-hidden', shouldHide);
        if (backToTopButton) backToTopButton.classList.toggle('is-context-hidden', quietZoneIsVisible);
        if (wasHidden && !shouldHide) trigger.dispatchEvent(new CustomEvent('btx:reveal'));
    }

    function restorePreviousFocus(shouldRestore) {
        if (shouldRestore !== false && previousFocus && previousFocus.focus) {
            previousFocus.focus({ preventScroll: true });
        }
    }

    function finalizeClose(settings) {
        window.clearTimeout(closeTimer);
        closeTimer = null;
        cancelSheetAnimation();
        layer.classList.remove('is-open', 'is-closing');
        layer.setAttribute('aria-hidden', 'true');
        trigger.setAttribute('aria-expanded', 'false');
        document.body.classList.remove('btx-chat-open');
        panel.classList.remove('is-dragging');
        setSheetY(0);
        syncTriggerVisibility();
        restorePreviousFocus(settings.restoreFocus);
    }

    function openChat() {
        if (layer.classList.contains('is-open')) return;
        window.clearTimeout(closeTimer);
        closeTimer = null;
        cancelSheetAnimation();
        layer.classList.remove('is-closing');
        previousFocus = document.activeElement;

        if (isMobileSheet()) {
            setSheetY(Math.min(window.innerHeight * 0.88, 780) + 32);
        } else {
            setSheetY(0);
        }

        layer.classList.add('is-open');
        layer.setAttribute('aria-hidden', 'false');
        trigger.setAttribute('aria-expanded', 'true');
        document.body.classList.add('btx-chat-open');
        TBTrack('btx_open');
        syncTriggerVisibility();

        if (isMobileSheet()) {
            window.requestAnimationFrame(function() { springSheetTo(0, 0); });
        } else {
            window.setTimeout(function() {
                input.focus({ preventScroll: true });
            }, 220);
        }
    }

    function closeChat(options) {
        var settings = options || {};
        window.clearTimeout(responseTimer);
        if (currentTyping && currentTyping.parentNode) {
            currentTyping.parentNode.removeChild(currentTyping);
        }
        currentTyping = null;

        if (settings.immediate || reduceMotionQuery.matches) {
            finalizeClose(settings);
            return;
        }

        layer.classList.add('is-closing');
        layer.classList.remove('is-open');
        layer.setAttribute('aria-hidden', 'true');
        trigger.setAttribute('aria-expanded', 'false');
        syncTriggerVisibility();

        if (isMobileSheet()) {
            var dismissTarget = Math.max(panel.offsetHeight, window.innerHeight * 0.86) + 40;
            springSheetTo(dismissTarget, settings.velocity || sheetVelocity, function() {
                finalizeClose(settings);
            });
        } else {
            closeTimer = window.setTimeout(function() {
                finalizeClose(settings);
            }, 360);
        }
    }

    function openExistingFlow(selector) {
        var target = document.querySelector(selector);
        if (!target) return;
        window.setTimeout(function() { target.click(); }, 160);
    }

    function routeTo(action) {
        closeChat({ restoreFocus: false, immediate: true });

        if (action === 'member') {
            window.location.href = 'https://skills.siliconstory.cn/skills';
            return;
        }
        if (action === 'inquiry') {
            openExistingFlow('.open-inquiry-link');
            return;
        }
        if (action === 'products') {
            var projects = document.getElementById('projects');
            if (projects) projects.scrollIntoView({ behavior: 'smooth', block: 'start' });
            return;
        }
        if (action === 'policy') {
            window.location.href = 'service-policy#delivery';
            return;
        }
        if (action === 'jarvis') {
            window.location.href = 'jarvis-hud.html';
        }
    }

    trigger.addEventListener('click', openChat);
    if (backdrop) backdrop.addEventListener('click', function() { closeChat(); });
    if (closeButton) closeButton.addEventListener('click', function() { closeChat(); });

    quickActions.addEventListener('click', function(e) {
        var button = e.target.closest('[data-btx-intent]');
        if (!button) return;
        TBTrack('btx_intent', { intent: button.dataset.btxIntent });
        appendMessage('user', button.textContent.trim());
        answer(button.dataset.btxIntent);
    });

    messages.addEventListener('click', function(e) {
        var button = e.target.closest('[data-btx-action]');
        if (!button) return;
        TBTrack('btx_action', { action: button.dataset.btxAction });
        routeTo(button.dataset.btxAction);
    });

    form.addEventListener('submit', function(e) {
        e.preventDefault();
        var value = input.value.trim();
        if (!value) {
            input.focus();
            return;
        }
        appendMessage('user', value);
        input.value = '';
        answer(detectIntent(value));
    });

    function rubberband(distance, dimension, constant) {
        return (distance * dimension * constant) / (dimension + constant * Math.abs(distance));
    }

    function beginSheetDrag(e) {
        if (!isMobileSheet() || !layer.classList.contains('is-open') || e.button > 0) return;
        if (e.target.closest('button, input, a')) return;
        cancelSheetAnimation();
        panel.classList.add('is-dragging');
        panel.setPointerCapture(e.pointerId);
        dragState = {
            pointerId: e.pointerId,
            startY: e.clientY,
            startSheetY: sheetY,
            history: [{ y: e.clientY, time: performance.now() }]
        };
    }

    function moveSheetDrag(e) {
        if (!dragState || dragState.pointerId !== e.pointerId) return;
        var next = dragState.startSheetY + (e.clientY - dragState.startY);
        if (next < 0) next = rubberband(next, Math.max(panel.offsetHeight, 1), 0.42);
        setSheetY(next);
        dragState.history.push({ y: e.clientY, time: performance.now() });
        if (dragState.history.length > 5) dragState.history.shift();
        e.preventDefault();
    }

    function endSheetDrag(e) {
        if (!dragState || dragState.pointerId !== e.pointerId) return;
        var history = dragState.history;
        var first = history[0];
        var last = history[history.length - 1];
        var elapsed = Math.max(last.time - first.time, 16);
        var velocity = ((last.y - first.y) / elapsed) * 1000;
        var projected = sheetY + (velocity / 1000) * 0.99 / (1 - 0.99);
        var threshold = panel.offsetHeight * 0.34;

        dragState = null;
        panel.classList.remove('is-dragging');
        if (panel.hasPointerCapture(e.pointerId)) panel.releasePointerCapture(e.pointerId);

        if (projected > threshold || velocity > 760) {
            closeChat({ velocity: velocity });
        } else {
            springSheetTo(0, velocity);
        }
    }

    if (grabber) grabber.addEventListener('pointerdown', beginSheetDrag);
    if (header) header.addEventListener('pointerdown', beginSheetDrag);
    panel.addEventListener('pointermove', moveSheetDrag);
    panel.addEventListener('pointerup', endSheetDrag);
    panel.addEventListener('pointercancel', endSheetDrag);

    var hero = document.getElementById('hero');
    if (hero && 'IntersectionObserver' in window) {
        var heroObserver = new IntersectionObserver(function(entries) {
            heroIsVisible = entries[0] ? entries[0].isIntersecting : false;
            syncTriggerVisibility();
        }, { threshold: 0.01 });
        heroObserver.observe(hero);
    } else {
        var updateHeroVisibility = function() {
            heroIsVisible = window.scrollY < Math.max(window.innerHeight * 0.8, 480);
            syncTriggerVisibility();
        };
        window.addEventListener('scroll', updateHeroVisibility, { passive: true });
        updateHeroVisibility();
    }

    var quietZones = Array.prototype.slice.call(document.querySelectorAll('#capabilities, #collab'));
    if (quietZones.length && 'IntersectionObserver' in window) {
        var visibleQuietZones = new Set();
        var quietZoneObserver = new IntersectionObserver(function(entries) {
            entries.forEach(function(entry) {
                if (entry.isIntersecting) visibleQuietZones.add(entry.target);
                else visibleQuietZones.delete(entry.target);
            });
            quietZoneIsVisible = visibleQuietZones.size > 0;
            syncTriggerVisibility();
        }, { threshold: 0.08 });
        quietZones.forEach(function(zone) { quietZoneObserver.observe(zone); });
    }

    var syncSheetMode = function() {
        if (!layer.classList.contains('is-open')) return;
        cancelSheetAnimation();
        setSheetY(0);
    };
    if (mobileSheetQuery.addEventListener) mobileSheetQuery.addEventListener('change', syncSheetMode);
    else mobileSheetQuery.addListener(syncSheetMode);

    document.addEventListener('keydown', function(e) {
        if (!layer.classList.contains('is-open')) return;
        if (e.key === 'Escape') {
            e.preventDefault();
            closeChat();
            return;
        }
        if (e.key !== 'Tab') return;
        var focusable = Array.prototype.slice.call(panel.querySelectorAll(
            'button:not([disabled]), input:not([disabled]), [href], [tabindex]:not([tabindex="-1"])'
        )).filter(function(element) {
            return element.offsetParent !== null;
        });
        if (!focusable.length) return;
        var first = focusable[0];
        var last = focusable[focusable.length - 1];
        if (e.shiftKey && document.activeElement === first) {
            e.preventDefault();
            last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
            e.preventDefault();
            first.focus();
        }
    });

    var mascot = trigger.querySelector('.floating-subscribe-mascot');
    var reduceMotion = reduceMotionQuery.matches;
    var finePointer = window.matchMedia('(pointer: fine)').matches;
    if (mascot && !reduceMotion && finePointer) {
        window.addEventListener('pointermove', function(e) {
            var nx = (e.clientX / window.innerWidth) - 0.5;
            var ny = (e.clientY / window.innerHeight) - 0.5;
            trigger.style.setProperty('--btx-x', (nx * 8).toFixed(2) + 'px');
            trigger.style.setProperty('--btx-y', (ny * 6).toFixed(2) + 'px');
            trigger.style.setProperty('--btx-rotate', (nx * 3).toFixed(2) + 'deg');
        }, { passive: true });
    }
})();

// === BTX morph mascot — expressive code-drawn states inspired by the supplied reference ===
(function() {
    var canvases = Array.prototype.slice.call(document.querySelectorAll('[data-btx-morph]'));
    if (!canvases.length) return;

    var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    var pointer = { x: 0, y: 0 };
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    var startedAt = performance.now();
    var animationFrame = 0;
    var activeUntil = 0;

    function clamp(value, min, max) {
        return Math.max(min, Math.min(max, value));
    }

    function ease(value) {
        value = clamp(value, 0, 1);
        return value * value * (3 - 2 * value);
    }

    function pulse(time, start, end, fade) {
        if (time < start || time > end) return 0;
        if (time < start + fade) return ease((time - start) / fade);
        if (time > end - fade) return ease((end - time) / fade);
        return 1;
    }

    function roundedCapsule(ctx, x, y, width, height, rotation, color, alpha) {
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(rotation);
        ctx.globalAlpha = alpha;
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.roundRect(-width / 2, -height / 2, width, height, height / 2);
        ctx.fill();
        ctx.restore();
    }

    function drawOrbits(ctx, alpha, now, front) {
        if (alpha <= 0.01) return;
        var colors = ['#63d66f', '#57b8ff', '#8a73ff', '#e95d74'];
        ctx.save();
        ctx.globalAlpha = alpha * (front ? 0.95 : 0.58);
        ctx.lineWidth = 3.3;
        ctx.lineCap = 'round';
        colors.forEach(function(color, index) {
            var rotation = -0.55 + index * 0.34 + Math.sin(now * 0.0007 + index) * 0.08;
            ctx.strokeStyle = color;
            ctx.beginPath();
            ctx.ellipse(
                120,
                120,
                81 - index * 3,
                33 + index * 4,
                rotation,
                front ? Math.PI * 0.02 : Math.PI,
                front ? Math.PI * 0.94 : Math.PI * 1.94
            );
            ctx.stroke();
        });
        ctx.restore();
    }

    function blobPath(ctx, cx, cy, rx, ry, now, triangle, hexagon) {
        var points = [];
        var count = 18;
        for (var i = 0; i < count; i++) {
            var angle = (Math.PI * 2 * i / count) - Math.PI / 2;
            var organic = 1
                + Math.sin(angle * 3 + now * 0.0012) * 0.018
                + Math.cos(angle * 5 - now * 0.0009) * 0.012;
            var triangleShape = 1 + triangle * 0.21 * Math.cos(3 * (angle + Math.PI / 6));
            var hexagonShape = 1 + hexagon * 0.075 * Math.cos(6 * angle);
            points.push({
                x: cx + Math.cos(angle) * rx * organic * triangleShape * hexagonShape,
                y: cy + Math.sin(angle) * ry * organic * triangleShape * hexagonShape
            });
        }
        ctx.beginPath();
        var firstMid = {
            x: (points[0].x + points[1].x) / 2,
            y: (points[0].y + points[1].y) / 2
        };
        ctx.moveTo(firstMid.x, firstMid.y);
        for (var j = 1; j <= count; j++) {
            var point = points[j % count];
            var next = points[(j + 1) % count];
            ctx.quadraticCurveTo(point.x, point.y, (point.x + next.x) / 2, (point.y + next.y) / 2);
        }
        ctx.closePath();
    }

    function prepare(canvas) {
        var rect = canvas.getBoundingClientRect();
        var width = Math.max(1, Math.round(rect.width));
        var height = Math.max(1, Math.round(rect.height));
        var pixelWidth = Math.round(width * dpr);
        var pixelHeight = Math.round(height * dpr);
        if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) {
            canvas.width = pixelWidth;
            canvas.height = pixelHeight;
        }
        var ctx = canvas.getContext('2d');
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.clearRect(0, 0, width, height);
        return { ctx: ctx, width: width, height: height };
    }

    function draw(canvas, now) {
        var frame = prepare(canvas);
        var ctx = frame.ctx;
        var scale = Math.min(frame.width, frame.height) / 240;
        var offsetX = (frame.width - 240 * scale) / 2;
        var offsetY = (frame.height - 240 * scale) / 2;
        var elapsed = now - startedAt;
        var cycle = reduceMotion ? 0.8 : (elapsed % 21000) / 1000;
        var isFloating = canvas.getAttribute('data-btx-morph') === 'floating';

        var dots = reduceMotion ? 0 : pulse(cycle, 1.55, 2.75, 0.32);
        var slits = reduceMotion ? 0 : pulse(cycle, 3.1, 4.55, 0.34);
        var exclamation = reduceMotion ? 0 : pulse(cycle, 5.05, 6.55, 0.35);
        var wideEyes = reduceMotion ? 0 : pulse(cycle, 7.05, 8.45, 0.35);
        var singleDot = reduceMotion ? 0 : pulse(cycle, 8.85, 9.95, 0.28);
        var oval = reduceMotion ? 0 : pulse(cycle, 10.15, 11.05, 0.26);
        var hexagon = reduceMotion ? 0 : pulse(cycle, 11.0, 12.0, 0.28);
        var triangle = reduceMotion ? 0 : pulse(cycle, 12.2, 14.75, 0.52);
        var orbit = reduceMotion ? 0 : pulse(cycle, 12.15, 16.15, 0.65);
        var cluster = reduceMotion ? 0 : pulse(cycle, 16.45, 17.6, 0.3);
        var satellite = reduceMotion ? 0 : pulse(cycle, 18.0, 19.35, 0.38);
        var collapsed = Math.max(dots, singleDot, cluster, satellite);

        ctx.save();
        ctx.translate(offsetX, offsetY);
        ctx.scale(scale, scale);

        // A neutral light field keeps the black character legible on the dark site.
        ctx.save();
        ctx.shadowColor = 'rgba(0, 0, 0, 0.28)';
        ctx.shadowBlur = 18;
        ctx.fillStyle = '#f4f2ec';
        ctx.beginPath();
        ctx.arc(120, 120, 102, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;
        ctx.strokeStyle = 'rgba(15, 16, 17, 0.13)';
        ctx.lineWidth = 1.5;
        ctx.stroke();
        ctx.restore();

        var centerX = 120;
        var centerY = 120 + (reduceMotion ? 0 : Math.sin(elapsed * 0.0021) * 1.2) - exclamation * 14;
        var radiusX = 62 * (1 + oval * 0.12) * (1 - exclamation * 0.66) * (1 - collapsed * 0.8);
        var radiusY = 58 * (1 - oval * 0.08) * (1 + exclamation * 0.16) * (1 - collapsed * 0.8);

        drawOrbits(ctx, Math.max(orbit, satellite * 0.74), now, false);

        ctx.save();
        ctx.fillStyle = '#08090a';
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
        ctx.lineWidth = 1.5;
        blobPath(ctx, centerX, centerY, radiusX, radiusY, now, triangle, hexagon);
        ctx.fill();
        ctx.stroke();
        ctx.restore();

        // Exclamation dot and the three-dot thinking state.
        if (exclamation > 0.01) {
            ctx.save();
            ctx.globalAlpha = exclamation;
            ctx.fillStyle = '#08090a';
            ctx.beginPath();
            ctx.arc(120, 184, 12, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
        }
        if (dots > 0.01) {
            ctx.save();
            ctx.globalAlpha = dots;
            ctx.fillStyle = '#08090a';
            [-44, 0, 44].forEach(function(dx, index) {
                ctx.globalAlpha = dots * (index === 1 ? 1 : 0.5);
                ctx.beginPath();
                ctx.arc(120 + dx, 120, index === 1 ? 13 : 11, 0, Math.PI * 2);
                ctx.fill();
            });
            ctx.restore();
        }
        if (cluster > 0.01) {
            ctx.save();
            ctx.fillStyle = '#08090a';
            [
                { x: 88, y: 106, r: 5, a: 0.42 },
                { x: 111, y: 125, r: 7, a: 0.72 },
                { x: 140, y: 116, r: 13, a: 1 },
                { x: 160, y: 91, r: 3.5, a: 0.28 }
            ].forEach(function(dot) {
                ctx.globalAlpha = cluster * dot.a;
                ctx.beginPath();
                ctx.arc(dot.x, dot.y, dot.r, 0, Math.PI * 2);
                ctx.fill();
            });
            ctx.restore();
        }

        var faceAlpha = 1 - Math.max(exclamation, collapsed);
        var lookX = isFloating ? pointer.x * 7 : Math.sin(now * 0.0013) * 3;
        var lookY = isFloating ? pointer.y * 4 : Math.cos(now * 0.0011) * 1.5;
        var normalAlpha = faceAlpha * (1 - Math.max(slits, wideEyes, triangle * 0.72));

        // The reference communicates character only through two white eye capsules.
        roundedCapsule(ctx, 102 + lookX, 104 + lookY, 13, 28, -0.12, '#fffdfa', normalAlpha);
        roundedCapsule(ctx, 137 + lookX, 106 + lookY, 13, 28, 0.08, '#fffdfa', normalAlpha);

        // Sleepy / scanning state: both eyes narrow into horizontal slits.
        roundedCapsule(ctx, 98 + lookX, 108 + lookY, 27, 5, -0.06, '#fffdfa', faceAlpha * slits);
        roundedCapsule(ctx, 143 + lookX, 109 + lookY, 27, 5, 0.06, '#fffdfa', faceAlpha * slits);

        // Curious state from the video: two large white eyes and one blue status dot.
        if (wideEyes > 0.01) {
            ctx.save();
            ctx.globalAlpha = faceAlpha * wideEyes;
            ctx.fillStyle = '#fffdfa';
            ctx.beginPath();
            ctx.arc(98 + lookX * 0.3, 110 + lookY * 0.3, 13, 0, Math.PI * 2);
            ctx.arc(140 + lookX * 0.3, 108 + lookY * 0.3, 13, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = '#2f9df4';
            ctx.strokeStyle = '#f4f2ec';
            ctx.lineWidth = 3;
            ctx.beginPath();
            ctx.arc(172, 73, 9, 0, Math.PI * 2);
            ctx.fill();
            ctx.stroke();
            ctx.restore();
        }

        // In the triangular state the face gives way to the single green trace seen in the reference.
        if (triangle > 0.04) {
            ctx.save();
            ctx.globalAlpha = triangle;
            ctx.strokeStyle = '#63d66f';
            ctx.lineWidth = 4;
            ctx.lineCap = 'round';
            ctx.beginPath();
            ctx.moveTo(82, 108);
            ctx.bezierCurveTo(99, 95, 122, 98, 148, 112);
            ctx.stroke();
            ctx.restore();
        }

        drawOrbits(ctx, Math.max(orbit, satellite * 0.74), now, true);

        ctx.restore();
    }

    function render(now) {
        animationFrame = 0;
        var isActive = !reduceMotion && now < activeUntil;
        var frameTime = isActive ? now : startedAt + 800;
        canvases.forEach(function(canvas) { draw(canvas, frameTime); });
        if (isActive && document.visibilityState !== 'hidden') start();
    }

    function start() {
        if (!animationFrame) animationFrame = requestAnimationFrame(render);
    }

    function wake(duration) {
        if (reduceMotion || document.visibilityState === 'hidden') return;
        var now = performance.now();
        if (now >= activeUntil) startedAt = now;
        activeUntil = Math.max(activeUntil, now + (duration || 1800));
        start();
    }

    window.addEventListener('pointermove', function(event) {
        pointer.x = clamp((event.clientX / window.innerWidth - 0.5) * 2, -1, 1);
        pointer.y = clamp((event.clientY / window.innerHeight - 0.5) * 2, -1, 1);
        var trigger = document.getElementById('floatingSubscribe');
        if (!trigger || trigger.classList.contains('is-context-hidden')) return;
        var rect = trigger.getBoundingClientRect();
        var nearestX = Math.max(rect.left, Math.min(event.clientX, rect.right));
        var nearestY = Math.max(rect.top, Math.min(event.clientY, rect.bottom));
        var distance = Math.hypot(event.clientX - nearestX, event.clientY - nearestY);
        if (distance < 220) wake(650);
    }, { passive: true });

    var trigger = document.getElementById('floatingSubscribe');
    var layer = document.getElementById('btxChatLayer');
    if (trigger) {
        trigger.addEventListener('btx:reveal', function() { wake(2400); });
        ['pointerenter', 'pointerdown', 'focus'].forEach(function(eventName) {
            trigger.addEventListener(eventName, function() { wake(2600); });
        });
        if ('IntersectionObserver' in window) {
            var mascotObserver = new IntersectionObserver(function(entries) {
                if (entries[0] && entries[0].isIntersecting && !trigger.classList.contains('is-context-hidden')) {
                    wake(2400);
                }
            }, { threshold: 0.2 });
            mascotObserver.observe(trigger);
        }
    }
    if (layer && 'MutationObserver' in window) {
        var chatObserver = new MutationObserver(function() {
            if (layer.classList.contains('is-open')) wake(7200);
        });
        chatObserver.observe(layer, { attributes: true, attributeFilter: ['class'] });
        layer.addEventListener('pointerdown', function() { wake(2200); }, { passive: true });
    }

    document.addEventListener('visibilitychange', function() {
        if (document.visibilityState !== 'hidden' && !reduceMotion && performance.now() < activeUntil) start();
    });

    if (reduceMotion) render(startedAt + 1200);
    else start();
})();

// === 7. Scroll Progress Bar (A3: passive) ===
(function() {
    var bar = document.getElementById('scrollProgress');
    if (!bar) return;
    TBScroll.add(function(scrollTop) {
        var docHeight = document.documentElement.scrollHeight - window.innerHeight;
        var progress = (scrollTop / docHeight) * 100;
        bar.style.width = progress + '%';
    });
})();

// === 8. Parallax scroll effects (A3: passive) ===
(function() {
    var hero = document.getElementById('hero');
    if (!hero) return;
    var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    var heroTitle = hero.querySelector('.hero-title');
    var heroSubEn = hero.querySelector('.hero-subtitle-en');
    var heroSub = hero.querySelector('.hero-subtitle');
    var heroBar = hero.querySelector('.hero-bar');
    var navbar = document.querySelector('.navbar');

    TBScroll.add(function(scrollY) {
                var vh = window.innerHeight;

                // Hero parallax — title moves slower, fades out
                if (!reduceMotion && scrollY < vh) {
                    var progress = scrollY / vh;
                    var titleY = scrollY * 0.35;
                    var fade = 1 - progress * 1.5;

                    if (heroTitle) {
                        heroTitle.style.transform = 'translateY(' + titleY + 'px)';
                        heroTitle.style.opacity = Math.max(fade, 0);
                    }
                    if (heroSubEn) {
                        heroSubEn.style.transform = 'translateY(' + scrollY * 0.25 + 'px)';
                        heroSubEn.style.opacity = Math.max(fade, 0);
                    }
                    if (heroSub) {
                        heroSub.style.transform = 'translateY(' + scrollY * 0.2 + 'px)';
                        heroSub.style.opacity = Math.max(fade, 0);
                    }
                    if (heroBar) {
                        heroBar.style.transform = 'translateY(' + scrollY * 0.15 + 'px)';
                        heroBar.style.opacity = Math.max(fade, 0);
                    }
                }

                // Navbar solidify on scroll
                if (navbar) {
                    if (scrollY > 100) {
                        navbar.style.background = 'rgba(26, 26, 24, 0.95)';
                        navbar.style.borderBottomColor = 'rgba(255,255,255,0.06)';
                    } else {
                        navbar.style.background = 'rgba(26, 26, 24, 0.6)';
                        navbar.style.borderBottomColor = 'rgba(255,255,255,0.04)';
                    }
                }
    });
})();

// Hero background video loops in markup so the first screen stays alive.

// === 10. Topic video 3D tilt — 已移除（交互减法） ===

// Command Palette is handled by jarvis-hud.js

// === 11. Nav Scrollspy ===
(function() {
    var links = document.querySelectorAll('.nav-link[href^="#"]');
    if (!links.length) return;

    function setActive(id) {
        links.forEach(function(l) {
            l.classList.toggle('active', l.getAttribute('href') === '#' + id);
        });
    }

    var sections = [];
    links.forEach(function(l) {
        var sec = document.getElementById(l.getAttribute('href').slice(1));
        if (sec) sections.push(sec);
    });
    var hero = document.getElementById('hero');
    if (hero) sections.push(hero);

    var spy = new IntersectionObserver(function(entries) {
        entries.forEach(function(e) {
            if (e.isIntersecting) setActive(e.target.id);
        });
    }, { rootMargin: '-35% 0px -55% 0px' });
    sections.forEach(function(s) { spy.observe(s); });
})();

// === 12. Highlights Lightbox ===
(function() {
    var items = Array.prototype.slice.call(document.querySelectorAll('.highlight-item'));
    if (!items.length) return;

    var data = items.map(function(it) {
        var img = it.querySelector('img');
        var cap = it.querySelector('.highlight-caption');
        return {
            src: img ? img.getAttribute('src') : '',
            alt: img ? img.alt : '',
            caption: cap ? cap.textContent : (img ? img.alt : '')
        };
    });

    var chevronLeft = '<svg viewBox="0 0 24 24"><polyline points="15 18 9 12 15 6"/></svg>';
    var chevronRight = '<svg viewBox="0 0 24 24"><polyline points="9 18 15 12 9 6"/></svg>';
    var cross = '<svg viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>';

    var lb = document.createElement('div');
    lb.className = 'lightbox';
    lb.setAttribute('role', 'dialog');
    lb.setAttribute('aria-modal', 'true');
    lb.setAttribute('aria-label', '图片查看器');
    lb.innerHTML =
        '<div class="lightbox-counter"></div>' +
        '<button class="lightbox-btn lightbox-close" aria-label="关闭">' + cross + '</button>' +
        '<button class="lightbox-btn lightbox-prev" aria-label="上一张">' + chevronLeft + '</button>' +
        '<figure class="lightbox-figure">' +
            '<img class="lightbox-img" alt="">' +
            '<figcaption class="lightbox-caption"></figcaption>' +
        '</figure>' +
        '<button class="lightbox-btn lightbox-next" aria-label="下一张">' + chevronRight + '</button>';
    document.body.appendChild(lb);

    var imgEl = lb.querySelector('.lightbox-img');
    var capEl = lb.querySelector('.lightbox-caption');
    var counterEl = lb.querySelector('.lightbox-counter');
    var current = 0;
    var isOpen = false;

    function preload(i) {
        var d = data[(i + data.length) % data.length];
        if (d && d.src) { var im = new Image(); im.src = d.src; }
    }

    function show(i, instant) {
        current = (i + data.length) % data.length;
        var d = data[current];
        function swap() {
            imgEl.src = d.src;
            imgEl.alt = d.alt;
            capEl.textContent = d.caption.trim();
            counterEl.textContent = (current + 1) + ' / ' + data.length;
            imgEl.onload = function() { imgEl.classList.remove('switching'); };
        }
        if (instant) {
            swap();
        } else {
            imgEl.classList.add('switching');
            setTimeout(swap, 120);
        }
        preload(current + 1);
        preload(current - 1);
    }

    function open(i) {
        isOpen = true;
        show(i, true);
        lb.classList.add('open');
        document.body.style.overflow = 'hidden';
    }

    function close() {
        isOpen = false;
        lb.classList.remove('open');
        document.body.style.overflow = '';
    }

    items.forEach(function(it, i) {
        it.setAttribute('tabindex', '0');
        it.setAttribute('role', 'button');
        var cap = it.querySelector('.highlight-caption');
        it.setAttribute('aria-label', '查看大图：' + (cap ? cap.textContent : ''));
        it.addEventListener('click', function() { open(i); });
        it.addEventListener('keydown', function(e) {
            if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(i); }
        });
    });

    lb.querySelector('.lightbox-close').addEventListener('click', close);
    lb.querySelector('.lightbox-prev').addEventListener('click', function() { show(current - 1); });
    lb.querySelector('.lightbox-next').addEventListener('click', function() { show(current + 1); });
    lb.addEventListener('click', function(e) {
        if (e.target === lb || e.target.classList.contains('lightbox-figure')) close();
    });

    document.addEventListener('keydown', function(e) {
        if (!isOpen) return;
        if (e.key === 'Escape') close();
        else if (e.key === 'ArrowLeft') show(current - 1);
        else if (e.key === 'ArrowRight') show(current + 1);
    });

    // Touch swipe
    var touchX = null;
    lb.addEventListener('touchstart', function(e) {
        touchX = e.changedTouches[0].clientX;
    }, { passive: true });
    lb.addEventListener('touchend', function(e) {
        if (touchX === null) return;
        var dx = e.changedTouches[0].clientX - touchX;
        touchX = null;
        if (Math.abs(dx) > 40) show(dx > 0 ? current - 1 : current + 1);
    }, { passive: true });
})();

// === 13. Card Spotlight (cursor-following glow, desktop only) ===
(function() {
    if (window.matchMedia('(pointer: coarse)').matches) return;
    var cards = document.querySelectorAll('.project-card:not(.project-card-static), .collab-card, .knowledge-card, .latest-card');
    cards.forEach(function(card) {
        var glow = document.createElement('span');
        glow.className = 'card-spotlight';
        card.appendChild(glow);
        card.addEventListener('mousemove', function(e) {
            var r = card.getBoundingClientRect();
            card.style.setProperty('--mx', (e.clientX - r.left) + 'px');
            card.style.setProperty('--my', (e.clientY - r.top) + 'px');
        });
    });
})();

// === 14. Magnetic Buttons — 已移除（交互减法：按钮回归标准 hover） ===

// === 15. Timeline scroll draw ===
(function() {
    var tl = document.querySelector('.timeline');
    if (!tl) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    tl.classList.add('tl-animated');
    var fill = document.createElement('div');
    fill.className = 'tl-progress';
    tl.appendChild(fill);

    var items = tl.querySelectorAll('.timeline-item');
    var ticking = false;

    function update() {
        var rect = tl.getBoundingClientRect();
        var target = window.innerHeight * 0.62 - rect.top;
        var h = Math.max(0, Math.min(target, rect.height));
        fill.style.height = h + 'px';
        items.forEach(function(item) {
            var dotTop = item.getBoundingClientRect().top - rect.top + 9;
            item.classList.toggle('lit', dotTop <= h);
        });
        ticking = false;
    }

    TBScroll.add(update);
})();

// === 16. Back-to-top progress ring ===
(function() {
    var btn = document.getElementById('backToTop');
    if (!btn) return;
    var NS = 'http://www.w3.org/2000/svg';
    var svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('class', 'btt-ring');
    svg.setAttribute('viewBox', '0 0 48 48');
    var circle = document.createElementNS(NS, 'circle');
    circle.setAttribute('cx', '24');
    circle.setAttribute('cy', '24');
    circle.setAttribute('r', '22.5');
    var C = 2 * Math.PI * 22.5;
    circle.style.strokeDasharray = C;
    circle.style.strokeDashoffset = C;
    svg.appendChild(circle);
    btn.appendChild(svg);

    TBScroll.add(function(y) {
        var docH = document.documentElement.scrollHeight - window.innerHeight;
        var p = docH > 0 ? Math.min(y / docH, 1) : 0;
        circle.style.strokeDashoffset = C * (1 - p);
    });
})();

// === 17. Staggered grid reveals ===
(function() {
    document.querySelectorAll('.highlights-grid, .projects-grid, .latest-grid, .collab-grid, .knowledge-grid, .search-faq-grid').forEach(function(grid) {
        grid.querySelectorAll('.reveal').forEach(function(el, i) {
            el.style.transitionDelay = (Math.min(i, 7) * 0.08) + 's';
            el.addEventListener('transitionend', function clear() {
                el.style.transitionDelay = '';
                el.removeEventListener('transitionend', clear);
            });
        });
    });
})();

// === 18. Global ESC closes modal / mobile menu ===
(function() {
    document.addEventListener('keydown', function(e) {
        if (e.key !== 'Escape') return;
        var modal = document.getElementById('wechatModal');
        if (modal && modal.classList.contains('open')) modal.classList.remove('open');
        var miniappModal = document.getElementById('miniappModal');
        if (miniappModal && miniappModal.classList.contains('open')) miniappModal.classList.remove('open');
        var inquiryModal = document.getElementById('inquiryModal');
        if (inquiryModal && inquiryModal.classList.contains('open')) {
            inquiryModal.classList.remove('open');
            inquiryModal.setAttribute('aria-hidden', 'true');
            document.body.classList.remove('inquiry-modal-open');
        }
        var menu = document.getElementById('mobileMenu');
        if (menu && menu.classList.contains('open')) menu.classList.remove('open');
    });
})();

// === Mobile swipe carousels (latest news + highlights gallery) ===
(function() {
    var mq = window.matchMedia('(max-width: 600px)');

    function buildHint() {
        var hint = document.createElement('div');
        hint.className = 'swipe-hint';
        hint.innerHTML = '<svg class="swipe-hand" viewBox="0 0 24 24" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14"/><path d="M13 6l6 6-6 6"/><path d="M11 6L5 12l6 6"/></svg><span>左右滑动浏览</span>';
        return hint;
    }

    function enhance(grid) {
        if (grid._swipeReady) return;
        grid._swipeReady = true;
        grid.classList.add('swipe-carousel');

        // Progress track
        var track = document.createElement('div');
        track.className = 'swipe-progress';
        var bar = document.createElement('div');
        bar.className = 'swipe-progress-bar';
        track.appendChild(bar);
        grid.parentNode.insertBefore(track, grid.nextSibling);

        // One-time swipe hint
        var hint = buildHint();
        track.parentNode.insertBefore(hint, track.nextSibling);

        var ticking = false;
        function update() {
            var max = grid.scrollWidth - grid.clientWidth;
            var ratio = grid.clientWidth / grid.scrollWidth; // visible fraction
            bar.style.width = Math.max(ratio * 100, 12) + '%';
            var p = max > 0 ? grid.scrollLeft / max : 0;
            // travel = track width minus bar width, expressed in bar-width %
            bar.style.transform = 'translateX(' + (p * (100 / Math.max(ratio, 0.12) - 100)) + '%)';
            ticking = false;
        }
        grid.addEventListener('scroll', function() {
            if (!ticking) { ticking = true; requestAnimationFrame(update); }
            if (!hint.classList.contains('hidden') && grid.scrollLeft > 16) {
                hint.classList.add('hidden');
            }
        }, { passive: true });
        update();
    }

    function teardown(grid) {
        if (!grid._swipeReady) return;
        grid._swipeReady = false;
        grid.classList.remove('swipe-carousel');
        grid.scrollLeft = 0;

        var track = grid.nextElementSibling;
        if (track && track.classList.contains('swipe-progress')) {
            var hint = track.nextElementSibling;
            track.remove();
            if (hint && hint.classList.contains('swipe-hint')) hint.remove();
        }
    }

    function apply() {
        document.querySelectorAll('.latest-grid, .highlights-grid').forEach(function(grid) {
            if (mq.matches) enhance(grid);
            else teardown(grid);
        });
    }

    apply();
    // Re-check when crossing the breakpoint (e.g. orientation change)
    if (mq.addEventListener) mq.addEventListener('change', apply);
    else if (mq.addListener) mq.addListener(apply);
})();

// === Lazy autoplay videos: 进入视口才加载播放，离开暂停 ===
(function() {
    var vids = document.querySelectorAll('video[data-lazy-autoplay]');
    if (!vids.length || !('IntersectionObserver' in window)) {
        // 兜底：不支持 IO 时恢复原行为
        vids.forEach(function(v) { v.play && v.play().catch(function(){}); });
        return;
    }
    var io = new IntersectionObserver(function(entries) {
        entries.forEach(function(entry) {
            var v = entry.target;
            if (entry.isIntersecting) {
                v.play().catch(function(){});
            } else {
                v.pause();
            }
        });
    }, { rootMargin: '200px 0px' });
    vids.forEach(function(v) { io.observe(v); });
})();

// === Mobile: projects grid collapse (show 4, expand on demand) ===
(function() {
    var btn = document.getElementById('projectsToggle');
    var grid = document.querySelector('.projects-grid');
    if (!btn || !grid) return;
    btn.addEventListener('click', function() {
        grid.classList.add('expanded');
        btn.setAttribute('aria-expanded', 'true');
        // 新展开的卡片带 .reveal，立即置为可见，避免等 IntersectionObserver
        grid.querySelectorAll('.reveal').forEach(function(el) { el.classList.add('visible'); });
    });
})();
