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

// === 2. Cursor Glow ===
(function() {
    const glow = document.getElementById('cursorGlow');
    if (!glow) return;
    let mouseX = -500, mouseY = -500;
    let glowX = -500, glowY = -500;

    document.addEventListener('mousemove', (e) => {
        mouseX = e.clientX;
        mouseY = e.clientY;
        if (!glow.classList.contains('active')) glow.classList.add('active');
    });

    document.addEventListener('mouseleave', () => {
        glow.classList.remove('active');
    });

    function animateGlow() {
        glowX += (mouseX - glowX) * 0.15;
        glowY += (mouseY - glowY) * 0.15;
        glow.style.left = glowX + 'px';
        glow.style.top = glowY + 'px';
        requestAnimationFrame(animateGlow);
    }
    animateGlow();
})();

// === 3. Language Toggle ===
function toggleLang() {
    const btn = document.getElementById('langToggle');
    const isZh = btn.textContent === 'EN';
    const newLang = isZh ? 'en' : 'zh';
    const hideLang = isZh ? 'zh' : 'en';

    btn.textContent = isZh ? '中' : 'EN';

    document.querySelectorAll('[data-lang]').forEach(el => {
        el.style.display = el.getAttribute('data-lang') === newLang ? '' : 'none';
    });
}

// === 4. Back to Top ===
(function() {
    const btn = document.getElementById('backToTop');
    if (!btn) return;
    window.addEventListener('scroll', () => {
        if (window.scrollY > window.innerHeight) {
            btn.classList.add('show');
        } else {
            btn.classList.remove('show');
        }
    });
})();

// === 6. Scroll Progress Bar ===
(function() {
    const bar = document.getElementById('scrollProgress');
    if (!bar) return;
    window.addEventListener('scroll', () => {
        const scrollTop = window.scrollY;
        const docHeight = document.documentElement.scrollHeight - window.innerHeight;
        const progress = (scrollTop / docHeight) * 100;
        bar.style.width = progress + '%';
    });
})();

// Parallax scroll effects
(function() {
    const hero = document.getElementById('hero');
    const heroTitle = hero.querySelector('.hero-title');
    const heroSubEn = hero.querySelector('.hero-subtitle-en');
    const heroSub = hero.querySelector('.hero-subtitle');
    const heroBar = hero.querySelector('.hero-bar');
    const navbar = document.querySelector('.navbar');

    let ticking = false;

    window.addEventListener('scroll', function() {
        if (!ticking) {
            requestAnimationFrame(function() {
                const scrollY = window.scrollY;
                const vh = window.innerHeight;

                // Hero parallax — title moves slower, fades out
                if (scrollY < vh) {
                    const progress = scrollY / vh;
                    const titleY = scrollY * 0.35;
                    const fade = 1 - progress * 1.5;

                    heroTitle.style.transform = `translateY(${titleY}px)`;
                    heroTitle.style.opacity = Math.max(fade, 0);

                    heroSubEn.style.transform = `translateY(${scrollY * 0.25}px)`;
                    heroSubEn.style.opacity = Math.max(fade, 0);

                    heroSub.style.transform = `translateY(${scrollY * 0.2}px)`;
                    heroSub.style.opacity = Math.max(fade, 0);

                    heroBar.style.transform = `translateY(${scrollY * 0.15}px)`;
                    heroBar.style.opacity = Math.max(fade, 0);
                }

                // Navbar solidify on scroll
                if (scrollY > 100) {
                    navbar.style.background = 'rgba(26, 26, 24, 0.95)';
                    navbar.style.borderBottomColor = 'rgba(255,255,255,0.06)';
                } else {
                    navbar.style.background = 'rgba(26, 26, 24, 0.6)';
                    navbar.style.borderBottomColor = 'rgba(255,255,255,0.04)';
                }

                ticking = false;
            });
            ticking = true;
        }
    });
})();
