// ========== JARVIS HUD SYSTEM ==========
window.jarvisAR = window.jarvisAR || {
    active: false, face: { x: 0, y: 0, z: 0 },
    hand: { x: 0, y: 0, visible: false, spread: false, palmSize: 0 },
    smoothFace: { x: 0, y: 0, z: 0 }, smoothHand: { x: 0, y: 0 },
    fistness: 0,       // 0 = open palm, 1 = tight fist (smoothed)
    chargeLevel: 0,    // energy charge 0→1 (builds while fist held)
    explosion: 0,      // 0 = none, >0 = exploding (counts down)
    gazeNav: { activeIdx: -1, dwellTime: 0, triggered: false, cooldown: 0 }
};
(function() {
    const canvas = document.getElementById('heroCanvas');
    const ctx = canvas.getContext('2d');
    let w, h, cx, cy, time = 0;
    let mouse = { x: -1000, y: -1000 };
    const PI = Math.PI, PI2 = PI * 2;
    const O = 'rgba(233,93,33,', T = 'rgba(0,140,140,', W = 'rgba(255,252,248,';

    function resize() {
        const hero = document.getElementById('hero');
        w = canvas.width = hero.offsetWidth;
        h = canvas.height = hero.offsetHeight;
        cx = w / 2; cy = h / 2;
    }

    // ---- Drawing helpers ----
    function ring(r, rot, a, col, lw) {
        ctx.save(); ctx.translate(cx, cy); ctx.rotate(rot);
        ctx.strokeStyle = col + a + ')'; ctx.lineWidth = lw;
        ctx.beginPath(); ctx.arc(0, 0, r, 0, PI2); ctx.stroke();
        ctx.restore();
    }

    function tickRing(r, n, len, rot, a, col, lw) {
        ctx.save(); ctx.translate(cx, cy); ctx.rotate(rot);
        // Ring
        ctx.strokeStyle = col + (a * 0.4) + ')'; ctx.lineWidth = lw * 0.6;
        ctx.beginPath(); ctx.arc(0, 0, r, 0, PI2); ctx.stroke();
        // Ticks
        ctx.strokeStyle = col + a + ')'; ctx.lineWidth = lw;
        for (let i = 0; i < n; i++) {
            const ang = (i / n) * PI2;
            const isMain = i % (n / 4 | 0 || 1) === 0;
            const tl = isMain ? len * 1.8 : len;
            ctx.beginPath();
            ctx.moveTo(Math.cos(ang) * (r - tl), Math.sin(ang) * (r - tl));
            ctx.lineTo(Math.cos(ang) * r, Math.sin(ang) * r);
            ctx.stroke();
        }
        ctx.restore();
    }

    function arc(r, s, e, rot, a, col, lw) {
        ctx.save(); ctx.translate(cx, cy); ctx.rotate(rot);
        ctx.strokeStyle = col + a + ')'; ctx.lineWidth = lw;
        ctx.lineCap = 'round';
        ctx.beginPath(); ctx.arc(0, 0, r, s, e); ctx.stroke();
        ctx.restore();
    }

    function glow(x, y, r, col, a) {
        ctx.shadowBlur = r; ctx.shadowColor = col + a + ')';
    }

    function text(str, x, y, a, col, sz) {
        ctx.font = (sz || 10) + 'px "JetBrains Mono",monospace';
        ctx.fillStyle = col + a + ')';
        ctx.fillText(str, x, y);
    }

    function line(x1, y1, x2, y2, a, col, lw) {
        ctx.strokeStyle = col + a + ')'; ctx.lineWidth = lw || 0.5;
        ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
    }

    function dashLine(x1, y1, x2, y2, a, col, dash) {
        ctx.setLineDash(dash || [3, 6]);
        line(x1, y1, x2, y2, a, col, 0.5);
        ctx.setLineDash([]);
    }

    function progressBar(x, y, w, h, pct, a, col) {
        ctx.strokeStyle = col + (a * 0.3) + ')'; ctx.lineWidth = 0.5;
        ctx.strokeRect(x, y, w, h);
        ctx.fillStyle = col + (a * 0.7) + ')';
        ctx.fillRect(x + 1, y + 1, (w - 2) * pct, h - 2);
    }

    // ---- MAIN RENDER ----
    function animate() {
        time += 0.006;
        ctx.clearRect(0, 0, w, h);

        const ar = window.jarvisAR;
        let offX = 0, offY = 0;
        if (ar && ar.active) {
            offX = ar.smoothFace.x * w * 0.08;
            offY = ar.smoothFace.y * h * 0.06;
        }
        const baseCx = cx, baseCy = cy;
        cx += offX; cy += offY;

        const R = Math.min(w, h) * 0.35; // bigger base radius

        // ============ LAYER 1: OUTERMOST RINGS ============
        // Giant outer ring — very faint
        ring(R * 1.55, time * 0.05, 0.12, T, 0.5);
        tickRing(R * 1.5, 120, 4, time * 0.08, 0.25, T, 0.5);

        // Second outer ring
        tickRing(R * 1.35, 90, 6, -time * 0.12, 0.35, O, 0.7);

        // Bright arc segments on outer ring
        arc(R * 1.42, 0, 0.8, time * 0.15, 0.7, O, 2.5);
        arc(R * 1.42, PI * 0.7, PI * 0.7 + 0.5, time * 0.15, 0.6, T, 2.5);
        arc(R * 1.42, PI * 1.4, PI * 1.4 + 0.6, time * 0.15, 0.5, O, 2);

        // ============ LAYER 2: MAIN RING CLUSTER ============
        tickRing(R, 72, 8, -time * 0.2, 0.6, O, 1.2);
        ring(R * 1.05, -time * 0.18, 0.2, O, 0.8);
        ring(R * 0.95, time * 0.22, 0.15, T, 0.6);

        // Thick arc segments
        arc(R * 1.1, 0.3, 1.0, time * 0.25, 0.8, O, 3);
        arc(R * 1.1, PI + 0.2, PI + 0.9, time * 0.25, 0.6, T, 3);
        arc(R * 0.9, 1.5, 2.3, -time * 0.3, 0.7, T, 2.5);
        arc(R * 0.9, PI + 1.2, PI + 2.0, -time * 0.3, 0.5, O, 2.5);

        // ============ LAYER 3: INNER RINGS ============
        tickRing(R * 0.7, 48, 6, time * 0.35, 0.5, T, 0.8);
        ring(R * 0.65, -time * 0.4, 0.3, T, 0.6);

        arc(R * 0.72, 0, 0.5, time * 0.4, 0.6, O, 2);
        arc(R * 0.72, PI - 0.3, PI + 0.3, time * 0.4, 0.5, T, 2);

        // ============ LAYER 4: CORE RINGS ============
        tickRing(R * 0.4, 36, 5, -time * 0.5, 0.45, O, 0.6);
        ring(R * 0.35, time * 0.6, 0.25, O, 0.5);
        ring(R * 0.25, -time * 0.8, 0.2, T, 0.4);

        // Arc reactor core glow
        const coreR = R * 0.15;
        const cGrd = ctx.createRadialGradient(cx, cy, 0, cx, cy, coreR * 2);
        cGrd.addColorStop(0, O + '0.25)');
        cGrd.addColorStop(0.5, T + '0.08)');
        cGrd.addColorStop(1, 'transparent');
        ctx.fillStyle = cGrd;
        ctx.beginPath(); ctx.arc(cx, cy, coreR * 2, 0, PI2); ctx.fill();

        // Center dot with glow
        glow(cx, cy, 20, O, 0.4);
        ctx.fillStyle = O + '0.6)';
        ctx.beginPath(); ctx.arc(cx, cy, 3 + Math.sin(time * 4) * 1, 0, PI2); ctx.fill();
        ctx.shadowBlur = 0;

        // ============ SCANNING SWEEPS ============
        // Bright sweep on main ring
        for (const [sr, sp, col] of [[R, 0.6, O], [R * 0.7, -0.9, T], [R * 1.35, 0.3, O]]) {
            const ang = time * sp * 2;
            const tipX = Math.cos(ang) * sr;
            const tipY = Math.sin(ang) * sr;
            // Sweep trail
            ctx.save(); ctx.translate(cx, cy);
            for (let i = 0; i < 40; i++) {
                const a2 = ang - (i / 40) * 1.0;
                ctx.strokeStyle = col + (0.4 * (1 - i / 40)) + ')';
                ctx.lineWidth = 2;
                ctx.beginPath();
                ctx.arc(0, 0, sr, a2 - 0.01, a2 + 0.01);
                ctx.stroke();
            }
            // Tip glow
            glow(tipX, tipY, 12, col, 0.6);
            ctx.fillStyle = col + '0.9)';
            ctx.beginPath(); ctx.arc(tipX, tipY, 3, 0, PI2); ctx.fill();
            ctx.shadowBlur = 0;
            ctx.restore();
        }

        // ============ GRID LINES — horizontal + vertical ============
        ctx.globalAlpha = 0.06 + Math.sin(time * 0.5) * 0.02;
        // Horizontal lines
        for (let i = -6; i <= 6; i++) {
            const y = cy + i * (R * 0.22);
            ctx.strokeStyle = T + '1)'; ctx.lineWidth = 0.3;
            ctx.beginPath(); ctx.moveTo(cx - R * 1.5, y); ctx.lineTo(cx + R * 1.5, y); ctx.stroke();
        }
        // Vertical lines
        for (let i = -6; i <= 6; i++) {
            const x = cx + i * (R * 0.22);
            ctx.beginPath(); ctx.moveTo(x, cy - R * 1.5); ctx.lineTo(x, cy + R * 1.5); ctx.stroke();
        }
        ctx.globalAlpha = 1;

        // ============ DATA PANELS ============
        const panels = [
            // Right panel
            { x: cx + R * 1.15, y: cy - R * 0.55, lines: [
                { t: 'JARVIS v4.2.1', c: O, a: 0.7, s: 11 },
                { t: 'STATUS: OPERATIONAL', c: T, a: 0.5 },
                { t: '', bar: true, pct: 0.89, c: O },
                { t: 'AI CORE LOAD 89%', c: O, a: 0.4 },
                { t: 'NEURAL NET ████████░ ', c: T, a: 0.35 },
                { t: 'LATENCY: 12ms', c: T, a: 0.3 },
            ]},
            // Left panel
            { x: cx - R * 1.65, y: cy - R * 0.35, lines: [
                { t: 'TECH BRIDGE SYS', c: T, a: 0.7, s: 11 },
                { t: 'SCAN MODE: ACTIVE', c: O, a: 0.5 },
                { t: '', bar: true, pct: 0.72 + Math.sin(time * 2) * 0.1, c: T },
                { t: 'SIGNAL STRENGTH 72%', c: T, a: 0.4 },
                { t: 'BRIDGE ██████░░░', c: O, a: 0.35 },
                { t: 'UPLINK: STABLE', c: O, a: 0.3 },
            ]},
            // Top right small
            { x: cx + R * 0.8, y: cy - R * 1.15, lines: [
                { t: 'QUANTUM.SYNC', c: O, a: 0.6, s: 9 },
                { t: 'ENT: ' + (Math.sin(time * 3) * 0.5 + 0.5).toFixed(4), c: T, a: 0.4, s: 9 },
            ]},
            // Bottom left small
            { x: cx - R * 1.3, y: cy + R * 0.85, lines: [
                { t: 'HAPTIC.FEED', c: T, a: 0.6, s: 9 },
                { t: 'VEC: [' + Math.sin(time).toFixed(2) + ', ' + Math.cos(time * 1.3).toFixed(2) + ']', c: O, a: 0.4, s: 9 },
            ]},
            // Bottom right
            { x: cx + R * 0.6, y: cy + R * 1.0, lines: [
                { t: 'HOLOGRAPH.ENGINE', c: O, a: 0.5, s: 9 },
                { t: 'FPS: 60 | GPU: 34%', c: T, a: 0.35, s: 9 },
            ]},
        ];

        panels.forEach(p => {
            const blink = Math.sin(time * 3 + p.x * 0.01) > 0 ? 1 : 0.85;
            let yOff = 0;
            // Panel border line
            dashLine(p.x, p.y - 4, p.x + 140, p.y - 4, 0.15, T);

            p.lines.forEach(l => {
                if (l.bar) {
                    progressBar(p.x, p.y + yOff, 120, 6, l.pct, 0.5 * blink, l.c);
                    yOff += 12;
                } else {
                    text(l.t, p.x, p.y + yOff + 10, (l.a || 0.5) * blink, l.c, l.s || 10);
                    yOff += 14;
                }
            });
        });

        // ============ CORNER BRACKETS (HUD frame) ============
        const margin = 40;
        const bLen = 30;
        const ba = 0.3 + Math.sin(time) * 0.1;
        ctx.strokeStyle = O + ba + ')'; ctx.lineWidth = 1;
        // Top-left
        ctx.beginPath(); ctx.moveTo(margin, margin + bLen); ctx.lineTo(margin, margin); ctx.lineTo(margin + bLen, margin); ctx.stroke();
        // Top-right
        ctx.beginPath(); ctx.moveTo(w - margin - bLen, margin); ctx.lineTo(w - margin, margin); ctx.lineTo(w - margin, margin + bLen); ctx.stroke();
        // Bottom-left
        ctx.strokeStyle = T + ba + ')';
        ctx.beginPath(); ctx.moveTo(margin, h - margin - bLen); ctx.lineTo(margin, h - margin); ctx.lineTo(margin + bLen, h - margin); ctx.stroke();
        // Bottom-right
        ctx.beginPath(); ctx.moveTo(w - margin - bLen, h - margin); ctx.lineTo(w - margin, h - margin); ctx.lineTo(w - margin, h - margin - bLen); ctx.stroke();

        // ============ CROSSHAIRS at cardinal points ============
        const crossR = R * 1.05;
        const crossA = 0.4;
        const cs = 10;
        [[cx + crossR, cy], [cx - crossR, cy], [cx, cy - crossR], [cx, cy + crossR]].forEach(([px, py], i) => {
            const c = i < 2 ? O : T;
            ctx.strokeStyle = c + crossA + ')'; ctx.lineWidth = 0.8;
            ctx.beginPath();
            ctx.moveTo(px - cs, py); ctx.lineTo(px + cs, py);
            ctx.moveTo(px, py - cs); ctx.lineTo(px, py + cs);
            ctx.stroke();
            ctx.beginPath(); ctx.arc(px, py, 3, 0, PI2); ctx.stroke();
        });

        // ============ DIAGONAL GUIDE LINES ============
        for (let i = 0; i < 4; i++) {
            const ang = PI * 0.25 + i * PI * 0.5;
            const x1 = cx + Math.cos(ang) * R * 0.4;
            const y1 = cy + Math.sin(ang) * R * 0.4;
            const x2 = cx + Math.cos(ang) * R * 1.5;
            const y2 = cy + Math.sin(ang) * R * 1.5;
            dashLine(x1, y1, x2, y2, 0.08, i % 2 === 0 ? O : T, [2, 10]);
        }

        // ============ FLOATING PARTICLES ============
        const pCount = 35;
        for (let i = 0; i < pCount; i++) {
            const ang = (i / pCount) * PI2 + time * 0.1;
            const dist = R * (0.5 + Math.sin(time * 0.5 + i * 2) * 0.6 + 0.6);
            const px = cx + Math.cos(ang + Math.sin(time + i) * 0.3) * dist;
            const py = cy + Math.sin(ang + Math.cos(time * 0.7 + i) * 0.3) * dist;
            const pa = 0.3 + Math.sin(time * 2 + i) * 0.2;
            const pc = i % 3 === 0 ? O : (i % 3 === 1 ? T : W);
            const ps = 1 + Math.sin(time * 3 + i * 0.5) * 0.5;

            ctx.fillStyle = pc + pa + ')';
            ctx.beginPath(); ctx.arc(px, py, ps, 0, PI2); ctx.fill();

            // Connect some particles to center
            if (i % 5 === 0) {
                ctx.strokeStyle = pc + '0.04)'; ctx.lineWidth = 0.3;
                ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(px, py); ctx.stroke();
            }
        }

        // ============ MOUSE RIPPLE WAVES ============
        if (mouse.x > 0 && mouse.y > 0) {
            // Expanding ripple rings from mouse position
            for (let rw = 0; rw < 3; rw++) {
                const rwPhase = ((time * 1.2 + rw * 0.33) % 1);
                const rwR = rwPhase * 120;
                const rwA = (1 - rwPhase) * 0.15;
                ctx.strokeStyle = O + rwA + ')';
                ctx.lineWidth = 1 * (1 - rwPhase);
                ctx.beginPath(); ctx.arc(mouse.x, mouse.y, rwR, 0, PI2); ctx.stroke();
            }
            // Mouse glow
            const mGrd = ctx.createRadialGradient(mouse.x, mouse.y, 0, mouse.x, mouse.y, 80);
            mGrd.addColorStop(0, O + '0.06)');
            mGrd.addColorStop(1, 'transparent');
            ctx.fillStyle = mGrd;
            ctx.beginPath(); ctx.arc(mouse.x, mouse.y, 80, 0, PI2); ctx.fill();
            // Small crosshair at mouse
            ctx.strokeStyle = O + '0.25)'; ctx.lineWidth = 0.5;
            ctx.beginPath();
            ctx.moveTo(mouse.x - 8, mouse.y); ctx.lineTo(mouse.x + 8, mouse.y);
            ctx.moveTo(mouse.x, mouse.y - 8); ctx.lineTo(mouse.x, mouse.y + 8);
            ctx.stroke();
        }

        // ============ EXTRA: WAVEFORM DISPLAY ============
        // Audio-style waveform at bottom
        const wfY = h - 80, wfW = w * 0.3, wfX = cx - wfW / 2;
        ctx.strokeStyle = T + '0.15)'; ctx.lineWidth = 0.8;
        ctx.beginPath();
        for (let i = 0; i <= 60; i++) {
            const x = wfX + (i / 60) * wfW;
            const amp = Math.sin(i * 0.3 + time * 4) * 8 * Math.sin(i * 0.05 * PI);
            i === 0 ? ctx.moveTo(x, wfY + amp) : ctx.lineTo(x, wfY + amp);
        }
        ctx.stroke();

        // ============ EXTRA: SINE WAVE RIBBONS ============
        for (let ribbon = 0; ribbon < 2; ribbon++) {
            const ry = cy + (ribbon === 0 ? -R * 0.4 : R * 0.4);
            const rc = ribbon === 0 ? T : O;
            ctx.strokeStyle = rc + '0.08)'; ctx.lineWidth = 0.6;
            ctx.beginPath();
            for (let i = 0; i <= 80; i++) {
                const x = cx - R * 1.2 + (i / 80) * R * 2.4;
                const y = ry + Math.sin(i * 0.15 + time * 2 + ribbon * PI) * 15;
                i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
            }
            ctx.stroke();
        }

        // ============ EXTRA: RADAR PING DOTS ============
        for (let rd = 0; rd < 8; rd++) {
            const rdAng = (rd / 8) * PI2 + time * 0.2;
            const rdDist = R * 0.8 + Math.sin(time + rd * 1.5) * R * 0.15;
            const rdx = cx + Math.cos(rdAng) * rdDist;
            const rdy = cy + Math.sin(rdAng) * rdDist;
            const rdPulse = ((time * 1.5 + rd * 0.4) % 1);
            ctx.fillStyle = (rd % 2 === 0 ? O : T) + (0.4 * (1 - rdPulse)) + ')';
            ctx.beginPath(); ctx.arc(rdx, rdy, 2 + rdPulse * 4, 0, PI2); ctx.fill();
        }

        // ============ TOP/BOTTOM STATUS BARS ============
        const topY = 60;
        text('JARVIS INTERFACE v4.2', cx - 70, topY, 0.3, O, 10);
        text('//  TECH BRIDGE SYSTEMS  //  ' + new Date().toLocaleTimeString(), cx - 130, topY + 15, 0.18, T, 9);

        const botY = h - 45;
        const arLabel = (ar && ar.active) ? 'AR.TRACKING: ONLINE' : 'AR.TRACKING: STANDBY';
        const arCol = (ar && ar.active) ? T : O;
        text(arLabel, cx - 55, botY, 0.3, arCol, 9);

        // ====================================================
        // ========== AR MODE: AMBER PROTOCOL HUD ===========
        // ====================================================
        const A = 'rgba(100,180,255,'; // blue primary
        const B = 'rgba(170,220,255,'; // light blue
        const RED = 'rgba(255,51,0,'; // alert red
        if (ar && ar.active) {
            const fx = cx + ar.smoothFace.x * w * 0.08;
            const fy = cy + ar.smoothFace.y * h * 0.06;

            // Update HTML panels
            const _hs = document.getElementById('arHandStatus');
            const _fs = document.getElementById('arFaceStatus');
            const _clk = document.getElementById('arClock');
            const _pwr = document.getElementById('arPowerLevel');
            const _cpu = document.getElementById('arCpuBar');
            const _net = document.getElementById('arNetBar');
            const _hex = document.getElementById('arHexDump');
            if (_hs) _hs.textContent = ar.hand.visible ? 'ONLINE' : 'SCANNING';
            if (_hs) _hs.style.color = ar.hand.visible ? '#88ccff' : '#ff3300';
            if (_clk) _clk.textContent = new Date().toLocaleTimeString('en-US', {hour12:false});
            if (_pwr) _pwr.textContent = 'PWR: ' + (8000 + Math.sin(time * 2) * 1500).toFixed(0);
            if (_cpu) _cpu.style.width = (40 + Math.sin(time * 1.3) * 30) + '%';
            if (_net) _net.style.width = (50 + Math.sin(time * 0.9) * 35) + '%';
            // Hex dump — add entry every ~60 frames
            if (_hex && Math.random() < 0.02) {
                const addr = '0x' + Math.floor(Math.random()*0xFFFFFF).toString(16).toUpperCase().padStart(6,'0');
                _hex.textContent = addr + '  ' + Array.from({length:8},()=>Math.floor(Math.random()*256).toString(16).toUpperCase().padStart(2,'0')).join(' ') + '\n' + (_hex.textContent || '').slice(0, 300);
            }

            // ---- FACE TRACKING — Amber targeting reticle ----

            // Face targeting — amber circle reticle
            ctx.strokeStyle = A + '0.5)'; ctx.lineWidth = 1.5;
            ctx.beginPath(); ctx.arc(sx, sy, 55, 0, PI2); ctx.stroke();
            ctx.strokeStyle = A + '0.25)'; ctx.lineWidth = 0.8;
            ctx.beginPath(); ctx.arc(sx, sy, 40, 0, PI2); ctx.stroke();

            // Rotating target arcs — amber
            ctx.strokeStyle = A + '0.6)'; ctx.lineWidth = 2; ctx.lineCap = 'round';
            for (let i = 0; i < 4; i++) {
                const ta = time * 2 + (i / 4) * PI2;
                ctx.beginPath(); ctx.arc(sx, sy, 48, ta, ta + 0.35); ctx.stroke();
            }

            // Crosshair
            ctx.strokeStyle = A + '0.4)'; ctx.lineWidth = 0.8;
            ctx.beginPath();
            ctx.moveTo(sx - 20, sy); ctx.lineTo(sx - 8, sy);
            ctx.moveTo(sx + 8, sy); ctx.lineTo(sx + 20, sy);
            ctx.moveTo(sx, sy - 20); ctx.lineTo(sx, sy - 8);
            ctx.moveTo(sx, sy + 8); ctx.lineTo(sx, sy + 20);
            ctx.stroke();

            // Gaze dot
            const fGzX = sx + ar.smoothFace.x * 15;
            const fGzY = sy + ar.smoothFace.y * 10;
            glow(fGzX, fGzY, 10, A, 0.5);
            ctx.fillStyle = A + '0.9)';
            ctx.beginPath(); ctx.arc(fGzX, fGzY, 3, 0, PI2); ctx.fill();
            ctx.shadowBlur = 0;

            // Scan line
            const scanLY = sy + Math.sin(time * 1.8) * 50;
            ctx.strokeStyle = A + '0.3)'; ctx.lineWidth = 0.8;
            ctx.beginPath(); ctx.moveTo(sx - 60, scanLY); ctx.lineTo(sx + 60, scanLY); ctx.stroke();

            // Face zone brackets
            const bk = 70, bkL = 20;
            ctx.strokeStyle = A + '0.4)'; ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.moveTo(fx - bk, fy - bk + bkL); ctx.lineTo(fx - bk, fy - bk); ctx.lineTo(fx - bk + bkL, fy - bk);
            ctx.moveTo(fx + bk - bkL, fy - bk); ctx.lineTo(fx + bk, fy - bk); ctx.lineTo(fx + bk, fy - bk + bkL);
            ctx.moveTo(fx - bk, fy + bk - bkL); ctx.lineTo(fx - bk, fy + bk); ctx.lineTo(fx - bk + bkL, fy + bk);
            ctx.moveTo(fx + bk - bkL, fy + bk); ctx.lineTo(fx + bk, fy + bk); ctx.lineTo(fx + bk, fy + bk - bkL);
            ctx.stroke();

            // ---- HAND: SKELETON + ENERGY BALL (amber) ----
            if (ar.hand.visible) {
                const hx = ar.smoothHand.x * w;
                const hy = ar.smoothHand.y * h;
                const pulse = Math.sin(time * 4) * 0.3 + 0.7;

                // Draw hand skeleton wireframe (amber lines)
                if (ar.hand.landmarks) {
                    const lm = ar.hand.landmarks;
                    const px = (i) => (1 - lm[i].x) * w; // mirrored
                    const py = (i) => lm[i].y * h;

                    ctx.strokeStyle = A + '0.7)'; ctx.lineWidth = 2; ctx.lineCap = 'round';
                    // Finger connections: [start, ...joints]
                    const fingers = [
                        [0, 1, 2, 3, 4],     // thumb
                        [0, 5, 6, 7, 8],     // index
                        [0, 9, 10, 11, 12],   // middle
                        [0, 13, 14, 15, 16],  // ring
                        [0, 17, 18, 19, 20],  // pinky
                        [5, 9], [9, 13], [13, 17] // palm cross
                    ];
                    fingers.forEach(f => {
                        ctx.beginPath();
                        for (let j = 0; j < f.length; j++) {
                            j === 0 ? ctx.moveTo(px(f[j]), py(f[j])) : ctx.lineTo(px(f[j]), py(f[j]));
                        }
                        ctx.stroke();
                    });

                    // Joint dots
                    ctx.fillStyle = B + '0.8)';
                    for (let j = 0; j < 21; j++) {
                        ctx.beginPath();
                        ctx.arc(px(j), py(j), j % 4 === 0 ? 4 : 2, 0, PI2);
                        ctx.fill();
                    }

                    // Fingertip glow
                    [4, 8, 12, 16, 20].forEach(tip => {
                        glow(px(tip), py(tip), 8, A, 0.4);
                        ctx.fillStyle = A + '0.9)';
                        ctx.beginPath(); ctx.arc(px(tip), py(tip), 3, 0, PI2); ctx.fill();
                        ctx.shadowBlur = 0;
                    });
                }

                // Explosion trigger — fist (squeeze) releases the charged energy
                if (ar.hand.fist && ar.chargeLevel > 0.15 && ar.explosion <= 0) {
                    ar.explosion = 1.0;
                    ar.chargeLevel = 0;
                }

                const isExploding = ar.explosion > 0;
                if (isExploding) {
                    ar.explosion -= 0.012;
                    const ep = 1 - ar.explosion;
                    const easeOut = 1 - Math.pow(1 - ep, 3);

                    // Blast waves — amber
                    for (let wave = 0; wave < 5; wave++) {
                        const wDelay = wave * 0.08;
                        const wP = Math.max(0, ep - wDelay) / (1 - wDelay);
                        if (wP <= 0 || wP >= 1) continue;
                        const wR = wP * (250 + wave * 60);
                        const wA = (1 - wP) * (0.5 - wave * 0.08);
                        ctx.strokeStyle = (wave % 2 === 0 ? W : A) + Math.max(0, wA) + ')';
                        ctx.lineWidth = 3 * (1 - wP);
                        ctx.beginPath(); ctx.arc(hx, hy, wR, 0, PI2); ctx.stroke();
                    }

                    // Flash
                    const flashA = Math.max(0, (1 - ep * 2)) * 0.5;
                    if (flashA > 0) {
                        const fGrd = ctx.createRadialGradient(hx, hy, 0, hx, hy, 300);
                        fGrd.addColorStop(0, W + flashA + ')');
                        fGrd.addColorStop(0.3, A + (flashA * 0.5) + ')');
                        fGrd.addColorStop(1, 'transparent');
                        ctx.fillStyle = fGrd;
                        ctx.beginPath(); ctx.arc(hx, hy, 300, 0, PI2); ctx.fill();
                    }

                    // Debris
                    for (let i = 0; i < 30; i++) {
                        const pAng = (i / 30) * PI2 + i * 0.7;
                        const pDist = easeOut * (150 + (i % 5) * 50);
                        ctx.fillStyle = (i % 3 === 0 ? W : A) + ((1 - ep) * 0.8) + ')';
                        ctx.beginPath();
                        ctx.arc(hx + Math.cos(pAng) * pDist, hy + Math.sin(pAng) * pDist, 3 * (1 - ep), 0, PI2);
                        ctx.fill();
                    }
                }

                // ====== KAMEHAMEHA ENERGY BALL ======
                const isClaw = ar.hand.claw;
                const fist = ar.fistness;

                // Charge builds while in claw pose
                if (isClaw && !isExploding) {
                    ar.chargeLevel = Math.min(1, ar.chargeLevel + 0.01);
                } else if (!isExploding && !ar.hand.fist) {
                    ar.chargeLevel = Math.max(0, ar.chargeLevel - 0.03);
                }
                const charge = ar.chargeLevel;
                const ba = isExploding ? Math.max(0, ar.explosion) : 1;
                const showBall = (isClaw || ar.hand.fist || isExploding) && (charge > 0.02 || isExploding);
                const intensity = showBall ? (0.4 + charge * 0.6) * ba : 0;

                // Ball radius — claw = compact charging ball
                const palmScale = Math.max(0.06, ar.hand.palmSize) / 0.12;
                const baseR = 18 + charge * 30;
                const ballR = baseR * palmScale;
                const coreR = ballR * (0.35 + charge * 0.35) + Math.sin(time * 6) * 3;

                if (showBall) {
                // === Outer energy field (wide diffuse glow) ===
                const fieldR = ballR * 4 + charge * 80;
                const oGrd = ctx.createRadialGradient(hx, hy, 0, hx, hy, fieldR);
                oGrd.addColorStop(0, A + (0.15 * intensity * pulse) + ')');
                oGrd.addColorStop(0.2, A + (0.06 * intensity) + ')');
                oGrd.addColorStop(1, 'transparent');
                ctx.fillStyle = oGrd;
                ctx.beginPath(); ctx.arc(hx, hy, fieldR, 0, PI2); ctx.fill();

                // === Plasma core sphere ===
                const cGrd = ctx.createRadialGradient(hx, hy, 0, hx, hy, coreR * 1.5);
                cGrd.addColorStop(0, W + (0.95 * intensity * pulse) + ')');
                cGrd.addColorStop(0.25, A + (0.7 * intensity * pulse) + ')');
                cGrd.addColorStop(0.6, 'rgba(80,160,255,' + (0.3 * intensity) + ')');
                cGrd.addColorStop(1, 'transparent');
                glow(hx, hy, 40 + charge * 30, A, 0.5 * intensity);
                ctx.fillStyle = cGrd;
                ctx.beginPath(); ctx.arc(hx, hy, coreR * 1.5, 0, PI2); ctx.fill();
                ctx.shadowBlur = 0;

                // === Inner white-hot center ===
                const innerR = coreR * 0.5 + Math.sin(time * 8) * 2 + charge * 4;
                glow(hx, hy, 20 + charge * 15, W, 0.6 * ba);
                ctx.fillStyle = W + (0.95 * pulse * ba) + ')';
                ctx.beginPath(); ctx.arc(hx, hy, innerR, 0, PI2); ctx.fill();
                ctx.shadowBlur = 0;

                // === Electric arcs from fingertips to ball center ===
                if (ar.hand.landmarks && fist > 0.2) {
                    const lm = ar.hand.landmarks;
                    const fpx = (i) => (1 - lm[i].x) * w;
                    const fpy = (i) => lm[i].y * h;
                    const arcAlpha = fist * 0.6 * ba;
                    [4, 8, 12, 16, 20].forEach((tip, ti) => {
                        const tx = fpx(tip), ty = fpy(tip);
                        // Lightning bolt — 3 segment jagged line
                        ctx.strokeStyle = A + arcAlpha + ')';
                        ctx.lineWidth = 1.5 + charge;
                        ctx.lineCap = 'round';
                        ctx.beginPath();
                        ctx.moveTo(tx, ty);
                        const dx = hx - tx, dy = hy - ty;
                        for (let seg = 1; seg <= 3; seg++) {
                            const t = seg / 4;
                            const jitter = (1 - t) * 15 * (Math.sin(time * 12 + ti * 3 + seg * 7) );
                            ctx.lineTo(tx + dx * t + jitter, ty + dy * t + jitter * 0.7);
                        }
                        ctx.lineTo(hx, hy);
                        ctx.stroke();
                        // Bright dot at fingertip
                        if (fist > 0.5) {
                            glow(tx, ty, 6, A, 0.3 * fist);
                            ctx.fillStyle = W + (0.7 * fist * ba) + ')';
                            ctx.beginPath(); ctx.arc(tx, ty, 2, 0, PI2); ctx.fill();
                            ctx.shadowBlur = 0;
                        }
                    });
                }

                // === Orbiting plasma rings ===
                const ringCount = 3 + Math.floor(charge * 3); // more rings when charged
                for (let ring = 0; ring < ringCount; ring++) {
                    const rr = coreR * 1.8 + ring * (12 + charge * 8) + Math.sin(time * 3 + ring) * 4;
                    const speed = (ring % 2 === 0 ? 1 : -1) * (2.5 + ring * 0.4 + charge * 2);
                    const ringA = (0.4 * intensity - ring * 0.05);
                    if (ringA <= 0) continue;
                    ctx.strokeStyle = (ring % 2 === 0 ? A : 'rgba(80,160,255,') + ringA + ')';
                    ctx.lineWidth = 2.5 - ring * 0.3;
                    ctx.lineCap = 'round';
                    for (let seg = 0; seg < 3; seg++) {
                        const sa = time * speed + (seg / 3) * PI2;
                        const arcLen = 0.4 + charge * 0.3;
                        ctx.beginPath(); ctx.arc(hx, hy, rr, sa, sa + arcLen); ctx.stroke();
                    }
                }

                // === Inward-spiraling particles (gathering energy) ===
                const pCount = 15 + Math.floor(charge * 20);
                for (let i = 0; i < pCount; i++) {
                    const pLife = ((time * 1.2 + i * 0.3) % 1);
                    const pDist = (1 - pLife) * (ballR * 5 + charge * 100);
                    const pAng = (i / pCount) * PI2 + time * 0.6 + pLife * 3;
                    const ppx = hx + Math.cos(pAng) * pDist;
                    const ppy = hy + Math.sin(pAng) * pDist;
                    const pa = pLife * 0.6 * intensity;
                    const ps = (1 + charge * 2) * pLife;
                    if (ps > 0.2 && pa > 0.02) {
                        ctx.fillStyle = (i % 4 === 0 ? W : (i % 2 === 0 ? A : 'rgba(80,160,255,')) + pa + ')';
                        ctx.beginPath(); ctx.arc(ppx, ppy, ps, 0, PI2); ctx.fill();
                    }
                }

                // === Pulsing shockwaves (more intense when charged) ===
                const swCount = 2 + Math.floor(charge * 2);
                for (let sw = 0; sw < swCount; sw++) {
                    const swP = ((time * (0.6 + charge * 0.4) + sw * (1 / swCount)) % 1);
                    const swR = coreR + swP * (ballR * 3 + charge * 60);
                    ctx.strokeStyle = A + ((1 - swP) * 0.15 * ba) + ')';
                    ctx.lineWidth = (2 + charge) * (1 - swP);
                    ctx.beginPath(); ctx.arc(hx, hy, swR, 0, PI2); ctx.stroke();
                }
                } // end showBall
            }

            // ====================================================
            // ========== GAZE NAVIGATION — Eye-controlled HUD =====
            // ====================================================
            const gaze = ar.gazeNav;
            if (gaze.cooldown > 0) gaze.cooldown -= 0.016;

            // Navigation targets — positioned around screen edges
            const navTargets = [
                { label: 'ABOUT',  section: '#about',  angle: -0.4,  dist: 0.38 },
                { label: 'TOPICS', section: '#topics', angle: 0,     dist: 0.40 },
                { label: 'COLLAB', section: '#collab', angle: 0.4,   dist: 0.38 },
            ];

            // Gaze point — map face direction to screen position
            // ar.smoothFace.x: -1 (looking right) to 1 (looking left)
            // ar.smoothFace.y: -1 (looking down) to 1 (looking up)
            const gzX = cx - ar.smoothFace.x * w * 0.4;
            const gzY = cy - ar.smoothFace.y * h * 0.35;

            // Draw gaze cursor trail
            ctx.fillStyle = A + '0.15)';
            ctx.beginPath(); ctx.arc(gzX, gzY, 30, 0, PI2); ctx.fill();
            glow(gzX, gzY, 15, A, 0.3);
            ctx.fillStyle = A + '0.6)';
            ctx.beginPath(); ctx.arc(gzX, gzY, 4, 0, PI2); ctx.fill();
            ctx.shadowBlur = 0;

            // Render each nav target
            let hoveredIdx = -1;
            navTargets.forEach((nav, i) => {
                // Position: arc layout at bottom of screen
                const nx = cx + nav.angle * w * 0.7;
                const ny = h * nav.dist + h * 0.55;
                const targetR = 50;

                // Check gaze proximity
                const dx = gzX - nx, dy = gzY - ny;
                const dist = Math.sqrt(dx * dx + dy * dy);
                const isHovered = dist < targetR * 1.8;
                if (isHovered && gaze.cooldown <= 0) hoveredIdx = i;

                // Dwell progress for this target
                const isActive = (gaze.activeIdx === i);
                const progress = isActive ? Math.min(gaze.dwellTime / 2.0, 1) : 0; // 2 sec dwell

                // --- Hexagonal frame ---
                const hexR = targetR + (isHovered ? 8 : 0) + Math.sin(time * 2 + i) * 2;
                const baseAlpha = isHovered ? 0.7 : 0.25;

                // Outer hex
                ctx.strokeStyle = (isHovered ? A : T) + baseAlpha + ')';
                ctx.lineWidth = isHovered ? 2 : 1;
                ctx.beginPath();
                for (let v = 0; v <= 6; v++) {
                    const a = (v / 6) * PI2 - PI / 6;
                    const hx2 = nx + Math.cos(a) * hexR;
                    const hy2 = ny + Math.sin(a) * hexR;
                    v === 0 ? ctx.moveTo(hx2, hy2) : ctx.lineTo(hx2, hy2);
                }
                ctx.stroke();

                // Progress arc (dwell timer visualization)
                if (progress > 0) {
                    ctx.strokeStyle = 'rgba(255,200,60,' + (0.8 * progress) + ')';
                    ctx.lineWidth = 3;
                    ctx.lineCap = 'round';
                    ctx.beginPath();
                    ctx.arc(nx, ny, hexR + 6, -PI / 2, -PI / 2 + progress * PI2);
                    ctx.stroke();

                    // Charging glow
                    const chGrd = ctx.createRadialGradient(nx, ny, 0, nx, ny, hexR);
                    chGrd.addColorStop(0, 'rgba(255,200,60,' + (0.1 * progress) + ')');
                    chGrd.addColorStop(1, 'transparent');
                    ctx.fillStyle = chGrd;
                    ctx.beginPath(); ctx.arc(nx, ny, hexR, 0, PI2); ctx.fill();
                }

                // Inner fill on hover
                if (isHovered) {
                    const hGrd = ctx.createRadialGradient(nx, ny, 0, nx, ny, hexR);
                    hGrd.addColorStop(0, A + '0.08)');
                    hGrd.addColorStop(1, 'transparent');
                    ctx.fillStyle = hGrd;
                    ctx.beginPath(); ctx.arc(nx, ny, hexR, 0, PI2); ctx.fill();
                }

                // Scan line decoration
                ctx.strokeStyle = (isHovered ? A : T) + (baseAlpha * 0.4) + ')';
                ctx.lineWidth = 0.5;
                for (let sl = -2; sl <= 2; sl++) {
                    const sly = ny + sl * 8;
                    ctx.beginPath();
                    ctx.moveTo(nx - hexR * 0.6, sly);
                    ctx.lineTo(nx + hexR * 0.6, sly);
                    ctx.stroke();
                }

                // Label
                ctx.font = '12px "JetBrains Mono",monospace';
                ctx.fillStyle = (isHovered ? '#ffffff' : A) + ')';
                ctx.textAlign = 'center';
                ctx.fillText(nav.label, nx, ny - 4);

                // Sub-label
                ctx.font = '9px "JetBrains Mono",monospace';
                ctx.fillStyle = (isHovered ? 'rgba(255,200,60,' : T) + (baseAlpha * 0.8) + ')';
                ctx.fillText(isHovered ? (progress > 0 ? 'LOCKING...' : 'DETECTED') : 'STANDBY', nx, ny + 12);
                ctx.textAlign = 'left'; // reset

                // Connection line from gaze cursor to hovered target
                if (isHovered) {
                    ctx.setLineDash([4, 8]);
                    ctx.strokeStyle = A + '0.2)';
                    ctx.lineWidth = 1;
                    ctx.beginPath();
                    ctx.moveTo(gzX, gzY);
                    ctx.lineTo(nx, ny);
                    ctx.stroke();
                    ctx.setLineDash([]);
                }
            });

            // Dwell logic — accumulate time on same target
            if (hoveredIdx >= 0) {
                if (gaze.activeIdx === hoveredIdx) {
                    gaze.dwellTime += 0.016; // ~1 frame at 60fps
                    // Trigger at 2 seconds
                    if (gaze.dwellTime >= 2.0 && !gaze.triggered) {
                        gaze.triggered = true;
                        gaze.cooldown = 3.0; // prevent re-trigger for 3s
                        const target = navTargets[hoveredIdx];
                        // Flash effect
                        ctx.fillStyle = 'rgba(100,180,255,0.15)';
                        ctx.fillRect(0, 0, w, h);
                        // Navigate
                        setTimeout(() => {
                            document.querySelector(target.section)?.scrollIntoView({ behavior: 'smooth' });
                        }, 300);
                    }
                } else {
                    gaze.activeIdx = hoveredIdx;
                    gaze.dwellTime = 0;
                    gaze.triggered = false;
                }
            } else {
                gaze.activeIdx = -1;
                gaze.dwellTime = 0;
                gaze.triggered = false;
            }

            // Gaze nav status label
            ctx.font = '9px "JetBrains Mono",monospace';
            ctx.fillStyle = T + '0.5)';
            ctx.fillText('GAZE.NAV: ACTIVE', w - 140, h - 20);

        }

        cx = baseCx; cy = baseCy;
        requestAnimationFrame(animate);
    }

    window.addEventListener('resize', resize);
    document.getElementById('hero').addEventListener('mousemove', (e) => {
        const rect = canvas.getBoundingClientRect();
        mouse.x = e.clientX - rect.left; mouse.y = e.clientY - rect.top;
    });
    document.getElementById('hero').addEventListener('mouseleave', () => {
        mouse.x = -1000; mouse.y = -1000;
    });
    resize(); animate();
})();

// ========== PREMIUM INTERACTIONS ==========

// === P1. Hero Text Split Animation ===
(function() {
    const title = document.querySelector('.hero-title');
    if (!title) return;

    let charIndex = 0;

    const splitText = (el) => {
        const nodes = [...el.childNodes];
        nodes.forEach(node => {
            if (node.nodeType === 3) {
                const text = node.textContent.trim();
                if (!text) return;
                // Split into words, wrap each word in a .word span
                const words = text.split(/\s+/);
                const frag = document.createDocumentFragment();
                words.forEach((word, wi) => {
                    const wordSpan = document.createElement('span');
                    wordSpan.className = 'word';
                    [...word].forEach(char => {
                        const charSpan = document.createElement('span');
                        charSpan.className = 'char';
                        charSpan.textContent = char;
                        charSpan.style.animationDelay = (charIndex * 0.05) + 's';
                        charIndex++;
                        wordSpan.appendChild(charSpan);
                    });
                    frag.appendChild(wordSpan);
                    if (wi < words.length - 1) frag.appendChild(document.createTextNode(' '));
                });
                node.replaceWith(frag);
            } else if (node.nodeName === 'BR') {
                // keep
            } else if (node.nodeName === 'SPAN') {
                // Wrap the span's text content in chars but keep the span's class
                const text = node.textContent.trim();
                if (!text) return;
                const wordSpan = document.createElement('span');
                wordSpan.className = 'word';
                // Preserve original span classes (text-orange, text-green)
                const inner = document.createElement('span');
                inner.className = node.className;
                [...text].forEach(char => {
                    const charSpan = document.createElement('span');
                    charSpan.className = 'char';
                    charSpan.textContent = char;
                    charSpan.style.animationDelay = (charIndex * 0.05) + 's';
                    charIndex++;
                    inner.appendChild(charSpan);
                });
                wordSpan.appendChild(inner);
                node.replaceWith(wordSpan);
            }
        });
    };

    splitText(title);
})();

// === P2. Magnetic Buttons ===
(function() {
    const magnets = document.querySelectorAll('.cta-button, .newsletter-btn, .footer-icon-link');

    magnets.forEach(el => {
        el.addEventListener('mousemove', (e) => {
            const rect = el.getBoundingClientRect();
            const x = e.clientX - rect.left - rect.width / 2;
            const y = e.clientY - rect.top - rect.height / 2;
            const strength = el.classList.contains('footer-icon-link') ? 0.35 : 0.2;
            el.style.transform = `translate(${x * strength}px, ${y * strength}px)`;
        });

        el.addEventListener('mouseleave', () => {
            el.style.transform = '';
            el.style.transition = 'transform 0.4s cubic-bezier(0.16, 1, 0.3, 1)';
            setTimeout(() => { el.style.transition = ''; }, 400);
        });
    });
})();

// === P3. Card Spotlight (cursor-following glow on collab cards) ===
(function() {
    document.querySelectorAll('.collab-card').forEach(card => {
        card.addEventListener('mousemove', (e) => {
            const rect = card.getBoundingClientRect();
            const x = e.clientX - rect.left;
            const y = e.clientY - rect.top;
            card.style.setProperty('--spot-x', x + 'px');
            card.style.setProperty('--spot-y', y + 'px');
            if (card.querySelector('::before') !== null) {
                // Fallback: directly set the pseudo-element position via CSS var
            }
            // Move the ::before pseudo via CSS custom properties
            card.style.background = `radial-gradient(300px circle at ${x}px ${y}px, rgba(233,93,33,0.08), transparent 70%), var(--surface-dark)`;
            card.style.borderColor = `rgba(233,93,33, ${0.3 + (0.4 * (1 - Math.min(Math.sqrt((x - rect.width/2)**2 + (y - rect.height/2)**2) / (rect.width/2), 1)))})`;
        });

        card.addEventListener('mouseleave', () => {
            card.style.background = '';
            card.style.borderColor = '';
        });
    });
})();

// === P4. Video Card 3D Tilt ===
(function() {
    document.querySelectorAll('.topic-video').forEach(video => {
        video.addEventListener('mousemove', (e) => {
            const rect = video.getBoundingClientRect();
            const x = (e.clientX - rect.left) / rect.width - 0.5;
            const y = (e.clientY - rect.top) / rect.height - 0.5;
            video.style.transform = `perspective(800px) rotateY(${x * 6}deg) rotateX(${-y * 6}deg)`;
            video.style.transition = 'transform 0.1s ease';
        });

        video.addEventListener('mouseleave', () => {
            video.style.transform = '';
            video.style.transition = 'transform 0.5s cubic-bezier(0.16, 1, 0.3, 1)';
        });
    });
})();

// === P5. Nav Active Section Tracking ===
(function() {
    const sections = document.querySelectorAll('section[id]');
    const navLinks = document.querySelectorAll('.nav-link');

    const sectionObserver = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                const id = entry.target.id;
                navLinks.forEach(link => {
                    link.classList.toggle('active', link.getAttribute('href') === '#' + id);
                });
            }
        });
    }, { threshold: 0.3, rootMargin: '-72px 0px -50% 0px' });

    sections.forEach(s => sectionObserver.observe(s));
})();

// === P6. Stats Glow on Count ===
(function() {
    const statsBar = document.querySelector('.stats-bar');
    if (!statsBar) return;
    const glowObserver = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                statsBar.classList.add('counting');
                setTimeout(() => statsBar.classList.remove('counting'), 2500);
            }
        });
    }, { threshold: 0.5 });
    glowObserver.observe(statsBar);
})();

// === P7. Smooth scroll for anchor links ===
(function() {
    document.querySelectorAll('a[href^="#"]').forEach(anchor => {
        anchor.addEventListener('click', function(e) {
            const target = document.querySelector(this.getAttribute('href'));
            if (!target) return;
            e.preventDefault();
            const offset = 72; // navbar height
            const y = target.getBoundingClientRect().top + window.scrollY - offset;
            window.scrollTo({ top: y, behavior: 'smooth' });
        });
    });
})();

// ========== JARVIS AR TRACKING SYSTEM ==========
// Uses MediaPipe Face Mesh + Hands via CDN
// Opt-in: only loads when user clicks the trigger button
(function() {
    const trigger = document.getElementById('arTrigger');
    const status = document.getElementById('arStatus');
    const video = document.getElementById('arVideo');
    if (!trigger) return;

    // Shared tracking state — read by the Jarvis HUD renderer
    window.jarvisAR = {
        active: false,
        face: { x: 0, y: 0, z: 0 },      // normalized -1 to 1
        hand: { x: 0, y: 0, visible: false }, // normalized 0-1
        smoothFace: { x: 0, y: 0, z: 0 },
        smoothHand: { x: 0, y: 0 }
    };

    let arRunning = false;

    function setStatus(msg) {
        status.textContent = msg;
        status.classList.add('show');
        setTimeout(() => status.classList.remove('show'), 3000);
    }

    function arLog(msg, type) {
        const feed = document.getElementById('arLogFeed');
        if (!feed) return;
        const line = document.createElement('div');
        line.className = type === 'SYS' ? 'msg-sys' : 'msg-data';
        line.textContent = '[' + type + '] ' + msg;
        feed.prepend(line);
        if (feed.children.length > 8) feed.lastChild.remove();
    }

    async function loadMediaPipe() {
        setStatus('LOADING AI MODELS...');
        // Use inline module script to import MediaPipe ESM
        const code = `import{FilesetResolver,FaceLandmarker,HandLandmarker}from"https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/vision_bundle.mjs";window._mpVision={FilesetResolver,FaceLandmarker,HandLandmarker};window.dispatchEvent(new Event("mpReady"));`;
        const blob = new Blob([code], { type: 'application/javascript' });
        const url = URL.createObjectURL(blob);
        const s = document.createElement('script');
        s.type = 'module';
        s.src = url;
        return new Promise((resolve, reject) => {
            const timer = setTimeout(() => reject(new Error('MediaPipe load timeout')), 30000);
            window.addEventListener('mpReady', () => {
                clearTimeout(timer);
                URL.revokeObjectURL(url);
                setStatus('MODELS LOADED');
                resolve();
            }, { once: true });
            s.onerror = (e) => { clearTimeout(timer); reject(e); };
            document.head.appendChild(s);
        });
    }

    const guide = document.getElementById('arGuide');
    const guideMessages = [
        { msg: '// JARVIS SYSTEM ONLINE — 系统已就绪', t: 2500 },
        { msg: '// 试试移动你的头部 — HUD 会跟着你动', t: 4000 },
        { msg: '// 伸出手掌对准摄像头 — 操控全息界面', t: 4000 },
        { msg: '// 挥动手掌 — 就像 Tony Stark 一样', t: 4000 },
        { msg: '// ENJOY THE FUTURE.', t: 3000 },
    ];
    let guideTimer = null;

    function showGuide(msg, duration) {
        guide.innerHTML = '<span class="ar-guide-tip">' + msg + '</span>';
        if (guideTimer) clearTimeout(guideTimer);
        guideTimer = setTimeout(() => {
            const tip = guide.querySelector('.ar-guide-tip');
            if (tip) tip.classList.add('fade-out');
            setTimeout(() => { guide.innerHTML = ''; }, 500);
        }, duration || 3500);
    }

    function runGuideSequence() {
        let delay = 500; // initial delay after activation
        guideMessages.forEach((item) => {
            setTimeout(() => showGuide(item.msg, item.t), delay);
            delay += item.t + 800; // gap between messages
        });
    }

    async function startCamera() {
        setStatus('ACCESSING CAMERA...');
        try {
            const stream = await navigator.mediaDevices.getUserMedia({
                video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } }
            });
            video.srcObject = stream;
            await video.play();
            // Activate camera background
            document.getElementById('hero').classList.add('ar-active');
            setStatus('CAMERA ACTIVE');
            return true;
        } catch (e) {
            setStatus('CAMERA DENIED');
            return false;
        }
    }

    async function initTracking() {
        let FR, FL_class, HL_class;
        try {
            const v = window._mpVision;
            FR = v.FilesetResolver;
            FL_class = v.FaceLandmarker;
            HL_class = v.HandLandmarker;
            if (!FR) throw new Error('FilesetResolver not found');
        } catch(e) {
            console.error('MediaPipe init error:', e);
            setStatus('INIT FAILED — FALLBACK MODE');
            return false;
        }

        setStatus('INITIALIZING FACE TRACKING...');

        const wasmFiles = await FR.forVisionTasks(
            'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.18/wasm'
        );

        // Face Landmarker
        let faceLandmarker = null;
        try {
            faceLandmarker = await FL_class.createFromOptions(wasmFiles, {
                baseOptions: {
                    modelAssetPath: 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task',
                    delegate: 'GPU'
                },
                runningMode: 'VIDEO',
                numFaces: 1,
                minFaceDetectionConfidence: 0.5,
                minTrackingConfidence: 0.5
            });
            setStatus('FACE TRACKING ONLINE');
        } catch(e) {
            console.warn('Face tracking failed:', e);
        }

        // Hand Landmarker
        let handLandmarker = null;
        try {
            setStatus('INITIALIZING HAND TRACKING...');
            handLandmarker = await HL_class.createFromOptions(wasmFiles, {
                baseOptions: {
                    modelAssetPath: 'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task',
                    delegate: 'GPU'
                },
                runningMode: 'VIDEO',
                numHands: 1,
                minHandDetectionConfidence: 0.5,
                minTrackingConfidence: 0.5
            });
            setStatus('HAND TRACKING ONLINE');
        } catch(e) {
            console.warn('Hand tracking failed:', e);
        }

        if (!faceLandmarker && !handLandmarker) {
            setStatus('TRACKING UNAVAILABLE');
            return false;
        }

        window.jarvisAR.active = true;
        setStatus('JARVIS SYSTEM ONLINE');

        // Tracking loop
        let lastTime = -1;
        function track() {
            if (!arRunning) return;

            const now = performance.now();
            if (now === lastTime) {
                requestAnimationFrame(track);
                return;
            }
            lastTime = now;

            const ar = window.jarvisAR;

            // Face tracking
            if (faceLandmarker && video.readyState >= 2) {
                try {
                    const faceResults = faceLandmarker.detectForVideo(video, now);
                    if (faceResults.faceLandmarks && faceResults.faceLandmarks.length > 0) {
                        const landmarks = faceResults.faceLandmarks[0];
                        // Use nose tip (index 1) as face center
                        const nose = landmarks[1];
                        // Map from 0-1 camera space to -1 to 1 (mirrored for selfie)
                        ar.face.x = -(nose.x - 0.5) * 2;
                        ar.face.y = -(nose.y - 0.5) * 2;
                        ar.face.z = nose.z * 2;
                    }
                } catch(e) { /* skip frame */ }
            }

            // Hand tracking
            if (handLandmarker && video.readyState >= 2) {
                try {
                    const handResults = handLandmarker.detectForVideo(video, now);
                    if (handResults.landmarks && handResults.landmarks.length > 0) {
                        const hand = handResults.landmarks[0];
                        // Palm center — average of wrist(0) and middle finger base(9)
                        const px = (hand[0].x + hand[9].x) / 2;
                        const py = (hand[0].y + hand[9].y) / 2;
                        ar.hand.x = 1 - px; // mirror for selfie
                        ar.hand.y = py;
                        ar.hand.visible = true;
                        // Detect open palm: measure avg distance between fingertips
                        // Fingertips: thumb(4), index(8), middle(12), ring(16), pinky(20)
                        const tips = [hand[4], hand[8], hand[12], hand[16], hand[20]];
                        const wrist = hand[0];
                        let avgDist = 0;
                        tips.forEach(t => {
                            avgDist += Math.sqrt((t.x - wrist.x) ** 2 + (t.y - wrist.y) ** 2);
                        });
                        avgDist /= 5;
                        ar.hand.spread = avgDist > 0.18; // open palm threshold
                        ar.hand.landmarks = hand; // save all 21 landmarks for skeleton
                        // Palm size — distance between wrist(0) and middle finger base(9)
                        ar.hand.palmSize = Math.sqrt((hand[0].x - hand[9].x) ** 2 + (hand[0].y - hand[9].y) ** 2);

                        // Gesture detection — three zones:
                        //   avgDist > 0.18  → open palm (no ball)
                        //   0.10 < avgDist <= 0.18 → claw/cupped (charging ball)
                        //   avgDist <= 0.10  → tight fist (release explosion)
                        ar.hand.claw = avgDist > 0.10 && avgDist <= 0.18;
                        ar.hand.fist = avgDist <= 0.10;

                        // Fistness for visual intensity (0=open, 1=tight)
                        const rawFist = Math.max(0, Math.min(1, 1 - (avgDist - 0.08) / 0.12));
                        ar.fistness += (rawFist - ar.fistness) * 0.15;

                        // Draw hand skeleton on separate canvas
                        const hc = document.getElementById('arHandCanvas');
                        const hctx = hc ? hc.getContext('2d') : null;
                        if (hctx && hc.width > 0) {
                            hctx.clearRect(0, 0, hc.width, hc.height);
                            hctx.strokeStyle = '#88ccff';
                            hctx.lineWidth = 2.5;
                            hctx.lineCap = 'round';
                            const px = (i) => hand[i].x * hc.width;
                            const py = (i) => hand[i].y * hc.height;
                            const dl = (i, j) => { hctx.beginPath(); hctx.moveTo(px(i), py(i)); hctx.lineTo(px(j), py(j)); hctx.stroke(); };
                            // Fingers
                            dl(0,1);dl(1,2);dl(2,3);dl(3,4);
                            dl(0,5);dl(5,6);dl(6,7);dl(7,8);
                            dl(0,9);dl(9,10);dl(10,11);dl(11,12);
                            dl(0,13);dl(13,14);dl(14,15);dl(15,16);
                            dl(0,17);dl(17,18);dl(18,19);dl(19,20);
                            dl(5,9);dl(9,13);dl(13,17);dl(0,17);
                            // Joint dots
                            hctx.fillStyle = '#aaddff';
                            for (let j = 0; j < 21; j++) {
                                hctx.beginPath();
                                hctx.arc(px(j), py(j), j % 4 === 0 ? 3.5 : 1.8, 0, Math.PI * 2);
                                hctx.fill();
                            }
                            // Fingertip glow
                            hctx.shadowColor = 'rgba(100,180,255,0.6)';
                            hctx.shadowBlur = 10;
                            hctx.fillStyle = '#ffffff';
                            [4,8,12,16,20].forEach(t => {
                                hctx.beginPath();
                                hctx.arc(px(t), py(t), 3, 0, Math.PI * 2);
                                hctx.fill();
                            });
                            hctx.shadowBlur = 0;
                        }

                        // Update hand cursor position
                        const cursor = document.getElementById('arHandCursor');
                        if (cursor) {
                            const idx = hand[8]; // index finger tip
                            cursor.style.display = 'block';
                            cursor.style.left = ((1 - idx.x) * window.innerWidth) + 'px';
                            cursor.style.top = (idx.y * window.innerHeight) + 'px';
                        }
                    } else {
                        ar.hand.visible = false;
                        const cursor = document.getElementById('arHandCursor');
                        if (cursor) cursor.style.display = 'none';
                        const hc = document.getElementById('arHandCanvas');
                        const hctx = hc ? hc.getContext('2d') : null;
                        if (hctx) hctx.clearRect(0, 0, hc.width, hc.height);
                    }
                } catch(e) { /* skip frame */ }
            }

            // Smooth interpolation
            const s = 0.12; // smoothing factor
            ar.smoothFace.x += (ar.face.x - ar.smoothFace.x) * s;
            ar.smoothFace.y += (ar.face.y - ar.smoothFace.y) * s;
            ar.smoothFace.z += (ar.face.z - ar.smoothFace.z) * s;
            ar.smoothHand.x += (ar.hand.x - ar.smoothHand.x) * 0.15;
            ar.smoothHand.y += (ar.hand.y - ar.smoothHand.y) * 0.15;

            if (Math.random() < 0.005) {
                const msgs = [
                    'NEURAL NET: STABLE', 'QUANTUM SYNC: OK', 'MEMORY: ' + (Math.random()*100).toFixed(0) + '% ALLOCATED',
                    'SCAN CYCLE: ' + (Math.random()*1000).toFixed(0) + 'ms', 'OPTICAL FEED: NOMINAL',
                    'HAND CONFIDENCE: ' + (85 + Math.random()*15).toFixed(0) + '%',
                    'FACE MESH: 468 LANDMARKS', 'GPU LOAD: ' + (30 + Math.random()*40).toFixed(0) + '%'
                ];
                arLog(msgs[Math.floor(Math.random() * msgs.length)], 'DAT');
            }

            requestAnimationFrame(track);
        }

        requestAnimationFrame(track);
        return true;
    }

    trigger.addEventListener('click', () => {
        // Direct navigation — ensures camera works on mobile (iOS Safari blocks iframe getUserMedia)
        window.location.href = 'jarvis-hud.html';
    });
})();

// === FEATURE: Typewriter Identity Rotation ===
(function() {
    const el = document.getElementById('typewriterTarget');
    if (!el) return;
    const phrases = [
        '连接科技与人的桥',
        '硅基物语创始人',
        '爱奥创 CEO',
        '科技内容创作者',
        'AI 硬件出海实践者'
    ];
    let phraseIdx = 0;
    let charIdx = 0;
    let deleting = false;
    const cursor = el.querySelector('.typewriter-cursor');

    function tick() {
        const current = phrases[phraseIdx];
        if (!deleting) {
            charIdx++;
            if (charIdx > current.length) {
                setTimeout(() => { deleting = true; tick(); }, 2500);
                return;
            }
        } else {
            charIdx--;
            if (charIdx < 0) {
                charIdx = 0;
                deleting = false;
                phraseIdx = (phraseIdx + 1) % phrases.length;
            }
        }
        el.textContent = current.substring(0, charIdx);
        el.appendChild(cursor);
        setTimeout(tick, deleting ? 40 : 80);
    }

    // Start after initial fade-in animation completes
    setTimeout(() => {
        deleting = true;
        charIdx = phrases[0].length;
        tick();
    }, 3000);
})();

// === FEATURE: Video Cover → Click to Play ===
document.querySelectorAll('.video-cover').forEach(cover => {
    cover.addEventListener('click', () => {
        const bvid = cover.dataset.bvid;
        const iframe = document.createElement('iframe');
        iframe.src = `https://player.bilibili.com/player.html?bvid=${bvid}&page=1&high_quality=1&danmaku=0&dm=0&autoplay=1`;
        iframe.style.cssText = 'width:100%;aspect-ratio:16/9;display:block;border:none;';
        iframe.allow = 'accelerometer;autoplay;clipboard-write;encrypted-media;gyroscope;picture-in-picture';
        iframe.allowFullscreen = true;
        cover.replaceWith(iframe);
    });
});

// === FEATURE: Product Video Cover → Click to Play ===
document.querySelectorAll('.product-video-cover').forEach(cover => {
    cover.addEventListener('click', () => {
        const src = cover.dataset.video;
        const video = document.createElement('video');
        video.src = src;
        video.controls = true;
        video.autoplay = true;
        video.playsInline = true;
        video.style.cssText = 'width:100%;aspect-ratio:16/9;display:block;object-fit:cover;background:#000;';
        cover.replaceWith(video);
    });
});

// === FEATURE: Cmd+K Command Palette ===
(function() {
    const overlay = document.getElementById('cmdPalette');
    const input = document.getElementById('cmdInput');
    const list = document.getElementById('cmdList');

    const commands = [
        { icon: '🏠', label: '首页', action: () => { window.scrollTo({top:0,behavior:'smooth'}); } },
        { icon: '👤', label: '关于我', action: () => document.getElementById('about').scrollIntoView({behavior:'smooth'}) },
        { icon: '📡', label: '内容领域', action: () => document.getElementById('topics').scrollIntoView({behavior:'smooth'}) },
        { icon: '🤝', label: '合作', action: () => document.getElementById('collab').scrollIntoView({behavior:'smooth'}) },
        { icon: '🎯', label: '开启 Jarvis 交互', action: () => { window.location.href = 'jarvis-hud.html'; } },
        { icon: '▶️', label: 'YouTube 频道', shortcut: '↗', action: () => window.open('https://www.youtube.com/@The-Tech-Bridge','_blank') },
        { icon: '📺', label: 'Bilibili', shortcut: '↗', action: () => window.open('https://b23.tv/jvOokV7','_blank') },
        { icon: '𝕏', label: 'X / Twitter', shortcut: '↗', action: () => window.open('https://x.com/TechBridgeZ','_blank') },
        { icon: '🎵', label: 'TikTok / 抖音', shortcut: '↗', action: () => window.open('https://www.tiktok.com/@techbridgez','_blank') },
        { icon: '💬', label: '添加微信', action: () => { const m = document.querySelector('.wechat-modal'); if(m) m.classList.add('open'); } },
        { icon: '☕', label: 'Buy Me a Coffee', shortcut: '↗', action: () => window.open('https://buymeacoffee.com/cyberbayes','_blank') },
    ];

    let activeIdx = 0;
    let filtered = [...commands];

    function render() {
        list.innerHTML = filtered.map((cmd, i) => `
            <div class="cmd-palette-item ${i === activeIdx ? 'active' : ''}" data-idx="${i}">
                <span class="cmd-icon">${cmd.icon}</span>
                <span>${cmd.label}</span>
                ${cmd.shortcut ? `<span class="cmd-shortcut">${cmd.shortcut}</span>` : ''}
            </div>
        `).join('');

        list.querySelectorAll('.cmd-palette-item').forEach(el => {
            el.addEventListener('click', () => {
                const idx = parseInt(el.dataset.idx);
                close();
                filtered[idx].action();
            });
            el.addEventListener('mouseenter', () => {
                activeIdx = parseInt(el.dataset.idx);
                render();
            });
        });
    }

    function open() {
        overlay.classList.add('open');
        input.value = '';
        filtered = [...commands];
        activeIdx = 0;
        render();
        setTimeout(() => input.focus(), 50);
    }

    function close() {
        overlay.classList.remove('open');
    }

    // Cmd+K / Ctrl+K
    document.addEventListener('keydown', e => {
        if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
            e.preventDefault();
            overlay.classList.contains('open') ? close() : open();
        }
        if (!overlay.classList.contains('open')) return;
        if (e.key === 'Escape') close();
        if (e.key === 'ArrowDown') { e.preventDefault(); activeIdx = (activeIdx + 1) % filtered.length; render(); }
        if (e.key === 'ArrowUp') { e.preventDefault(); activeIdx = (activeIdx - 1 + filtered.length) % filtered.length; render(); }
        if (e.key === 'Enter' && filtered.length) { close(); filtered[activeIdx].action(); }
    });

    overlay.addEventListener('click', e => { if (e.target === overlay) close(); });

    input.addEventListener('input', () => {
        const q = input.value.toLowerCase();
        filtered = commands.filter(c => c.label.toLowerCase().includes(q));
        activeIdx = 0;
        render();
    });
})();

// === FEATURE: Konami Code Easter Egg ===
(function() {
    const code = ['ArrowUp','ArrowUp','ArrowDown','ArrowDown','ArrowLeft','ArrowRight','ArrowLeft','ArrowRight','b','a'];
    let pos = 0;
    document.addEventListener('keydown', e => {
        if (e.key === code[pos]) {
            pos++;
            if (pos === code.length) {
                pos = 0;
                // Trigger celebration
                document.body.classList.add('konami-active');
                setTimeout(() => document.body.classList.remove('konami-active'), 600);
                // Spawn particles
                for (let i = 0; i < 60; i++) {
                    const p = document.createElement('div');
                    const x = Math.random() * 100;
                    const y = Math.random() * 100;
                    const size = 4 + Math.random() * 8;
                    const hue = Math.random() * 60 + 10; // orange-ish
                    const dur = 1 + Math.random() * 1.5;
                    p.style.cssText = `position:fixed;left:${x}vw;top:${y}vh;width:${size}px;height:${size}px;border-radius:50%;background:hsl(${hue},90%,60%);z-index:99999;pointer-events:none;animation:konamiParticle ${dur}s ease-out forwards;`;
                    document.body.appendChild(p);
                    setTimeout(() => p.remove(), dur * 1000);
                }
                // Add particle animation if not exists
                if (!document.getElementById('konamiStyle')) {
                    const s = document.createElement('style');
                    s.id = 'konamiStyle';
                    s.textContent = `@keyframes konamiParticle { 0%{opacity:1;transform:scale(1)} 100%{opacity:0;transform:scale(0) translateY(-200px)} }`;
                    document.head.appendChild(s);
                }
            }
        } else {
            pos = 0;
        }
    });
})();
