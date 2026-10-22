# AIR STRUM · 空气吉他

只用摄像头和双手，在浏览器里演奏吉他和弦。左手摆数字手势选和弦，右手上下挥动扫弦；没有键盘演奏或触屏演奏模式。

## 本地运行

需要 Node.js 22 或更新版本，以及带摄像头的现代浏览器。桌面 Chrome / Edge 是这一版的优先验证环境。

```sh
npm ci
npm run setup
npm run dev
```

打开终端显示的 `http://localhost:5173`，点击“开启摄像头”并允许访问。第一次点击同时启用浏览器音频。建议佩戴耳机、保持光线均匀，让双手完整入镜。

`npm run setup` 从固定地址下载 MediaPipe Hand Landmarker float16 v1 模型（约 7.8 MB），并把已锁定版本的 WASM 和识别库复制到 `public/`。这一步需要联网；运行时所有脚本、模型和 WASM 都由本地站点提供，摄像头画面不会上传。模型和生成文件没有提交到 Git，可重复运行 setup 恢复。

## 怎么弹

手心朝向镜头，左手保持手势约 110 ms。这里使用下表指定的简化指法，三指手势是**食指、中指、无名指**，不是其他地区常见的“三”。

| 左手 | 手势 | 和弦 |
| --- | --- | --- |
| 1 | 只伸食指 | C |
| 2 | 食指、中指 | G |
| 3 | 食指、中指、无名指 | Am |
| 4 | 四指伸直，拇指收起 | F |
| 5 | 五指张开 | Dm |
| 0 | 握拳 | 消音 |

右手掌心从参考横线上方扫到下方，或从下方扫到上方。横线在视频高度的 55% 处；需要跨过横线，并达到速度门槛，才触发一次扫弦。下扫依次拨低音到高音，上扫反过来，动作越快力度越大。先在横线一侧停好，再做幅度明显的动作。灵敏度越高，触发所需速度越低。

画面是镜像预览。若模型把两手功能判反，点击“交换双手”，以骨架旁的“和弦手 / 扫弦手”标签为准。左手移出画面约 450 ms 后，和弦释放并消音；切到后台会关闭摄像头，回到页面后需要重新开启。

## 算法与延迟

- MediaPipe Hand Landmarker 输出两只手各 21 个关键点，在独立 Web Worker 中运行，优先 GPU，初始化失败时退回 CPU。兼容其 WASM 加载器，使用 classic worker 加动态 ESM 导入。
- 手势分类直接计算手指关节角度和相对手掌距离，不额外训练分类模型；不依赖手指是否在画面中“朝上”。正对镜头、手指分开时效果更稳定，严重遮挡和侧掌仍可能误判。
- 和弦切换需要 110 ms 稳定手势。扫弦使用掌心纵向坐标的轻量平滑、跨线检测、速度门槛、4% 高度回差与 115 ms 冷却，避免轻微抖动连续发声。追踪间断超过 180 ms 时重置运动历史。
- 最多一个视频帧在途，目标采样上限约 30 FPS；识别耗时超过 300 ms 的旧帧不会发声，识别线程超过 5 秒无响应则释放摄像头并提示重试。
- Web Audio 使用 Karplus–Strong 拨弦合成、分数延迟音准补偿和逐弦错峰。没有外部音频下载。

界面 FPS 是实际收到的识别结果帧率；“ms 识别”从截取视频帧前计时到主线程收到结果，包含位图转换、线程通信与模型推理，**不包含摄像头曝光、手势稳定等待和扬声器延迟**。

在开发机 Edge 无头浏览器、模拟摄像头下，实际模型链路的单次检查约为 29 FPS、21 ms 往返。这只证明模型加载与视频推理能运行，不代表真人手势准确率或手机性能。真实摄像头、双手遮挡、手机浏览器与主观音色仍需设备实测。

## 验证

```sh
npm test
npm run build
```

单元测试覆盖 0–5 手势、旋转和尺度变化、非法数据、防抖、追踪丢失、上下扫、慢速动作、抖动、灵敏度和双手分配。

浏览器检查需要先启动 dev 或 preview 服务，以及安装 Playwright 的浏览器：

```sh
npx playwright install chromium
npm run test:browser
```

Windows 已安装 Edge 时可在 PowerShell 中使用：

```powershell
$env:BROWSER_CHANNEL = 'msedge'
npm run test:browser
```

`APP_URL` 可覆盖测试站点地址。检查会使用模拟摄像头运行**真实模型与 Worker**，检查帧率、停止与重开、权限拒绝提示、390px 页面宽度，以及真实 Web Audio 合成的信号和 A3 音准。截图与结果写入忽略提交的 `test-results/`。它没有验证真人手势的识别率。

## 构建与手机路线

```sh
npm run setup
npm run build
npm run preview
```

将 `dist/` 的完整内容放到 HTTPS 静态站点的根目录，包括 `models/`、`mediapipe/` 与 `vision.worker.js`。当前资源路径以 `/` 开头，若部署到 `/musician/` 等子路径，需要同时调整应用和 Worker 的资源基址。`npm run build` 前必须完成 setup。

页面已有窄屏布局、前置摄像头偏好和 `playsinline`。手机访问局域网 `http://电脑IP:5173` 通常无法使用摄像头，因为它不是安全上下文；手机试用需要 HTTPS。此版本没有打包原生 App，也尚未完成 iOS / Android 真机验证。

后续可以先部署 HTTPS 网页，在实际手机上测量 FPS、识别延迟和功耗，再决定是否封装为 Capacitor App。手势与扫弦状态机在 `src/gestures.js`，不依赖 DOM；音频在 `src/audio.js`；识别模型调用在 `public/vision.worker.js`。原生迁移可以保留同样的关键点协议及状态机，把摄像头和模型推理替换为原生 MediaPipe Tasks，把声音替换为低延迟音频引擎。并发模型只处理一个在途帧，便于控制手机发热与内存占用。

## 文件

```text
src/gestures.js          手势分类、稳定器、扫弦检测、和弦映射
src/audio.js             拨弦合成与消音
src/main.js              摄像头生命周期、界面与演奏连接
src/style.css            页面与窄屏布局
public/vision.worker.js  独立线程中的双手识别
scripts/setup-assets.mjs 固定版本模型与 WASM 准备
scripts/browser-check.mjs 浏览器链路检查
tests/gestures.test.js   纯算法回归测试
```
