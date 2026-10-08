# 阶段 1：Android 容器与 Capacitor 实施

> 上游：`00_安卓APP改造总控与AI交接.md`  
> 下游：`02_原生网络与CORS解决方案实施.md`

## 1. 本阶段唯一目标

把现有 React/Vite 项目增加 Android 原生容器，使项目第一次具备：

- Android 工程；
- WebView 运行环境；
- Capacitor 配置；
- 可同步 React 构建产物；
- 与现有 `src/runtime/webViewRuntime.js` 对接的基础。

**本阶段不负责最终解决 CORS。**

---

## 2. 当前前置事实

目前：

- React/Vite 已存在；
- `npm run build` 已存在；
- `src/runtime/webViewRuntime.js` 已存在；
- 尚无 Android 工程；
- 尚无 Capacitor Android 平台；
- 尚无 Gradle Android App 工程。

Capacitor 官方当前工作流包含：

```
npm install @capacitor/android
npx cap add android
npm run build
npx cap sync
```

具体版本必须以实施时的当前兼容版本和项目 Node/Vite 约束为准，不得盲目复制旧版本配置。

---

## 3. 必须完成

### 3.1 添加 Capacitor 依赖

根据当前项目依赖管理方式修改：

- `package.json`
- `package-lock.json`

至少需要 Android 平台依赖及 Capacitor 核心依赖。

### 3.2 创建 Capacitor 配置

建立项目所需的 Capacitor 配置，明确：

- appId
- appName
- webDir
- Android 项目路径
- 与 Vite dist 的关系

不能让 Android 工程指向错误的前端目录。

### 3.3 建立 Android 工程

生成并提交：

- `android/`
- Gradle 相关文件
- Android Manifest
- MainActivity
- Capacitor Android 所需文件

必须确认生成的 Android 工程不是临时文件。

### 3.4 对接现有 WebView runtime

不要重新设计另一套 JS bridge。

检查 `src/runtime/webViewRuntime.js`：

- Android host 是否能提供其期待的 bridge；
- Back 键入口是否可以对接；
- lifecycle 是否可以对接；
- fullscreen / orientation 是否有合理实现；
- bridge 版本是否需要保留为 1。

如果 Capacitor 默认机制与现有 bridge 不完全一致，应建立兼容层，而不是直接删除旧 bridge。

---

## 4. Android 网络安全初步检查

本阶段必须检查项目实际第三方 URL 是否存在：

- `http://`
- `https://`
- 自签名证书
- 非标准 TLS
- IP 地址直连
- 重定向
- Cookie
- 自定义 Header

不要直接使用“允许所有明文流量”作为万能解决办法。

如果确实存在 HTTP 源，需要在后续阶段单独决定 Network Security Config 的最小放行范围。

---

## 5. 本阶段不要做

- 不要在本阶段把所有 fetch 改成 Native HTTP。
- 不要删除 requestManager。
- 不要删除浏览器模式。
- 不要把 Android 原生代码写进 React 页面。
- 不要为了 Android 而重写播放器。
- 不要声称“已经解决 CORS”。

---

## 6. 完成检查

必须确认：

- [ ] package.json 已增加所需依赖。
- [ ] package-lock.json 与 package.json 一致。
- [ ] Capacitor 配置存在。
- [ ] android/ 工程存在。
- [ ] Android 工程文件完整。
- [ ] webDir 指向正确构建目录。
- [ ] 现有 React 入口没有被破坏。
- [ ] webViewRuntime 仍然存在。
- [ ] 未删除浏览器能力。
- [ ] 没有把 CORS 解决方案提前伪装成完成。

---

## 7. 阶段交接记录

### 已完成交接（2026-10-03）

- 阶段结论：阶段 1 已完成，下一阶段为 02_原生网络与CORS解决方案实施.md。
- Capacitor：8.5.2；Android Gradle Plugin：8.13.0；Gradle Wrapper：8.14.3；compileSdk/targetSdk：36；minSdk：24；Java source/target：21。
- Capacitor 配置：webDir=dist；appId=com.yuivo9999.mybox123；appName=TVBox React。
- package.json 与 package-lock.json 的 root dependencies、devDependencies、engines 已逐项核对一致。
- GitHub Actions 已真实执行 npm install、npm run build、npx cap sync android，run 37068061377 成功。
- Android 关键文件已落库：android/settings.gradle、android/build.gradle、android/app/build.gradle、android/capacitor.settings.gradle、android/app/capacitor.build.gradle、MainActivity.java、Manifest 等。
- src/runtime/webViewRuntime.js 保留；尚未声称 Capacitor 自动实现 TVBoxAndroidBridge。具体 bridge 兼容层留给后续阶段。
- npm install 日志报告 3 个 moderate severity vulnerabilities，并报告 uuid@7.0.3 deprecated；本阶段未执行 audit fix --force，下一阶段必须先定位具体依赖链。
- 固定 http/https URL 的 GitHub 代码搜索未返回结果；这不能证明运行时 source 配置没有 HTTP/HTTPS，下一阶段必须继续审计动态源配置及 service/parser/playback/HLS 入口。
- Native HTTP/CORS、requestManager Android 适配、APK 专用 Actions、真机验收均未完成。
- 一次性 android-scaffold-once.yml 已删除；deploy.yml 已恢复 contents: read，保留 Node 22。

下一 AI 第一件事：先读取总控文档、本文件、02_原生网络与CORS解决方案实施.md，然后定位 3 个 moderate vulnerabilities 的具体依赖链，再开始 Native HTTP 设计。

不要重复做：不要再次 npx cap add android，不要再次创建一次性 scaffold workflow，不要把“Android 工程存在”当成“CORS 已解决”或“APK 已完成”。

验证证据：Android scaffold/sync commit cffd5ed3afa90611b88c6d75c8f597c0c23ced2b；Actions run 37068061377；cleanup commit 94aa2c62423abd477cee911d602e4a36ecb680b0。

实施 AI 完成后必须填写：

- 阶段：
- 完成日期：
- Commit：
- 新增文件：
- 修改文件：
- Android 工程实际技术版本：
- webDir：
- appId：
- bridge 对接情况：
- HTTP/HTTPS 初步发现：
- 未完成：
- 风险：
- 下一阶段：
- 下一 AI 第一件事：
- 下一 AI 必须先检查：
- 不要重复做：
