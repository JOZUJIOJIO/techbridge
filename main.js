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
    window.addEventListener('scroll', function() {
        if (window.scrollY > window.innerHeight) {
            btn.classList.add('show');
        } else {
            btn.classList.remove('show');
        }
    }, { passive: true });
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

// === 6. Video Cover Click Handlers ===
(function() {
    // Topic videos → embed Bilibili player inline (no danmaku)
    document.querySelectorAll('[data-bvid]').forEach(function(cover) {
        cover.addEventListener('click', function() {
            var bvid = cover.getAttribute('data-bvid');
            if (!bvid || cover.classList.contains('playing')) return;
            cover.classList.add('playing');
            var iframe = document.createElement('iframe');
            iframe.src = 'https://player.bilibili.com/player.html?bvid=' + bvid + '&autoplay=1&danmaku=0&high_quality=1';
            iframe.setAttribute('allowfullscreen', 'true');
            iframe.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;border:none;z-index:2;';
            cover.appendChild(iframe);
        });
    });

    // Latest videos → play mp4 inline from cover
    document.querySelectorAll('.latest-cover-wrap[data-video]').forEach(function(cover) {
        cover.addEventListener('click', function() {
            var src = cover.getAttribute('data-video');
            if (!src || cover.classList.contains('playing')) return;
            cover.classList.add('playing');
            var video = document.createElement('video');
            video.src = src;
            video.controls = true;
            video.autoplay = true;
            video.playsInline = true;
            video.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;object-fit:cover;z-index:2;background:#000;';
            cover.style.position = 'relative';
            cover.appendChild(video);
        });
    });

    // Product videos → play mp4 inline
    document.querySelectorAll('.product-video-cover[data-video]').forEach(function(cover) {
        cover.addEventListener('click', function() {
            var src = cover.getAttribute('data-video');
            if (!src || cover.classList.contains('playing')) return;
            cover.classList.add('playing');
            var video = document.createElement('video');
            video.src = src;
            video.controls = true;
            video.autoplay = true;
            video.playsInline = true;
            video.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;object-fit:cover;z-index:2;background:#000;';
            cover.style.position = 'relative';
            cover.appendChild(video);
        });
    });
})();

// === 6b. WeChat Modal (A1: moved from inline onclick) ===
(function() {
    var modal = document.getElementById('wechatModal');
    if (!modal) return;

    var openLink = document.getElementById('openWechatLink');
    var closeBtn = document.getElementById('wechatModalClose');

    if (openLink) {
        openLink.addEventListener('click', function(e) {
            e.preventDefault();
            modal.classList.add('open');
        });
    }
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
    window.addEventListener('scroll', function() {
        var scrollTop = window.scrollY;
        var docHeight = document.documentElement.scrollHeight - window.innerHeight;
        var progress = (scrollTop / docHeight) * 100;
        bar.style.width = progress + '%';
    }, { passive: true });
})();

// === 8. Parallax scroll effects (A3: passive) ===
(function() {
    var hero = document.getElementById('hero');
    if (!hero) return;
    var heroTitle = hero.querySelector('.hero-title');
    var heroSubEn = hero.querySelector('.hero-subtitle-en');
    var heroSub = hero.querySelector('.hero-subtitle');
    var heroBar = hero.querySelector('.hero-bar');
    var navbar = document.querySelector('.navbar');

    var ticking = false;

    window.addEventListener('scroll', function() {
        if (!ticking) {
            requestAnimationFrame(function() {
                var scrollY = window.scrollY;
                var vh = window.innerHeight;

                // Hero parallax — title moves slower, fades out
                if (scrollY < vh) {
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

                ticking = false;
            });
            ticking = true;
        }
    }, { passive: true });
})();

// === 9. Hero background video — play 3 times then fade out ===
(function() {
    var video = document.getElementById('heroBgVideo');
    if (!video) return;
    var playCount = 0;
    var maxPlays = 3;

    video.addEventListener('ended', function() {
        playCount++;
        if (playCount < maxPlays) {
            video.play();
        } else {
            video.classList.add('fade-out');
        }
    });
})();

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
