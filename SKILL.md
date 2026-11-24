# SKILL：语音延迟观测

项目简介见 [README.md](README.md)。这是公开仓库，不写账号、令牌和内部授权。设计见 `docs/DESIGN.md`，架构见 `docs/ARCHITECTURE.md`，路线见 `docs/ROADMAP.md`。

## 怎么跑

- 测试：`npm test`，22 个文件，不联网，不需要 Twilio 账号。
- 部署：先 Worker 后 Pages，步骤和命令见 `docs/DEPLOYMENT.md`（含回滚）。Pages 要在 `pages/` 目录下部署，否则 `functions/` 不会上传，所有路由 404。
- 真实通话检查在 `tests/e2e/`，使用合成英文音频。

## 质量标准

- 每个数字带证据等级 E1 到 E5，跨时钟的近似值不当作模型耗时。
- 写清"验证了什么"：测试套件、合成音频通话各验证到哪一步。已知未解：有一通合成音频通话约 25 秒掉线、无结束事件，原因没找到。
- 不用"变快了"这类没有对照的话。

## 禁区

- Secrets 只用 `wrangler pages secret put`，永不进仓库和浏览器。
- 不在测试里使用真实的人声或客户数据。
- 真实通话会产生 Twilio 费用，按授权范围进行。
- 英文语音 Demo 的慢等待尚未验证修好：不说已解决，等 Jeff 决定继续排查还是先放一边。
