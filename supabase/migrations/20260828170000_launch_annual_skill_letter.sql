alter table public.stripe_webhook_events
  add column if not exists resend_contact_synced_at timestamptz;

alter table public.member_wecom_onboarding
  alter column automation_rule_key set default 'website_skill_letter_annual';

insert into public.automation_rules (
  rule_key,
  name,
  enabled,
  priority,
  trigger_event,
  source_channel,
  customer_type,
  wecom_user_id,
  tag_names,
  welcome_message,
  group_key,
  group_name,
  send_group_invite,
  notify_feishu,
  write_attribution,
  version,
  source_system,
  source_record_id,
  synced_at,
  updated_at
) values (
  'website_skill_letter_annual',
  '官网 AI Skills 年度订阅',
  true,
  100,
  'wecom_contact_added',
  'Tech Bridge官网',
  '付费订阅',
  'shirleyLin',
  array['官网来源', 'AI Skills年度订阅'],
  '欢迎加入 Tech Bridge AI Skills 年度买手服务。你的付款与服务资格已自动核验，第 001 期与 Skill Pack 将发送到付款邮箱。请点击下方入口，长按识别二维码加入进阶实践社群。',
  'member-core',
  'Tech Bridge AI Skill Lab',
  true,
  true,
  true,
  3,
  'seed',
  'seed:website_skill_letter_annual',
  now(),
  now()
) on conflict (rule_key) do update set
  name = excluded.name,
  enabled = excluded.enabled,
  priority = excluded.priority,
  trigger_event = excluded.trigger_event,
  source_channel = excluded.source_channel,
  customer_type = excluded.customer_type,
  wecom_user_id = excluded.wecom_user_id,
  tag_names = excluded.tag_names,
  welcome_message = excluded.welcome_message,
  group_key = excluded.group_key,
  group_name = excluded.group_name,
  send_group_invite = excluded.send_group_invite,
  notify_feishu = excluded.notify_feishu,
  write_attribution = excluded.write_attribution,
  version = excluded.version,
  source_system = excluded.source_system,
  source_record_id = excluded.source_record_id,
  synced_at = excluded.synced_at,
  updated_at = excluded.updated_at;

update public.automation_rules
set enabled = false,
    updated_at = now()
where rule_key = 'website_skill_email_9_9';

update public.member_wecom_onboarding as onboarding
set automation_rule_key = 'website_skill_letter_annual',
    updated_at = now()
where onboarding.automation_rule_key in ('website_skill_email_9_9', 'website_stripe_annual_199')
  and exists (
    select 1
    from public.paid_subscribers as subscriber
    where subscriber.stripe_checkout_session_id = onboarding.stripe_checkout_session_id
      and subscriber.plan = 'skill_email_365'
  );

update public.customer_attributions as attribution
set rule_key = 'website_skill_letter_annual',
    customer_type = '付费订阅',
    tag_names = array['官网来源', 'AI Skills年度订阅'],
    updated_at = now()
where attribution.rule_key = 'website_skill_email_9_9'
   or '9.9元技能邮件订阅' = any(attribution.tag_names)
   or exists (
     select 1
     from public.paid_subscribers as subscriber
     where subscriber.stripe_checkout_session_id = attribution.order_id
       and subscriber.plan = 'skill_email_365'
   );
