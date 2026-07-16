import assert from 'node:assert/strict';
import { createCipheriv, createHmac, randomBytes } from 'node:crypto';
import test from 'node:test';

import {
  decryptMessage,
  parseEventXml,
  signatureFor,
  verifySignature,
  xmlField
} from '../functions/lib/wecom.js';
import { signBridgeRequest } from '../functions/lib/wecom-bridge-client.js';

const CORP_ID = 'wwb18e676047faa374';
const TOKEN = 'test-callback-token';
const KEY_BYTES = Buffer.from('0123456789abcdef0123456789abcdef');
const AES_KEY = KEY_BYTES.toString('base64').replace(/=$/, '');

function encryptMessage(message, receiver = CORP_ID) {
  const messageBuffer = Buffer.from(message);
  const length = Buffer.alloc(4);
  length.writeUInt32BE(messageBuffer.length);
  const unpadded = Buffer.concat([randomBytes(16), length, messageBuffer, Buffer.from(receiver)]);
  const padding = 32 - (unpadded.length % 32);
  const padded = Buffer.concat([unpadded, Buffer.alloc(padding, padding)]);
  const cipher = createCipheriv('aes-256-cbc', KEY_BYTES, KEY_BYTES.subarray(0, 16));
  cipher.setAutoPadding(false);
  return Buffer.concat([cipher.update(padded), cipher.final()]).toString('base64');
}

test('decrypts a WeCom callback payload and checks the receiver id', () => {
  const xml = '<xml><Event><![CDATA[change_external_contact]]></Event></xml>';
  const encrypted = encryptMessage(xml);
  assert.equal(decryptMessage(encrypted, AES_KEY, CORP_ID), xml);
  assert.throws(() => decryptMessage(encrypted, AES_KEY, 'wrong-corp'), /invalid_wecom_receiver/);
});

test('verifies the sorted SHA1 callback signature', () => {
  const encrypted = encryptMessage('echo-value');
  const signature = signatureFor(TOKEN, '1720000000', 'nonce-1', encrypted);
  assert.equal(verifySignature({
    token: TOKEN,
    timestamp: '1720000000',
    nonce: 'nonce-1',
    encrypted,
    signature
  }), true);
  assert.equal(verifySignature({
    token: TOKEN,
    timestamp: '1720000000',
    nonce: 'nonce-1',
    encrypted,
    signature: signature.replace(/^./, signature[0] === '0' ? '1' : '0')
  }), false);
});

test('extracts encrypted and event XML fields', () => {
  const outer = '<xml><Encrypt><![CDATA[ciphertext]]></Encrypt></xml>';
  assert.equal(xmlField(outer, 'Encrypt'), 'ciphertext');

  const event = parseEventXml(`<xml>
    <Event><![CDATA[change_external_contact]]></Event>
    <ChangeType><![CDATA[add_external_contact]]></ChangeType>
    <UserID><![CDATA[zhengqiao]]></UserID>
    <ExternalUserID><![CDATA[wm_external]]></ExternalUserID>
    <State><![CDATA[m_order_state]]></State>
    <WelcomeCode><![CDATA[welcome-code]]></WelcomeCode>
  </xml>`);
  assert.deepEqual(event, {
    event: 'change_external_contact',
    changeType: 'add_external_contact',
    updateDetail: '',
    userId: 'zhengqiao',
    externalUserId: 'wm_external',
    state: 'm_order_state',
    welcomeCode: 'welcome-code',
    chatId: '',
    joinScene: '',
    memberChangeCount: ''
  });

  const groupEvent = parseEventXml(`<xml>
    <Event><![CDATA[change_external_chat]]></Event>
    <ChangeType><![CDATA[update]]></ChangeType>
    <UpdateDetail><![CDATA[add_member]]></UpdateDetail>
    <ChatId><![CDATA[wr_group]]></ChatId>
    <JoinScene>3</JoinScene>
    <MemChangeCnt>1</MemChangeCnt>
  </xml>`);
  assert.equal(groupEvent.updateDetail, 'add_member');
  assert.equal(groupEvent.chatId, 'wr_group');
  assert.equal(groupEvent.joinScene, '3');
  assert.equal(groupEvent.memberChangeCount, '1');
});

test('signs bridge requests with timestamp-bound HMAC-SHA256', async () => {
  const secret = 'bridge-secret';
  const timestamp = '1720000000000';
  const body = JSON.stringify({ state: 'm_0123456789abcdef0123456789' });
  const expected = createHmac('sha256', secret).update(`${timestamp}.${body}`).digest('hex');
  assert.equal(await signBridgeRequest(secret, timestamp, body), expected);
});
