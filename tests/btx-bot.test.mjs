import assert from 'node:assert/strict';
import test from 'node:test';

import {
  BTX_INK,
  BTX_MOOD_IDS,
  BTX_NOTIFY_BLUE,
  BTX_PAPER,
  BTX_STATE_IDS,
  blendBTXPoses,
  isFiniteBTXPose,
  sampleBTXPose
} from '../btx-bot.js';

test('ships the complete BTX state and mood catalogues', () => {
  assert.deepEqual(BTX_STATE_IDS, [
    'idle', 'thinking', 'wink', 'wide', 'alert', 'notify', 'exclaim',
    'sleep', 'egg', 'hexagon', 'play', 'orbit', 'burst', 'comet', 'swirl'
  ]);
  assert.equal(BTX_MOOD_IDS.length, 16);
  assert.equal(BTX_INK, '#0a0a0c');
  assert.equal(BTX_PAPER, '#f9f9f9');
  assert.equal(BTX_NOTIFY_BLUE, '#2496e8');
});

test('every state and mood produces finite deterministic geometry', () => {
  for (const state of BTX_STATE_IDS) {
    for (const mood of BTX_MOOD_IDS) {
      const first = sampleBTXPose(state, 1.234, mood);
      const second = sampleBTXPose(state, 1.234, mood);
      assert.equal(isFiniteBTXPose(first), true, `${state}/${mood}`);
      assert.deepEqual(first, second, `${state}/${mood}`);
      assert.equal(first.profile.length, 64);
    }
  }
});

test('pose blending preserves catalogue shape and transition endpoints', () => {
  const from = sampleBTXPose('idle', 0.7, 'neutral');
  const to = sampleBTXPose('orbit', 0.4, 'excited');
  assert.deepEqual(blendBTXPoses(from, to, 0).profile, from.profile);
  assert.deepEqual(blendBTXPoses(from, to, 1).profile, to.profile);
  assert.equal(isFiniteBTXPose(blendBTXPoses(from, to, 0.47)), true);
});
