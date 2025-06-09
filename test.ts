import axios, { AxiosResponse, AxiosError } from "axios";
import { HttpsProxyAgent } from "https-proxy-agent";
import { HttpProxyAgent } from "http-proxy-agent";

// 网站检测配置
interface WebsiteCheckConfig {
  url: string;
  timeout?: number;
  maxRetries?: number;
  retryDelay?: number;
  proxy?: string;
  cookies?: string | Record<string, string>;
  userAgentType?: "desktop" | "mobile" | "random";
  randomizeDelay?: boolean;
  headers?: Record<string, string>;
}

// 检测结果
interface CheckResult {
  url: string;
  isAccessible: boolean;
  statusCode?: number;
  responseTime: number;
  error?: string;
  timestamp: Date;
}

/**
 * 检测单个网站是否可访问
 * @param config 检测配置
 * @returns 检测结果
 */
/**
 * 获取随机User-Agent
 * @param type 设备类型
 * @returns User-Agent字符串
 */
function getRandomUserAgent(
  type: "desktop" | "mobile" | "random" = "desktop"
): string {
  // 桌面浏览器UA列表
  const desktopUserAgents = [
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:120.0) Gecko/20100101 Firefox/120.0",
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Edge/120.0.0.0 Safari/537.36",
  ];

  // 移动设备UA列表
  const mobileUserAgents = [
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_1_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
    "Mozilla/5.0 (Linux; Android 14; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.6099.43 Mobile Safari/537.36",
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/120.0.6099.119 Mobile/15E148 Safari/604.1",
    "Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Mobile Safari/537.36",
    "Mozilla/5.0 (iPad; CPU OS 17_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
  ];

  // 根据类型选择UA列表
  let userAgents: string[];
  if (type === "random") {
    userAgents = Math.random() > 0.5 ? desktopUserAgents : mobileUserAgents;
  } else if (type === "mobile") {
    userAgents = mobileUserAgents;
  } else {
    userAgents = desktopUserAgents;
  }

  // 随机选择一个UA
  const randomIndex = Math.floor(Math.random() * userAgents.length);
  return userAgents[randomIndex];
}

/**
 * 格式化Cookie字符串或对象
 * @param cookies Cookie字符串或对象
 * @returns 格式化后的Cookie字符串
 */
function formatCookies(cookies: string | Record<string, string>): string {
  if (typeof cookies === "string") {
    return cookies;
  }

  return Object.entries(cookies)
    .map(([key, value]) => `${key}=${value}`)
    .join("; ");
}

/**
 * 获取随机延迟时间
 * @param baseDelay 基础延迟时间
 * @returns 随机化后的延迟时间
 */
function getRandomDelay(baseDelay: number): number {
  // 在基础延迟的0.75-1.25倍之间随机
  const factor = 0.75 + Math.random() * 0.5;
  return Math.floor(baseDelay * factor);
}

async function checkWebsite(config: WebsiteCheckConfig): Promise<CheckResult> {
  const {
    url,
    timeout = 10000,
    maxRetries = 3,
    retryDelay = 1000,
    proxy,
    cookies,
    userAgentType = "desktop",
    randomizeDelay = true,
    headers = {},
  } = config;
  const startTime = Date.now();

  console.log(`🔍 正在检测: ${url}`);

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      // 构建请求头
      const requestHeaders: Record<string, string> = {
        "User-Agent": getRandomUserAgent(userAgentType),
        Accept:
          "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7",
        "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
        "Accept-Encoding": "gzip, deflate, br",
        "Cache-Control": "no-cache",
        Pragma: "no-cache",
        "Sec-Ch-Ua": '"Not_A Brand";v="8", "Chromium";v="120"',
        "Sec-Ch-Ua-Mobile": userAgentType === "mobile" ? "?1" : "?0",
        "Sec-Ch-Ua-Platform": '"Windows"',
        "Sec-Fetch-Dest": "document",
        "Sec-Fetch-Mode": "navigate",
        "Sec-Fetch-Site": "none",
        "Sec-Fetch-User": "?1",
        "Upgrade-Insecure-Requests": "1",
        Connection: "keep-alive",
        ...headers,
      };

      // 添加Cookie
      if (cookies) {
        requestHeaders["Cookie"] = formatCookies(cookies);
      }

      // 构建请求配置
      const requestConfig: any = {
        timeout,
        headers: requestHeaders,
        validateStatus: (status: number) => status < 500, // 接受所有小于500的状态码
        maxRedirects: 5,
        decompress: true,
      };

      // 添加代理配置
      if (proxy) {
        const isHttps = url.startsWith("https://");
        if (isHttps) {
          requestConfig.httpsAgent = new HttpsProxyAgent(proxy);
        } else {
          requestConfig.httpAgent = new HttpProxyAgent(proxy);
        }
        console.log(`🔒 使用代理: ${proxy}`);
      }

      const response: AxiosResponse = await axios.get(url, requestConfig);

      const responseTime = Date.now() - startTime;

      console.log(
        `✅ 访问成功 - 状态码: ${response.status}, 响应时间: ${responseTime}ms`
      );

      return {
        url,
        isAccessible: true,
        statusCode: response.status,
        responseTime,
        timestamp: new Date(),
      };
    } catch (error: any) {
      const responseTime = Date.now() - startTime;

      if (attempt < maxRetries) {
        console.log(`❌ 第${attempt}次尝试失败: ${error.message}`);

        // 计算延迟时间，可以随机化以避免被检测
        const actualDelay = randomizeDelay
          ? getRandomDelay(retryDelay)
          : retryDelay;
        console.log(`⏳ ${actualDelay}ms后进行第${attempt + 1}次重试...`);

        await new Promise((resolve) => setTimeout(resolve, actualDelay));
        continue;
      }

      // 最后一次尝试失败
      let errorMessage = error.message;
      let statusCode: number | undefined;

      if (error.response) {
        // 服务器响应了错误状态码
        statusCode = error.response.status;
        errorMessage = `HTTP ${statusCode}: ${error.response.statusText}`;
        console.log(`❌ 服务器错误 - 状态码: ${statusCode}`);
      } else if (error.request) {
        // 请求发出但没有收到响应
        errorMessage = "网络连接失败或超时";
        console.log(`❌ 网络连接失败: ${error.code || error.message}`);
      } else {
        // 其他错误
        console.log(`❌ 请求配置错误: ${error.message}`);
      }

      return {
        url,
        isAccessible: false,
        statusCode,
        responseTime,
        error: errorMessage,
        timestamp: new Date(),
      };
    }
  }

  // 这里不会执行到，但为了TypeScript类型检查
  throw new Error("Unexpected error in checkWebsite function");
}

/**
 * 批量检测多个网站
 * @param urls 网站URL列表
 * @param options 检测选项
 * @returns 检测结果列表
 */
async function checkMultipleWebsites(
  urls: string[],
  options: Omit<WebsiteCheckConfig, "url"> = {}
): Promise<CheckResult[]> {
  console.log(`🚀 开始批量检测 ${urls.length} 个网站...\n`);

  const results: CheckResult[] = [];

  for (const url of urls) {
    const result = await checkWebsite({ url, ...options });
    results.push(result);
    console.log(""); // 空行分隔
  }

  return results;
}

/**
 * 打印检测结果摘要
 * @param results 检测结果列表
 */
function printSummary(results: CheckResult[]): void {
  console.log("📊 检测结果摘要:");
  console.log("=".repeat(50));

  const accessible = results.filter((r) => r.isAccessible).length;
  const total = results.length;

  console.log(`总计: ${total} 个网站`);
  console.log(`可访问: ${accessible} 个`);
  console.log(`不可访问: ${total - accessible} 个`);
  console.log(`成功率: ${((accessible / total) * 100).toFixed(1)}%`);

  console.log("\n详细结果:");
  results.forEach((result, index) => {
    const status = result.isAccessible ? "✅" : "❌";
    const statusInfo = result.statusCode ? ` (${result.statusCode})` : "";
    const timeInfo = ` - ${result.responseTime}ms`;
    const errorInfo = result.error ? ` - ${result.error}` : "";

    console.log(
      `${index + 1}. ${status} ${
        result.url
      }${statusInfo}${timeInfo}${errorInfo}`
    );
  });
}

// 主函数 - 示例用法
async function main() {
  try {
    // 单个网站检测示例
    console.log("=== 单个网站检测示例 ===\n");
    const singleResult = await checkWebsite({
      url: "https://www.baidu.com",
      timeout: 5000,
      maxRetries: 2,
      userAgentType: "random",
      randomizeDelay: true,
    });

    console.log("检测结果:", singleResult);

    console.log("\n=== 批量网站检测示例 ===\n");

    // 批量检测示例
    const testUrls = ["https://www.baidu.com", "https://sykb169.org/"];

    const results = await checkMultipleWebsites(testUrls, {
      timeout: 15000,
      maxRetries: 3,
      retryDelay: 2000,
      userAgentType: "random",
      randomizeDelay: true,
      // 可选：添加代理
      // proxy: 'http://127.0.0.1:7890',
      // 可选：添加自定义Cookie
      cookies: {
        session_id: "test123",
        visitor: "true",
      },
      // 可选：添加自定义请求头
      headers: {
        Referer: "https://www.google.com/",
      },
    });

    printSummary(results);
  } catch (error) {
    console.error("程序执行出错:", error);
  }
}

// 如果直接运行此文件，则执行主函数
if (require.main === module) {
  main();
}

// 导出函数供其他模块使用
export {
  checkWebsite,
  checkMultipleWebsites,
  printSummary,
  WebsiteCheckConfig,
  CheckResult,
};
