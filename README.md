# DeepFocus 代理合作方案 · 对外版

面向意向合作伙伴，沿用DeepFocus品牌UI。首页大标题分为两行：第一行「Deepfocus GEO」，第二行「品牌代理合作方案」。「了解产品」打开 https://www.deepfocusglobal.com/zh-CN/ 。

## 公开访问

大陆公开入口：https://r4lxq8tmi6.feishuapp.com/app/app_17fvb4dy65y/ 。已设public且无需登录，页面、字体、表单与飞书通知服务同源托管。大陆入口源码在 `mainland/`。原Sites入口继续保留，并已同步手机/平板适配。

## 内容维护

source-plan.md保留合作规则来源；web/index.html为对外页面，scripts/build.py提取费用和分成，生成terms.json、来源指纹与单文件Worker。原始完整合作方案的讨论稿和待定条款不直接展示，重要费用、分工、退款与结算限制保留在对外FAQ。

## 本地验证

```sh
python3 scripts/build.py
node --check worker/index.js
node --check web/app.js
node --test tests/contact.test.mjs
node scripts/validate-artifact.mjs
node scripts/preview.mjs
```

预览http://127.0.0.1:8770，通知为模拟，不向真实群发送。预览控制路由只存在本机脚本，未打包部署。

## 服务端咨询

POST /api/consult接受姓名、手机号或微信、公司/团队、城市、合作模式、销售情况、需求、同意使用信息勾选、空蜜罐及请求UUID。严格校验来源、JSON、字段枚举、长度与12KB请求体，通知使用飞书纯文本富文本节点，用户输入不解析为@或卡片。

运行时通过Sites配置FEISHU_WEBHOOK_URL为secret、PUBLIC_SITE_ORIGIN为网站来源。若机器人启用签名，可选secret FEISHU_SIGN_SECRET。密钥不进入源码、浏览器、构建产物或公开仓库。

飞书HTTP和业务码同时成功才返回ok:true。失败保留表单；超时/结果不明不会自动重发。客户端防双击、短期编号回执缓存和每IP每10分钟5次的实例内限流用于基础保护，内存/边缘缓存不保证跨区域精确一次或全局限流。没有数据库及持久队列，提交资料留存在接收飞书群；飞书明确拒绝时本次未收集成功，不显示成功。日志仅含编号与发送状态，不打印表单或Webhook。

## 资源

使用本地Space Grotesk / MiSans / Geist Mono、DeepFocus紫色#4F39F6和DF线条标识，字体许可随web/assets保留。Codex CLI头图生成被当前模型配置拒绝，页面使用合作费用概览，未假称生成插画。

站点公开；服务端能力由Sites Worker托管，不将表单后端发布到纯静态Pages。
