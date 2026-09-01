# 桥比特官网

`https://qiaobit.com/` 的唯一源码项目。

## 项目边界

本仓库只负责：

- 桥比特个人介绍、内容、播客、活动、项目矩阵与联系页面
- 官网商务合作申请
- 隐私最小化的网站访问统计
- Cloudflare Worker 静态资源托管、HTTPS 跳转和内部路径保护

本仓库不负责：

- AI Skills 的支付、分销、邮件交付与后台，源码位于平行项目 `../AI Skills`
- 容易发扩展、授权、兑换码与商店材料，源码位于平行项目 `../谷歌插件`
- 乾X企业官网，源码位于平行项目 `../乾X官网`
- 企业微信运营自动化，源码位于平行项目 `../Techbridge运营自动化`
- 硅基物语会员原型，源码位于 `../硅基物语H5/website-prototype`

官网可以展示这些产品的卡片和外链，但不得重新引入它们的支付、授权、数据库迁移、后台或部署代码。

## 本地运行

```bash
npm install
python3 -m http.server 8080 --bind 127.0.0.1
```

访问：`http://127.0.0.1:8080/index.html`

## 验证

```bash
npm run check
npm run deploy:dry-run
```

检查内容包括 JavaScript 语法、官网 API 测试、内部目录防公开测试和 Cloudflare 部署包生成。

## 生产安全

当前满意的线上黄金版本：

- Worker：`techbridge`
- Version ID：`f5a9dd06-36b2-4a5e-a9ea-64845a3b0ad6`
- 上线时间：2026-08-30

本地清理版已经移除容易发生产接口。**在容易发独立 Worker 接管 `qiaobit.com/rongyifa/*`、`qiaobit.com/api/rongyifa/*` 和专用 Stripe Webhook 之前，禁止部署本仓库。**

## 目标发布流程

```text
codex/功能分支
→ Pull Request
→ npm run check
→ npm run deploy:dry-run
→ 合并受保护的 master
→ GitHub Actions 自动部署 Cloudflare
→ 线上冒烟验证
```

日常发布不再从脏的本地工作区直接执行 `wrangler deploy`。紧急情况可以回滚到上面的黄金 Worker Version。
