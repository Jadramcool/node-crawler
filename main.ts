import axios, { AxiosInstance } from "axios";
import * as cheerio from "cheerio";
import fs from "fs";
import ExcelJS from "exceljs";

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
}

interface ScrapeResults {
  [key: string]: any; // 修改类型以支持更复杂的数据结构
}

const config: ScraperConfig = {
  targetUrl: "https://u3c3.u3c3u3c3u3c3.com/",
  proxyUrl: "http://127.0.0.1:7897",
  selectors: {
    rows: "table tbody tr",
  },
  startPage: 1,
  endPage: 10,
  maxRetries: 3,
  retryDelay: 4000,
};

class WebScraper {
  private axiosInstance: AxiosInstance;
  private config: ScraperConfig;

  constructor(config: ScraperConfig) {
    this.config = {
      maxRetries: 3,
      retryDelay: 1000,
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
        await this.delay(this.config.retryDelay || 1000);
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
    };

    for (
      let page = this.config.startPage;
      page <= this.config.endPage;
      page++
    ) {
      try {
        const pageResult = await this.scrapePage(page);
        results.pages.push(pageResult);
        results.totalItems += pageResult.items.length;

        // 避免爬取过快
        if (page < this.config.endPage) {
          console.log(`等待 ${this.config.retryDelay}ms 后继续爬取下一页...`);
          await this.delay(this.config.retryDelay || 1000);
        }
      } catch (error) {
        console.error(`爬取第 ${page} 页失败，继续爬取下一页`, error);
      }
    }

    console.log(
      `全部爬取完成，共爬取 ${results.pages.length} 页，${results.totalItems} 条数据`
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

async function saveToExcel(data: ScrapeResults, filename: string) {
  const workbook = new ExcelJS.Workbook();
  let worksheet: ExcelJS.Worksheet;
  let existingData: any = null;
  // const worksheet = workbook.addWorksheet("Data");

  //  定义表头结构（提取为常量，避免重复代码）
  const COLUMNS = [
    { header: "序号", key: "index", width: 8 },
    { header: "类型", key: "type", width: 10 },
    { header: "标题", key: "title", width: 30 },
    { header: "下载链接", key: "torrentHref", width: 40 },
    { header: "磁力链接", key: "magnetHref", width: 50 },
    { header: "大小", key: "size", width: 20 },
    { header: "日期", key: "date", width: 20 },
  ];

  // 检查文件是否存在
  const fileExists = fs.existsSync(filename);

  if (fileExists) {
    // 读取已存在的 Excel 文件
    await workbook.xlsx.readFile(filename);
    const oldSheet = workbook.getWorksheet("Data"); // 使用!断言非空
    if (!oldSheet) throw new Error("工作表不存在");
    worksheet = oldSheet;
    // 设置columns（确保数据能正确映射到列）
    worksheet.columns = COLUMNS;
    // 获取现有数据（从第二行开始，跳过表头）
    const lastRowNum = worksheet.lastRow?.number || 1; // 如果没有数据行，lastRowNum 为 1
    if (lastRowNum < 2) {
      // 没有数据行（只有表头）
      existingData = [];
    } else {
      // 有数据行，获取从第2行到最后一行的数据
      const rows = worksheet.getRows(2, 1) || []; // 修正范围
      existingData = rows[0].getCell(4).value; // 处理 rows 可能为 undefined 的情况
    }
  } else {
    // 创建新工作表并添加表头
    worksheet = workbook.addWorksheet("Data");
    worksheet.columns = COLUMNS;
  }

  // 合并所有页面的项目
  const allItems = data.pages.flatMap((page: any) => page.items);
  const newItems: any[] = [];
  // 是否找到重复项
  let isDuplicateFound = false;

  for (const item of allItems) {
    // 跳过重复项检测（当已发现重复后不再检测）
    if (isDuplicateFound) {
      console.log(
        `此次插入${newItems.length}条数据, 共${allItems.length}条数据`
      );
      break;
    }

    // 检查是否与现有数据的第一条（表格最上方）重复
    const firstExistingItem = existingData;
    if (firstExistingItem && isItemDuplicate(item, firstExistingItem)) {
      console.log("检测到重复数据，停止后续数据插入");
      isDuplicateFound = true;
      continue; // 跳过当前重复项，但保留之前已确认的非重复项
    }

    // 记录有效新数据（序号需在插入时动态生成，避免提前生成导致断层）
    newItems.unshift(item); // 保持插入顺序（倒序处理后正序插入）
  }

  // 生成连续序号并插入数据
  let newIndex = 1; // 现有数据条数 + 1（序号从1开始）
  let insertRow: number = fileExists ? 2 : 2; // 插入位置始终在表头下方（第2行）

  for (const item of newItems) {
    item.index = newIndex++;
    console.log("插入的数据:", item);
    console.log(`在第 ${insertRow} 行插入数据`); // 打印插入位置
    worksheet.insertRow(insertRow++, item);
  }

  // 保存 Excel 文件
  await workbook.xlsx.writeFile(filename);
  console.log(`爬取结果已保存到 ${filename} 文件中`);
}

// 数据重复检测函数（根据标题和大小判断，可根据实际需求调整）
function isItemDuplicate(newItem: any, existingItem: any): boolean {
  return newItem.torrentHref === existingItem;
}

// 使用示例
async function main() {
  const scraper = new WebScraper(config);
  try {
    console.log("开始爬取网页内容...");
    const results = await scraper.scrape();
    // 将爬取结果保存到文件中
    await saveToExcel(results, "output11.xlsx");
    // console.log("爬取结果：");
    // // 打印爬取结果
    // console.log(JSON.stringify(results, null, 2));
  } catch (error) {
    if (axios.isAxiosError(error)) {
      console.error("网络请求错误:", {
        message: error.message,
        status: error.response?.status,
        statusText: error.response?.statusText,
      });
    } else {
      console.error("程序执行出错:", error);
    }
  }
}

main();
