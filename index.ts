import { spawn } from "child_process";
import * as path from "path";

// 命令行参数解析
function parseCommandLineArgs() {
  const args = process.argv.slice(2);
  const config = {
    scraper: "main", // 默认使用main.ts
    startPage: 1,
    endPage: 100,
    manual: false,
    schedule: false,
    noProxy: false,
    proxy: "",
    help: false,
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    switch (arg) {
      case "--scraper":
      case "-s":
        if (i + 1 < args.length) {
          config.scraper = args[i + 1];
          i++;
        }
        break;
      case "--start-page":
        if (i + 1 < args.length) {
          config.startPage = parseInt(args[i + 1]);
          i++;
        }
        break;
      case "--end-page":
        if (i + 1 < args.length) {
          config.endPage = parseInt(args[i + 1]);
          i++;
        }
        break;
      case "--manual":
        config.manual = true;
        break;
      case "--schedule":
        config.schedule = true;
        break;
      case "--no-proxy":
        config.noProxy = true;
        break;
      case "--proxy":
        if (i + 1 < args.length) {
          config.proxy = args[i + 1];
          i++;
        }
        break;
      case "--help":
      case "-h":
        config.help = true;
        break;
    }
  }

  return config;
}

// 显示帮助信息
function showHelp() {
  console.log(`
🚀 Node.js 爬虫工具 - 统一入口

使用方法:
  ts-node index.ts [选项]

选项:
  -s, --scraper <type>     指定爬虫类型 (main|kb) [默认: main]
  --start-page <number>    起始页码 [默认: 1]
  --end-page <number>      结束页码 [默认: 100]
  --manual                 手动模式
  --schedule               定时模式
  --no-proxy               禁用代理 (仅适用于main爬虫)
  --proxy <url>            指定代理地址 (仅适用于main爬虫)
  -h, --help               显示帮助信息

示例:
  # 使用main爬虫，爬取1-50页
  ts-node index.ts --scraper main --start-page 1 --end-page 50
  
  # 使用kb爬虫，爬取100-200页
  ts-node index.ts --scraper kb --start-page 100 --end-page 200
  
  # 使用main爬虫的定时模式，禁用代理
  ts-node index.ts --scraper main --schedule --no-proxy
  
  # 使用kb爬虫的手动模式
  ts-node index.ts --scraper kb --manual
`);
}

// 执行指定的爬虫脚本
function runScraper(config: any) {
  let scriptPath: string;
  let args: string[] = [];

  if (config.scraper === "kb") {
    scriptPath = path.join(__dirname, "main_kb.ts");
    
    // 为kb爬虫传递页码参数
    args.push("--start-page", config.startPage.toString());
    args.push("--end-page", config.endPage.toString());
    
    if (config.manual) {
      args.push("--manual");
    }
    if (config.schedule) {
      args.push("--schedule");
    }
  } else {
    scriptPath = path.join(__dirname, "main.ts");
    
    // 为main爬虫传递参数
    if (config.manual) {
      args.push("--manual");
    }
    if (config.schedule) {
      args.push("--schedule");
    }
    
    // 添加分隔符
    args.push("--");
    
    if (config.noProxy) {
      args.push("--no-proxy");
    }
    if (config.proxy) {
      args.push("--proxy", config.proxy);
    }
    args.push("--start-page", config.startPage.toString());
    args.push("--end-page", config.endPage.toString());
  }

  console.log(`🚀 启动${config.scraper === "kb" ? "KB" : "Main"}爬虫...`);
  console.log(`📄 脚本路径: ${scriptPath}`);
  console.log(`⚙️  参数: ${args.join(" ")}`);
  console.log(`📊 页码范围: ${config.startPage} - ${config.endPage}\n`);

  // 使用spawn执行ts-node命令
  const child = spawn("ts-node", [scriptPath, ...args], {
    stdio: "inherit",
    shell: true,
  });

  child.on("close", (code) => {
    if (code === 0) {
      console.log(`\n✅ ${config.scraper === "kb" ? "KB" : "Main"}爬虫执行完成`);
    } else {
      console.log(`\n❌ ${config.scraper === "kb" ? "KB" : "Main"}爬虫执行失败，退出码: ${code}`);
    }
  });

  child.on("error", (error) => {
    console.error(`❌ 启动爬虫时出错: ${error.message}`);
  });
}

// 主函数
function main() {
  const config = parseCommandLineArgs();

  if (config.help) {
    showHelp();
    return;
  }

  // 验证爬虫类型
  if (!['main', 'kb'].includes(config.scraper)) {
    console.error(`❌ 无效的爬虫类型: ${config.scraper}`);
    console.log(`💡 支持的类型: main, kb`);
    process.exit(1);
  }

  // 验证页码范围
  if (config.startPage < 1 || config.endPage < config.startPage) {
    console.error(`❌ 无效的页码范围: ${config.startPage} - ${config.endPage}`);
    console.log(`💡 起始页码必须大于0，结束页码必须大于等于起始页码`);
    process.exit(1);
  }

  runScraper(config);
}

// 如果直接运行此文件，则执行main函数
if (require.main === module) {
  main();
}

export { main, parseCommandLineArgs, runScraper };