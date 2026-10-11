# DeepFocus GEO 品牌代理合作方案

该版本为大陆公开访问入口，保留DeepFocus品牌样式、两行标题、合作费用与分成规则、收益计算器、产品官网链接和咨询弹窗。

公开页面、字体和许可保存在 `client/partner-site/`；`python3 scripts/sync-partner-site.py` 将它们嵌入服务端公开资源。业务模块为 `server/modules/partners/`，复用原站已验收的字段校验、通知、限流、超时与回执逻辑。主界面由该模块输出，避免依赖海外CDN资源；平台默认入口文件保留供托管构建使用。

通知Webhook仅配置在在线环境变量 `FEISHU_WEBHOOK_URL`，不得写入源码。可选 `FEISHU_SIGN_SECRET`；上线后将 `PUBLIC_SITE_ORIGIN` 设为实际公开域名的origin。表单无需登录，但保留平台CSRF、同源校验、必填项与同意校验、蜜罐、短期回执和限流。日志配置关闭请求/响应正文，并在平台完成追踪前清除请求正文；通知只在飞书返回业务码0后显示成功。超时保持不确定状态并禁止自动重发。回执和限流为进程内存级；不保证跨进程唯一发送。成功信息保存在飞书群，不另建数据库。

验证：`npm run type:check:server`、`npm run build:server`、`node --test tests/contact.test.mjs tests/controller.test.mjs`，发布走飞书妙搭CLI的工作分支 `sprint/default`。镜像发布后设置public且require-login=false，并从未登录浏览器验收页面和表单。大陆平台域名不等于已经验证所有运营商与所有设备可达。

公开入口：https://r4lxq8tmi6.feishuapp.com/app/app_17fvb4dy65y/ 。Miaoda应用app_17fvb4dy65y，发布环境需配置运行时secret，不包含在GitHub。
本地构建前将 `.env.example` 复制为 `.env`，该文件只有不含secret的日志配置。
