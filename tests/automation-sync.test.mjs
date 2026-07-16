import assert from 'node:assert/strict';
import test from 'node:test';

import { mapFeishuRule } from '../functions/automation-sync.js';

test('maps a Feishu automation row into the runtime rule schema', () => {
  const rule = mapFeishuRule({
    record_id: 'rec_rule',
    fields: {
      '规则名称': '官网¥199年度会员',
      '启用': true,
      '规则Key': 'website_stripe_annual_199',
      '优先级': 100,
      '触发场景': ['添加企微'],
      '渠道来源': ['Tech Bridge官网'],
      '客户类型': ['付费会员'],
      '企微员工UserID': 'shirleyLin',
      '自动标签': ['官网来源', '199元付费会员'],
      '欢迎语': '欢迎加入',
      '群名称': '比特自媒体核心群',
      '群配置ID': 'member-core',
      '发送群入口': true,
      '通知飞书': true,
      '写入客户归因': true,
      '规则版本': 1
    }
  });

  assert.equal(rule.rule_key, 'website_stripe_annual_199');
  assert.equal(rule.trigger_event, 'wecom_contact_added');
  assert.equal(rule.source_channel, 'Tech Bridge官网');
  assert.deepEqual(rule.tag_names, ['官网来源', '199元付费会员']);
  assert.equal(rule.group_key, 'member-core');
  assert.equal(rule.enabled, true);
  assert.equal(rule.source_record_id, 'rec_rule');
});

test('ignores a Feishu row without a stable rule key', () => {
  assert.equal(mapFeishuRule({ record_id: 'rec_empty', fields: { '规则名称': '空规则' } }), null);
});
