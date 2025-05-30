# Node.js Web Scraper

一个基于 Node.js 和 TypeScript 的高效网页爬虫工具，支持数据存储到 MySQL 数据库、定时任务调度和 Excel 数据导出功能。

## ✨ 功能特性

- 🚀 **高效爬取**：支持多页面并发爬取，智能重试机制
- 🗄️ **数据存储**：MySQL 数据库存储，支持重复数据检测
- ⏰ **定时任务**：内置 cron 调度器，支持自动化爬取
- 📊 **数据导出**：一键导出数据库数据到 Excel 表格
- 🔄 **智能跳页**：检测重复数据自动跳页，提高爬取效率
- 🛡️ **错误处理**：完善的错误处理和日志记录机制
- 🎯 **代理支持**：支持 HTTP 代理，绕过访问限制

## 📋 目录结构

```
node爬虫/
├── main.ts                 # 基础爬虫（输出到Excel）
├── main_sql.ts             # 数据库爬虫（支持定时任务）
├── export_db_to_excel.ts   # 数据库导出工具
├── package.json            # 项目配置
├── tsconfig.json           # TypeScript配置
├── README.md               # 项目说明
├── README_MySQL.md         # 数据库功能说明
├── README_SCHEDULER.md     # 定时任务说明
└── README_EXPORT.md        # 导出功能说明
```

## 🚀 快速开始

### 环境要求

- Node.js >= 16.0.0
- MySQL >= 5.7
- TypeScript >= 4.0

### 安装依赖

```bash
# 使用 npm
npm install

# 或使用 pnpm（推荐）
pnpm install
```

### 数据库配置

1. 创建 MySQL 数据库：

```sql
CREATE DATABASE scraper_db CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
```

2. 修改数据库配置（在 `main_sql.ts` 中）：

```typescript
const config: ScraperConfig = {
  // ... 其他配置
  database: {
    host: "localhost",
    port: 3306,
    user: "your_username",
    password: "your_password",
    database: "scraper_db",
  },
};
```

## 📖 使用方法

### 1. 基础爬虫（输出到 Excel）

```bash
# 开发环境运行
npm run start

# 或直接运行
ts-node main.ts
```

### 2. 数据库爬虫

#### 基本使用

```bash
# 手动执行一次
npm run start:sql:manual

# 启动定时任务（每天晚上6点执行）
npm run start:sql:schedule

# 显示帮助信息
npm run start:sql:help
```

#### 命令行参数支持

现在支持通过命令行参数动态配置爬虫行为：

```bash
# 禁用代理，爬取1-50页
npm run start:sql:manual -- --no-proxy --start-page 1 --end-page 50

# 使用自定义代理，爬取1-200页
npm run start:sql:manual -- --proxy http://127.0.0.1:8080 --end-page 200

# 定时任务模式下使用自定义配置
npm run start:sql:schedule -- --no-proxy --start-page 10 --end-page 100
```

#### 可用参数

| 参数                    | 说明         | 默认值                  | 示例                            |
| ----------------------- | ------------ | ----------------------- | ------------------------------- |
| `--no-proxy`            | 禁用代理     | 启用代理                | `--no-proxy`                    |
| `--proxy <url>`         | 设置代理地址 | `http://127.0.0.1:7897` | `--proxy http://127.0.0.1:8080` |
| `--start-page <number>` | 设置起始页码 | `1`                     | `--start-page 10`               |
| `--end-page <number>`   | 设置结束页码 | `100`                   | `--end-page 200`                |

#### 直接使用 Node.js

```bash
# 编译后直接运行
npm run build:sql
node dist/main_sql.js --manual --no-proxy --start-page 1 --end-page 50

# 或使用 ts-node 直接运行
ts-node main_sql.ts --manual --proxy http://127.0.0.1:8080 --end-page 200
```

### 3. 数据导出

```bash
# 导出数据库数据到Excel
npm run export:excel
```

## 🔧 配置说明

### 爬虫配置

#### 代码配置（默认值）

```typescript
const config: ScraperConfig = {
  targetUrl: "https://example.com", // 目标网站
  proxyUrl: cmdConfig.enableProxy ? cmdConfig.proxyUrl : undefined, // 代理地址（可通过命令行覆盖）
  startPage: cmdConfig.startPage, // 起始页码（可通过命令行覆盖）
  endPage: cmdConfig.endPage, // 结束页码（可通过命令行覆盖）
  maxRetries: 3, // 最大重试次数
  retryDelay: 4000, // 重试延迟（毫秒）
  selectors: {
    rows: "table tbody tr", // CSS选择器
  },
};
```

#### 命令行配置（优先级更高）

命令行参数会覆盖代码中的默认配置：

```bash
# 配置优先级：命令行参数 > 代码默认值

# 示例：禁用代理，自定义页面范围
ts-node main_sql.ts --manual --no-proxy --start-page 5 --end-page 50

# 示例：使用自定义代理
ts-node main_sql.ts --schedule --proxy http://192.168.1.100:8080
```

#### 配置参数说明

| 配置项   | 代码默认值              | 命令行参数              | 说明                 |
| -------- | ----------------------- | ----------------------- | -------------------- |
| 代理启用 | `true`                  | `--no-proxy`            | 是否使用代理         |
| 代理地址 | `http://127.0.0.1:7897` | `--proxy <url>`         | HTTP 代理服务器地址  |
| 起始页   | `1`                     | `--start-page <number>` | 爬取起始页码         |
| 结束页   | `100`                   | `--end-page <number>`   | 爬取结束页码         |
| 最大重试 | `3`                     | 暂不支持                | 请求失败最大重试次数 |
| 重试延迟 | `4000ms`                | 暂不支持                | 重试间隔时间         |

````

### 数据库表结构

```sql
CREATE TABLE scraped_data (
  id INT AUTO_INCREMENT PRIMARY KEY,
  type VARCHAR(100),
  title VARCHAR(500),
  torrent_href VARCHAR(500) UNIQUE,
  magnet_href VARCHAR(1000),
  size VARCHAR(50),
  date VARCHAR(50),
  html TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
````

## 📊 核心功能

### 智能重复检测

- **前半部分重复，后半部分新数据**：继续正常爬取
- **全部重复/混合重复**：自动跳过接下来的 10 页
- **无重复数据**：回头爬取之前跳过的页面

### 定时任务

- 每天晚上 6 点自动执行爬取任务
- 完整的执行日志记录
- 支持手动和自动两种模式

### 数据导出

- 按日期倒序导出（最新数据在前）
- 自动生成带时间戳的文件名
- 包含表头样式、自动筛选等 Excel 功能

## 🛠️ 开发脚本

### 基础脚本

```bash
# 开发环境
npm run start              # 运行基础爬虫
npm run start:sql          # 数据库爬虫（支持参数传递）
npm run start:sql:manual   # 手动运行数据库爬虫（支持参数传递）
npm run start:sql:schedule # 启动定时任务（支持参数传递）
npm run start:sql:help     # 显示帮助信息
npm run export:excel       # 导出数据到Excel（支持参数传递）
npm run dev               # 开发模式（热重载）

# 生产环境
npm run build             # 编译TypeScript
npm run prod:sql:manual   # 生产环境手动运行（支持参数传递）
npm run prod:sql:schedule # 生产环境定时任务（支持参数传递）
npm run prod:export:excel # 生产环境数据导出（支持参数传递）
```

### 参数传递示例

```bash
# 开发环境示例
npm run start:sql:manual -- --no-proxy --start-page 1 --end-page 50
npm run start:sql:schedule -- --proxy http://127.0.0.1:8080 --end-page 200
npm run export:excel -- --output-file custom_export.xlsx

# 生产环境示例
npm run prod:sql:manual -- --no-proxy --start-page 10 --end-page 100
npm run prod:sql:schedule -- --proxy http://127.0.0.1:8080
```

> **注意**：使用 npm scripts 传递参数时，需要在脚本名称后添加 `--` 分隔符，然后跟上实际参数。

## 📝 日志记录

### 执行日志表

```sql
CREATE TABLE execution_logs (
  id INT AUTO_INCREMENT PRIMARY KEY,
  start_time DATETIME NOT NULL,
  end_time DATETIME,
  duration_ms INT,
  total_pages INT DEFAULT 0,
  total_items INT DEFAULT 0,
  new_items INT DEFAULT 0,
  duplicate_items INT DEFAULT 0,
  status ENUM('running', 'completed', 'failed'),
  error_message TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

### 查看执行日志

```sql
-- 查看最近10次执行记录
SELECT * FROM execution_logs ORDER BY start_time DESC LIMIT 10;

-- 查看执行统计
SELECT
  DATE(start_time) as date,
  COUNT(*) as executions,
  SUM(new_items) as total_new_items,
  AVG(duration_ms/1000) as avg_duration_seconds
FROM execution_logs
WHERE status = 'completed'
GROUP BY DATE(start_time)
ORDER BY date DESC;
```

## 🚀 部署建议

### 使用 PM2 管理进程

```bash
# 安装 PM2
npm install -g pm2

# 启动定时任务
pm2 start "npm run start:sql:schedule" --name "scraper-scheduler"

# 查看进程状态
pm2 status

# 查看日志
pm2 logs scraper-scheduler
```

### 系统服务部署

创建 systemd 服务文件 `/etc/systemd/system/scraper.service`：

```ini
[Unit]
Description=Web Scraper Service
After=network.target mysql.service

[Service]
Type=simple
User=your_user
WorkingDirectory=/path/to/your/project
ExecStart=/usr/bin/node dist/main_sql.js --schedule
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
```

## 🔍 监控和维护

### 性能监控

- 监控数据库连接数
- 检查磁盘空间使用情况
- 观察内存使用情况
- 定期清理过期日志

### 数据维护

```sql
-- 清理30天前的执行日志
DELETE FROM execution_logs WHERE created_at < DATE_SUB(NOW(), INTERVAL 30 DAY);

-- 查看数据库大小
SELECT
  table_name,
  ROUND(((data_length + index_length) / 1024 / 1024), 2) AS 'Size (MB)'
FROM information_schema.tables
WHERE table_schema = 'scraper_db';
```

## 🤝 贡献指南

1. Fork 本仓库
2. 创建特性分支 (`git checkout -b feature/AmazingFeature`)
3. 提交更改 (`git commit -m 'Add some AmazingFeature'`)
4. 推送到分支 (`git push origin feature/AmazingFeature`)
5. 开启 Pull Request

## 📄 许可证

本项目采用 ISC 许可证 - 查看 [LICENSE](LICENSE) 文件了解详情

## 🆘 常见问题

### Q: 数据库连接失败怎么办？

A: 检查数据库服务是否启动，配置信息是否正确，用户权限是否足够。

### Q: 爬取速度太慢怎么办？

A: 可以调整 `retryDelay` 参数，但要注意不要对目标网站造成过大压力。

### Q: 如何修改爬取的数据字段？

A: 修改 `scrapePage` 方法中的选择器和数据提取逻辑。

### Q: 定时任务没有执行怎么办？

A: 检查系统时间是否正确，cron 表达式是否正确，进程是否正常运行。

## 📞 联系方式

如有问题或建议，请通过以下方式联系：

- 提交 Issue
- 发送 Pull Request
- 邮箱：your-email@example.com

---

⭐ 如果这个项目对你有帮助，请给它一个星标！

