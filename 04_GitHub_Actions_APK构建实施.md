# 阶段 4：GitHub Actions APK 构建实施

> 上游：`03_React请求层Android适配实施.md`  
> 下游：`05_最终验收与AI交接实施.md`

## 1. 本阶段目标

实现：

```
GitHub push
  ↓
GitHub Actions
  ↓
Node dependencies
  ↓
React build
  ↓
Capacitor sync
  ↓
Gradle Android build
  ↓
APK
  ↓
GitHub Actions Artifact
```

用户最终应该能够直接从 GitHub Actions 下载 APK。

---

## 2. 当前事实

当前已有：

`.github/workflows/deploy.yml`

它主要负责：

- Node 20
- npm install
- npm run build
- GitHub Pages

它不是 Android APK workflow。

因此本阶段应新增独立 workflow，而不是粗暴破坏 Pages workflow。

---

## 3. 新 Workflow 要求

建议新增：

`.github/workflows/android.yml`

具体文件名可以调整，但必须清晰表达 Android 构建用途。

触发方式至少支持：

- push 到 main
- workflow_dispatch

---

## 4. Node / Java / Android

必须固定兼容版本，不允许“latest everywhere”。

至少明确：

- Node
- Java / JDK
- Android SDK
- Gradle / Gradle Wrapper
- Capacitor 版本

版本选择必须以实施时官方兼容矩阵为准。

---

## 5. 安装依赖

应优先使用：

```
npm ci
```

而不是：

```
npm install
```

因为仓库已经存在 `package-lock.json`。

如果 lockfile 与 package.json 不一致，必须先解决依赖一致性问题，不能在 CI 中靠 npm install 随机修正。

---

## 6. 构建步骤

逻辑必须保持：

1. checkout
2. setup Node
3. npm ci
4. npm run build
5. Capacitor sync
6. setup Java / Android
7. Gradle assemble
8. 上传 APK Artifact

具体命令以生成的 Android 工程为准。

---

## 7. APK 类型

需要明确：

### Debug APK

优点：

- 可以直接构建；
- 不需要正式签名；
- 适合个人测试安装。

### Release APK

如果目标是长期分发：

- 必须配置签名；
- keystore 不得提交仓库；
- secrets 不得写入 YAML；
- 构建产物必须明确版本。

本项目第一阶段可以先完成 debug APK，再决定 release 签名。

**不能把 debug APK 描述为正式发布 APK。**

---

## 8. Artifact

必须上传明确的 APK 文件。

Artifact 名称建议包含：

- app
- android
- apk
- build type

例如：

```
mybox-android-debug-apk
```

用户应该可以：

GitHub → Actions → 对应 Run → Artifacts → 下载 ZIP → 解压 → APK

---

## 9. 不要破坏 Pages

Android workflow 与 Pages workflow 应独立。

不得：

- 删除 deploy.yml
- 修改 Pages 部署为 Android
- 让 Android 构建依赖 Pages 部署成功

---

## 10. CI 安全

不得：

- 在日志输出 secrets；
- 把 keystore 提交 Git；
- 使用不受信任脚本执行 secrets；
- 使用不固定版本的第三方 Action；
- 给予 workflow 不必要的 write 权限。

---

## 11. CI 完成定义

- [x] android workflow 存在。
- [x] workflow 可以手动触发。
- [x] main push 可以触发。
- [x] Node 版本明确。
- [x] Java 版本明确。
- [x] Android SDK 版本明确。
- [x] npm ci 成功。
- [x] React build 成功。
- [x] Capacitor sync 成功。
- [x] Gradle APK build 成功。
- [x] APK Artifact 成功上传。
- [x] Pages workflow 未被破坏。
- [x] 日志没有泄露 secrets。

---

## 12. 阶段交接记录

- 阶段：阶段 4：GitHub Actions APK 构建实施
- 完成日期：2026-10-03
- Commit：0bd4e4862d61e79cf1cf76e0bbb37ca29831b525（Android SDK manager 路径修复并经远程 Run #4 验证）
- Workflow：.github/workflows/build-apk.yml
- Node：22
- Java：Temurin 21
- Android SDK：compile/target SDK 36；CI 显式安装 platform android-36、build-tools 36.0.0、platform-tools
- Gradle：8.14.3（仓库 Gradle Wrapper）
- Capacitor：8.5.2
- APK 类型：Debug APK
- APK 输出路径：android/app/build/outputs/apk/debug/app-debug.apk
- Artifact 名称：mybox-android-debug-apk
- 最近一次成功 Run：Run #4（ID 37088502727）
- Artifact：mybox-android-debug-apk；4,127,838 bytes；SHA-256 digest：58f10fc61c4c2757fc6aaf26c672431a4ca90bebe11e64931485b4acc4744eb7；有效期至 2026-10-17 02:06:39 UTC
- 未完成：本阶段 CI 构建与 Artifact 验证已完成；Release 签名仍未配置
- 风险：Release 签名未配置；本阶段按文档先完成 Debug APK
- 下一阶段：05_最终验收与AI交接实施.md
- 下一 AI 第一件事：先检查本文件第 13 节与 GitHub Actions 最近一次 Run，再继续阶段 5
- 下一 AI 必须先检查：Android workflow、Pages workflow、Artifact、Release 签名状态
- 不要重复做：不要重复创建 Android workflow；不要把 Debug APK 描述为正式发布 APK

---

## 13. 阶段 4 完成记录（2026-10-03）

- 阶段：阶段 4：GitHub Actions APK 构建实施
- 完成日期：2026-10-03
- Commit：0bd4e4862d61e79cf1cf76e0bbb37ca29831b525（Android SDK manager 路径修复）
- Workflow：.github/workflows/build-apk.yml
- Node：22
- Java：Temurin 21
- Android SDK：compile/target SDK 36；CI 显式安装 platform android-36、build-tools 36.0.0、platform-tools
- Gradle：8.14.3（仓库 Gradle Wrapper）
- Capacitor：8.5.2
- APK 类型：Debug APK
- APK 输出路径：android/app/build/outputs/apk/debug/app-debug.apk
- Artifact 名称：mybox-android-debug-apk
- 最近一次成功 Run：Run #4（ID 37088502727）
- Artifact：mybox-android-debug-apk；4,127,838 bytes；SHA-256 digest：58f10fc61c4c2757fc6aaf26c672431a4ca90bebe11e64931485b4acc4744eb7；有效期至 2026-10-17 02:06:39 UTC
- 未完成：本阶段 CI 构建与 Artifact 验证已完成；Release 签名仍未配置
- 风险：Release 签名未配置；本阶段按文档先完成 Debug APK
- 下一阶段：05_最终验收与AI交接实施.md
- 下一 AI 第一件事：先检查本文件第 13 节与 GitHub Actions 最近一次 Run，再继续阶段 5
- 下一 AI 必须先检查：Android workflow、Pages workflow、Artifact、Release 签名状态
- 不要重复做：不要重复创建 Android workflow；不要把 Debug APK 描述为正式发布 APK
