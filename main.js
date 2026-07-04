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

// === 2. Cursor Glow (A4: pauses on mobile / when inactive) ===
(function() {
    const glow = document.getElementById('cursorGlow');
    if (!glow) return;
    // Skip RAF loop entirely on touch devices
    if (window.matchMedia('(pointer: coarse)').matches) return;

    let mouseX = -500, mouseY = -500;
    let glowX = -500, glowY = -500;
    let isActive = false;
    let rafId = null;

    function animateGlow() {
        glowX += (mouseX - glowX) * 0.15;
        glowY += (mouseY - glowY) * 0.15;
        glow.style.left = glowX + 'px';
        glow.style.top = glowY + 'px';
        rafId = requestAnimationFrame(animateGlow);
    }

    function startGlow() {
        if (!isActive) {
            isActive = true;
            glow.classList.add('active');
            rafId = requestAnimationFrame(animateGlow);
        }
    }

    function stopGlow() {
        isActive = false;
        glow.classList.remove('active');
        if (rafId) {
            cancelAnimationFrame(rafId);
            rafId = null;
        }
    }

    document.addEventListener('mousemove', (e) => {
        mouseX = e.clientX;
        mouseY = e.clientY;
        startGlow();
    });

    document.addEventListener('mouseleave', stopGlow);
})();

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

// === 10. Topic video 3D tilt on mousemove ===
(function() {
    document.querySelectorAll('.topic-video').forEach(function(card) {
        card.addEventListener('mousemove', function(e) {
            var rect = card.getBoundingClientRect();
            var x = (e.clientX - rect.left) / rect.width - 0.5;
            var y = (e.clientY - rect.top) / rect.height - 0.5;
            card.style.setProperty('--rx', (x * 6) + 'deg');
            card.style.setProperty('--ry', (-y * 6) + 'deg');
        });
        card.addEventListener('mouseleave', function() {
            card.style.setProperty('--rx', '0deg');
            card.style.setProperty('--ry', '0deg');
        });
    });
})();

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

// === 14. Magnetic Buttons (desktop only) ===
(function() {
    if (window.matchMedia('(pointer: coarse)').matches) return;
    var els = document.querySelectorAll('.hero-action, .cta-button, .project-cta-btn, .knowledge-btn');
    var strength = 0.22;
    els.forEach(function(el) {
        el.classList.add('magnetic');
        el.addEventListener('mousemove', function(e) {
            var r = el.getBoundingClientRect();
            var x = e.clientX - r.left - r.width / 2;
            var y = e.clientY - r.top - r.height / 2;
            el.style.setProperty('--magx', (x * strength).toFixed(1) + 'px');
            el.style.setProperty('--magy', (y * strength).toFixed(1) + 'px');
        });
        el.addEventListener('mouseleave', function() {
            el.style.setProperty('--magx', '0px');
            el.style.setProperty('--magy', '0px');
        });
    });
})();

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
        // Leave DOM in place; CSS reverts to grid above 600px. Just reset bar.
    }

    function apply() {
        if (!mq.matches) return;
        document.querySelectorAll('.latest-grid, .highlights-grid').forEach(enhance);
    }

    apply();
    // Re-check when crossing the breakpoint (e.g. orientation change)
    if (mq.addEventListener) mq.addEventListener('change', apply);
    else if (mq.addListener) mq.addListener(apply);
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
