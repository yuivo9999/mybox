# 阶段 2：原生网络与 CORS 解决方案实施

> 上游：`01_Android容器与Capacitor实施.md`  
> 下游：`03_React请求层Android适配实施.md`

## 1. 本阶段目标

真正解决：

> Android App 内第三方接口请求受到浏览器/WebView CORS 限制的问题。

本阶段的目标不是“关闭 CORS”，而是建立：

```
React
  ↓
统一请求适配
  ↓
Android Native HTTP
  ↓
第三方服务器
```

浏览器环境则保持：

```
React
  ↓
浏览器 HTTP
  ↓
第三方服务器
```

---

## 2. 核心原则

### 2.1 Native HTTP 才是 CORS 问题的关键出口

Android 原生网络请求不处于浏览器 JavaScript CORS 执行环境中。

因此：

- Native HTTP 请求不应通过 WebView 的 fetch 再绕一圈；
- React 只负责调用统一请求接口；
- Android 原生层负责真正的 HTTP；
- 原生层把必要结果返回给 Web 层。

### 2.2 不得把“关闭 WebView 安全”作为主要方案

禁止以以下方式冒充完成：

- allow universal access from file URLs
- 任意 origin 放行
- 关闭证书验证
- 接受所有 TLS
- 任意 JavaScript bridge
- 无限制混合内容

除非有非常明确且经过验证的特定需求，否则采用最小权限。

---

## 3. 先审计现有请求形态

本阶段已按当前仓库实际代码完成网络入口审计。

### 3.1 实际请求入口

| 请求/链路 | 当前入口 | Stage 2 结论 |
|---|---|---|
| 影视 JSON API | `src/adapters/movie/movieAdapter.js` → `resilientFetch` | Android 后续应走 Native HTTP |
| Live JSON/XML/M3U/TXT | `src/adapters/live/liveAdapter.js` → `resilientFetch` | Android 后续应走 Native HTTP |
| HLS manifest（仅在 parser 明确要求 `fetchManifest` 时） | `src/parsers/hlsParser.js` → 注入的 `fetch` | 与普通 API 分开；Stage 3/播放链路继续单独判断 |
| HLS / 视频播放 | `src/player/html5PlayerAdapter.js` + HLS.js / HTML5 Video | 不接入普通 Native HTTP bridge |
| 原生播放器 | `src/player/nativePlayerAdapter.js` → 既有播放器 bridge | 与 API 网络 bridge 分离 |
| 图片 | 当前未发现独立 Native HTTP 图片请求入口 | 保持图片加载链路独立 |
| XHR | 当前仓库未发现业务 XHR 入口 | 无需新增 XHR bridge |
| 用户源配置 | `src/services/sourceConfigService.js` | 运行时允许 `http://` / `https://`；仓库未发现固定第三方源列表 |

仓库代码搜索对 `http://` 与 `https://` 均未发现固定代码命中；因此不能伪称存在某个已知 HTTP 域名。运行时导入的源配置仍可能包含明文 HTTP。

### 3.2 请求分类表

| 请求类型 | 是否需要 Native | 原因 |
|---|---|---|
| JSON API | Android：需要；Web：保持浏览器 | 第三方 API 可能不提供 CORS |
| XML API | Android：需要；Web：保持浏览器 | 与 JSON 同属源数据请求 |
| TXT/M3U Live 源 | Android：需要；Web：保持浏览器 | 当前由 Live Adapter 文本请求取得 |
| 解析接口 | 按实际 Parser 再判断 | 不能把 Parser 与 API 混为一谈 |
| 图片 | 暂不改 | 当前未发现统一 Native 图片请求需求 |
| M3U8 / HLS segment | 单独处理 | 播放器/HLS.js 链路 |
| MP4 / 其他媒体 | 单独处理 | 播放器链路，不走普通 JSON bridge |

现有 `resilientFetch.js` 仍保留浏览器侧兼容路径；其中历史性的公共 CORS proxy fallback 没有在本阶段删除，以避免在 Stage 2 提前破坏现有 Web 行为。Stage 3 必须保证 Android API 请求优先进入本阶段 Native HTTP，而不是继续依赖这些公共 proxy。

---

## 4. Native HTTP 接口设计

本阶段实际实现位置：

- `src/runtime/nativeHttpBridge.js`
- `src/runtime/webViewRuntime.js`

采用 Capacitor 8 官方 `CapacitorHttp.request()` 作为 Android 原生 HTTP 通道；该 API 属于 `@capacitor/core`，不新增第三方 HTTP 库。Capacitor 文档明确提供 `url/method/params/data/headers/readTimeout/connectTimeout/disableRedirects/responseType` 等能力。

JS 层对其再包一层受限契约：

```js
{
  method: "GET",
  url: "https://example.com/api",
  headers: {},
  body: null,
  timeoutMs: 15000,
  responseType: "text"
}
```

返回：

```js
{
  ok: true,
  status: 200,
  headers: {},
  body: "...",
  url: "https://example.com/api"
}
```

HTTP 非 2xx：

```js
{
  ok: false,
  status: 404,
  headers: {},
  body: "...",
  url: "..."
}
```

网络/桥接失败通过异常携带标准 `code`：

- `NETWORK_ERROR`
- `TIMEOUT`
- `DNS_ERROR`
- `TLS_ERROR`
- `BRIDGE_UNAVAILABLE`
- `UNSUPPORTED_METHOD`
- `UNSUPPORTED_PROTOCOL`
- `UNSUPPORTED_RESPONSE_TYPE`
- `ABORTED`

敏感 Header 不进入日志；`Cookie`、`Authorization`、`User-Agent`、`Referer` 可以作为显式 Header 传入，但不会自动从 WebView Cookie 或其他全局状态复制。

---

## 5. 必须支持的能力

已根据实际代码需求实现/处理：

- GET：支持
- POST：支持
- PUT/PATCH/DELETE/HEAD/OPTIONS：同时支持，避免后续业务出现协议缺口
- headers：支持，并校验 CR/LF
- body：支持 string / JSON-serializable object
- timeout：支持；默认 15 秒，限制在 1–120 秒，并映射到 native connect/read timeout
- HTTP status：返回统一 `ok/status/headers/body/url`
- response text：支持
- JSON：支持
- redirect：支持是否禁用自动 redirect
- Abort：支持 JS 层取消；当前 CapacitorHttp 没有暴露底层 cancellation handle，因此不声称底层传输已取消
- Cookie：通过显式 `Cookie` Header 支持；不自动同步 WebView Cookie
- Authorization：通过显式 Header 支持
- User-Agent / Referer：通过显式 Header 支持
- 日志：Native HTTP 实现不打印请求 Header、Cookie、Token、Authorization 或响应正文

---

## 6. Bridge 安全要求

本项目没有新增任意 Java/Kotlin 方法调用桥。现有 `webViewRuntime.call()` 同样采用固定方法白名单，拒绝任意字符串方法调用。

Native HTTP 采用 Capacitor 官方 Plugin Bridge，业务层只通过：

- `nativeHttpRequest`
- `webViewRuntime.nativeHttpRequest()`

进入请求能力。

请求方法采用 allowlist：

`GET / POST / PUT / PATCH / DELETE / HEAD / OPTIONS`

responseType 采用 allowlist：

`text / json`

URL 只允许：

`http://` / `https://`

明确拒绝：

- `file:`
- `data:`
- `blob:`
- 任意未知协议

没有修改：

- universal access from file URLs
- TLS 证书校验
- WebView 任意 origin
- 全局 mixed content
- 任意 JavaScript → Java/Kotlin 反射调用

---

## 7. 错误处理

Native bridge 自身不吞掉异常。

它将 bridge 不可用、参数错误、timeout、DNS、TLS、网络失败、abort、unsupported response type 等区分为明确错误码；HTTP 状态则保留在返回结构中。

`requestManager.js` 当前没有在本阶段改写，仍保留原有 concurrency / deduplication / AbortController / cancel / cancelAll。Stage 3 的接入点已经明确：

```text
business service
  ↓
request adapter
  ↓
requestManager
  ↓
  ├─ Browser fetch
  └─ webViewRuntime.nativeHttpRequest
```

因此本阶段没有把生命周期调度职责重复塞进 Native bridge。

---

## 8. Android 明文 HTTP

审计结果：

- 仓库没有固定第三方源列表，因此不存在可诚实列出的“当前已知 HTTP 域名”。
- `sourceConfigService.js` 允许用户运行时导入 `http://` 源。
- 没有在 Android Manifest / Capacitor config 中全局开启 cleartext。
- Native bridge 允许识别 `http://` URL，但 Android 平台是否允许某个明文域名仍取决于 Android 网络安全策略；本阶段不通过全局放开安全策略来解决。
- 如果后续真实源确实要求明文 HTTP，应根据真实域名再设计最小范围的原生网络安全配置，并优先要求源升级 HTTPS。

---

## 9. 本阶段不要做

本阶段没有：

- 修改所有业务页面调用 Native API；
- 删除 `requestManager`；
- 在组件中散落 Android 判断；
- 关闭全部 WebView 安全限制；
- 把 HLS/MP4/媒体流量改成普通 API bridge；
- 把 CapacitorHttp 全局 patch 到 fetch/XHR，从而绕过 Stage 3 的 requestManager 设计。

---

## 10. 完成定义

本阶段代码实施已满足：

- [x] 请求分类完成。
- [x] Native HTTP API 已实现。
- [x] JS bridge 已实现。
- [x] bridge 方法白名单明确。
- [x] GET/POST 等实际需要的能力已实现。
- [x] timeout/abort 已处理。
- [x] status/error 已处理。
- [x] Cookie/Header 需求已处理。
- [x] HTTP 明文问题已调查。
- [x] 没有把媒体播放链路错误地当普通 API。
- [x] requestManager 接入方案已明确并可交给阶段 3。

---

## 阶段交接记录

- 阶段：阶段 2：原生网络与 CORS 解决方案实施
- 完成日期：2026-10-03
- Commit：`ce712db2ab5b5aa27193f72a21e490bb7a8145f8`（bridge allowlist hardening）；架构检查：`df00d078527e853f79b5de52a7af86ca94b10816`；Native HTTP 实施 commits：`02a62c4d46fba2427497b67316a6c5863154d3e5`、`f9180c2109c9ecd1650734c3abef9740d4c1add`
- Native HTTP 实现位置：`src/runtime/nativeHttpBridge.js`
- JS bridge 实现位置：`src/runtime/nativeHttpBridge.js` + `src/runtime/webViewRuntime.js`
- 支持的 method：GET / POST / PUT / PATCH / DELETE / HEAD / OPTIONS
- 支持的 responseType：text / json
- timeout：默认 15000ms；native connect/read timeout；范围 1000–120000ms
- abort：JS AbortSignal 可阻止结果继续返回；CapacitorHttp 没有暴露底层取消句柄，因此不声称传输层取消
- Cookie：显式 Cookie Header；不自动同步 WebView Cookie
- Header：显式传递并校验 CR/LF；不记录敏感 Header
- HTTP 明文策略：不全局开启 cleartext；运行时 HTTP 源需真实域名后再做最小范围策略；HTTPS 优先
- 播放链路处理方式：HLS.js / HTML5 / native player 保持独立；普通 API bridge 不承载媒体流
- 已验证的真实请求：当前未在 Android 真机/模拟器上执行第三方真实请求；本阶段通过 GitHub 文件静态检查和现有 Web 构建链路验证实现结构。不得把静态验证冒充真实 Android 请求验证
- 未完成：阶段 3 尚未将 requestManager 与 Native adapter 接通；阶段 4 APK workflow 尚未建立；阶段 5 真机验收尚未完成
- 风险：`resilientFetch.js` 仍保留浏览器侧历史 CORS proxy fallback；Stage 3 Android 请求必须绕过该路径。运行时明文 HTTP 源的具体域名未知，需真实源出现后再确定最小原生策略
- 下一阶段：03_React请求层Android适配实施.md
- 下一 AI 第一件事：先检查 `nativeHttpBridge.js`、`webViewRuntime.capabilities.nativeHttp`，然后逐个审计 service/adapter 的网络入口并接入 requestManager
- 下一 AI 必须先检查：requestManager 的 dedup/concurrency/AbortController/cancel/cancelAll 是否完整保留；Browser 与 Android 返回契约是否统一；HLS/播放链路是否没有被机械替换
- 不要重复做：不要重新安装 Capacitor；不要重新生成 Android scaffold；不要重新设计 Native HTTP 协议；不要新增临时 Android scaffold workflow
