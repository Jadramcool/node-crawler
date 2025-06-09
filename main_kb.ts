import { chromium, Page } from "playwright";
import mysql from "mysql2/promise";

// 数据库配置
const dbConfig = {
  host: "117.72.60.94",
  port: 3306,
  user: "root",
  password: "JIADAOMING0119",
  database: "scraper_db",
};

// 数据库连接
let connection: mysql.Connection | null = null;

interface Config {
  baseUrl: string;
  urlPattern: string;
  startPage: number;
  endPage: number;
  baseDelay: number;
}

const config: Config = {
  baseUrl: "https://sykb169.org",
  urlPattern: "/forum-2-{page}.html",
  startPage: 1,
  endPage: 821,
  baseDelay: 5000,
};

// 带 emoji 的日志函数
const log = (
  message: string,
  type:
    | "info"
    | "error"
    | "success"
    | "warning"
    | "process"
    | "action"
    | "result" = "info"
) => {
  const timestamp = new Date().toISOString().slice(0, 19).replace("T", " ");
  const emojis = {
    info: "🔵",
    error: "❌",
    success: "✅",
    warning: "⚠️",
    process: "⏳",
    action: "🚀",
    result: "📊",
  };
  console.log(`[${timestamp}] ${emojis[type]} ${message}`);
};

// 初始化数据库连接和表
const initDatabase = async () => {
  try {
    log("开始连接数据库 🔌", "action");
    connection = await mysql.createConnection(dbConfig);
    log("数据库连接成功 ✅", "success");

    // 创建sykb表（如果不存在）
    log("开始创建数据表 🗃️", "action");
    const createTableQuery = `
      CREATE TABLE IF NOT EXISTS sykb (
        id INT AUTO_INCREMENT PRIMARY KEY,
        title VARCHAR(500) NOT NULL,
        detail_link VARCHAR(500) UNIQUE,
        status TINYINT DEFAULT 1,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      )
    `;

    await connection.execute(createTableQuery);
    log("sykb表创建成功或已存在 ✅", "success");
  } catch (error: any) {
    log(`数据库初始化失败: ${error.message} ❌`, "error");
    throw error;
  }
};

// 数据处理统计
interface ProcessStats {
  linkDuplicates: number;
  titleDuplicates: number;
  inserted: number;
  updated: number;
}

// 插入数据到数据库（避免重复）
const insertToDatabase = async (
  data: ThreadData
): Promise<"link_duplicate" | "title_updated" | "inserted" | "error"> => {
  if (!connection) {
    return "error";
  }

  try {
    const { title, detail_link } = data;

    // 检查是否已存在相同的链接
    const [existingByLink] = await connection.execute(
      "SELECT id FROM sykb WHERE detail_link = ?",
      [detail_link]
    );

    if ((existingByLink as any[]).length > 0) {
      return "link_duplicate";
    }

    // 检查是否存在相同标题但没有detail_link的旧数据
    const [existingByTitle] = await connection.execute(
      "SELECT id, detail_link FROM sykb WHERE title = ? AND (detail_link IS NULL OR detail_link = '')",
      [title]
    );

    if ((existingByTitle as any[]).length > 0) {
      // 更新旧数据的detail_link
      const oldRecord = (existingByTitle as any[])[0];
      await connection.execute(
        "UPDATE sykb SET detail_link = ?, updated_at = NOW() WHERE id = ?",
        [detail_link, oldRecord.id]
      );
      return "title_updated";
    }

    // 插入新数据
    const insertQuery = `
      INSERT INTO sykb (title, detail_link)
      VALUES (?, ?)
    `;

    await connection.execute(insertQuery, [title, detail_link]);
    return "inserted";
  } catch (error: any) {
    return "error";
  }
};

// 关闭数据库连接
const closeDatabase = async () => {
  try {
    if (connection) {
      log("开始关闭数据库连接 🔒", "action");
      await connection.end();
      connection = null;
      log("数据库连接已关闭 ✅", "success");
    }
  } catch (error: any) {
    log(`关闭数据库连接时出错: ${error.message} ❌`, "error");
    connection = null;
  }
};

const scrape = async () => {
  let browser;
  try {
    await initDatabase();

    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext();
    const page = await context.newPage();

    for (
      let pageNumber = config.startPage;
      pageNumber <= config.endPage;
      pageNumber++
    ) {
      await runSinglePageScrape(page, pageNumber);
      if (pageNumber < config.endPage) {
        await new Promise((resolve) => setTimeout(resolve, config.baseDelay));
      }
    }

    await browser.close();
    log("✅ 爬取任务完成", "success");
  } catch (error: any) {
    log(`❌ 爬取失败: ${error.message}`, "error");
    if (browser) await browser.close();
  } finally {
    await closeDatabase();
  }
};

interface ThreadData {
  title: string;
  detail_link: string;
}

const runSinglePageScrape = async (page: Page, pageNumber: number) => {
  const url = generateUrl(pageNumber);
  log(`📃 第 ${pageNumber} 页: ${url}`, "action");

  try {
    // 导航到页面
    await page.goto(url, { waitUntil: "networkidle" });

    // 提取页面数据
    const results = await page.evaluate<ThreadData[]>(() => {
      const threadElements = document.querySelectorAll("#waterfall > li");
      return Array.from(threadElements).map((thread) => {
        const titleElement = thread.querySelector("h3");
        const linkElement = thread.querySelector("h3 a");
        const title = titleElement?.textContent?.trim() || "未找到标题";
        const link = linkElement?.getAttribute("href") || "#";
        return {
          title,
          detail_link: new URL(link, window.location.origin).href,
        };
      });
    });

    // 处理数据并统计
    const stats: ProcessStats = {
      linkDuplicates: 0,
      titleDuplicates: 0,
      inserted: 0,
      updated: 0,
    };

    for (const item of results) {
      const result = await insertToDatabase(item);
      switch (result) {
        case "link_duplicate":
          stats.linkDuplicates++;
          break;
        case "title_updated":
          stats.updated++;
          break;
        case "inserted":
          stats.inserted++;
          break;
      }
    }

    // 打印统计结果
    log(
      `📊 第${pageNumber}页统计: 提取${results.length}条 | 链接重复${stats.linkDuplicates}条 | 标题更新${stats.updated}条 | 新增${stats.inserted}条`,
      "result"
    );

    // 保存截图
    await page.screenshot({
      path: `./screenshot/screenshot_${pageNumber}.png`,
    });
  } catch (error: any) {
    await page?.screenshot({ path: `./screenshot/error_${pageNumber}.png` });
    log(`❌ 第${pageNumber}页失败: ${error.message}`, "error");
    throw error;
  }
};

const generateUrl = (pageNumber: number): string => {
  const urlPath = config.urlPattern.replace("{page}", pageNumber.toString());
  return config.baseUrl + urlPath;
};

const main = async () => {
  log("🚀 启动爬取任务", "success");
  await scrape();
  log("✨ 爬取任务结束", "success");
};

main();
