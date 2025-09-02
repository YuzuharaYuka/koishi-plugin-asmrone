# koishi-plugin-asmrone

[![npm](https://img.shields.io/npm/v/koishi-plugin-asmrone?style=flat-square)](https://www.npmjs.com/package/koishi-plugin-asmrone)

利用 [asmr.one](https://asmr.one) 的 API，提供在聊天平台中搜索、查看并收听音声作品的功能。

**注意：部分内容可能不适合在所有场合使用 (NSFW)，请在合适的范围内使用本插件。**

## 功能

- **结果展示**: 支持两种模式展示搜索结果和作品详情：
    - **图片菜单**: (需 `puppeteer`) 将内容渲染为图片发送，美观且能规避平台风控。
    - **文本消息**: 以纯文本或合并转发的形式发送。
- **音轨获取**: 支持三种方式发送音轨：
    - **`card`**: 音乐卡片 (仅部分平台支持，如 OneBot)。
    - **`file`**: 逐个发送原始音频文件。
    - **`zip`**: 将多个音轨打包为 ZIP 压缩包发送，支持加密。
- **交互式操作**:
    - 列表指令后可回复【序号】选择，【f】翻页。
    - 所有交互均可回复【n/取消】随时中断。
- **权限管理**: 支持白名单和黑名单模式，可精细控制插件可用性。

## 指令说明

### `搜音声 <关键词> [页数]`

搜索音声作品。

- **关键词**: 多个标签请用 `/` 分割。
- **示例**: `搜音声 催眠/JK 2`

---

### `热门音声 [页数]`

获取当前热门作品列表。

- **示例**: `热门音声`

---

### `听音声 <RJ号> [音轨序号...] [选项]`

获取作品信息并发送音轨。

- **`RJ号`**: 支持 `RJ01234567` 或 `123456` 等格式，将自动补全。
- **`音轨序号` (可选)**: 一个或多个数字序号或范围，用空格分隔 (如 `1 3 5-8`)。
    - 若提供，则直接获取指定音轨。
    - 若省略，则返回作品详情并等待交互选择。
- **`选项` (可选)**: `card` | `file` | `zip`。
    - 指定本次发送的格式，若省略则使用配置中的默认方式。

#### **使用示例**

1.  **获取详情并等待交互**:
    ```
    听音声 RJ01234567
    ```
    > 机器人将回复作品详情，等待输入音轨序号。

2.  **直接获取指定音轨 (含范围，指定zip模式)**:
    ```
    听音声 RJ01234567 1 3 5-8 zip
    ```

3.  **在交互中指定发送方式**:
    > 使用 `听音声 RJ01234567` 后，可通过回复 `2 4-6 card` 来获取第 2、4、5、6 轨，并以音乐卡片形式发送。

## 配置项

### 基础设置

| 配置项 | 类型 | 默认值 | 说明 |
| :--- | :--- | :--- | :--- |
| `apiBaseUrl` | `string` | `https://api.asmr-200.com/api` | 音声数据 API 地址。 |
| `useForward` | `boolean` | `false` | (文本模式) 启用合并转发发送长消息。 |
| `showSearchImage` | `boolean` | `false` | (文本模式) 搜索结果中显示封面图 (有风控风险)。 |
| `useImageMenu` | `boolean` | `true` | 启用图片菜单 (需 `puppeteer`)。 |
| `showLinks` | `boolean` | `false` | 在详情中显示 asmr.one/DLsite 链接。 |
| `pageSize` | `number` | `10` | 每页结果数量 (1-40)。 |
| `interactionTimeout` | `number` | `60` | 交互操作超时时间 (秒)。 |

### 权限设置

| 配置项 | 类型 | 默认值 | 说明 |
| :--- | :--- | :--- | :--- |
| `accessMode` | `string` | `all` | 访问权限模式: `all` (所有), `whitelist` (白名单), `blacklist` (黑名单)。 |
| `whitelist` | `string[]` | `[]` | 白名单列表 (群号/频道 ID)，仅白名单模式生效。 |
| `blacklist` | `string[]` | `[]` | 黑名单列表 (群号/频道 ID)，仅黑名单模式生效。 |

### 下载与发送设置

| 配置项 | 类型 | 默认值 | 说明 |
| :--- | :--- | :--- | :--- |
| `defaultSendMode` | `string` | `file` | 默认音轨发送方式: `card`, `file`, `zip`。 |
| `cardModeNonAudioAction` | `string` | `skip` | Card模式下对非音频文件的操作: `skip` (跳过) 或 `fallbackToFile` (转为file模式发送)。 |
| `downloadTimeout` | `number` | `300` | 单文件下载超时 (秒)。 |

### 命名规则设置

| 配置项 | 类型 | 默认值 | 说明 |
| :--- | :--- | :--- | :--- |
| `prependRjCodeCard` | `boolean` | `false` | Card 标题添加 RJ 号。 |
| `prependRjCodeFile` | `boolean` | `true` | File 文件名添加 RJ 号。 |
| `prependRjCodeZip` | `boolean` | `true` | Zip 包名/文件夹添加 RJ 号。 |

### 压缩包设置

| 配置项 | 类型 | 默认值 | 说明 |
| :--- | :--- | :--- | :--- |
| `zipMode` | `string` | `single` | 多文件压缩方式: `single` (合并为一包) 或 `multiple` (每轨一包)。 |
| `usePassword` | `boolean` | `false` | Zip 是否加密。 |
| `password` | `string` | `""` | 压缩包密码 (需先启用 `usePassword`)。 |

### 调试设置

| 配置项 | 类型 | 默认值 | 说明 |
| :--- | :--- | :--- | :--- |
| `debug` | `boolean` | `false` | 开启Debug模式 (在控制台输出详细API日志)。 |

## 安装

可从 Koishi 插件市场搜索 `asmrone` 安装。

为使用核心的 **图片菜单** 功能，需要额外安装 `koishi-plugin-puppeteer` 依赖。