# 定时爬虫任务说明

## 功能概述

本项目已升级支持定时任务功能，可以每天晚上 6 点自动执行爬取任务，并将执行结果记录到数据库的日志表中。

## 新增功能

### 1. 定时任务

- 每天晚上 18:00（北京时间）自动执行爬取任务
- 使用 `node-cron` 库实现定时调度
- 支持手动执行和定时执行两种模式

### 2. 执行日志记录

- 新增 `execution_logs` 表记录每次执行的详细信息
- 记录内容包括：
  - 执行开始时间
  - 执行结束时间
  - 总运行时间（毫秒）
  - 爬取页数
  - 总数据条数
  - 新增数据条数
  - 重复数据条数
  - 执行状态（运行中/完成/失败）
  - 错误信息（如果有）

## 数据库表结构

### execution_logs 表

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
  status ENUM('running', 'completed', 'failed') DEFAULT 'running',
  error_message TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_start_time (start_time),
  INDEX idx_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

## 使用方法

### 安装依赖

```bash
npm install
# 或
pnpm install
```

### 运行模式

#### 1. 手动执行一次爬取

```bash
# 开发模式
npm run start:sql:manual

# 生产模式
npm run prod:sql:manual
```

#### 2. 启动定时任务

```bash
# 开发模式
npm run start:sql:schedule

# 生产模式
npm run prod:sql:schedule
```

#### 3. 直接运行（显示帮助信息）

```bash
npm run start:sql
```

### 命令行参数

- `--manual`: 手动执行一次爬取任务
- `--schedule`: 启动定时任务模式
- 无参数: 显示使用帮助

## 日志查看

### 查看执行历史

```sql
SELECT
  id,
  start_time,
  end_time,
  ROUND(duration_ms/1000/60, 2) as duration_minutes,
  total_pages,
  total_items,
  new_items,
  duplicate_items,
  status,
  error_message
FROM execution_logs
ORDER BY start_time DESC
LIMIT 10;
```

### 查看执行统计

```sql
SELECT
  DATE(start_time) as date,
  COUNT(*) as executions,
  SUM(new_items) as total_new_items,
  SUM(duplicate_items) as total_duplicates,
  AVG(duration_ms/1000/60) as avg_duration_minutes
FROM execution_logs
WHERE status = 'completed'
GROUP BY DATE(start_time)
ORDER BY date DESC;
```

## 部署建议

### 1. 生产环境部署

```bash
# 编译TypeScript
npm run build:sql

# 启动定时任务（建议使用进程管理器如PM2）
pm2 start "node dist/main_sql.js --schedule" --name "web-scraper-scheduler"
```

### 2. 使用 PM2 管理

```bash
# 安装PM2
npm install -g pm2

# 启动定时任务
pm2 start dist/main_sql.js --name "scraper-scheduler" -- --schedule

# 查看日志
pm2 logs scraper-scheduler

# 重启
pm2 restart scraper-scheduler

# 停止
pm2 stop scraper-scheduler
```

### 3. 系统服务（Linux）

创建 systemd 服务文件 `/etc/systemd/system/web-scraper.service`：

```ini
[Unit]
Description=Web Scraper Scheduler
After=network.target

[Service]
Type=simple
User=your-user
WorkingDirectory=/path/to/your/project
ExecStart=/usr/bin/node dist/main_sql.js --schedule
Restart=always
RestartSec=10
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
```

启用服务：

```bash
sudo systemctl enable web-scraper
sudo systemctl start web-scraper
sudo systemctl status web-scraper
```

## 注意事项

1. **时区设置**: 定时任务使用 `Asia/Shanghai` 时区，确保服务器时区正确
2. **数据库连接**: 确保 MySQL 服务正常运行且连接配置正确
3. **网络代理**: 如果使用代理，确保代理服务正常运行
4. **日志监控**: 建议定期清理执行日志表，避免数据过多影响性能
5. **错误处理**: 程序会自动记录错误信息到日志表，便于问题排查

## 监控和维护

### 日志清理

建议定期清理旧的执行日志：

```sql
-- 删除30天前的日志
DELETE FROM execution_logs
WHERE created_at < DATE_SUB(NOW(), INTERVAL 30 DAY);
```

### 性能监控

```sql
-- 查看最近失败的执行
SELECT * FROM execution_logs
WHERE status = 'failed'
ORDER BY start_time DESC
LIMIT 5;

-- 查看平均执行时间趋势
SELECT
  DATE(start_time) as date,
  AVG(duration_ms/1000/60) as avg_minutes,
  MIN(duration_ms/1000/60) as min_minutes,
  MAX(duration_ms/1000/60) as max_minutes
FROM execution_logs
WHERE status = 'completed'
GROUP BY DATE(start_time)
ORDER BY date DESC
LIMIT 7;
```
