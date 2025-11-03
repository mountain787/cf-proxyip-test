// ==================== 初始化 ====================
import { promisify } from 'util';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// 在 ES 模块中定义 __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ==================== 动态导入依赖（在依赖检查完成后）====================
// 使用动态导入，避免在模块解析时检查依赖
const expressModule = await import("express");
const express = expressModule.default;
const wsModule = await import("ws");
const WebSocket = wsModule.default || wsModule;
const axiosModule = await import("axios");
const axios = axiosModule.default || axiosModule;
const maxmindModule = await import("maxmind");
const maxmind = maxmindModule.default || maxmindModule;

// Node.js 内置模块可以静态导入
import https from "https";
import tls from "tls";
import net from "net";
import dns from "dns";

const dnsLookup = promisify(dns.lookup);
const dnsResolve4 = promisify(dns.resolve4);
const dnsResolveCname = promisify(dns.resolveCname);
const dnsResolve = promisify(dns.resolve);

// ==================== 配置参数 ====================
// 服务器配置 - 固定端口 3000
const PORT = parseInt(process.env.PORT) || 3000;

// 缓存和速率限制配置
const CACHE_DURATION = 30000; // 缓存持续时间（毫秒）- 30秒
const MAX_REQUESTS_PER_IP = 10; // 每个IP每分钟最大请求数
const RATE_LIMIT_WINDOW = 60000; // 速率限制时间窗口（毫秒）- 1分钟

// 检测超时配置
const TLS_TIMEOUT = 5000; // TLS/HTTPS 连接超时（毫秒）
const WEBSOCKET_TIMEOUT = 3000; // WebSocket 连接超时（毫秒）
const CDN_TRACE_TIMEOUT = 3000; // CDN Trace 请求超时（毫秒）

// 功能开关配置
const DISABLE_WEBSOCKET = process.env.DISABLE_WEBSOCKET === 'true'; // 禁用 WebSocket 检测（用于云平台）
const DISABLE_CDN_TRACE = process.env.DISABLE_CDN_TRACE === 'true'; // 禁用 CDN Trace 检测

// DNS 解析配置
const DNS_MAX_RECURSION_DEPTH = 10; // CNAME 递归解析最大深度

// 默认值配置
const DEFAULT_PORT = 443; // 默认端口
const DEFAULT_HOST = "clpan.pages.dev"; // 默认 Host (SNI)
const DEFAULT_WS_PATH = "/"; // 默认 WebSocket 路径

// ==================== 配置参数结束 ====================

const app = express();

// ------------------- HTML 前端（集成在代码中）-------------------
const HTML_TEMPLATE = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<title>CF IP 远程检测</title>
<link rel="stylesheet" href="https://unpkg.com/leaflet/dist/leaflet.css" />
<style>
  body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Arial, sans-serif; padding: 20px; max-width: 1200px; margin: 0 auto; }
  h2 { margin-top: 0; color: #333; }
  #map { height: 400px; width: 100%; margin-top: 20px; border: 1px solid #ddd; border-radius: 8px; touch-action: pan-x pan-y; }
  .container { display: flex; gap: 20px; flex-wrap: wrap; }
  .form-box { flex: 1; max-width: 350px; }
  .info-box { flex: 2; min-width: 400px; }
  label { display: block; margin: 12px 0 6px 0; font-weight: 500; color: #555; }
  input { width: 100%; padding: 10px; margin: 0 0 12px 0; border: 1px solid #ddd; border-radius: 4px; box-sizing: border-box; font-size: 14px; }
  input:focus { outline: none; border-color: #4CAF50; }
  button { width: 100%; padding: 12px; margin: 12px 0; background: #4CAF50; color: white; border: none; border-radius: 4px; font-size: 16px; font-weight: 500; cursor: pointer; }
  button:hover { background: #45a049; }
  button:disabled { background: #ccc; cursor: not-allowed; }
  .quick-btn { width: 100%; padding: 8px; margin: 4px 0; background: #2196F3; color: white; border: none; border-radius: 4px; font-size: 14px; cursor: pointer; }
  .quick-btn:hover { background: #1976D2; }
  .quick-btn-group { margin: 15px 0; }
  .quick-label { font-size: 12px; color: #666; margin-bottom: 8px; font-weight: 500; }
  .help-text { margin-top: 20px; font-size: 12px; color: #666; }
  .optional { color: #999; font-weight: normal; }
  table { border-collapse: collapse; width: 100%; margin-top: 10px; }
  th, td { text-align: left; padding: 10px; border-bottom: 1px solid #eee; }
  th { background: #f5f5f5; font-weight: 600; color: #333; position: sticky; top: 0; z-index: 10; }
  #resultsTable th { background: #4CAF50; color: white; }
  #resultsTable tbody tr:hover { background: #f9f9f9; }
  .status-success { color: #4CAF50; font-weight: 600; }
  .status-fail { color: #f44336; font-weight: 600; }
  code { background: #f4f4f4; padding: 2px 6px; border-radius: 3px; font-family: monospace; }
</style>
</head>
<body>

<h2>CF IP 远程检测</h2>
<div class="container">
  <div class="form-box">
    <label>IP:端口</label>
    <input type="text" id="ipPort" placeholder="1.164.110.203:10029" />

    <label>Host (SNI) <span class="optional">(可选)</span></label>
    <input type="text" id="host" placeholder="此处填写你的CF节点域名" />

    <button onclick="detectIP()" id="submitBtn">检测</button>

    <div class="quick-btn-group">
      <div class="quick-label">快速选择：</div>
      <button class="quick-btn" onclick="selectQuickOption('ProxyIP.KR.CMLiussss.net')">韩国 KR</button>
      <button class="quick-btn" onclick="selectQuickOption('ProxyIP.JP.CMLiussss.net')">日本 JP</button>
      <button class="quick-btn" onclick="selectQuickOption('ProxyIP.SG.CMLiussss.net')">新加坡 SG</button>
    </div>

    <div class="help-text">
      支持格式：IP:端口，如 <code>1.164.110.203:10029</code><br>
      端口默认为 443（可省略）<br>
      Host 填写你的CF节点域名
    </div>
  </div>

  <div class="info-box">
    <div id="map"></div>
    <!-- 单个IP结果表格 -->
    <table id="infoTable" style="display: none;"><tbody></tbody></table>
    <!-- 多个IP结果表格 -->
    <div id="multiResultPanel" style="display: none;">
      <h3 style="margin-top: 0; margin-bottom: 15px;">检测结果</h3>
      <div style="margin-bottom: 10px; color: #666; font-size: 14px;">
        <strong>域名/输入:</strong> <span id="inputDomain"></span> | 
        <strong>解析到:</strong> <span id="resolvedCount"></span> 个 IP
      </div>
      <div style="overflow-x: auto;">
        <table id="resultsTable" style="width: 100%; min-width: 800px;">
          <thead>
            <tr>
              <th>IP</th>
              <th>位置</th>
              <th>组织/ASN</th>
              <th>TLS</th>
              <th>WS</th>
              <th>CDN</th>
              <th>TLS延迟</th>
              <th>WS延迟</th>
              <th>Warp</th>
            </tr>
          </thead>
          <tbody id="resultsTableBody"></tbody>
        </table>
      </div>
    </div>
  </div>
</div>

<script src="https://unpkg.com/leaflet/dist/leaflet.js"></script>
<script>
// 配置 Leaflet 使用 passive 事件监听器以减少警告
(function() {
  const originalAddListener = L.DomEvent.addListener;
  L.DomEvent.addListener = function(obj, type, handler, context) {
    // 为 touch 事件添加 passive 选项
    if (L.Browser.touch && (type === 'touchstart' || type === 'touchmove')) {
      obj.addEventListener(type, handler, { passive: true });
      return handler;
    }
    return originalAddListener.call(this, obj, type, handler, context);
  };
})();

let map = L.map('map', {
  zoomControl: true,
  attributionControl: true,
  // 优化触摸体验
  touchZoom: true,
  doubleClickZoom: true,
  scrollWheelZoom: true
}).setView([35, 139], 5);

// 使用 Esri World Street Map（全球覆盖，免费）
L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}', {
  attribution: '&copy; <a href="https://www.esri.com/" target="_blank">Esri</a> | &copy; OpenStreetMap',
  maxZoom: 19,
  minZoom: 2
}).addTo(map);

let marker = null;

function selectQuickOption(domain) {
  document.getElementById('ipPort').value = domain;
  document.getElementById('host').value = '';
}

async function detectIP() {
  const ipPortInput = document.getElementById('ipPort').value.trim();
  let host = document.getElementById('host').value.trim();
  const submitBtn = document.getElementById('submitBtn');

  // 参数验证
  if (!ipPortInput) {
    alert("请填写 IP:端口");
    return;
  }

  // 解析 IP:端口 格式
  let ip, port = 443;
  const ipPortMatch = ipPortInput.match(/^(.+?):(\\d+)$/);
  if (ipPortMatch) {
    ip = ipPortMatch[1];
    port = ipPortMatch[2];
  } else {
    ip = ipPortInput;
  }

  // 禁用按钮，防止重复提交
  submitBtn.disabled = true;
  submitBtn.textContent = "检测中...";

  try {
    const params = new URLSearchParams({
      ip,
      port: port.toString(),
      host,
      wsPath: "/"
    });
    
    const resp = await fetch(\`/api?\${params}\`);
    const data = await resp.json();

    if (!resp.ok) {
      throw new Error(data.error || data.message || \`HTTP \${resp.status}\`);
    }

    updateInfo(data);
  } catch(err) {
    alert("检测失败: " + err.message);
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = "检测";
  }
}

// 格式化位置信息
function formatLocation(geoip) {
  if (!geoip) return "-";
  const city = geoip.city || "";
  const country = geoip.countryName || geoip.country || "";
  if (city && country) return \`\${city}, \${country}\`;
  if (city) return city;
  if (country) return country;
  return "-";
}

// 更新地图标记
function updateMapMarker(data) {
  if (marker) map.removeLayer(marker);
  marker = null;
  
  if (data.geoip?.latitude && data.geoip?.longitude) {
    const locationText = formatLocation(data.geoip);
    marker = L.marker([data.geoip.latitude, data.geoip.longitude]).addTo(map)
      .bindPopup(\`\${data.ip}<br>\${locationText}\`).openPopup();
    map.setView([data.geoip.latitude, data.geoip.longitude], 10);
  }
}

function updateInfo(data) {
  if (data.results && data.results.length > 1) {
    updateMultiResults(data);
    return;
  }

  const singleData = data.results ? data.results[0] : data;
  document.getElementById('multiResultPanel').style.display = 'none';
  document.getElementById('infoTable').style.display = 'table';

  const tbody = document.getElementById('infoTable').querySelector('tbody');
  tbody.innerHTML = '';

  const infoList = [
    ["IP", singleData.ip || "-"],
    ["端口", singleData.port || "-"],
    ["TLS 检测", singleData.checks?.tls_detect ? "true" : "false"],
    ["WebSocket 状态", singleData.checks?.ws_real_connect ? "true" : "false"],
    ["CDN Trace", singleData.checks?.cdn_trace ? "true" : "false"],
    ["TLS 延迟(ms)", singleData.latency?.tls_handshake_ms ?? "-"],
    ["WS 连接延迟(ms)", singleData.latency?.ws_connect_ms ?? "-"],
    ["位置", formatLocation(singleData.geoip)],
    ["组织/ASN", singleData.geoip ? \`\${singleData.geoip.organization || "-"} / \${singleData.geoip.asn ? "AS" + singleData.geoip.asn : "-"}\` : "-"],
    ["Warp", singleData.cdn?.warp || "off"]
  ];

  infoList.forEach(([key, value]) => {
    const row = document.createElement('tr');
    row.innerHTML = \`<th>\${key}</th><td>\${value}</td>\`;
    tbody.appendChild(row);
  });

  updateMapMarker(singleData);
}

function updateMultiResults(data) {
  // 显示多结果面板，隐藏单结果表格
  document.getElementById('infoTable').style.display = 'none';
  document.getElementById('multiResultPanel').style.display = 'block';

  // 更新标题信息（域名/输入）
  document.getElementById('inputDomain').textContent = data.input || '-';

  // 清空并填充表格
  const tbody = document.getElementById('resultsTableBody');
  tbody.innerHTML = '';

  if (data.results && data.results.length > 0) {
    // 过滤掉所有检测都失败的IP（TLS、WS、CDN都失败）
    const validResults = data.results.filter((result) => {
      const tlsFailed = !result.checks?.tls_detect;
      const wsFailed = !result.checks?.ws_real_connect;
      const cdnFailed = !result.checks?.cdn_trace;
      // 如果三个检测都失败，则过滤掉
      return !(tlsFailed && wsFailed && cdnFailed);
    });

    // 更新显示的有效IP数量
    const totalResolved = data.resolvedIPs?.length || data.results?.length || 0;
    const validCount = validResults.length;
    document.getElementById('resolvedCount').textContent = \`\${totalResolved} 个 IP (显示 \${validCount} 个有效IP)\`;

    validResults.forEach((result) => {
      const row = document.createElement('tr');
      const orgAsn = result.geoip 
        ? \`\${result.geoip.organization || "-"} / \${result.geoip.asn ? "AS" + result.geoip.asn : "-"}\`
        : "-";

      row.innerHTML = \`
        <td><strong>\${result.ip}</strong></td>
        <td>\${formatLocation(result.geoip)}</td>
        <td style="font-size: 12px;">\${orgAsn}</td>
        <td class="\${result.checks?.tls_detect ? 'status-success' : 'status-fail'}">
          \${result.checks?.tls_detect ? '✓' : '✕'}
        </td>
        <td class="\${result.checks?.ws_real_connect ? 'status-success' : 'status-fail'}">
          \${result.checks?.ws_real_connect ? '✓' : '✕'}
        </td>
        <td class="\${result.checks?.cdn_trace ? 'status-success' : 'status-fail'}">
          \${result.checks?.cdn_trace ? '✓' : '✕'}
        </td>
        <td>\${result.latency?.tls_handshake_ms ? result.latency.tls_handshake_ms + 'ms' : '-'}</td>
        <td>\${result.latency?.ws_connect_ms ? result.latency.ws_connect_ms + 'ms' : '-'}</td>
        <td>\${result.cdn?.warp || 'off'}</td>
      \`;
      
      tbody.appendChild(row);
    });

    // 更新地图 - 显示第一个成功的IP位置（使用过滤后的有效结果）
    if (marker) map.removeLayer(marker);
    marker = null;
    
    // 查找第一个成功的IP（优先 TLS，其次 WebSocket，最后有 GeoIP 的）
    let firstSuccessIP = null;
    
    // 首先找 TLS 成功的
    firstSuccessIP = validResults.find(r => r.checks?.tls_detect && r.geoip?.latitude && r.geoip?.longitude);
    
    // 如果没找到 TLS 成功的，找 WebSocket 成功的
    if (!firstSuccessIP) {
      firstSuccessIP = validResults.find(r => r.checks?.ws_real_connect && r.geoip?.latitude && r.geoip?.longitude);
    }
    
    // 如果都没成功，找第一个有 GeoIP 信息的
    if (!firstSuccessIP) {
      firstSuccessIP = validResults.find(r => r.geoip?.latitude && r.geoip?.longitude);
    }
    
    if (firstSuccessIP) {
      updateMapMarker(firstSuccessIP);
    }
  }
}
</script>
</body>
</html>`;

// 根路径返回 HTML
app.get("/", (req, res) => {
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.send(HTML_TEMPLATE);
});

// 处理 favicon.ico 请求（避免 404 错误）
app.get("/favicon.ico", (req, res) => {
  res.status(204).end();
});

// ------------------- 初始化 GeoIP 数据库 -------------------
let cityReader = null;
let asnReader = null;

async function downloadGeoIPDatabase(dbPath, dbName) {
  const downloadUrls = [
    'https://raw.gitmirror.com/adysec/IP_database/main/geolite/' + dbName,
    'https://raw.githubusercontent.com/adysec/IP_database/main/geolite/' + dbName
  ];
  
  for (const downloadUrl of downloadUrls) {
    try {
      console.log(`📥 尝试下载: ${downloadUrl}`);
      const response = await axios.get(downloadUrl, {
        responseType: 'arraybuffer',
        timeout: 60000,
        maxContentLength: 100 * 1024 * 1024 // 最大 100MB
      });
      
      fs.writeFileSync(dbPath, response.data);
      const fileSize = (response.data.length / 1024 / 1024).toFixed(2);
      console.log(`✅ ${dbName} 下载成功: ${dbPath} (${fileSize} MB)`);
      return true;
    } catch (urlError) {
      console.log(`⚠️  下载失败: ${urlError.message}`);
    }
  }
  
  return false;
}

async function initGeoIP() {
  try {
    // 加载 ASN 数据库（使用 maxmind.Reader 方式）
    const asnDbPath = path.join(__dirname, "GeoLite2-ASN.mmdb");
    if (fs.existsSync(asnDbPath)) {
      try {
        const buffer = fs.readFileSync(asnDbPath);
        asnReader = new maxmind.Reader(buffer, { watch: false });
        console.log("✅ GeoIP ASN 数据库加载成功");
      } catch (err) {
        console.warn(`⚠️  GeoIP ASN 数据库加载失败: ${err.message}`);
      }
    } else {
      console.warn(`⚠️  GeoIP ASN 数据库文件不存在: ${asnDbPath}`);
      // 尝试自动下载
      console.log(`📥 尝试自动下载 GeoLite2-ASN.mmdb...`);
      const downloadSuccess = await downloadGeoIPDatabase(asnDbPath, "GeoLite2-ASN.mmdb");
      if (downloadSuccess) {
        try {
          const buffer = fs.readFileSync(asnDbPath);
          asnReader = new maxmind.Reader(buffer, { watch: false });
          console.log("✅ GeoIP ASN 数据库加载成功（自动下载）");
        } catch (err) {
          console.warn(`⚠️  下载后的 ASN 数据库加载失败: ${err.message}`);
        }
      } else {
        console.warn(`❌ GeoLite2-ASN.mmdb 自动下载失败，请手动下载`);
      }
    }
    
    // 加载 City 数据库（包含详细位置信息，使用 maxmind.Reader 方式）
    const cityDbPath = path.join(__dirname, "GeoLite2-City.mmdb");
    if (fs.existsSync(cityDbPath)) {
      try {
        const buffer = fs.readFileSync(cityDbPath);
        cityReader = new maxmind.Reader(buffer, { watch: false });
        console.log("✅ GeoIP City 数据库加载成功");
      } catch (err) {
        console.warn(`⚠️  GeoIP City 数据库加载失败: ${err.message}`);
      }
    } else {
      console.warn(`⚠️  GeoIP City 数据库文件不存在: ${cityDbPath}`);
      // 尝试自动下载
      console.log(`📥 尝试自动下载 GeoLite2-City.mmdb...`);
      const downloadSuccess = await downloadGeoIPDatabase(cityDbPath, "GeoLite2-City.mmdb");
      if (downloadSuccess) {
        try {
          const buffer = fs.readFileSync(cityDbPath);
          cityReader = new maxmind.Reader(buffer, { watch: false });
          console.log("✅ GeoIP City 数据库加载成功（自动下载）");
        } catch (err) {
          console.warn(`⚠️  下载后的 City 数据库加载失败: ${err.message}`);
        }
      } else {
        console.warn(`❌ GeoLite2-City.mmdb 自动下载失败，请手动下载`);
      }
    }
    
    // 测试查询一个已知IP验证数据库工作正常
    if (cityReader || asnReader) {
      const testIP = "1.1.1.1";
      const testCity = cityReader ? cityReader.get(testIP) : null;
      const testASN = asnReader ? asnReader.get(testIP) : null;
      if (testCity || testASN) {
        console.log(`✅ GeoIP 测试查询成功 (${testIP})`);
      } else {
        console.warn(`⚠️  GeoIP 测试查询未找到数据 (${testIP})`);
      }
    }
  } catch (err) {
    console.warn("⚠️  GeoIP 数据库初始化失败:", err.message);
    console.warn("   将跳过地理位置查询功能");
  }
}

initGeoIP();

// ------------------- 请求频率限制和缓存 -------------------
const requestCache = new Map(); // 用于缓存 API 响应
const rateLimitMap = new Map(); // 用于速率限制

function checkRateLimit(ip) {
  const now = Date.now();
  const key = `rate_${ip}`;
  const record = rateLimitMap.get(key);
  
  if (!record || now - record.firstRequest > RATE_LIMIT_WINDOW) {
    rateLimitMap.set(key, { firstRequest: now, count: 1 });
    return true;
  }
  
  if (record.count >= MAX_REQUESTS_PER_IP) {
    return false;
  }
  
  record.count++;
  return true;
}

// ------------------- 工具函数 -------------------
// IP 格式验证函数
function isIPAddress(str) {
  const ipv4Regex = /^(?:[0-9]{1,3}\.){3}[0-9]{1,3}$/;
  const ipv6Regex = /^(?:[0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}$|^::1$|^::$/;
  return ipv4Regex.test(str) || ipv6Regex.test(str);
}

function isDomain(str) {
  const domainRegex = /^[a-zA-Z0-9][a-zA-Z0-9.-]*[a-zA-Z0-9]$|^[a-zA-Z0-9]$/;
  return domainRegex.test(str);
}

// ------------------- DNS 解析（支持 CNAME 递归解析，获取所有IP）-------------------
async function resolveDomain(domain, visited = new Set(), depth = 0) {
  if (depth > DNS_MAX_RECURSION_DEPTH) {
    throw new Error(`CNAME 递归深度超过限制（${DNS_MAX_RECURSION_DEPTH}层）`);
  }
  if (visited.has(domain)) {
    throw new Error("检测到 CNAME 循环引用");
  }
  visited.add(domain);

  // 如果是IP地址，直接返回，不进行DNS查询
  if (isIPAddress(domain)) {
    return [domain];
  }

  // 收集所有可能的IP地址
  const allIPs = new Set();

  try {
    // 方法1: 尝试直接解析 A 记录
    try {
      const addresses = await dnsResolve4(domain);
      if (Array.isArray(addresses) && addresses.length > 0) {
        addresses.forEach(ip => allIPs.add(ip));
      }
    } catch (err) {
      // 继续尝试其他方法
    }

    // 方法2: 检查 CNAME 记录
    try {
      const cnameRecords = await dnsResolveCname(domain);
      if (Array.isArray(cnameRecords) && cnameRecords.length > 0) {
        for (const cname of cnameRecords) {
          const resolvedIPs = await resolveDomain(cname, visited, depth + 1);
          resolvedIPs.forEach(ip => allIPs.add(ip));
        }
      }
    } catch (err) {
      // 继续尝试其他方法
    }

    // 方法3: 通用解析
    try {
      const records = await dnsResolve(domain, 'A');
      if (Array.isArray(records) && records.length > 0) {
        records.forEach(ip => allIPs.add(ip));
      }
    } catch (err) {
      // 继续尝试其他方法
    }

    // 方法4: lookup
    try {
      const result = await dnsLookup(domain, { all: true, family: 4 });
      if (Array.isArray(result)) {
        result.forEach(r => allIPs.add(r.address));
      } else {
        allIPs.add(result.address);
      }
    } catch (err) {
      try {
        const result = await dnsLookup(domain, { family: 4 });
        allIPs.add(result.address);
      } catch (err2) {
        // 忽略
      }
    }

    if (allIPs.size > 0) {
      const uniqueIPs = Array.from(allIPs);
      if (depth === 0) {
        console.log(`✅ 解析到 ${uniqueIPs.length} 个 IP: ${uniqueIPs.join(', ')}`);
      }
      return uniqueIPs;
    }

    throw new Error(`未找到 ${domain} 的 A 记录或 CNAME 记录`);
  } catch (err) {
    if (err.message.includes('ENOTFOUND') || err.message.includes('ENODATA')) {
      throw new Error(`域名 ${domain} 不存在或无法解析`);
    }
    throw err;
  }
}

// ------------------- API -------------------
app.get("/api", async (req, res) => {
  let { ip, port = DEFAULT_PORT, host, wsPath = DEFAULT_WS_PATH } = req.query;
  
  // 参数验证
  if (!ip) {
    return res.status(400).json({ 
      error: "缺少必需参数",
      message: "需要提供 ip 参数"
    });
  }


  // 检测并解析 IP:端口 格式（例如 1.164.110.203:10029）
  const ipPortMatch = ip.match(/^(.+?):(\d+)$/);
  if (ipPortMatch) {
    ip = ipPortMatch[1];
    port = ipPortMatch[2];
  }

  // 如果 Host 为空，使用默认值
  if (!host || host.trim() === "") {
    host = DEFAULT_HOST;
  }

  // 如果端口为空或未指定，使用默认端口
  if (!port || port === "" || port === String(DEFAULT_PORT)) {
    port = DEFAULT_PORT;
  }

  // IP 格式验证
  const isIP = isIPAddress(ip);
  const isDomainName = isDomain(ip);
  
  if (!isIP && !isDomainName) {
    return res.status(400).json({ 
      error: "无效的 IP 地址或域名",
      message: "请提供有效的 IP 地址或域名（支持 IPv4、IPv6 或域名，也可使用 IP:端口 格式）"
    });
  }

  // 如果是域名，解析为多个 IP
  let targetIPs = [];
  if (isDomainName) {
    try {
      console.log(`\n🔍 DNS 解析域名: ${ip}`);
      targetIPs = await resolveDomain(ip);
    } catch (err) {
      return res.status(400).json({ 
        error: "DNS 解析失败",
        message: err.message
      });
    }
  } else {
    // 单个 IP
    targetIPs = [ip];
  }

  // 速率限制
  const clientIp = req.ip || req.connection.remoteAddress || "unknown";
  if (!checkRateLimit(clientIp)) {
    return res.status(429).json({ 
      error: "请求过于频繁",
      message: "请稍后再试"
    });
  }

  const targetPort = parseInt(port);
  if (isNaN(targetPort) || targetPort < 1 || targetPort > 65535) {
    return res.status(400).json({ 
      error: "无效的端口号",
      message: "端口号必须在 1-65535 之间"
    });
  }

  // 检查缓存（域名缓存使用原始输入）
  const cacheKey = `${ip}_${targetPort}_${host}`;
  const cached = requestCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
    return res.json(cached.data);
  }

  // 检测单个 IP 的函数（完全独立，不共享状态）
  async function detectSingleIP(targetIP, index, total) {
    // 每个检测都有独立的结果对象，避免数据混淆
    const result = {
      ip: targetIP,  // 明确标记IP，确保结果对应正确
      checks: { 
        tls_detect: false, 
        ws_real_connect: false, 
        cdn_trace: false 
      },
    latency: {},
    geoip: null,
    cdn: { warp: "off" }
  };

    // 使用IP作为日志前缀，避免并发时日志混乱
    const logPrefix = `[IP:${targetIP}]`;

    try {
      console.log(`\n${logPrefix} [${index + 1}/${total}] 📋 开始检测 (Host: ${host})`);

      // ----- GeoIP 查询 -----
      try {
        const geoipData = await lookupGeoIP(targetIP);
        if (geoipData && Object.keys(geoipData).length > 0) {
          result.geoip = geoipData;
          console.log(`${logPrefix} ✅ GeoIP: ${geoipData.city || ''}${geoipData.city ? ', ' : ''}${geoipData.countryName || geoipData.country || ''}${geoipData.organization ? ' / ' + geoipData.organization : ''}`);
        } else {
          console.warn(`${logPrefix} ⚠️  GeoIP: 未找到数据`);
        }
      } catch (err) {
        console.warn(`${logPrefix} ⚠️  GeoIP 查询失败: ${err.message}`);
      }

      // ----- TLS 检测 -----
      const tlsStart = Date.now();
      try {
        await testTLS(targetIP, targetPort, host);
    result.checks.tls_detect = true;
        result.latency.tls_handshake_ms = Date.now() - tlsStart;
        console.log(`${logPrefix} ✅ TLS: ${result.latency.tls_handshake_ms}ms`);
  } catch (err) {
    result.checks.tls_detect = false;
        result.latency.tls_handshake_ms = Date.now() - tlsStart;
        console.error(`${logPrefix} ❌ TLS: ${err.message}`);
      }

      // ----- WebSocket 检测 -----
      const wsStart = Date.now();
      if (DISABLE_WEBSOCKET) {
        // 云平台环境：跳过 WebSocket 检测
        result.checks.ws_real_connect = false;
        result.latency.ws_connect_ms = 0;
        console.log(`${logPrefix} ⏭️  WebSocket: 已禁用（云平台优化）`);
      } else {
        try {
          const wsInfo = await testWebSocket(targetIP, targetPort, host, wsPath);
          result.checks.ws_real_connect = true;
          result.latency.ws_connect_ms = Date.now() - wsStart;
          if (wsInfo) result.websocket = wsInfo;
          console.log(`${logPrefix} ✅ WebSocket: ${result.latency.ws_connect_ms}ms`);
        } catch (err) {
          result.checks.ws_real_connect = false;
          result.latency.ws_connect_ms = Date.now() - wsStart;
          result.websocket = { error: err.message };
          console.warn(`${logPrefix} ⚠️  WebSocket: ${err.message}`);
        }
      }

      // ----- CDN Trace 检测 -----
      if (DISABLE_CDN_TRACE) {
        // 云平台环境：跳过 CDN Trace 检测
        result.checks.cdn_trace = false;
        console.log(`${logPrefix} ⏭️  CDN Trace: 已禁用（云平台优化）`);
      } else {
        try {
          const cdnResult = await testCDNTrace(targetIP, targetPort, host);
          result.checks.cdn_trace = cdnResult.success;
          if (cdnResult.warp) result.cdn.warp = cdnResult.warp;
          // trace 内容不在API响应中返回（仅用于内部检测）
          if (cdnResult.success && cdnResult.warp) {
            console.log(`${logPrefix} ✅ CDN Trace: ${cdnResult.warp || 'off'}`);
          } else {
            console.warn(`${logPrefix} ⚠️  CDN Trace: 不可用`);
          }
        } catch (err) {
          result.checks.cdn_trace = false;
          console.warn(`${logPrefix} ⚠️  CDN Trace: ${err.message}`);
        }
      }

      console.log(`${logPrefix} ✓ 检测完成`);
      return result;
    } catch (err) {
      // 即使检测过程中出现意外错误，也返回部分结果，不影响其他IP
      console.error(`${logPrefix} ❌ 检测异常: ${err.message}`);
      result.error = err.message;
      return result;
    }
  }

  // 并行检测所有 IP（每个IP完全独立，使用 Promise.allSettled 避免一个失败影响全部）
  console.log(`\n🚀 开始并行检测 ${targetIPs.length} 个 IP 地址...`);
  const results = await Promise.all(
    targetIPs.map((targetIP, index) => detectSingleIP(targetIP, index, targetIPs.length))
  );

  // 验证结果完整性：确保每个IP都有对应的结果
  if (results.length !== targetIPs.length) {
    console.error(`⚠️  警告: 检测结果数量(${results.length})与IP数量(${targetIPs.length})不匹配`);
  }
  
  // 验证每个结果的IP是否匹配
  results.forEach((result, index) => {
    if (result.ip !== targetIPs[index]) {
      console.error(`⚠️  警告: 结果索引${index}的IP不匹配: 期望${targetIPs[index]}, 实际${result.ip}`);
    }
  });

  // 清理和精简结果数据
  const cleanedResults = results.map(r => {
    const cleaned = {
      ip: r.ip,
      checks: r.checks,
      latency: r.latency
    };
    
    // 保留geoip信息（位置和组织/ASN）- 即使部分字段为空也要保留对象
    if (r.geoip) {
      cleaned.geoip = {
        city: r.geoip.city || null,
        country: r.geoip.country || null,
        countryName: r.geoip.countryName || null,
        latitude: r.geoip.latitude || null,
        longitude: r.geoip.longitude || null,
        asn: r.geoip.asn || null,
        organization: r.geoip.organization || null
      };
    }
    
    // 保留cdn信息（包括warp状态）
    if (r.cdn) {
      cleaned.cdn = { warp: r.cdn.warp || "off" };
    }
    
    // 仅在有WebSocket连接时才添加websocket信息，并精简字段
    if (r.websocket && r.websocket.connected) {
      cleaned.websocket = {
        connected: true,
        protocol: r.websocket.protocol || null
      };
    }
    
    return cleaned;
  });

  // 判断是否使用默认host（避免泄露默认配置）
  const isDefaultHost = host === DEFAULT_HOST;
  
  // 构建响应
  let response;
  
  if (targetIPs.length === 1) {
    // 单个IP：直接在顶层返回，不包含results数组（避免重复）
    response = {
      input: ip,
      isDomain: isDomainName,
      port: targetPort,  // 添加port字段，前端需要显示
      ...cleanedResults[0],  // 直接展开单个结果的所有字段
      timestamp: new Date().toISOString()
    };
    // 仅在使用非默认host时才返回host字段
    if (!isDefaultHost) {
      response.host = host;
    }
  } else {
    // 多个IP：使用results数组
    response = {
      input: ip,
      isDomain: isDomainName,
      resolvedIPs: targetIPs,
      port: targetPort,
      results: cleanedResults,
      timestamp: new Date().toISOString()
    };
    // 仅在使用非默认host时才返回host字段
    if (!isDefaultHost) {
      response.host = host;
    }
  }

  // 缓存结果
  requestCache.set(cacheKey, { data: response, timestamp: Date.now() });

  // 输出汇总
  console.log(`\n📊 检测完成: ${results.length} 个 IP`);
  console.log(`   TLS 成功: ${results.filter(r => r.checks.tls_detect).length}/${results.length}`);
  console.log(`   WebSocket 成功: ${results.filter(r => r.checks.ws_real_connect).length}/${results.length}`);
  console.log(`   CDN Trace 成功: ${results.filter(r => r.checks.cdn_trace).length}/${results.length}`);
  console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`);

  res.json(response);
});

// ------------------- GeoIP 查询 -------------------
async function lookupGeoIP(ip) {
  if (!cityReader && !asnReader) {
    return null;
  }

  try {
    const cityData = cityReader ? cityReader.get(ip) : null;
    const asnData = asnReader ? asnReader.get(ip) : null;

    if (!cityData && !asnData) {
      return null;
    }

    const result = {};
    
    if (cityData) {
      result.city = cityData.city?.names?.en || cityData.city?.names?.zh || "";
      result.country = cityData.country?.iso_code || "";
      result.countryName = cityData.country?.names?.en || cityData.country?.names?.zh || "";
      if (cityData.location) {
        result.latitude = cityData.location.latitude || null;
        result.longitude = cityData.location.longitude || null;
      }
    }

    if (asnData) {
      result.asn = asnData.autonomous_system_number || null;
      result.organization = asnData.autonomous_system_organization || "";
    }

    return Object.keys(result).length > 0 ? result : null;
  } catch (err) {
    console.warn(`GeoIP 查询异常 (${ip}):`, err.message);
    return null;
  }
}

// ------------------- TLS 检测（通过 HTTPS）-------------------
async function testTLS(ip, port = DEFAULT_PORT, host) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: ip,
      port: port,
      path: '/',
      method: 'HEAD',
      rejectUnauthorized: false,
      timeout: TLS_TIMEOUT,
      headers: {
        'Host': host
      }
    };

    const req = https.request(options, (res) => {
      resolve(true);
    });

    req.on('error', (err) => {
      reject(new Error(err.message || "TLS 连接失败"));
    });

    req.on('timeout', () => {
      req.destroy();
      reject(new Error(`TLS 连接超时（${TLS_TIMEOUT/1000}秒）`));
    });

    req.end();
  });
}

// ------------------- WebSocket 检测 -------------------
async function testWebSocket(ip, port = DEFAULT_PORT, host, wsPath = DEFAULT_WS_PATH) {
  return new Promise((resolve, reject) => {
    // 使用 IP 地址连接，但在 Host 头中使用 host
    const url = `wss://${ip}:${port}${wsPath}`;
    let timeout = null;
    let isResolved = false;

    const cleanup = () => {
      if (timeout) {
        clearTimeout(timeout);
        timeout = null;
      }
    };

    const safeReject = (error) => {
      if (!isResolved) {
        isResolved = true;
        cleanup();
        reject(error);
      }
    };

    const safeResolve = (value) => {
      if (!isResolved) {
        isResolved = true;
        cleanup();
        resolve(value);
      }
    };

    try {
      // WebSocket 连接配置
      const wsOptions = {
        rejectUnauthorized: false, // 允许自签名证书（用于测试）
        handshakeTimeout: WEBSOCKET_TIMEOUT,
        perMessageDeflate: false,
        headers: {
          'Host': host || ip // 在 Host 头中指定原始 host
        }
      };

      // 使用 createConnection 自定义底层 TLS 连接以设置 SNI（仅在有 host 时）
      if (host) {
        wsOptions.createConnection = (options, callback) => {
          // 直接使用 tls.connect，设置正确的 host 和 servername
          const socket = tls.connect({
            host: ip,              // 连接到实际 IP
            port: port,            // 连接到实际端口
            servername: host,      // SNI 使用 host 域名
            rejectUnauthorized: false,
            ...options
          }, callback);
          return socket;
        };
      }

      const ws = new WebSocket(url, wsOptions);

      timeout = setTimeout(() => {
        if (!isResolved) {
          // 添加错误监听器来捕获 terminate 可能引发的错误
          ws.on("error", () => {}); // 忽略错误
          try {
            // WebSocket 状态: CONNECTING = 0, OPEN = 1, CLOSING = 2, CLOSED = 3
            if (ws.readyState === 0 || ws.readyState === 1) {
              ws.terminate();
            }
          } catch (err) {
            // 忽略 terminate 错误
          }
          safeReject(new Error(`连接超时（${WEBSOCKET_TIMEOUT/1000}秒）`));
        }
      }, WEBSOCKET_TIMEOUT);

      ws.on("open", () => {
        // 仅返回关键信息，精简响应
        const wsInfo = {
          connected: true,
          protocol: ws.protocol || null
        };

        ws.close();
        safeResolve(wsInfo);
      });

      ws.on("error", (err) => {
        // 处理各种 WebSocket 连接错误
        const errorMsg = err.message || "";
        const errorCode = err.code || "";
        
        if (errorMsg.includes("EACCES") ||
            errorMsg.includes("permission denied") ||
            errorMsg.includes("EPERM")) {
          safeReject(new Error("当前环境不支持 WebSocket 检测（权限限制）"));
        } else if (errorMsg.includes("ECONNREFUSED") || 
                   errorCode === "ECONNREFUSED") {
          safeReject(new Error("WebSocket 连接被拒绝（目标服务器未开放该端口或服务）"));
        } else if (errorMsg.includes("ETIMEDOUT") || 
                   errorMsg.includes("timeout")) {
          safeReject(new Error("WebSocket 连接超时"));
        } else if (errorMsg.includes("ENOTFOUND") || 
                   errorMsg.includes("getaddrinfo")) {
          safeReject(new Error("无法解析目标地址"));
        } else {
          safeReject(new Error(errorMsg || "WebSocket 连接失败"));
        }
      });

      ws.on("close", () => {
        // close 事件不触发 reject，因为可能是正常关闭
      });
    } catch (err) {
      safeReject(new Error(`创建 WebSocket 连接失败: ${err.message}`));
    }
  });
}

// ------------------- CDN Trace 检测 -------------------
async function testCDNTrace(ip, port = DEFAULT_PORT, host) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: ip,
      port: port,
      path: '/cdn-cgi/trace',
      method: 'GET',
      rejectUnauthorized: false,
      timeout: CDN_TRACE_TIMEOUT,
      servername: host, // 设置 SNI（Server Name Indication）
      headers: {
        'Host': host
      }
    };

    const req = https.request(options, (res) => {
      let data = '';

      res.on('data', (chunk) => {
        data += chunk;
      });

      res.on('end', () => {
        if (res.statusCode !== 200 || !data?.trim()) {
          resolve({ 
            success: false, 
            warp: "off",
            reason: res.statusCode === 404 || res.statusCode === 403 ? `端点不可用 (HTTP ${res.statusCode})` : 
                   res.statusCode !== 200 ? `HTTP ${res.statusCode}` : "响应为空"
          });
          return;
        }

        const warpMatch = data.match(/warp=(\w+)/);
        const warp = warpMatch ? warpMatch[1] : "off";

        resolve({ 
          success: true, 
          warp: warp === "on" ? "on" : "off",
          trace: data
        });
      });
    });

    req.on('error', (err) => {
      resolve({ success: false, warp: "off", reason: err.message || "连接失败" });
    });

    req.on('timeout', () => {
      req.destroy();
      resolve({ success: false, warp: "off", reason: `请求超时（${CDN_TRACE_TIMEOUT/1000}秒）` });
    });

    req.end();
  });
}

// ------------------- 错误处理中间件 -------------------
app.use((err, req, res, next) => {
  console.error("服务器错误:", err);
  res.status(500).json({ 
    error: "服务器内部错误",
    message: err.message 
  });
});

// ------------------- 404 处理 -------------------
app.use((req, res) => {
  // 对于静态资源请求返回 204，避免产生错误日志
  if (req.path.match(/\.(ico|png|jpg|jpeg|gif|svg|css|js|woff|woff2|ttf|eot)$/i)) {
    res.status(204).end();
    return;
  }
  res.status(404).json({ 
    error: "未找到资源",
    message: `路径 ${req.path} 不存在`
  });
});

// ------------------- 启动服务 -------------------
function startServer() {
  try {
    const server = app.listen(PORT, () => {
      console.log(`✅ CF IP 检测服务已启动，端口: ${PORT}`);
      console.log(`📡 API 端点: http://localhost:${PORT}/api`);
      console.log(`🌐 Web 界面: http://localhost:${PORT}/`);
      console.log(`\n📦 功能配置:`);
      console.log(`   WebSocket 检测: ${DISABLE_WEBSOCKET ? '⏭️ 已禁用（云平台优化）' : '✅ 已启用'}`);
      console.log(`   CDN Trace 检测: ${DISABLE_CDN_TRACE ? '⏭️ 已禁用（云平台优化）' : '✅ 已启用'}`);
      console.log(`   GeoIP 数据库: ✅ 自动加载`);
      console.log(`\n使用说明:`);
      console.log(`  - 访问 Web 界面进行可视化检测`);
      console.log(`  - 或直接调用 API: GET /api?ip=172.69.21.100&port=443&host=你的cloudflare 节点域名`);
    });

    // 处理优雅关闭
    process.on('SIGTERM', () => {
      console.log('\n收到 SIGTERM 信号，正在关闭服务器...');
      server.close(() => {
        console.log('服务器已关闭');
        process.exit(0);
      });
    });

  } catch (err) {
    console.error('❌ 启动服务器失败:', err.message);
    process.exit(1);
  }
}

startServer();