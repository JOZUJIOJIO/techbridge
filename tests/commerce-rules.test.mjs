import assert from 'node:assert/strict';
import test from 'node:test';

import { automationFromSession } from '../functions/api/member-onboarding.js';
import {
  ANNUAL_MEMBER_AUTOMATION,
  ANNUAL_MEMBER_PLAN,
  ANNUAL_MEMBER_RULE_KEY,
  SKILL_EMAIL_AUTOMATION,
  SKILL_EMAIL_PLAN,
  SKILL_EMAIL_RULE_KEY,
  automationForPlan
} from '../server/wecom-bridge/commerce-rules.mjs';
import {
  defaultMemberRule,
  defaultSkillEmailRule
} from '../server/wecom-bridge/automation.mjs';

test('maps the current 9.9 skill-email plan to its own automation rule', () => {
  const automation = automationForPlan(SKILL_EMAIL_PLAN);
  assert.equal(automation.ruleKey, SKILL_EMAIL_RULE_KEY);
  assert.equal(automation.customerType, '付费订阅');
  assert.deepEqual([...automation.tagNames], ['官网来源', '9.9元技能邮件订阅']);
  assert.doesNotMatch(automation.welcomeMessage, /199|年度会员/);
});

test('keeps the historical annual member rule separate', () => {
  const automation = automationForPlan(ANNUAL_MEMBER_PLAN);
  assert.equal(automation.ruleKey, ANNUAL_MEMBER_RULE_KEY);
  assert.equal(automation.customerType, '付费会员');
  assert.deepEqual([...automation.tagNames], ['官网来源', '199元付费会员']);
});

test('selects onboarding automation from Stripe metadata and safe legacy inference', () => {
  assert.equal(
    automationFromSession({ metadata: { plan: SKILL_EMAIL_PLAN }, amount_total: 990 }).ruleKey,
    SKILL_EMAIL_RULE_KEY
  );
  assert.equal(
    automationFromSession({ metadata: { plan: ANNUAL_MEMBER_PLAN }, amount_total: 19_900 }).ruleKey,
    ANNUAL_MEMBER_RULE_KEY
  );
  assert.equal(
    automationFromSession({ metadata: {}, amount_total: 990 }).ruleKey,
    SKILL_EMAIL_RULE_KEY
  );
  assert.equal(
    automationFromSession({ metadata: {}, amount_total: 19_900 }).ruleKey,
    ANNUAL_MEMBER_RULE_KEY
  );
});

test('builds distinct WeCom fallback rules for current and historical products', () => {
  const env = { WECOM_CONTACT_USER_ID: 'operator' };
  const skillRule = defaultSkillEmailRule(env);
  const memberRule = defaultMemberRule(env);

  assert.equal(skillRule.rule_key, SKILL_EMAIL_RULE_KEY);
  assert.deepEqual(skillRule.tag_names, [...SKILL_EMAIL_AUTOMATION.tagNames]);
  assert.equal(memberRule.rule_key, ANNUAL_MEMBER_RULE_KEY);
  assert.deepEqual(memberRule.tag_names, [...ANNUAL_MEMBER_AUTOMATION.tagNames]);
});

test('rejects unknown commerce plans instead of silently applying the 199 rule', () => {
  assert.throws(() => automationForPlan('unknown-plan'), /unsupported_commerce_plan/);
});
