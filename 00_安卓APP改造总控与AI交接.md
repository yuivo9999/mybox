# mybox Android APK 改造总控与 AI 交接文档

> 文档用途：这是本次“React Web 项目 → Android APK → GitHub Actions 自动产出 APK → 手机安装”的总控文档。  
> 目标：解决浏览器环境下第三方接口请求受到 CORS / 浏览器跨域安全策略限制的问题，同时尽量保留现有 React 业务架构。  
> 本文是后续所有阶段 AI 的第一入口。任何 AI 接手本任务时，必须先阅读本文，再按“当前阶段”进入对应阶段文档。

## 1. 当前项目事实（2026-10-03）

仓库：`yuivo9999/mybox123`  
默认分支：`main`

当前项目是 React + Vite Web 应用：

- `package.json`：React 19、Vite 8、HLS.js 等。
- 已有 `npm run build`。
- 已有 GitHub Actions，但当前主要用于 GitHub Pages 部署。
- 已有 `src/runtime/webViewRuntime.js`。
- 已有 `src/services/requestManager.js`。
- 阶段 1 已完成：Android 原生工程已经存在并纳入 Git。
- Capacitor Android 8.5.2 已安装并同步。
- Android Manifest / Gradle Android App 工程已经由 Capacitor CLI 实际生成。
- 当前仍没有正式的 Android APK 专用 GitHub Actions 工作流；阶段 4 才建立。
- 当前 WebView bridge 只是“桥接抽象”，不是已经存在的 Android 原生实现。

### 已有 WebView 能力

`src/runtime/webViewRuntime.js` 已经定义：

- `TVboxAndroidBridge`
- `Android`
- `tvboxBridge`
- `setFullscreen`
- `requestOrientation`
- `getAppState`
- `notifyLifecycle`
- `TVBoxWebView.onBackPressed`

因此本项目并不是从零开始设计 WebView 运行环境；后续应优先复用这一层，而不是重新制造一套互不兼容的桥接协议。

### 已有请求调度层

`src/services/requestManager.js` 当前负责：

- 请求去重 key
- 并发限制
- AbortController
- cancel / cancelAll
- 请求生命周期管理

因此后续 CORS 解决方案应优先在“请求适配层”处理，不应把所有业务页面逐个改成 Android 专用代码。

---

## 2. 最终目标

最终用户操作流程必须能够做到：

1. AI 按阶段修改 GitHub 仓库。
2. 推送到 `main` 后，GitHub Actions 自动执行 Android 构建。
3. Actions 生成可安装的 APK。
4. APK 作为 Actions Artifact（必要时再发布 Release）。
5. 用户下载 APK。
6. Android 手机允许安装后直接运行。
7. React 页面在 Android WebView 中运行。
8. 需要访问第三方接口的请求不再依赖浏览器页面直接跨域 fetch；需要时由 Android 原生网络层代为请求，再安全地把结果交给 Web 层。
9. 原有 Web 浏览器模式仍然保留，不能因为 Android 改造而强制所有 Web 请求走原生桥。

---

## 3. 关键技术原则

### 原则 A：不要误认为“打包成 APK = 自动解决 CORS”

APK / WebView 本身不等于 CORS 解决方案。

正确的目标架构是：

```
Web 浏览器：
React → requestManager → 浏览器 HTTP

Android：
React → requestManager → Android 请求适配器 → Native HTTP → 第三方接口
```

原生 HTTP 请求发生在 Android 原生层时，不受浏览器 JavaScript CORS 机制的直接约束。

### 原则 B：不要大规模重写业务

优先改造：

- 请求入口
- Android bridge
- Native HTTP adapter
- Capacitor / Android 容器
- GitHub Actions

而不是把影视、Live、解析、播放等业务全部重写。

### 原则 C：API 请求和媒体播放必须分开判断

第三方接口请求、解析请求、JSON/XML/Text 请求与：

- HLS
- MP4
- M3U8
- 视频播放
- 图片
- 字幕

并不是完全相同的网络问题。

后续 AI 必须逐项确认哪些请求需要 Native HTTP，哪些应该继续由 WebView / HLS.js / 播放器处理。

### 原则 D：安全优先

不得通过“关闭所有 WebView 安全机制”来解决问题。

除非有明确、经过验证的必要性，否则不得随意：

- 关闭 TLS 校验
- 接受任意证书
- 关闭所有 WebView 安全策略
- 无限制暴露 Android JavaScript bridge
- 把任意原生方法暴露给网页
- 把用户数据、Cookie、Authorization header 无限制返回网页

---

## 4. 阶段总表

| 阶段 | 文档 | 目标 | 完成后状态 |
|---|---|---|---|
| 0 | 本文 | 总控、状态、交接规则 | AI 知道整个任务 |
| 1 | `01_Android容器与Capacitor实施.md` | 建立 Android 工程 | **已完成：仓库具备 Android 容器** |
| 2 | `02_原生网络与CORS解决方案实施.md` | 建立 Native HTTP 通道 | **已完成：具备受限 Native HTTP 原生通路** |
| 3 | `03_React请求层Android适配实施.md` | 接入现有 requestManager | 业务请求可按运行环境选择通路 |
| 4 | `04_GitHub_Actions_APK构建实施.md` | GitHub 自动构建 APK | push 后可获得 APK Artifact |
| 5 | `05_最终验收与AI交接实施.md` | 全面静态/CI/设备验收 | 明确是否真正完成 |

**执行顺序必须遵守：1 → 2 → 3 → 4 → 5。当前已完成阶段 2，下一阶段进入阶段 3。**

如果某阶段发现前置阶段存在缺陷，不允许直接跳到后面的阶段掩盖问题。

---

## 5. 每个阶段 AI 必须遵守的交接协议

每次接手时必须：

### 第一步：阅读本文件

确认：

- 当前仓库是什么；
- 最终目标是什么；
- 当前阶段是什么；
- 前置阶段是否已完成；
- 哪些文件已经存在；
- 哪些文件禁止重复创建。

### 第二步：阅读对应阶段文档

对应关系：

- Android 工程：`01_Android容器与Capacitor实施.md`
- Native 网络：`02_原生网络与CORS解决方案实施.md`
- React 请求适配：`03_React请求层Android适配实施.md`
- GitHub APK：`04_GitHub_Actions_APK构建实施.md`
- 验收：`05_最终验收与AI交接实施.md`

### 第三步：先检查 GitHub 当前状态

必须根据仓库当前真实文件判断：

- 前一阶段是否已经完成；
- 文件是否已经被后续 AI 修改；
- 是否存在部分完成；
- 是否存在与计划不同的实现。

**不得仅凭本文件假设代码一定与文档完全一致。**

### 第四步：完成当前阶段

一次完成该阶段明确列出的任务。

### 第五步：记录交接

完成后必须更新本阶段文档中的：

- 实际完成内容
- 实际新增/修改文件
- 未完成项
- 已知风险
- 给下一 AI 的明确入口
- 下一阶段应该首先检查什么

---

## 6. 特别重要的最终验证规则

本项目之前已经明确要求：

> 最终检验阶段不得通过“拉取仓库到本地并进行本地构建”来作为最终验证手段。

因此最终验收必须以：

- GitHub 文件检查
- GitHub Actions
- Actions 日志
- 构建 Artifact
- Android 真机安装/运行
- 静态代码一致性检查

为主。

**不要在最终验收时临时 clone / pull 仓库然后本地 build 来代替真正的 GitHub CI 验证。**

---

## 7. 当前 AI 给下一 AI 的固定交接模板

每阶段结束时，在对应阶段文档末尾写：

```text
## 阶段交接记录

阶段：
完成日期：

本阶段结论：
- 已完成：
- 未完成：
- 有意保留：
- 已知风险：

实际修改文件：
- ...

下一阶段：
- ...

下一 AI 第一件事：
- ...

下一 AI 必须先检查：
- ...

不要重复做：
- ...

验证证据：
- GitHub commit：
- GitHub Actions：
- Artifact：
- 其他：
```

---

## 8. 绝对不能发生的事情

- 不得为了“看起来能运行”而删除现有业务。
- 不得把 Android 专用代码散落到所有页面。
- 不得用一个全局 CORS 开关冒充解决方案。
- 不得因为 Native HTTP 存在，就删除浏览器请求能力。
- 不得未经检查修改已有数据结构。
- 不得把 Cookie / Token / Authorization 等敏感数据无条件暴露给网页。
- 不得把 debug APK 当作已经完成正式发布签名体系。
- 不得把 GitHub Pages workflow 当成 Android APK workflow。
- 不得在最终验收时用本地 clone/build 代替 GitHub Actions 验证。

---

## 9. 阶段 1 已完成后的当前状态

截至 2026-10-03，Android 容器阶段已经完成，但整个 Android APK 改造远未完成。

- Capacitor 8.5.2 + Android 工程已落库。
- webDir 已确定为 dist。
- appId 已确定为 com.yuivo9999.mybox123。
- GitHub Actions 已真实执行 npm run build 与 npx cap sync android。
- 阶段 2 已完成：已建立受限 Native HTTP 通道，基于 Capacitor 8 官方 `CapacitorHttp.request()`。
- `src/runtime/webViewRuntime.js` 已暴露 `capabilities.nativeHttp` 与统一 `nativeHttpRequest()` 入口。
- `src/services/requestManager.js` 尚未接入 Native adapter，这是阶段 3 的明确任务。
- npm install 日志仍存在 3 个 moderate severity vulnerabilities；本阶段没有盲目执行 `audit fix --force`，下一阶段仍需定位依赖链。
- Android 明文 HTTP 没有全局放开；运行时 HTTP 源需真实域名后再决定最小策略。
- APK 构建工作流尚未建立。
- Android 真机/模拟器真实第三方请求尚未验证。

下一 AI 入口：03_React请求层Android适配实施.md。第一件事是核对 `nativeHttpBridge.js`、`webViewRuntime.capabilities.nativeHttp`，再逐项接入 requestManager，并确保 Browser / Android 契约统一、HLS/播放链路不被机械替换。

---

## 10. 最终完成定义

只有同时满足以下条件，才可以说“Android APK 改造完成”：

- [ ] Android 工程存在并纳入 Git。
- [ ] React 构建产物能正确进入 Android WebView。
- [ ] Android 生命周期、返回键、方向等与现有 runtime bridge 对接。
- [ ] CORS 敏感 API 请求有明确 Native HTTP 路径。
- [ ] 浏览器模式仍可正常工作。
- [ ] requestManager 与 Native 请求层正确衔接。
- [ ] Android 网络安全策略经过明确配置，而不是粗暴关闭安全。
- [ ] GitHub Actions 可以自动生成 APK。
- [ ] APK Artifact 可下载。
- [ ] APK 可安装到目标 Android 手机。
- [ ] 真实第三方请求经过验证。
- [ ] 关键业务页面经过验证。
- [ ] 最终检查没有发现遗漏或明显错误。
