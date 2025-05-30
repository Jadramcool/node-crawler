import axios, { AxiosInstance } from "axios";
import * as cheerio from "cheerio";
import mysql from "mysql2/promise";
import * as cron from "node-cron";

interface DatabaseConfig {
  host: string;
  port: number;
  user: string;
  password: string;
  database: string;
}

interface ScraperConfig {
  targetUrl: string;
  proxyUrl?: string;
  selectors: {
    [key: string]: string;
  };
  startPage: number;
  endPage: number;
  maxRetries?: number;
  retryDelay?: number;
  database: DatabaseConfig;
}

interface ScrapeResults {
  [key: string]: any; // 修改类型以支持更复杂的数据结构
}

interface ExecutionLog {
  id?: number;
  start_time: Date;
  end_time?: Date;
  duration_ms?: number;
  total_pages: number;
  total_items: number;
  new_items: number;
  duplicate_items: number;
  status: "running" | "completed" | "failed";
  error_message?: string;
  created_at?: Date;
}

const config: ScraperConfig = {
  targetUrl: "https://u3c3.u3c3u3c3u3c3.com",
  proxyUrl: "http://127.0.0.1:7897",
  selectors: {
    rows: "table tbody tr",
  },
  startPage: 1,
  endPage: 100,
  maxRetries: 3,
  retryDelay: 4000,
  database: {
    host: "localhost",
    port: 3306,
    user: "root",
    password: "123456",
    database: "scraper_db",
  },
};

// 数据库连接池
let pool: mysql.Pool;

class WebScraper {
  private axiosInstance: AxiosInstance;
  private config: ScraperConfig;

  constructor(config: ScraperConfig) {
    this.config = {
      maxRetries: 3,
      retryDelay: 3000,
      ...config,
    };

    // 配置axios实例
    this.axiosInstance = axios.create({
      proxy: config.proxyUrl
        ? {
            host: new URL(config.proxyUrl).hostname,
            port: parseInt(new URL(config.proxyUrl).port),
            protocol: new URL(config.proxyUrl).protocol.slice(0, -1),
          }
        : undefined,
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        Accept:
          "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
        "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
        "Cache-Control": "no-cache",
        Pragma: "no-cache",
      },
      timeout: 10000,
    });
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  private async retryOperation<T>(
    operation: () => Promise<T>,
    retryCount = 0
  ): Promise<T> {
    try {
      return await operation();
    } catch (error) {
      if (retryCount < (this.config.maxRetries || 3)) {
        console.log(
          `操作失败，${this.config.retryDelay}ms后进行第${
            retryCount + 1
          }次重试...`
        );
        await this.delay(this.config.retryDelay || 3000);
        return this.retryOperation(operation, retryCount + 1);
      }
      throw error;
    }
  }

  private getPageUrl(pageNumber: number): string {
    return pageNumber > 1
      ? `${this.config.targetUrl}/?p=${pageNumber}`
      : this.config.targetUrl;
  }

  async scrape(): Promise<ScrapeResults> {
    const results: ScrapeResults = {
      pages: [],
      totalItems: 0,
      totalInserted: 0,
      totalDuplicate: 0,
    };

    // 记录需要回头爬取的页码
    const skippedPages: number[] = [];
    // 记录当前是否处于回头爬取模式
    let isBacktracking = false;
    // 记录上一次跳页的起始页码，避免重复跳页
    let lastSkipStartPage = -1;

    let page = this.config.startPage;
    while (page <= this.config.endPage) {
      try {
        console.log(
          `开始爬取第 ${page} 页${isBacktracking ? " (回头爬取模式)" : ""}...`
        );
        const pageResult = await this.scrapePage(page);
        results.pages.push(pageResult);
        results.totalItems += pageResult.items.length;

        // 分析页面内重复数据的分布情况
        const pageAnalysis = await analyzePageDuplicates(pageResult);

        // 立即保存当前页数据到数据库
        console.log(`正在保存第 ${page} 页数据到数据库...`);
        const saveResult = await savePageToDatabase(pageResult);
        results.totalInserted =
          (results.totalInserted || 0) + saveResult.insertedCount;
        results.totalDuplicate =
          (results.totalDuplicate || 0) + saveResult.duplicateCount;

        // 根据页面内重复分布决定是否跳页
        if (saveResult.duplicateCount > 0 && !isBacktracking) {
          if (pageAnalysis.pattern === "start_duplicate_then_new") {
            // 开始重复但中间不重复，继续正常爬取
            console.log(
              `第 ${page} 页：开始部分重复但中间有新数据，继续正常爬取`
            );
            page++;
          } else {
            // 检查是否刚刚跳过来的页面，避免重复跳页
            if (lastSkipStartPage !== -1 && page <= lastSkipStartPage + 9) {
              console.log(
                `第 ${page} 页：检测到重复数据，但这是刚跳过来的页面，继续正常爬取避免重复跳页`
              );
              page++;
            } else {
              // 清空skippedPages
              skippedPages.length = 0;
              // 其他所有情况（包括全部重复、开始不重复但中间重复等），都跳页
              const pagesToSkip = [];
              for (let i = 1; i <= 9; i++) {
                const skipPage = page + i;
                if (skipPage < this.config.endPage) {
                  pagesToSkip.push(skipPage);
                  skippedPages.push(skipPage);
                }
              }

              if (pagesToSkip.length > 0) {
                console.log(
                  `第 ${page} 页：检测到重复数据模式 "${
                    pageAnalysis.pattern
                  }"，跳过接下来的 ${pagesToSkip.length} 页: ${pagesToSkip.join(
                    ", "
                  )}`
                );
                page += pagesToSkip.length + 1; // 页码跳转到跳过页面之后
              } else {
                page++; // 如果已经接近结束页，则正常递增
              }
            }
          }
        } else {
          // 如果没有重复数据，且之前有跳过的页面，则进入回头爬取模式
          if (!isBacktracking && skippedPages.length > 0) {
            console.log(
              `第 ${page} 页：无重复数据，开始回头爬取之前跳过的页面`
            );
            lastSkipStartPage = page; // 记录本次跳页的起始页码
            isBacktracking = true;
            page = skippedPages.shift() || this.config.endPage + 1; // 取出第一个跳过的页码
          } else {
            // 正常递增或回头爬取模式下的递增
            if (isBacktracking && skippedPages.length > 0) {
              page = skippedPages.shift() || this.config.endPage + 1; // 取出下一个跳过的页码
            } else {
              isBacktracking = false; // 回头爬取完成，恢复正常模式
              page++; // 正常递增
            }
          }
        }

        // 避免爬取过快
        if (page <= this.config.endPage) {
          //   延迟时间在retryDelay正负一秒内
          const delay =
            (this.config.retryDelay || 3000) +
            Math.floor(Math.random() * 2000) -
            1000;
          console.log(`等待 ${delay}ms 后继续爬取下一页...`);
          await this.delay(delay || 1000);
        }
      } catch (error) {
        console.error(`爬取第 ${page} 页失败，继续爬取下一页`, error);
        page++; // 出错时也递增页码
      }
    }

    console.log(
      `全部爬取完成，共爬取 ${results.pages.length} 页，${results.totalItems} 条数据，` +
        `新增 ${results.totalInserted} 条，重复 ${results.totalDuplicate} 条`
    );
    return results;
  }

  async scrapePage(pageNumber: number): Promise<ScrapeResults> {
    return this.retryOperation(async () => {
      try {
        const pageUrl = this.getPageUrl(pageNumber);
        console.log(`正在爬取第 ${pageNumber} 页: ${pageUrl}`);
        const response = await this.axiosInstance.get(pageUrl);
        const $ = cheerio.load(response.data);
        const items: any[] = [];

        // 提取表格行数据
        $(config.selectors.rows).each((index, row) => {
          // 跳过前两个表格行（可能是表头）
          if (index < 2) return;

          const $row = $(row);
          const $typeTd = $row.find("td:first-child"); // 类型
          const $titleTd = $row.find("td:nth-child(2)"); // 名称
          const $linkTd = $row.find("td:nth-child(3)"); // 链接
          const $sizeTd = $row.find("td:nth-child(4)"); // 大小
          const $dateTd = $row.find("td:nth-child(5)"); // 日期
          const $typeLink = $typeTd.find("a").first(); // 类型 a 标签
          const $titleLink = $titleTd.find("a").first(); // 在第二个 td 中查找 a 标签

          // 获取第三个单元格中的所有链接
          const thirdTdLinks: string[] = [];
          $linkTd.find("a").each((_, link) => {
            thirdTdLinks.push($(link).attr("href") || "");
          });

          const rowData = {
            type: $typeLink.attr("title") || "", // 类型
            title: $titleLink.text().trim(), // 获取 a 标签的 title 属性
            torrentHref: thirdTdLinks[0] || "", // 获取下载链接
            magnetHref: thirdTdLinks[1] || "", // 获取磁力链接
            size: $sizeTd.text().trim(), // 获取大小文本
            date: $dateTd.text().trim(), // 获取日期文本
            html: $.html(row), // 保存整行的 HTML
          };

          items.push(rowData);
        });

        console.log(`第 ${pageNumber} 页爬取完成，共 ${items.length} 条数据`);
        return {
          pageNumber,
          url: pageUrl,
          items,
        };
      } catch (error) {
        console.error("爬取过程中发生错误:", error);
        throw error;
      }
    });
  }
}

// 初始化数据库连接和创建表
async function initDatabase() {
  try {
    // 创建数据库连接池
    pool = mysql.createPool({
      host: config.database.host,
      port: config.database.port,
      user: config.database.user,
      password: config.database.password,
      database: config.database.database,
      waitForConnections: true,
      connectionLimit: 10,
      queueLimit: 0,
    });

    // 创建数据库（如果不存在）
    const connection = await mysql.createConnection({
      host: config.database.host,
      port: config.database.port,
      user: config.database.user,
      password: config.database.password,
    });

    await connection.execute(
      `CREATE DATABASE IF NOT EXISTS ${config.database.database}`
    );
    await connection.end();

    // 创建数据表（如果不存在）
    const createDataTableSQL = `
      CREATE TABLE IF NOT EXISTS scraped_data (
        id INT AUTO_INCREMENT PRIMARY KEY,
        type VARCHAR(100),
        title VARCHAR(500),
        torrent_href VARCHAR(500) UNIQUE,
        magnet_href VARCHAR(1000),
        size VARCHAR(50),
        date VARCHAR(50),
        html TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_torrent_href (torrent_href)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `;

    // 创建执行日志表（如果不存在）
    const createLogTableSQL = `
      CREATE TABLE IF NOT EXISTS execution_logs (
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
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `;

    await pool.execute(createDataTableSQL);
    await pool.execute(createLogTableSQL);
    console.log("数据库初始化完成");
  } catch (error) {
    console.error("数据库初始化失败:", error);
    throw error;
  }
}

// 分析页面内重复数据的分布模式
async function analyzePageDuplicates(pageData: any): Promise<{
  pattern:
    | "all_new"
    | "all_duplicate"
    | "start_duplicate_then_new"
    | "new_then_duplicate"
    | "mixed";
  duplicateIndexes: number[];
}> {
  const duplicateIndexes: number[] = [];

  // 检查每个数据项是否重复
  for (let i = 0; i < pageData.items.length; i++) {
    const item = pageData.items[i];
    try {
      const [rows] = (await pool.execute(
        "SELECT COUNT(*) as count FROM scraped_data WHERE torrent_href = ?",
        [item.torrentHref]
      )) as any;

      if (rows[0].count > 0) {
        duplicateIndexes.push(i);
      }
    } catch (error) {
      console.error("检查重复数据时出错:", error);
    }
  }

  // 分析重复模式
  const totalItems = pageData.items.length;
  const duplicateCount = duplicateIndexes.length;

  if (duplicateCount === 0) {
    return { pattern: "all_new", duplicateIndexes };
  }

  if (duplicateCount === totalItems) {
    return { pattern: "all_duplicate", duplicateIndexes };
  }

  // 检查是否从开始重复然后变新
  const firstHalfDuplicates = duplicateIndexes.filter(
    (i) => i < totalItems / 2
  ).length;
  const secondHalfDuplicates = duplicateIndexes.filter(
    (i) => i >= totalItems / 2
  ).length;

  if (firstHalfDuplicates > 0 && secondHalfDuplicates === 0) {
    return { pattern: "start_duplicate_then_new", duplicateIndexes };
  }

  if (firstHalfDuplicates === 0 && secondHalfDuplicates > 0) {
    return { pattern: "new_then_duplicate", duplicateIndexes };
  }

  return { pattern: "mixed", duplicateIndexes };
}

// 保存单页数据到数据库
async function savePageToDatabase(pageData: any) {
  try {
    let insertedCount = 0;
    let duplicateCount = 0;

    for (const item of pageData.items) {
      try {
        // 检查是否已存在相同的下载链接
        const [existing] = (await pool.execute(
          "SELECT id FROM scraped_data WHERE torrent_href = ?",
          [item.torrentHref]
        )) as any;

        if (existing.length > 0) {
          //   console.log(`跳过重复数据: ${item.title}`);
          duplicateCount++;
          continue;
        }

        // 插入新数据
        await pool.execute(
          `INSERT INTO scraped_data (type, title, torrent_href, magnet_href, size, date, html) 
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [
            item.type,
            item.title,
            item.torrentHref,
            item.magnetHref,
            item.size,
            item.date,
            item.html,
          ]
        );

        insertedCount++;
        // console.log(`成功插入数据: ${item.title}`);
      } catch (error: any) {
        if (error.code === "ER_DUP_ENTRY") {
          //   console.log(`跳过重复数据: ${item.title}`);
          duplicateCount++;
        } else {
          console.error(`插入数据失败: ${item.title}`, error);
        }
      }
    }

    console.log(
      `第 ${pageData.pageNumber} 页数据保存完成: 新增 ${insertedCount} 条，重复 ${duplicateCount} 条`
    );
    return { insertedCount, duplicateCount };
  } catch (error) {
    console.error(`保存第 ${pageData.pageNumber} 页数据到数据库失败:`, error);
    throw error;
  }
}

// 关闭数据库连接
async function closeDatabase() {
  if (pool) {
    await pool.end();
    console.log("数据库连接已关闭");
  }
}

// 记录执行日志到数据库
async function logExecution(log: ExecutionLog): Promise<number> {
  try {
    const [result] = (await pool.execute(
      `INSERT INTO execution_logs (start_time, end_time, duration_ms, total_pages, total_items, new_items, duplicate_items, status, error_message)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        log.start_time,
        log.end_time || null,
        log.duration_ms || null,
        log.total_pages,
        log.total_items,
        log.new_items,
        log.duplicate_items,
        log.status,
        log.error_message || null,
      ]
    )) as any;
    return result.insertId;
  } catch (error) {
    console.error("记录执行日志失败:", error);
    throw error;
  }
}

// 更新执行日志
async function updateExecutionLog(
  id: number,
  updates: Partial<ExecutionLog>
): Promise<void> {
  try {
    const fields = [];
    const values = [];

    if (updates.end_time !== undefined) {
      fields.push("end_time = ?");
      values.push(updates.end_time);
    }
    if (updates.duration_ms !== undefined) {
      fields.push("duration_ms = ?");
      values.push(updates.duration_ms);
    }
    if (updates.total_pages !== undefined) {
      fields.push("total_pages = ?");
      values.push(updates.total_pages);
    }
    if (updates.total_items !== undefined) {
      fields.push("total_items = ?");
      values.push(updates.total_items);
    }
    if (updates.new_items !== undefined) {
      fields.push("new_items = ?");
      values.push(updates.new_items);
    }
    if (updates.duplicate_items !== undefined) {
      fields.push("duplicate_items = ?");
      values.push(updates.duplicate_items);
    }
    if (updates.status !== undefined) {
      fields.push("status = ?");
      values.push(updates.status);
    }
    if (updates.error_message !== undefined) {
      fields.push("error_message = ?");
      values.push(updates.error_message);
    }

    if (fields.length > 0) {
      values.push(id);
      await pool.execute(
        `UPDATE execution_logs SET ${fields.join(", ")} WHERE id = ?`,
        values
      );
    }
  } catch (error) {
    console.error("更新执行日志失败:", error);
    throw error;
  }
}

// 执行爬取任务并记录日志
async function executeScrapingTask(): Promise<void> {
  const startTime = new Date();
  let logId: number | null = null;

  try {
    // 初始化数据库
    await initDatabase();

    // 记录开始执行的日志
    logId = await logExecution({
      start_time: startTime,
      total_pages: 0,
      total_items: 0,
      new_items: 0,
      duplicate_items: 0,
      status: "running",
    });

    console.log(
      `[${startTime.toISOString()}] 开始执行定时爬取任务，日志ID: ${logId}`
    );

    const scraper = new WebScraper(config);
    const results = await scraper.scrape();

    const endTime = new Date();
    const duration = endTime.getTime() - startTime.getTime();

    // 更新执行日志为完成状态
    await updateExecutionLog(logId, {
      end_time: endTime,
      duration_ms: duration,
      total_pages: results.pages?.length || 0,
      total_items: results.totalItems || 0,
      new_items: results.totalInserted || 0,
      duplicate_items: results.totalDuplicate || 0,
      status: "completed",
    });

    console.log(`[${endTime.toISOString()}] 爬取任务完成！`);
    console.log(
      `执行时间: ${duration}ms (${(duration / 1000 / 60).toFixed(2)}分钟)`
    );
    console.log(`总页数: ${results.pages?.length || 0}`);
    console.log(`总数据: ${results.totalItems || 0} 条`);
    console.log(`新增: ${results.totalInserted || 0} 条`);
    console.log(`重复: ${results.totalDuplicate || 0} 条`);
  } catch (error) {
    const endTime = new Date();
    const duration = endTime.getTime() - startTime.getTime();

    let errorMessage = "未知错误";
    if (axios.isAxiosError(error)) {
      errorMessage = `网络请求错误: ${error.message} (状态码: ${error.response?.status})`;
    } else if (error instanceof Error) {
      errorMessage = error.message;
    }

    console.error(`[${endTime.toISOString()}] 爬取任务执行失败:`, errorMessage);

    // 更新执行日志为失败状态
    if (logId) {
      try {
        await updateExecutionLog(logId, {
          end_time: endTime,
          duration_ms: duration,
          status: "failed",
          error_message: errorMessage,
        });
      } catch (logError) {
        console.error("更新失败日志时出错:", logError);
      }
    }
  } finally {
    // 关闭数据库连接
    await closeDatabase();
  }
}

// 手动执行模式
async function main() {
  console.log("手动执行爬取任务...");
  await executeScrapingTask();
}

// 启动定时任务
function startScheduledTask() {
  console.log("启动定时爬取任务，每天晚上6点执行...");

  // 每天晚上6点执行 (0 18 * * *)
  cron.schedule(
    "0 18 * * *",
    async () => {
      console.log("定时任务触发，开始执行爬取...");
      await executeScrapingTask();
    },
    {
      scheduled: true,
      timezone: "Asia/Shanghai", // 设置时区为中国时区
    }
  );

  console.log("定时任务已启动，程序将保持运行状态...");

  // 保持程序运行
  process.on("SIGINT", () => {
    console.log("\n收到退出信号，正在关闭程序...");
    process.exit(0);
  });
}

// 根据命令行参数决定执行模式
if (process.argv.includes("--schedule")) {
  // 定时任务模式
  startScheduledTask();
} else if (process.argv.includes("--manual")) {
  // 手动执行模式
  main();
} else {
  // 默认显示帮助信息
  console.log("使用方法:");
  console.log("  npm run start --manual    # 手动执行一次爬取");
  console.log("  npm run start --schedule  # 启动定时任务（每天晚上6点执行）");
  console.log("");
  console.log("或者直接使用 node 命令:");
  console.log("  node main_sql.js --manual");
  console.log("  node main_sql.js --schedule");
}
