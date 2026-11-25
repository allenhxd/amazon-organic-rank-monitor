# US Excel dual-rank monitor · 美国站 Excel 双排名工具

Use this command-line tool to track a watchlist on Amazon.com. Each observation records the position of a product in the organic grid and in Sponsored placements, with evidence for same-row or adjacent-row appearances. It runs on the user's computer with Node.js. The Web application has its own organic-only database and export.

## 快速开始

在解压后的仓库根目录运行。需要 Node.js 22、Corepack 和仓库指定版本的 pnpm。离线演示使用已安装的依赖，无需启动 Web、PostgreSQL、Redis 或浏览器。

```sh
corepack enable
pnpm install --frozen-lockfile
pnpm excel-rank demo excel-rank-output/demo.xlsx
pnpm excel-rank template excel-rank-output/watchlist.xlsx
```

打开 `watchlist.xlsx`，在「监控清单」替换示例商品。每行填写一个子 ASIN 和一个关键词，启用的行会进入下一批采集。SKU、父 ASIN 和同父体匹配按实际商品填写。相同关键词共用搜索页，相同子 ASIN 共用详情页。示例报告使用固定的合成日期。

## 实际监测与离线重放

首次使用真实采集时安装 Chromium。在 Linux 上可按本机环境使用 `pnpm exec playwright install --with-deps chromium` 安装系统依赖。运行前由操作者确认适用的网站条款、法律和账号授权范围。

```sh
pnpm exec playwright install chromium
pnpm excel-rank run excel-rank-output/watchlist.xlsx excel-rank-output/run-01.json excel-rank-output/run-01.xlsx
pnpm excel-rank replay excel-rank-output/watchlist.xlsx excel-rank-output/run-01.json excel-rank-output/replay-01.xlsx
```

每个输出路径都应使用新文件名。真实采集先保存 JSON，再写工作簿。导出中断后，可用同一清单和 JSON 重放。下次采集以最近一次生成的报告为输入，继续积累历史。JSON 包含自己的关键词、商品、位置与运行证据，保存在本地。

CLI 将本次结果写入「CLI排名历史」「CLI价格历史」「CLI评分历史」「CLI运行审计」。同词对比、排名变化和评分变化按 CLI 历史生成。导入旧主簿时保留原有工作表，不把旧表数值当作本版采集结果。CLI 不会自动清理旧报告。

采集使用独立的美国站英文浏览器会话和 1920×1080 视口，验证配送邮编 96038。搜索按唯一关键词逐一翻三页，详情直接访问商品页。页面拒绝访问或出现 CAPTCHA 时停止本批采集。命令退出码 2 表示采集已停止，应检查 JSON 中的 `reason` 和报告中的未完成项。退出码 1 表示命令或文件错误。

- 自然位按页和自然排记录。纯广告排及五张卡中“四广告＋一自然”的排跳过自然排编号。广告位按页和物理排记录。
- 同一个商品自然位与广告位的距离，按同一页的物理排比较。优先同排，其次邻排。匹配优先用直接子 ASIN，只有对应父子关系得到验证后才使用同父体展示商品。
- 三页完成且排除所有可匹配位置后才能记为「暂无」。缺失页、身份或分类证据保留为「未完成」。已验证的较早页面可以提供直接命中证据。
- 价格、库存按子 ASIN 采集。评分按已核验的评分主体去重，缺失字段留空。日期按 Asia/Shanghai 计算。

## 可选的 Sponsored Products 关键词同步

已获 Amazon Ads API 授权的维护者可通过环境变量提供 `AMAZON_ADS_CLIENT_ID`、短期有效的 `AMAZON_ADS_ACCESS_TOKEN` 和 `AMAZON_ADS_PROFILE_ID`。命令先核验美国广告资料，再读取 campaigns、adGroups、productAds 和 keywords。请将访问令牌仅保存在本机的进程环境中。

```sh
pnpm excel-rank ads-snapshot excel-rank-output/config.json
pnpm excel-rank sync excel-rank-output/watchlist.xlsx excel-rank-output/config.json excel-rank-output/expanded.xlsx
```

`sync` 可单独离线执行。输入 JSON 使用 `ads-snapshot` 的结构，含 `countryCode`、`date` 及上述四个列表。它从仍在投放期的手动广告活动中选取启用广告组、商品广告及正向 broad／phrase／exact 关键词，补充自有商品与同类目竞品的清单。已经停用的组合保留原状态。管理广告账户、创建授权和续签访问令牌均由操作者负责。
