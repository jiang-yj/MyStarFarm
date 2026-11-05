# 平台适配设计

## 数据流

视图事件 → `game/engine.ts` 纯规则 → 更新 SaveData → `SaveRepository` → `StorageAdapter`。

规则层的计时方法显式接收 `now: number`，每日委托显式接收平台生成的本地日期键。离线计算 `calculateOfflineRewards` 克隆输入再计算，返回新存档与报告；没有 DOM、网络、音频或存储副作用。`validateQuest(itemPool, playerState, template)` 是委托生成前的纯校验入口。

`PlatformAdapter` 集中提供时钟、本地日期键、震动、导入/导出、存储和音频。当前 `web.ts` 使用 Date、localStorage、Web Audio、文件选择器和下载链接。`SaveRepository` 管理多份存档及修订号，同一来源多页更新时拒绝旧版本覆盖；浏览器 storage 事件同时提醒当前页重新载入。

## 微信小程序（预留，未实现）

1. 新增小程序 StorageAdapter，映射 `wx.getStorageSync` / `wx.setStorageSync`。
2. 新增 AudioAdapter，使用 `wx.createInnerAudioContext` 加载本地音频；当前合成旋律不能直接依赖小程序 Web Audio，需渲染为音频文件或改写实现。
3. 将 `onHide/onShow` 连接同一离线结算入口；文件备份能力映射到小程序文件/分享能力。
4. 复用规则、数值与 SaveData，重写 WXML/WXSS 视图并绑定操作；不把 `wx` 调用放入 `game/`。
5. 现有浏览器存档不会自动迁移，需用户显式导入或制作迁移工具。

## macOS（预留，未实现）

用 Swift/AppKit + WKWebView 本地承载 H5 静态产物，第一步先验证桌面窗口层级、鼠标交互、桌面图标、Spaces、多显示器和休眠恢复，再做桌面模式。原生壳负责窗口、快捷键、开机启动等；游戏只需通过桥接平台实现文件备份、存储和生命周期。

原生壳可以先使用 WebView 独立存储，也可通过统一适配器落盘，但不能假设与 Safari/Chrome 自动共用存档。桌面壁纸模式另做横屏地图和侧边操作面板；当前电脑浏览器版是侧栏 + 竖屏游戏画面，不等于 macOS 壁纸已经实现。

## 时间及产出语义

- 作物播种时记录 readyAt；浇水只对未浇水且尚未成熟的作物生效一次。
- 动物一份饲料对应一个生产周期，产出未收取时不能重复喂食。好感度在收取时确定品质。
- 鱼苗放入后需要喂食，一个周期结束后收网移除该鱼并转成背包物品。
- 离线区间仅推进 `min(elapsed, 4h)`，超出部分平移未完成的 readyAt，保留剩余时间。已完成产出只转移一次到 offline；claim 后 offline 清空。
- 暂停/休眠后不依赖 setInterval 累加进度，返回时读取时间戳。1Hz UI 定时器仅更新显示；只有垂钓指针使用轻量 requestAnimationFrame。
- 每日委托是本地日期键驱动；未接取无倒计时，接取后明确截止时间。每个自然日只补充一次，避免刷新无限刷奖章。
- 未来新增 SaveData 版本时应显式增加迁移函数，当前只接受 version=1。
