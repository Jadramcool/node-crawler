# Web Scraper with MySQL Database

这是一个基于 Node.js 和 TypeScript 的网页爬虫，数据存储到 MySQL 数据库中。

## 功能特性

- 支持多页面爬取
- 数据存储到 MySQL 数据库
- 自动去重（基于下载链接）
- 支持代理设置
- 重试机制
- 连接池管理

## 环境要求

- Node.js 16+
- MySQL 5.7+ 或 MySQL 8.0+
- TypeScript

## 安装步骤

1. 安装依赖包：

```bash
npm install
# 或者使用 pnpm
pnpm install
```

2. 设置 MySQL 数据库：

   - 创建数据库：`CREATE DATABASE scraper_db;`
   - 确保 MySQL 服务正在运行

3. 配置数据库连接：
   在 `main.ts` 文件中修改数据库配置：

```typescript
database: {
  host: "localhost",
  port: 3306,
  user: "root",
  password: "your_password", // 修改为你的MySQL密码
  database: "scraper_db"
}
```

## 数据库表结构

程序会自动创建 `scraped_data` 表，包含以下字段：

- `id`: 自增主键
- `type`: 类型
- `title`: 标题
- `torrent_href`: 下载链接
- `magnet_href`: 磁力链接
- `size`: 文件大小
- `date`: 日期
- `html`: 原始 HTML
- `created_at`: 创建时间

## 使用方法

```bash
npm start
# 或者
pnpm start
```

## 配置说明

在 `main.ts` 中可以配置：

- `targetUrl`: 目标网站 URL
- `proxyUrl`: 代理服务器（可选）
- `startPage`: 开始页码
- `endPage`: 结束页码
- `maxRetries`: 最大重试次数
- `retryDelay`: 重试延迟时间（毫秒）
- `database`: 数据库连接配置

## 注意事项

1. 请确保 MySQL 数据库已正确安装并运行
2. 修改数据库密码为你的实际密码
3. 首次运行会自动创建数据表
4. 程序使用 `INSERT IGNORE` 来避免重复数据
5. 请遵守目标网站的 robots.txt 和使用条款

## 故障排除

### 数据库连接失败

- 检查 MySQL 服务是否运行
- 验证用户名和密码是否正确
- 确认数据库是否存在

### 爬取失败

- 检查网络连接
- 验证代理设置（如果使用）
- 检查目标网站是否可访问
