export const SKILL_EMAIL_PLAN = 'skill_email_365';
export const SKILL_EMAIL_RULE_KEY = 'website_skill_letter_annual';
export const LEGACY_SKILL_EMAIL_RULE_KEY = 'website_skill_email_9_9';
export const ANNUAL_MEMBER_PLAN = 'annual';
export const ANNUAL_MEMBER_RULE_KEY = 'website_stripe_annual_199';

export const SKILL_EMAIL_AUTOMATION = Object.freeze({
  ruleKey: SKILL_EMAIL_RULE_KEY,
  name: '官网 AI Skills 年度订阅',
  sourceChannel: 'Tech Bridge官网',
  customerType: '付费订阅',
  tagNames: Object.freeze(['官网来源', 'AI Skills年度订阅']),
  welcomeMessage: '欢迎加入 Tech Bridge AI Skills 年度买手服务。你的付款与服务资格已自动核验，第 001 期与 Skill Pack 将发送到付款邮箱。请点击下方入口，长按识别二维码加入进阶实践社群。',
  groupKey: 'member-core',
  groupName: 'Tech Bridge AI Skill Lab'
});

export const ANNUAL_MEMBER_AUTOMATION = Object.freeze({
  ruleKey: ANNUAL_MEMBER_RULE_KEY,
  name: '官网¥199年度会员',
  sourceChannel: 'Tech Bridge官网',
  customerType: '付费会员',
  tagNames: Object.freeze(['官网来源', '199元付费会员']),
  welcomeMessage: '欢迎加入 Tech Bridge 会员。你的付款与会员资格已经自动核验。请点击下方入口，长按识别二维码加入会员群。',
  groupKey: 'member-core',
  groupName: '比特自媒体核心群'
});

export function automationForPlan(plan) {
  if (plan === ANNUAL_MEMBER_PLAN) return ANNUAL_MEMBER_AUTOMATION;
  if (plan === SKILL_EMAIL_PLAN) return SKILL_EMAIL_AUTOMATION;
  throw new Error(`unsupported_commerce_plan:${plan || 'missing'}`);
}
