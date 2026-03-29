# iirose-avatar-adapter

IIROSE 头像适配插件（IAA），用于让外链头像支持更直观的图形化裁切与提交。

本项目面向普通用户的使用目标：

- 开箱即用，不需要自建图床或中转服务
- 用拖拽和缩放完成头像裁切，不需要手动算参数
- 直接走 IIROSE 资料头像提交流程

---

## 一键导入链接

在 IIROSE 终端中执行下面任意一个链接即可。

### 方案 1：GitHub Raw（推荐）

```text
https://raw.githubusercontent.com/Nobeta-Work/iirose-avatar-adapter/main/dist/IAA.js
```

### 方案 2：jsDelivr CDN（访问可能更快）

```text
https://cdn.jsdelivr.net/gh/Nobeta-Work/iirose-avatar-adapter@main/dist/IAA.js
```

如果 CDN 没更新，可以先刷新缓存：

```text
https://purge.jsdelivr.net/gh/Nobeta-Work/iirose-avatar-adapter@main/dist/IAA.js
```

---

## 使用步骤（普通用户）

1. 打开 IIROSE 并登录账号。
2. 进入 工具 -> 终端。
3. 输入 `js` 并回车。
4. 粘贴上面的导入链接并回车执行。
5. 打开个人资料头像编辑面板。
6. 点击 IAA 图形裁剪入口。
7. 在弹窗中拖拽头像位置、调整缩放。
8. 点击“生成 URL”，再选择“应用到头像”或“应用并提交”。

---

## 功能特性

- 图形化裁切：拖拽定位 + 滚轮缩放 + 滑块缩放
- 第三方即开即用：基于 wsrv.nl（images.weserv.nl）生成变换头像链接
- 提交流程兼容：写入头像字段后可直接调用站内提交
- 轻量接入：单文件脚本，直接远程导入

---

## 常见问题

### 1) 为什么我看不到 IAA 入口？

- 先确认脚本已成功导入（终端没有报错）
- 刷新页面后重新打开头像编辑面板
- 如果 IIROSE 页面结构更新，插件可能需要适配新版本

### 2) 点击提交后没有变化？

- 检查原始图片链接是否可访问
- 先点击“生成 URL”，确认输出链接有效
- 再尝试“应用到头像”后使用 IIROSE 原生保存按钮提交

### 3) 生成链接为什么是 wsrv.nl？

IAA 使用第三方图像处理服务来生成裁切后的 1:1 头像链接，避免用户自己搭建中转服务。

---

## 版本

当前版本：v0.1.0

---

## 开发构建（可选）

如果你需要本地修改后重打包：

```bash
npm install
npm run build
```

构建产物：

- `dist/IAA.js`