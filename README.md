# iirose-plugins

IIROSE 插件开发合集。

当前准备发布：

- **I@A** (`iirose-@all`)：在聊天框输入 `[@全体成员]` 后，自动展开为当前房间全部成员的 @ 列表。

## iirose-@all

产物统一使用 `dist/bundle.js`。

发布时请使用 Tag 区分版本，例如 `v0.1.0`。

在 IIROSE 终端输入 `js` 后，粘贴下面任一链接执行即可。

### GitHub Raw

```text
https://raw.githubusercontent.com/Nobeta-Work/iirose-plugins/v0.1.0/iirose-%40all/dist/bundle.js
```

### jsDelivr CDN

```text
https://cdn.jsdelivr.net/gh/Nobeta-Work/iirose-plugins@v0.1.0/iirose-%40all/dist/bundle.js
```

如果后续发布新版本，只需要把链接中的 Tag 替换为对应版本号。

## 提交范围

- `iirose-@all/src/`：源码
- `iirose-@all/dist/bundle.js`：发布产物
- `iirose-@all/tests/`：保留本地开发使用，不再纳入后续仓库提交范围
