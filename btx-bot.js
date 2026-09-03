/*
 * BTX emotional bot for qiaobit.com.
 *
 * Adapted from bloub by Jeremy Perret (MIT). This integration keeps the
 * upstream default ink/paper palette, measured silhouettes and state language,
 * then connects them to the Tech Bridge reception flow. See THIRD_PARTY_NOTICES.md.
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

const PROFILE_SAMPLES = 64;
const TRANSITION_MS = 440;
const ACTIVE_WINDOW_MS = 90000;
const POINTER_MEMORY_MS = 1800;
const TAU = Math.PI * 2;

export const BTX_INK = '#0a0a0c';
export const BTX_PAPER = '#f9f9f9';
export const BTX_NOTIFY_BLUE = '#2496e8';

// Pixel-measured radial profiles from the upstream reference animation.
const ORIGINAL_PROFILES = Object.freeze({
    egg: [0.8369,0.8424,0.8497,0.8585,0.8674,0.8775,0.8878,0.8983,0.9089,0.9185,0.9288,0.9374,0.9445,0.9504,0.9543,0.9559,0.9555,0.9519,0.9466,0.9389,0.9302,0.9193,0.9085,0.8969,0.8852,0.8734,0.8625,0.8513,0.8411,0.8325,0.8243,0.8179,0.8137,0.8112,0.8102,0.8128,0.8178,0.8262,0.8374,0.8518,0.8702,0.8922,0.9169,0.9446,0.9741,1.0023,1.0267,1.0433,1.0481,1.0393,1.0216,0.9970,0.9697,0.9418,0.9169,0.8949,0.8760,0.8604,0.8490,0.8394,0.8337,0.8314,0.8305,0.8326],
    hexagon: [0.9210,0.9282,0.9441,0.9706,0.9984,1.0059,0.9896,0.9562,0.9290,0.9124,0.9047,0.9058,0.9157,0.9349,0.9642,0.9873,0.9882,0.9665,0.9336,0.9105,0.8968,0.8918,0.8955,0.9080,0.9293,0.9611,0.9820,0.9812,0.9590,0.9282,0.9089,0.8978,0.8964,0.9026,0.9189,0.9439,0.9778,0.9990,0.9964,0.9713,0.9439,0.9274,0.9196,0.9206,0.9308,0.9502,0.9799,1.0121,1.0226,1.0071,0.9752,0.9510,0.9366,0.9316,0.9351,0.9485,0.9711,1.0026,1.0213,1.0155,0.9863,0.9547,0.9347,0.9232],
    triangle: [0.7819,0.8211,0.8747,0.9440,1.0223,1.0960,1.1401,1.1340,1.0808,1.0047,0.9265,0.8603,0.8104,0.7730,0.7450,0.7273,0.7151,0.7118,0.7148,0.7245,0.7427,0.7680,0.8037,0.8518,0.9148,0.9876,1.0583,1.1073,1.1109,1.0667,0.9940,0.9164,0.8482,0.7948,0.7555,0.7261,0.7056,0.6925,0.6859,0.6869,0.6938,0.7084,0.7305,0.7615,0.8040,0.8595,0.9311,1.0092,1.0791,1.1171,1.1054,1.0501,0.9779,0.9050,0.8450,0.7990,0.7656,0.7413,0.7258,0.7160,0.7146,0.7204,0.7330,0.7528]
});

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
    neutral: {
        roll: 0,
        eyes: [
            { x: 15, y: -29, w: 11, h: 29, tilt: -30, open: 1 },
            { x: 36, y: -39, w: 9, h: 26, tilt: -30, open: 1 }
        ]
    },
    attentive:  { split: 32, eyeW: 12, eyeH: 26, tilt: -5,  eyeY: -18, eyeX: 8, roll: -4, open: 1 },
    surprised:  { split: 38, eyeW: 26, eyeH: 28, tilt: 0,   eyeY: -8,  eyeX: 2, roll: 0,  open: 1 },
    excited:    { split: 39, eyeW: 23, eyeH: 33, tilt: -10, eyeY: -14, eyeX: 5, roll: 0,  open: 1 },
    happy:      { split: 34, eyeW: 16, eyeH: 10, tilt: 14,  eyeY: -5,  eyeX: 4, roll: 0,  open: 1 },
    laughing:   { split: 36, eyeW: 20, eyeH: 8,  tilt: 20,  eyeY: -2,  eyeX: 3, roll: 0,  open: 1 },
    angry:      { split: 34, eyeW: 20, eyeH: 9,  tilt: 30,  eyeY: -8,  eyeX: 3, roll: 0,  open: 1 },
    sad:        { split: 32, eyeW: 13, eyeH: 24, tilt: -28, eyeY: -3,  eyeX: 1, roll: 0,  open: 1 },
    scared:     { split: 41, eyeW: 24, eyeH: 36, tilt: 0,   eyeY: -5,  eyeX: 1, roll: 0,  open: 1 },
    suspicious: {
        roll: -6,
        eyes: [
            { x: -10, y: -9, w: 12, h: 24, tilt: 0, open: 1 },
            { x: 22, y: -12, w: 13, h: 9, tilt: 0, open: 1 }
        ]
    },
    confused: {
        roll: 8,
        eyes: [
            { x: -10, y: -10, w: 12, h: 27, tilt: -18, open: 1 },
            { x: 23, y: -7, w: 17, h: 10, tilt: 14, open: 1 }
        ]
    },
    curious: {
        roll: -15,
        eyes: [
            { x: -8, y: -17, w: 14, h: 28, tilt: -8, open: 1 },
            { x: 23, y: -17, w: 12, h: 23, tilt: -8, open: 1 }
        ]
    },
    proud:      { split: 34, eyeW: 18, eyeH: 9,  tilt: 18, eyeY: -1, eyeX: 4, roll: 0,  open: 1 },
    shy:        { split: 28, eyeW: 10, eyeH: 18, tilt: 0,  eyeY: -2, eyeX: -7,roll: -7, open: 1 },
    bored:      { split: 32, eyeW: 18, eyeH: 7,  tilt: 0,  eyeY: -7, eyeX: -5,roll: 0,  open: 1 },
    sleepy:     { split: 32, eyeW: 12, eyeH: 25, tilt: 0,  eyeY: -4, eyeX: 3, roll: -3, open: 0.42 }
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

function makeProfile(shape) {
    return ORIGINAL_PROFILES[shape]
        ? [...ORIGINAL_PROFILES[shape]]
        : new Array(PROFILE_SAMPLES).fill(1);
}

function moodFor(id) {
    return MOODS[id] || MOODS.neutral;
}

function eyesForMood(id) {
    const mood = moodFor(id);
    if (mood.eyes) return mood.eyes.map((eye) => ({ ...eye }));
    return [
        { x: (mood.eyeX || 0) - mood.split / 2, y: mood.eyeY, w: mood.eyeW, h: mood.eyeH, tilt: mood.tilt, open: mood.open },
        { x: (mood.eyeX || 0) + mood.split / 2, y: mood.eyeY, w: mood.eyeW, h: mood.eyeH, tilt: -mood.tilt, open: mood.open }
    ];
}

export function sampleBTXPose(stateId, seconds, moodId = 'neutral') {
    const state = BTX_STATE_IDS.includes(stateId) ? stateId : 'idle';
    const time = Number.isFinite(seconds) ? Math.max(0, seconds) : 0;
    const mood = BTX_MOOD_IDS.includes(moodId) ? moodId : 'neutral';
    const breath = 1 + Math.sin((time / 3.4) * TAU) * 0.005;
    let profile = makeProfile('circle');
    let rx = 59;
    let ry = 59 * breath;
    let x = 0;
    let y = 0;
    let roll = moodFor(mood).roll;
    let faceAlpha = 1;
    let bodyAlpha = 1;
    let bodySpin = 0;
    let expression = mood;
    let eyes = eyesForMood(expression);

    if (state === 'thinking') {
        const pulse = smoothPulse(time % 1.5, 0.15, 0.9, 0.28);
        rx = 9.7 * (1 + pulse * 0.25);
        ry = rx;
        faceAlpha = 0;
    } else if (state === 'wink') {
        expression = 'happy';
        eyes = [
            { x: -9, y: -8, w: 14, h: 28, tilt: -8, open: 1 },
            { x: 22, y: -7, w: 26, h: 5.5, tilt: 5, open: 1 }
        ];
        roll = 6.7;
    } else if (state === 'wide') {
        expression = 'surprised';
        eyes = [
            { x: -2, y: 1, w: 21, h: 52, tilt: 12, open: 1 },
            { x: 29, y: 5, w: 19, h: 46, tilt: 12, open: 1 }
        ];
        roll = 0;
    } else if (state === 'alert') {
        const travel = easeInOutCubic(clamp(time / 1.5));
        rx = 8;
        ry = 38;
        x = lerp(-4, 18, travel) * (1 - clamp((time - 1.6) / 0.4));
        y = -18 + Math.sin(time * 2.5 * TAU) * 0.7;
        roll = 17.7;
        faceAlpha = 0;
    } else if (state === 'notify') {
        expression = 'surprised';
        eyes = [
            { x: -20, y: -3, w: 22, h: 30, tilt: -2, open: 1 },
            { x: 11, y: -7, w: 28, h: 29, tilt: 1, open: 1 }
        ];
        roll = 0;
    } else if (state === 'exclaim') {
        rx = 7.5;
        ry = 32;
        y = -18;
        roll = 0;
        faceAlpha = 0;
    } else if (state === 'sleep') {
        rx = 9.4;
        ry = 9.4;
        y = 6 + Math.sin(time * (TAU / 0.6)) * 11;
        faceAlpha = 0;
    } else if (state === 'egg') {
        profile = makeProfile('egg');
        expression = 'shy';
        eyes = [
            { x: 9, y: -25, w: 9, h: 22, tilt: -25, open: 1 },
            { x: 27, y: -31, w: 8, h: 21, tilt: -25, open: 1 }
        ];
        roll = 0;
    } else if (state === 'hexagon') {
        profile = makeProfile('hexagon');
        expression = 'attentive';
        eyes = [
            { x: 9, y: -24, w: 10, h: 24, tilt: -22, open: 1 },
            { x: 29, y: -31, w: 9, h: 23, tilt: -22, open: 1 }
        ];
        roll = 0;
    } else if (state === 'play') {
        profile = makeProfile('triangle');
        expression = 'attentive';
        eyes = [
            { x: -4, y: 0, w: 10, h: 20, tilt: 0, open: 1 },
            { x: 18, y: -2, w: 10, h: 19, tilt: 0, open: 1 }
        ];
        roll = 0;
    } else if (state === 'orbit') {
        const ramp = easeInOutCubic(clamp(time / 0.35));
        const back = easeInOutCubic(clamp((time - 1.6) / 0.9));
        profile = makeProfile('triangle').map((radius) => lerp(radius, 1, back));
        bodySpin = -TAU * 1.25 * time * ramp;
        expression = 'attentive';
        eyes = [
            { x: -4, y: 0, w: 10, h: 20 + back * 4, tilt: 0, open: 1 },
            { x: 18, y: -2, w: 10, h: 19 + back * 4, tilt: 0, open: 1 }
        ];
        roll = 0;
    } else if (state === 'burst') {
        const collapse = 1 - 0.834 * easeOutQuint(clamp(time / 0.7));
        const regrow = easeOutQuint(clamp((time - 1.7) / 0.7));
        const size = collapse + (1 - collapse) * regrow;
        rx = 59 * size;
        ry = rx;
        faceAlpha = clamp((time - 1.85) / 0.4);
    } else if (state === 'comet') {
        const collapse = 1 - (1 - 0.129) * easeOutQuint(clamp(time / 0.55));
        const regrow = easeOutQuint(clamp((time - 1.85) / 0.6));
        const size = collapse + (1 - collapse) * regrow;
        rx = 59 * size;
        ry = rx;
        y = Math.sin(clamp(time / 1.7) * Math.PI) * 2;
        roll = 0;
        faceAlpha = clamp((time - 2) / 0.35);
    } else if (state === 'swirl') {
        expression = mood;
        eyes = eyesForMood(expression);
    }

    return {
        state,
        mood: expression,
        profile,
        rx,
        ry,
        x,
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
        const angle = (index / profile.length) * TAU;
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

function orbitGradient(ctx, phase, index) {
    const gradient = ctx.createLinearGradient(-92, -70, 92, 70);
    const hue = (index * 61 + phase * 18) % 360;
    gradient.addColorStop(0, `hsl(${hue} 55% 62%)`);
    gradient.addColorStop(0.5, `hsl(${(hue + 62) % 360} 58% 64%)`);
    gradient.addColorStop(1, `hsl(${(hue + 124) % 360} 55% 60%)`);
    return gradient;
}

function drawOrbit(ctx, time, alpha, front) {
    if (alpha <= 0.001) return;
    ctx.save();
    ctx.globalAlpha *= alpha * (front ? 0.95 : 0.45);
    ctx.lineCap = 'round';
    for (let index = 0; index < 6; index += 1) {
        const phase = time * (3 + index * 0.14) + index * 0.92;
        ctx.save();
        ctx.rotate(-0.62 + index * 0.3);
        ctx.strokeStyle = orbitGradient(ctx, phase, index);
        ctx.lineWidth = 2.8 + index * 0.12;
        ctx.beginPath();
        ctx.ellipse(0, 6, 78 + index * 0.8, 8 + index * 4, 0, front ? phase : phase + Math.PI, front ? phase + Math.PI * 0.72 : phase + Math.PI * 1.72);
        ctx.stroke();
        ctx.restore();
    }
    ctx.restore();
}

function drawBurst(ctx, time, alpha) {
    if (alpha <= 0.001) return;
    ctx.save();
    ctx.globalAlpha *= alpha;
    const seeds = [0.16, 1.78, 3.42, 4.64, 5.52];
    for (let index = 0; index < seeds.length; index += 1) {
        const u = time - index * 0.2;
        if (u < 0 || u > 0.62) continue;
        const distance = (38 + index * 2.2) * Math.pow(0.75, u * 10);
        const phase = seeds[index] + (u * 100 * Math.PI) / 180;
        const size = 2.4 + 1.65 * clamp(u / 0.55);
        ctx.fillStyle = BTX_INK;
        ctx.globalAlpha = alpha * clamp(u / 0.06) * clamp((0.62 - u) / 0.08) * (0.42 + 0.58 * clamp(1 - distance / 48));
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
        ctx.strokeStyle = orbitGradient(ctx, time * 2.2, index);
        ctx.lineWidth = 5.6;
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
        [-33, 31].forEach((x, dotIndex) => {
            const index = dotIndex === 0 ? 0 : 2;
            const phase = ((((time - index * 0.5) / 1.5) % 1) + 1) % 1;
            const pulse = phase < 0.5 ? (0.5 - 0.5 * Math.cos(phase * TAU)) * 2 : 0;
            ctx.globalAlpha = alpha * (0.55 + 0.45 * pulse);
            ctx.fillStyle = BTX_INK;
            ctx.beginPath();
            ctx.arc(x, 0, 9.7 * (1 + 0.25 * pulse), 0, TAU);
            ctx.fill();
        });
    }

    if (decor === 'alert') {
        ctx.globalAlpha = alpha;
        ctx.fillStyle = BTX_INK;
        ctx.beginPath();
        ctx.ellipse(-13, 31, 6.8, 8.5, 0.3, 0, TAU);
        ctx.fill();
    }

    if (decor === 'exclaim') {
        ctx.globalAlpha = alpha;
        ctx.fillStyle = BTX_INK;
        ctx.beginPath();
        ctx.arc(0, 34, 6.7, 0, TAU);
        ctx.fill();
    }

    if (decor === 'notify') {
        const pop = 0.88 + Math.sin(Math.min(time * 8, Math.PI / 2)) * 0.12;
        ctx.save();
        ctx.translate(49, -47);
        ctx.scale(pop, pop);
        ctx.globalAlpha = alpha;
        ctx.fillStyle = BTX_NOTIFY_BLUE;
        ctx.beginPath();
        ctx.arc(0, 0, 9, 0, TAU);
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

function drawEye(ctx, eye, lookX, lookY, faceAlpha) {
    const height = Math.max(1, eye.h * clamp(eye.open));
    roundedCapsule(ctx, eye.x + lookX, eye.y + lookY, eye.w, height, eye.tilt * Math.PI / 180, BTX_PAPER, faceAlpha);
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

    ctx.fillStyle = BTX_PAPER;
    ctx.beginPath();
    ctx.arc(0, 0, 92, 0, TAU);
    ctx.fill();

    drawDecor(ctx, frame.previousDecor, frame.previousDecorTime, 1 - frame.decorMix, 'back');
    drawDecor(ctx, pose.decor, pose.decorTime, frame.decorMix, 'back');

    ctx.save();
    ctx.translate(pose.x, pose.y);
    ctx.rotate((pose.roll * Math.PI / 180) + pose.bodySpin);
    ctx.globalAlpha = pose.bodyAlpha;
    profilePath(ctx, pose.profile, pose.rx, pose.ry);
    ctx.fillStyle = BTX_INK;
    ctx.fill();
    ctx.clip();

    let targetX = 0;
    let targetY = 0;
    const followsPointer = pose.state === 'idle' || pose.state === 'swirl';
    if (followsPointer && pointerAge < POINTER_MEMORY_MS && box.width > 0 && box.height > 0) {
        targetX = clamp((pointer.x - (box.left + box.width / 2)) / Math.max(box.width, 1), -1, 1) * 7;
        targetY = clamp((pointer.y - (box.top + box.height / 2)) / Math.max(box.height, 1), -1, 1) * 5;
    } else if (followsPointer) {
        targetX = Math.sin(seconds * 0.87) * 3.4;
        targetY = Math.cos(seconds * 0.71) * 2.1;
    }

    const blink = pose.state === 'idle' ? 1 - smoothPulse((seconds % 4.6), 4.1, 4.38, 0.12) * 0.94 : 1;
    pose.eyes.forEach((eye) => drawEye(ctx, { ...eye, open: eye.open * blink }, targetX, targetY, pose.faceAlpha));
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
        trigger.addEventListener('pointerdown', () => wake(2600));
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
