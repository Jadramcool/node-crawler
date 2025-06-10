# 统一入口使用说明

## 概述

本项目现在提供了一个统一的入口文件 `index.ts`，可以通过命令行参数控制执行不同的爬虫脚本，并支持灵活的配置选项。

## 功能特性

- 🚀 统一入口控制多个爬虫脚本
- ⚙️ 命令行参数配置页码范围
- 🔧 支持手动和定时模式
- 🌐 代理配置支持（main爬虫）
- 📖 内置帮助文档

## 使用方法

### 基本语法

```bash
ts-node index.ts [选项]
```

### 可用选项

| 选项 | 简写 | 描述 | 默认值 |
|------|------|------|--------|
| `--scraper <type>` | `-s` | 指定爬虫类型 (main\|kb) | main |
| `--start-page <number>` | - | 起始页码 | 1 |
| `--end-page <number>` | - | 结束页码 | 100 |
| `--manual` | - | 手动模式 | false |
| `--schedule` | - | 定时模式 | false |
| `--no-proxy` | - | 禁用代理 (仅main爬虫) | false |
| `--proxy <url>` | - | 指定代理地址 (仅main爬虫) | - |
| `--help` | `-h` | 显示帮助信息 | - |

## 使用示例

### 1. 基本使用

```bash
# 使用默认配置启动main爬虫
ts-node index.ts

# 显示帮助信息
ts-node index.ts --help
```

### 2. 指定爬虫类型

```bash
# 启动main爬虫
ts-node index.ts --scraper main

# 启动kb爬虫
ts-node index.ts --scraper kb
```

### 3. 配置页码范围

```bash
# main爬虫：爬取1-50页
ts-node index.ts --scraper main --start-page 1 --end-page 50

# kb爬虫：爬取100-200页
ts-node index.ts --scraper kb --start-page 100 --end-page 200
```

### 4. 模式配置

```bash
# 手动模式
ts-node index.ts --scraper main --manual

# 定时模式
ts-node index.ts --scraper kb --schedule
```

### 5. 代理配置（仅main爬虫）

```bash
# 禁用代理
ts-node index.ts --scraper main --no-proxy

# 指定代理地址
ts-node index.ts --scraper main --proxy http://127.0.0.1:7897

# 定时模式 + 禁用代理
ts-node index.ts --scraper main --schedule --no-proxy
```

### 6. 复合配置示例

```bash
# kb爬虫：手动模式，爬取500-821页
ts-node index.ts --scraper kb --manual --start-page 500 --end-page 821

# main爬虫：定时模式，爬取1-100页，使用自定义代理
ts-node index.ts --scraper main --schedule --start-page 1 --end-page 100 --proxy http://127.0.0.1:8080
```

## NPM Scripts

为了方便使用，项目还提供了预定义的npm脚本：

### 新版本脚本（推荐）

```bash
# 基本启动
npm run start

# 启动main爬虫
npm run start:main

# 启动kb爬虫
npm run start:kb

# main爬虫手动模式
npm run start:main:manual

# main爬虫定时模式
npm run start:main:schedule

# main爬虫定时模式（无代理）
npm run start:main:schedule:noProxy

# kb爬虫手动模式
npm run start:kb:manual

# kb爬虫定时模式
npm run start:kb:schedule

# 显示帮助
npm run help

# 开发模式
npm run dev
```

### 兼容性脚本（legacy）

为了保持向后兼容，原有的脚本仍然可用，但建议使用新的统一入口：

```bash
npm run legacy:start
npm run legacy:start:manual
npm run legacy:start:schedule
npm run legacy:start:schedule:noProxy
npm run legacy:start:kb
npm run legacy:start:kb:manual
npm run legacy:start:kb:schedule
```

## 爬虫类型说明

### Main爬虫 (`main.ts`)
- 基于axios和cheerio的传统爬虫
- 支持代理配置
- 适用于简单的HTML页面抓取
- 支持智能跳页和重复检测

### KB爬虫 (`main_kb.ts`)
- 基于Playwright的浏览器自动化爬虫
- 适用于JavaScript渲染的动态页面
- 支持截图功能
- 专门针对sykb169.org网站优化

## 注意事项

1. **页码范围验证**：起始页码必须大于0，结束页码必须大于等于起始页码
2. **爬虫类型验证**：只支持 `main` 和 `kb` 两种类型
3. **代理配置**：代理相关参数仅对main爬虫有效
4. **数据库配置**：两个爬虫都使用相同的数据库配置
5. **错误处理**：如果参数无效，程序会显示错误信息并退出

## 故障排除

### 常见问题

1. **"无效的爬虫类型"错误**
   - 确保使用 `main` 或 `kb` 作为爬虫类型

2. **"无效的页码范围"错误**
   - 检查起始页码是否大于0
   - 检查结束页码是否大于等于起始页码

3. **ts-node命令不存在**
   - 确保已安装TypeScript和ts-node
   - 运行 `npm install` 安装依赖

4. **数据库连接失败**
   - 检查数据库配置是否正确
   - 确保数据库服务正在运行

### 调试模式

如果遇到问题，可以查看详细的启动信息：

```bash
# 启动时会显示详细信息
ts-node index.ts --scraper kb --start-page 1 --end-page 10
```

输出示例：
```
🚀 启动KB爬虫...
📄 脚本路径: /path/to/main_kb.ts
⚙️  参数: --start-page 1 --end-page 10
📊 页码范围: 1 - 10
```

## 更新日志

- **v1.0.0**: 初始版本，支持统一入口和命令行配置
- 添加了完整的参数验证和错误处理
- 保持了与原有脚本的完全兼容性
- 提供了丰富的npm scripts快捷方式