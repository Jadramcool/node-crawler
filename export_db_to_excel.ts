import mysql from "mysql2/promise";
import ExcelJS from "exceljs";

interface DatabaseConfig {
  host: string;
  port: number;
  user: string;
  password: string;
  database: string;
}

interface DataItem {
  id: number;
  type: string;
  title: string;
  torrent_href: string;
  magnet_href: string;
  size: string;
  date: string;
  html: string;
  created_at: Date;
}

const config: DatabaseConfig = {
  host: "localhost",
  port: 3306,
  user: "root",
  password: "123456",
  database: "scraper_db",
};

// 数据库连接池
let pool: mysql.Pool;

// 初始化数据库连接
async function initDatabase() {
  try {
    pool = mysql.createPool({
      host: config.host,
      port: config.port,
      user: config.user,
      password: config.password,
      database: config.database,
      waitForConnections: true,
      connectionLimit: 10,
      queueLimit: 0,
    });
    console.log("数据库连接初始化完成");
  } catch (error) {
    console.error("数据库连接初始化失败:", error);
    throw error;
  }
}

// 从数据库获取所有数据，按date倒序排列
async function getAllDataFromDatabase(): Promise<DataItem[]> {
  try {
    console.log("正在从数据库获取数据...");
    const [rows] = await pool.execute(
      `SELECT id, type, title, torrent_href, magnet_href, size, date, html, created_at 
       FROM scraped_data 
       ORDER BY 
         CASE 
           WHEN date REGEXP '^[0-9]{4}-[0-9]{2}-[0-9]{2}' THEN STR_TO_DATE(date, '%Y-%m-%d')
           WHEN date REGEXP '^[0-9]{2}-[0-9]{2}' THEN STR_TO_DATE(CONCAT(YEAR(NOW()), '-', date), '%Y-%m-%d')
           WHEN date REGEXP '^[0-9]{1,2}/[0-9]{1,2}' THEN STR_TO_DATE(CONCAT(YEAR(NOW()), '-', REPLACE(date, '/', '-')), '%Y-%m-%d')
           ELSE created_at
         END DESC,
         created_at DESC`
    );

    console.log(`从数据库获取到 ${(rows as any[]).length} 条数据`);
    return rows as DataItem[];
  } catch (error) {
    console.error("从数据库获取数据失败:", error);
    throw error;
  }
}

// 导出数据到Excel文件
async function exportToExcel(data: DataItem[], filename: string) {
  try {
    console.log("正在创建Excel文件...");
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet("数据导出");

    // 定义表头结构
    const COLUMNS = [
      { header: "序号", key: "index", width: 8 },
      { header: "ID", key: "id", width: 8 },
      { header: "类型", key: "type", width: 15 },
      { header: "标题", key: "title", width: 50 },
      { header: "下载链接", key: "torrent_href", width: 60 },
      { header: "磁力链接", key: "magnet_href", width: 80 },
      { header: "大小", key: "size", width: 15 },
      { header: "日期", key: "date", width: 15 },
      { header: "创建时间", key: "created_at", width: 20 },
    ];

    worksheet.columns = COLUMNS;

    // 设置表头样式
    worksheet.getRow(1).font = { bold: true };
    worksheet.getRow(1).fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FFE0E0E0" },
    };

    // 添加数据行
    data.forEach((item, index) => {
      worksheet.addRow({
        index: index + 1,
        id: item.id,
        type: item.type,
        title: item.title,
        torrent_href: item.torrent_href,
        magnet_href: item.magnet_href,
        size: item.size,
        date: item.date,
        created_at: item.created_at
          .toISOString()
          .slice(0, 19)
          .replace("T", " "),
      });
    });

    // 设置自动筛选
    worksheet.autoFilter = {
      from: "A1",
      to: `I${data.length + 1}`,
    };

    // 冻结首行
    worksheet.views = [
      {
        state: "frozen",
        ySplit: 1,
      },
    ];

    // 保存Excel文件
    await workbook.xlsx.writeFile(filename);
    console.log(`数据已成功导出到 ${filename}`);
    console.log(`共导出 ${data.length} 条数据`);
  } catch (error) {
    console.error("导出Excel文件失败:", error);
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

// 生成带时间戳的文件名
function generateFilename(): string {
  const now = new Date();
  const timestamp = now
    .toISOString()
    .slice(0, 19)
    .replace(/:/g, "-")
    .replace("T", "_");
  return `表格_${timestamp}.xlsx`;
}

// 主函数
async function main() {
  const startTime = new Date();
  console.log(`[${startTime.toISOString()}] 开始导出数据库数据到Excel...`);

  try {
    // 初始化数据库连接
    await initDatabase();

    // 从数据库获取所有数据
    const data = await getAllDataFromDatabase();

    if (data.length === 0) {
      console.log("数据库中没有数据可导出");
      return;
    }

    // 生成文件名
    const filename = generateFilename();

    // 导出到Excel
    await exportToExcel(data, filename);

    const endTime = new Date();
    const duration = endTime.getTime() - startTime.getTime();
    console.log(`[${endTime.toISOString()}] 导出完成！`);
    console.log(`总耗时: ${duration}ms (${(duration / 1000).toFixed(2)}秒)`);
    console.log(`导出文件: ${filename}`);
  } catch (error) {
    console.error("导出过程中发生错误:", error);
  } finally {
    // 关闭数据库连接
    await closeDatabase();
  }
}

// 如果直接运行此文件，则执行main函数
if (require.main === module) {
  main();
}

export { main as exportDatabaseToExcel };

