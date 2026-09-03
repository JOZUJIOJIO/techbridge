/*
 * BTX emotional bot for qiaobit.com.
 *
 * The deterministic sampling and radial-profile morphing approach is adapted
 * from bloub by Jeremy Perret (MIT). The BTX shapes, palette, face and event
 * mapping are original to Tech Bridge. See THIRD_PARTY_NOTICES.md.
 */

export const BTX_STATE_IDS = Object.freeze([
    'idle',
    'thinking',
    'wink',
    'wide',
    'alert',
    'notify',
    'exclaim',
    'sleep',
    'egg',
    'hexagon',
    'play',
    'orbit',
    'burst',
    'comet',
    'swirl'
]);

export const BTX_MOOD_IDS = Object.freeze([
    'neutral',
    'attentive',
    'surprised',
    'excited',
    'happy',
    'laughing',
    'angry',
    'sad',
    'scared',
    'suspicious',
    'confused',
    'curious',
    'proud',
    'shy',
    'bored',
    'sleepy'
]);

const PROFILE_SAMPLES = 48;
const TRANSITION_MS = 440;
const ACTIVE_WINDOW_MS = 90000;
const POINTER_MEMORY_MS = 1800;
const TAU = Math.PI * 2;

const STATE_DURATIONS = Object.freeze({
    idle: 2600,
    thinking: 2200,
    wink: 1600,
    wide: 1800,
    alert: 2100,
    notify: 2200,
    exclaim: 1900,
    sleep: 2400,
    egg: 1700,
    hexagon: 1700,
    play: 1900,
    orbit: 3400,
    burst: 2500,
    comet: 2400,
    swirl: 1800
});

const AUTO_SEQUENCE = Object.freeze([
    ['idle', 'neutral'],
    ['thinking', 'attentive'],
    ['wink', 'happy'],
    ['wide', 'curious'],
    ['notify', 'excited'],
    ['egg', 'shy'],
    ['hexagon', 'confused'],
    ['play', 'proud'],
    ['orbit', 'excited'],
    ['burst', 'laughing'],
    ['comet', 'curious'],
    ['exclaim', 'surprised'],
    ['alert', 'attentive'],
    ['sleep', 'sleepy']
]);

const MOODS = Object.freeze({
    neutral:    { split: 36, eyeW: 14, eyeH: 31, tilt: 0,  eyeY: -12, roll: -3, open: 1 },
    attentive:  { split: 36, eyeW: 13, eyeH: 35, tilt: 0,  eyeY: -14, roll: -1, open: 1 },
    surprised:  { split: 39, eyeW: 25, eyeH: 27, tilt: 0,  eyeY: -10, roll: 0,  open: 1 },
    excited:    { split: 40, eyeW: 22, eyeH: 31, tilt: -8, eyeY: -14, roll: 2,  open: 1 },
    happy:      { split: 36, eyeW: 22, eyeH: 10, tilt: 12, eyeY: -8,  roll: 0,  open: 1 },
    laughing:   { split: 38, eyeW: 27, eyeH: 8,  tilt: 18, eyeY: -5,  roll: 2,  open: 1 },
    angry:      { split: 36, eyeW: 23, eyeH: 10, tilt: 28, eyeY: -10, roll: 0,  open: 1 },
    sad:        { split: 34, eyeW: 17, eyeH: 27, tilt: -25,eyeY: -5,  roll: -4, open: 1 },
    scared:     { split: 42, eyeW: 25, eyeH: 38, tilt: 0,  eyeY: -6,  roll: 0,  open: 1 },
    suspicious: { split: 34, eyeW: 18, eyeH: 23, tilt: 8,  eyeY: -10, roll: -6, open: 1 },
    confused:   { split: 35, eyeW: 18, eyeH: 27, tilt: -12,eyeY: -8,  roll: 9,  open: 1 },
    curious:    { split: 36, eyeW: 17, eyeH: 32, tilt: -7, eyeY: -14, roll: -11,open: 1 },
    proud:      { split: 36, eyeW: 23, eyeH: 9,  tilt: 15, eyeY: -3,  roll: 0,  open: 1 },
    shy:        { split: 30, eyeW: 13, eyeH: 24, tilt: 0,  eyeY: -3,  roll: -7, open: 1 },
    bored:      { split: 36, eyeW: 23, eyeH: 8,  tilt: 0,  eyeY: -8,  roll: 0,  open: 1 },
    sleepy:     { split: 34, eyeW: 17, eyeH: 26, tilt: 0,  eyeY: -4,  roll: -3, open: 0.42 }
});

function clamp(value, min = 0, max = 1) {
    return Math.max(min, Math.min(max, value));
}

function lerp(a, b, amount) {
    return a + (b - a) * amount;
}

function easeOutQuint(value) {
    const t = 1 - clamp(value);
    return 1 - t * t * t * t * t;
}

function easeInOutCubic(value) {
    const t = clamp(value);
    return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

function smoothPulse(value, start, end, edge = 0.16) {
    if (value <= start || value >= end) return 0;
    const enter = clamp((value - start) / edge);
    const leave = clamp((end - value) / edge);
    return Math.min(easeOutQuint(enter), easeOutQuint(leave));
}

function polygonRadius(sides, angle, rotation) {
    const sector = TAU / sides;
    const local = ((angle - rotation + sector / 2) % sector + sector) % sector - sector / 2;
    return Math.cos(Math.PI / sides) / Math.cos(local);
}

function profileRadius(shape, angle, time) {
    const organic = 1 + Math.sin(angle * 3 + time * 1.4) * 0.012 + Math.cos(angle * 5 - time) * 0.008;
    if (shape === 'egg') return organic * (0.91 + 0.07 * Math.sin(angle));
    if (shape === 'hexagon') return organic * polygonRadius(6, angle, Math.PI / 6) * 1.04;
    if (shape === 'triangle') return organic * polygonRadius(3, angle, -Math.PI / 2) * 0.93;
    if (shape === 'drop') return organic * (0.9 + 0.12 * Math.sin(angle) - 0.04 * Math.cos(angle * 2));
    if (shape === 'swirl') return organic * (1 + 0.08 * Math.sin(angle * 2 - time * 5));
    return organic;
}

function makeProfile(shape, time) {
    return Array.from({ length: PROFILE_SAMPLES }, (_, index) => {
        const angle = (index / PROFILE_SAMPLES) * TAU - Math.PI / 2;
        return profileRadius(shape, angle, time);
    });
}

function moodFor(id) {
    return MOODS[id] || MOODS.neutral;
}

function eyesForMood(id) {
    const mood = moodFor(id);
    return [
        { x: -mood.split / 2, y: mood.eyeY, w: mood.eyeW, h: mood.eyeH, tilt: mood.tilt, open: mood.open },
        { x: mood.split / 2, y: mood.eyeY, w: mood.eyeW, h: mood.eyeH, tilt: -mood.tilt, open: mood.open }
    ];
}

export function sampleBTXPose(stateId, seconds, moodId = 'neutral') {
    const state = BTX_STATE_IDS.includes(stateId) ? stateId : 'idle';
    const time = Number.isFinite(seconds) ? Math.max(0, seconds) : 0;
    const mood = BTX_MOOD_IDS.includes(moodId) ? moodId : 'neutral';
    const breath = Math.sin(time * 2.1) * 0.012;
    let shape = 'circle';
    let rx = 59 * (1 + breath);
    let ry = 57 * (1 - breath * 0.35);
    let y = 1;
    let roll = moodFor(mood).roll;
    let faceAlpha = 1;
    let bodyAlpha = 1;
    let bodySpin = 0;
    let expression = mood;
    let eyes = eyesForMood(expression);

    if (state === 'thinking') {
        rx *= 0.94;
        ry *= 0.94;
        expression = 'attentive';
        eyes = eyesForMood(expression);
    } else if (state === 'wink') {
        expression = mood === 'neutral' ? 'happy' : mood;
        eyes = eyesForMood(expression);
        eyes[0].open = 0.08 + Math.abs(Math.cos(time * 5.4)) * 0.15;
        roll -= 6;
    } else if (state === 'wide') {
        expression = mood === 'neutral' ? 'surprised' : mood;
        eyes = eyesForMood(expression);
        rx *= 1.03;
        ry *= 1.02;
    } else if (state === 'alert') {
        rx = 19;
        ry = 62;
        y = -13;
        roll = Math.sin(time * 5) * 2;
        faceAlpha = 0;
    } else if (state === 'notify') {
        expression = mood === 'neutral' ? 'excited' : mood;
        eyes = eyesForMood(expression);
        rx *= 1.02;
    } else if (state === 'exclaim') {
        shape = 'drop';
        rx = 31;
        ry = 55;
        y = -9;
        roll = -20;
        faceAlpha = 0;
    } else if (state === 'sleep') {
        expression = 'sleepy';
        eyes = eyesForMood(expression);
        y = 4 + Math.sin(time * 1.4) * 2;
    } else if (state === 'egg') {
        shape = 'egg';
        rx = 51;
        ry = 61;
        expression = mood === 'neutral' ? 'shy' : mood;
        eyes = eyesForMood(expression);
    } else if (state === 'hexagon') {
        shape = 'hexagon';
        rx = 58;
        ry = 58;
        expression = mood === 'neutral' ? 'confused' : mood;
        eyes = eyesForMood(expression);
    } else if (state === 'play') {
        shape = 'triangle';
        rx = 60;
        ry = 58;
        roll = 90;
        faceAlpha = 0;
    } else if (state === 'orbit') {
        expression = mood === 'neutral' ? 'excited' : mood;
        eyes = eyesForMood(expression);
        rx = 51;
        ry = 50;
    } else if (state === 'burst') {
        expression = mood === 'neutral' ? 'laughing' : mood;
        eyes = eyesForMood(expression);
        rx = 45 + Math.sin(time * 5) * 3;
        ry = 44 + Math.sin(time * 5) * 3;
    } else if (state === 'comet') {
        shape = 'drop';
        rx = 14;
        ry = 14;
        roll = -35;
        faceAlpha = 0;
    } else if (state === 'swirl') {
        shape = 'swirl';
        rx = lerp(23, 58, easeOutQuint(time / 1.2));
        ry = rx;
        bodySpin = TAU * (1 - easeInOutCubic(clamp(time / 1.4)));
        expression = mood === 'neutral' ? 'curious' : mood;
        eyes = eyesForMood(expression);
    }

    return {
        state,
        mood: expression,
        profile: makeProfile(shape, time),
        rx,
        ry,
        x: 0,
        y,
        roll,
        bodySpin,
        bodyAlpha,
        faceAlpha,
        eyes,
        decor: state,
        decorTime: time
    };
}

function blendEye(from, to, amount) {
    return {
        x: lerp(from.x, to.x, amount),
        y: lerp(from.y, to.y, amount),
        w: lerp(from.w, to.w, amount),
        h: lerp(from.h, to.h, amount),
        tilt: lerp(from.tilt, to.tilt, amount),
        open: lerp(from.open, to.open, amount)
    };
}

export function blendBTXPoses(from, to, amount) {
    const mix = clamp(amount);
    return {
        ...to,
        profile: to.profile.map((radius, index) => lerp(from.profile[index] ?? radius, radius, mix)),
        rx: lerp(from.rx, to.rx, mix),
        ry: lerp(from.ry, to.ry, mix),
        x: lerp(from.x, to.x, mix),
        y: lerp(from.y, to.y, mix),
        roll: lerp(from.roll, to.roll, mix),
        bodySpin: lerp(from.bodySpin, to.bodySpin, mix),
        bodyAlpha: lerp(from.bodyAlpha, to.bodyAlpha, mix),
        faceAlpha: lerp(from.faceAlpha, to.faceAlpha, mix),
        eyes: [blendEye(from.eyes[0], to.eyes[0], mix), blendEye(from.eyes[1], to.eyes[1], mix)]
    };
}

export function isFiniteBTXPose(pose) {
    const values = [pose.rx, pose.ry, pose.x, pose.y, pose.roll, pose.bodySpin, pose.bodyAlpha, pose.faceAlpha];
    pose.profile.forEach((value) => values.push(value));
    pose.eyes.forEach((eye) => values.push(eye.x, eye.y, eye.w, eye.h, eye.tilt, eye.open));
    return values.every(Number.isFinite);
}

function roundedCapsule(ctx, x, y, width, height, rotation, color, alpha) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(rotation);
    ctx.globalAlpha *= alpha;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.roundRect(-width / 2, -height / 2, width, Math.max(1, height), Math.min(width, Math.max(1, height)) / 2);
    ctx.fill();
    ctx.restore();
}

function profilePath(ctx, profile, rx, ry) {
    const points = profile.map((radius, index) => {
        const angle = (index / profile.length) * TAU - Math.PI / 2;
        return { x: Math.cos(angle) * rx * radius, y: Math.sin(angle) * ry * radius };
    });
    ctx.beginPath();
    const first = points[0];
    const second = points[1];
    ctx.moveTo((first.x + second.x) / 2, (first.y + second.y) / 2);
    for (let index = 1; index <= points.length; index += 1) {
        const point = points[index % points.length];
        const next = points[(index + 1) % points.length];
        ctx.quadraticCurveTo(point.x, point.y, (point.x + next.x) / 2, (point.y + next.y) / 2);
    }
    ctx.closePath();
}

function brandGradient(ctx, pose) {
    const gradient = ctx.createLinearGradient(-pose.rx, -pose.ry, pose.rx, pose.ry);
    gradient.addColorStop(0, '#087f7c');
    gradient.addColorStop(0.46, '#0a5d5d');
    gradient.addColorStop(0.7, '#8f4c22');
    gradient.addColorStop(1, '#e95d21');
    return gradient;
}

function orbitGradient(ctx, phase) {
    const gradient = ctx.createLinearGradient(-92, -70, 92, 70);
    gradient.addColorStop(0, '#00b8b0');
    gradient.addColorStop(clamp(0.45 + Math.sin(phase) * 0.08), '#f1c44f');
    gradient.addColorStop(1, '#ff6c33');
    return gradient;
}

function drawOrbit(ctx, time, alpha, front) {
    if (alpha <= 0.001) return;
    ctx.save();
    ctx.globalAlpha *= alpha * (front ? 0.95 : 0.45);
    ctx.lineCap = 'round';
    for (let index = 0; index < 5; index += 1) {
        const phase = time * (1.45 + index * 0.12) + index * 0.92;
        ctx.save();
        ctx.rotate(-0.55 + index * 0.25);
        ctx.strokeStyle = orbitGradient(ctx, phase);
        ctx.lineWidth = 2.2 + index * 0.16;
        ctx.beginPath();
        ctx.ellipse(0, 4, 72 - index * 2.4, 21 + index * 3, 0, front ? phase : phase + Math.PI, front ? phase + Math.PI * 0.86 : phase + Math.PI * 1.86);
        ctx.stroke();
        ctx.restore();
    }
    ctx.restore();
}

function drawBurst(ctx, time, alpha) {
    if (alpha <= 0.001) return;
    ctx.save();
    ctx.globalAlpha *= alpha;
    for (let index = 0; index < 11; index += 1) {
        const phase = (index / 11) * TAU + time * 0.9;
        const wave = (time * 0.72 + index * 0.11) % 1;
        const distance = 48 + wave * 48;
        const size = 4.8 * (1 - wave) + 1.4;
        ctx.fillStyle = index % 2 ? '#14b8b1' : '#f07a36';
        ctx.globalAlpha = alpha * (1 - wave);
        ctx.beginPath();
        ctx.arc(Math.cos(phase) * distance, Math.sin(phase) * distance, size, 0, TAU);
        ctx.fill();
    }
    ctx.restore();
}

function drawComet(ctx, time, alpha, front) {
    if (alpha <= 0.001) return;
    ctx.save();
    ctx.globalAlpha *= alpha * (front ? 0.9 : 0.5);
    ctx.rotate(0.58);
    for (let index = 0; index < 4; index += 1) {
        ctx.strokeStyle = index % 2 ? '#00b8b0' : '#ff7438';
        ctx.lineWidth = 5 - index * 0.65;
        ctx.lineCap = 'round';
        ctx.beginPath();
        const phase = time * 2.2 - index * 0.22;
        ctx.ellipse(-1, 0, 73 + index * 2, 14 + index * 1.5, 0, front ? phase : phase + Math.PI, front ? phase + 1.7 : phase + Math.PI + 1.7);
        ctx.stroke();
    }
    ctx.restore();
}

function drawDecor(ctx, decor, time, alpha, layer) {
    if (alpha <= 0.001) return;
    ctx.save();
    if (decor === 'orbit' || decor === 'swirl') drawOrbit(ctx, time, alpha, layer === 'front');
    if (decor === 'comet') drawComet(ctx, time, alpha, layer === 'front');
    if (decor === 'burst' && layer === 'back') drawBurst(ctx, time, alpha);
    if (layer !== 'front') {
        ctx.restore();
        return;
    }

    if (decor === 'thinking') {
        [-22, 0, 22].forEach((x, index) => {
            const bounce = Math.sin(time * 5 - index * 0.9) * 5;
            ctx.globalAlpha = alpha * (0.55 + index * 0.2);
            ctx.fillStyle = '#fff9ef';
            ctx.beginPath();
            ctx.arc(x, 10 + bounce, 5 + index * 0.8, 0, TAU);
            ctx.fill();
        });
    }

    if (decor === 'alert') {
        ctx.globalAlpha = alpha;
        ctx.fillStyle = '#ff7b3d';
        ctx.beginPath();
        ctx.arc(0, 72, 11, 0, TAU);
        ctx.fill();
    }

    if (decor === 'exclaim') {
        ctx.globalAlpha = alpha;
        ctx.fillStyle = '#fff9ef';
        ctx.beginPath();
        ctx.roundRect(-5, -31, 10, 39, 5);
        ctx.fill();
        ctx.beginPath();
        ctx.arc(0, 23, 6, 0, TAU);
        ctx.fill();
    }

    if (decor === 'notify') {
        const pop = 0.88 + Math.sin(Math.min(time * 8, Math.PI / 2)) * 0.12;
        ctx.save();
        ctx.translate(49, -47);
        ctx.scale(pop, pop);
        ctx.globalAlpha = alpha;
        ctx.fillStyle = '#1aa9a2';
        ctx.strokeStyle = '#fff9ef';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(0, 0, 13, 0, TAU);
        ctx.fill();
        ctx.stroke();
        ctx.strokeStyle = '#fff9ef';
        ctx.lineWidth = 2.4;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(-5, 0);
        ctx.lineTo(-1, 4);
        ctx.lineTo(6, -5);
        ctx.stroke();
        ctx.restore();
    }

    if (decor === 'sleep') {
        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.fillStyle = '#e9a933';
        ctx.font = '700 15px JetBrains Mono, monospace';
        ctx.fillText('z', 42, -38 - ((time * 12) % 16));
        ctx.font = '700 21px JetBrains Mono, monospace';
        ctx.fillText('Z', 57, -54 - ((time * 9) % 20));
        ctx.restore();
    }

    if (decor === 'play') {
        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.fillStyle = '#fff9ef';
        ctx.rotate(-Math.PI / 2);
        ctx.beginPath();
        ctx.moveTo(-12, -17);
        ctx.lineTo(19, 0);
        ctx.lineTo(-12, 17);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
    }
    ctx.restore();
}

function prepareCanvas(canvas, dpr) {
    const box = canvas.getBoundingClientRect();
    const width = Math.max(1, Math.round(box.width));
    const height = Math.max(1, Math.round(box.height));
    const pixelWidth = Math.round(width * dpr);
    const pixelHeight = Math.round(height * dpr);
    if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) {
        canvas.width = pixelWidth;
        canvas.height = pixelHeight;
    }
    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);
    return { ctx, width, height, box };
}

function drawBridgeMark(ctx, alpha) {
    ctx.save();
    ctx.globalAlpha *= alpha * 0.75;
    ctx.strokeStyle = '#fff9ef';
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(-18, 21);
    ctx.quadraticCurveTo(0, 12, 18, 21);
    ctx.stroke();
    ctx.restore();
}

function drawEye(ctx, eye, lookX, lookY, faceAlpha, state) {
    const height = Math.max(1, eye.h * clamp(eye.open));
    roundedCapsule(ctx, eye.x + lookX, eye.y + lookY, eye.w, height, eye.tilt * Math.PI / 180, '#fff9ef', faceAlpha);
    if (state === 'happy' || height < 9 || faceAlpha < 0.15) return;
    ctx.save();
    ctx.globalAlpha *= faceAlpha * clamp((height - 7) / 18);
    ctx.fillStyle = '#092c2d';
    ctx.beginPath();
    ctx.arc(eye.x + lookX * 1.3, eye.y + lookY * 1.3, Math.min(4.2, eye.w * 0.22), 0, TAU);
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.globalAlpha *= 0.82;
    ctx.beginPath();
    ctx.arc(eye.x + lookX * 1.3 - 1.2, eye.y + lookY * 1.3 - 1.4, 1.1, 0, TAU);
    ctx.fill();
    ctx.restore();
}

function drawFrame(canvas, frame, pointer, pointerAge, now, dpr) {
    const prepared = prepareCanvas(canvas, dpr);
    const { ctx, width, height, box } = prepared;
    const scale = Math.min(width, height) / 190;
    const pose = frame.pose;
    const seconds = now / 1000;

    ctx.save();
    ctx.translate(width / 2, height / 2 + 2 * scale);
    ctx.scale(scale, scale);

    const halo = ctx.createRadialGradient(0, 4, 8, 0, 4, 88);
    halo.addColorStop(0, 'rgba(0,184,176,0.22)');
    halo.addColorStop(0.58, 'rgba(233,93,33,0.08)');
    halo.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = halo;
    ctx.beginPath();
    ctx.arc(0, 4, 88, 0, TAU);
    ctx.fill();

    drawDecor(ctx, frame.previousDecor, frame.previousDecorTime, 1 - frame.decorMix, 'back');
    drawDecor(ctx, pose.decor, pose.decorTime, frame.decorMix, 'back');

    ctx.save();
    ctx.translate(pose.x, pose.y);
    ctx.rotate((pose.roll * Math.PI / 180) + pose.bodySpin);
    ctx.shadowColor = 'rgba(0, 0, 0, 0.42)';
    ctx.shadowBlur = 14;
    ctx.globalAlpha = pose.bodyAlpha;
    profilePath(ctx, pose.profile, pose.rx, pose.ry);
    ctx.fillStyle = brandGradient(ctx, pose);
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.strokeStyle = 'rgba(255,249,239,0.28)';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    let targetX = 0;
    let targetY = 0;
    if (pointerAge < POINTER_MEMORY_MS && box.width > 0 && box.height > 0) {
        targetX = clamp((pointer.x - (box.left + box.width / 2)) / Math.max(box.width, 1), -1, 1) * 7;
        targetY = clamp((pointer.y - (box.top + box.height / 2)) / Math.max(box.height, 1), -1, 1) * 5;
    } else {
        targetX = Math.sin(seconds * 0.87) * 3.4;
        targetY = Math.cos(seconds * 0.71) * 2.1;
    }

    const blink = pose.state === 'idle' ? 1 - smoothPulse((seconds % 4.6), 4.1, 4.38, 0.12) * 0.94 : 1;
    pose.eyes.forEach((eye) => drawEye(ctx, { ...eye, open: eye.open * blink }, targetX, targetY, pose.faceAlpha, pose.mood));
    if (pose.faceAlpha > 0.3 && !['thinking', 'sleep'].includes(pose.state)) drawBridgeMark(ctx, pose.faceAlpha);
    ctx.restore();

    drawDecor(ctx, frame.previousDecor, frame.previousDecorTime, 1 - frame.decorMix, 'front');
    drawDecor(ctx, pose.decor, pose.decorTime, frame.decorMix, 'front');
    ctx.restore();
    canvas.dataset.btxState = pose.state;
    canvas.dataset.btxMood = pose.mood;
}

function bootBTXBot() {
    const canvases = Array.from(document.querySelectorAll('[data-btx-morph]'));
    if (!canvases.length) return;

    const reducedQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const pointer = { x: window.innerWidth / 2, y: window.innerHeight / 2, at: 0 };
    const initialNow = performance.now();
    const runtime = {
        state: 'idle',
        mood: 'neutral',
        stateStartedAt: initialNow,
        transitionStartedAt: initialNow,
        fromPose: sampleBTXPose('idle', 0, 'neutral'),
        previousDecor: 'idle',
        previousDecorTime: 0,
        nextAutoAt: initialNow + STATE_DURATIONS.idle,
        autoIndex: 0,
        activeUntil: initialNow + 6000,
        raf: 0
    };

    function currentFrame(now) {
        const seconds = Math.max(0, now - runtime.stateStartedAt) / 1000;
        const target = sampleBTXPose(runtime.state, seconds, runtime.mood);
        const decorMix = reducedQuery.matches ? 1 : easeOutQuint((now - runtime.transitionStartedAt) / TRANSITION_MS);
        return {
            pose: blendBTXPoses(runtime.fromPose, target, decorMix),
            previousDecor: runtime.previousDecor,
            previousDecorTime: runtime.previousDecorTime,
            decorMix
        };
    }

    function setState(state, mood, duration) {
        if (!BTX_STATE_IDS.includes(state)) return;
        const now = performance.now();
        const snapshot = currentFrame(now);
        runtime.fromPose = snapshot.pose;
        runtime.previousDecor = snapshot.pose.decor;
        runtime.previousDecorTime = snapshot.pose.decorTime;
        runtime.state = state;
        runtime.mood = BTX_MOOD_IDS.includes(mood) ? mood : runtime.mood;
        runtime.stateStartedAt = now;
        runtime.transitionStartedAt = now;
        runtime.nextAutoAt = now + (duration || STATE_DURATIONS[state] || 2200);
        runtime.activeUntil = Math.max(runtime.activeUntil, now + (duration || 3200));
        start();
    }

    function advanceAuto(now) {
        if (now < runtime.nextAutoAt) return;
        runtime.autoIndex = (runtime.autoIndex + 1) % AUTO_SEQUENCE.length;
        const [state, mood] = AUTO_SEQUENCE[runtime.autoIndex];
        setState(state, mood, STATE_DURATIONS[state]);
    }

    function canvasIsVisible(canvas) {
        const box = canvas.getBoundingClientRect();
        return box.width > 0 && box.height > 0 && box.bottom > -40 && box.top < window.innerHeight + 40;
    }

    function render(now) {
        runtime.raf = 0;
        const visible = canvases.some(canvasIsVisible);
        if (!visible || document.visibilityState === 'hidden') return;
        if (!reducedQuery.matches) advanceAuto(now);
        const frame = currentFrame(now);
        canvases.forEach((canvas) => {
            if (canvasIsVisible(canvas)) drawFrame(canvas, frame, pointer, now - pointer.at, now, dpr);
        });
        if (!reducedQuery.matches && now < runtime.activeUntil) start();
    }

    function start() {
        if (!runtime.raf && document.visibilityState !== 'hidden') runtime.raf = window.requestAnimationFrame(render);
    }

    function wake(duration = 5000) {
        runtime.activeUntil = Math.max(runtime.activeUntil, performance.now() + duration);
        start();
    }

    window.addEventListener('pointermove', (event) => {
        pointer.x = event.clientX;
        pointer.y = event.clientY;
        pointer.at = performance.now();
        wake(1200);
    }, { passive: true });

    window.addEventListener('btx:emotion', (event) => {
        const detail = event.detail || {};
        setState(detail.state || 'idle', detail.mood || 'neutral', detail.duration);
    });

    const trigger = document.getElementById('floatingSubscribe');
    const layer = document.getElementById('btxChatLayer');
    if (trigger) {
        trigger.addEventListener('btx:reveal', () => setState('swirl', 'curious', 2400));
        trigger.addEventListener('pointerenter', () => setState('wide', 'curious', 1800));
        trigger.addEventListener('pointerdown', () => setState('burst', 'excited', 2600));
        trigger.addEventListener('focus', () => setState('notify', 'attentive', 2000));
    }

    if (layer && 'MutationObserver' in window) {
        new MutationObserver(() => {
            if (layer.classList.contains('is-open')) setState('swirl', 'happy', 3200);
            else wake(2200);
        }).observe(layer, { attributes: true, attributeFilter: ['class'] });
    }

    if ('MutationObserver' in window && trigger) {
        new MutationObserver(() => {
            if (!trigger.classList.contains('is-context-hidden')) {
                runtime.activeUntil = performance.now() + ACTIVE_WINDOW_MS;
                start();
            }
        }).observe(trigger, { attributes: true, attributeFilter: ['class'] });
    }

    const onReducedChange = () => {
        runtime.fromPose = sampleBTXPose('idle', 0.8, 'attentive');
        runtime.state = 'idle';
        runtime.mood = 'attentive';
        runtime.stateStartedAt = performance.now() - 800;
        runtime.transitionStartedAt = runtime.stateStartedAt;
        runtime.activeUntil = performance.now() + 1000;
        start();
    };
    if (reducedQuery.addEventListener) reducedQuery.addEventListener('change', onReducedChange);
    else reducedQuery.addListener(onReducedChange);

    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') wake(3000);
    });

    window.BTXBot = Object.freeze({
        setState,
        wake,
        states: BTX_STATE_IDS,
        moods: BTX_MOOD_IDS,
        getState: () => ({ state: runtime.state, mood: runtime.mood })
    });

    if (reducedQuery.matches) onReducedChange();
    else setState('swirl', 'curious', 2200);
}

if (typeof window !== 'undefined' && typeof document !== 'undefined') bootBTXBot();
