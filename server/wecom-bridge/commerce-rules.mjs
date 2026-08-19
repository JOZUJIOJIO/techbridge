export const SKILL_EMAIL_PLAN = 'skill_email_365';
export const SKILL_EMAIL_RULE_KEY = 'website_skill_email_9_9';
export const ANNUAL_MEMBER_PLAN = 'annual';
export const ANNUAL_MEMBER_RULE_KEY = 'website_stripe_annual_199';

export const SKILL_EMAIL_AUTOMATION = Object.freeze({
  ruleKey: SKILL_EMAIL_RULE_KEY,
  name: '官网¥9.9技能邮件订阅',
  sourceChannel: 'Tech Bridge官网',
  customerType: '付费订阅',
  tagNames: Object.freeze(['官网来源', '9.9元技能邮件订阅']),
  welcomeMessage: '欢迎订阅 Tech Bridge 技能邮件。你的付款与订阅资格已经自动核验，后续技能内容将发送到付款邮箱。请点击下方入口，长按识别二维码加入订阅用户群。',
  groupKey: 'member-core',
  groupName: '比特自媒体核心群'
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
