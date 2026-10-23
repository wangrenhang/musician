import './style.css';
import { GestureLatch, StrumDetector, classifyGesture, assignHands, palmCenter } from './gestures.js';
import { GuitarAudio } from './audio.js';
import { CHORD_CATALOG, ROOTS, QUALITIES, GESTURES, mappedChord } from './chords.js';
import { loadPresets, savePresets, validatePresets } from './presets.js';

const loaded = loadPresets({ getItem: key => localStorage.getItem(key) });
let presetData = loaded.data;
let editingId = null;
const activePreset = () => presetData.presets.find(p => p.id === presetData.activeId);

const icons = {
  logo: '<svg viewBox="0 0 32 32" fill="none"><path d="M5 10h22M5 16h22M5 22h22M21 5 11 27" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"/></svg>',
  camera: '<svg viewBox="0 0 24 24" fill="none"><rect x="3" y="6" width="13" height="12" rx="3"/><path d="m16 10 5-3v10l-5-3"/></svg>',
  arrow: '<svg viewBox="0 0 24 24" fill="none"><path d="M12 4v16m-6-6 6 6 6-6"/></svg>',
  volume: '<svg viewBox="0 0 24 24" fill="none"><path d="m11 5-6 4H2v6h3l6 4V5Zm4 3c3 2 3 6 0 8m3-11c5 4 5 10 0 14"/></svg>',
  check: '<svg viewBox="0 0 24 24" fill="none"><path d="m5 12 4 4L19 6"/></svg>',
};

function diagram(chord) {
  const stopped = chord.frets.filter(f => f > 0);
  const start = stopped.length && Math.max(...stopped) > 4 ? Math.min(...stopped) : 1;
  const strings = chord.frets.map((f, i) => `<line x1="${18 + i * 12}" y1="24" x2="${18 + i * 12}" y2="84"/>${f > 0 ? `<circle class="fret-dot" cx="${18 + i * 12}" cy="${24 + (f - start + 0.5) * 15}" r="4.2"/>` : `<text x="${18 + i * 12}" y="16">${f < 0 ? '×' : '○'}</text>`}`).join('');
  return `<svg class="chord-diagram" viewBox="0 0 100 94" role="img" aria-label="${chord.name} 和弦配音，第 ${start} 品起">${start > 1 ? `<text x="8" y="35">${start}</text>` : ''}${[0, 1, 2, 3, 4].map(f => `<line x1="18" x2="78" y1="${24 + f * 15}" y2="${24 + f * 15}" class="${f === 0 && start === 1 ? 'nut' : ''}"/>`).join('')}${strings}</svg>`;
}
function handIcon(mask) {
  return `<svg class="gesture-icon" viewBox="0 0 68 68" aria-hidden="true"><path d="M22 40v15q0 8 13 8h9q10 0 10-10V40" fill="none"/>${[0,1,2,3,4].map(i => {
    const on = Boolean(mask & (1 << i));
    return i === 0 ? `<path d="${on ? 'M25 48 8 30q-5-6 0-9t10 5l9 12' : 'M25 48 30 39q4-5 8-1t0 8l-6 5'}" class="${on ? 'extended' : ''}" fill="none"/>` : `<path d="M${20+i*7} 42v${on ? -(30 + (i === 2 ? 5 : i === 4 ? -5 : 0)) : -6}q3-7 6 0v${on ? 30 + (i === 2 ? 5 : i === 4 ? -5 : 0) : 6}" class="${on ? 'extended' : ''}" fill="none"/>`;
  }).join('')}</svg>`;
}
function chordCards() {
  return GESTURES.map(g => {
    const c = mappedChord(activePreset().mapping, g.number);
    return `<article class="chord-card" data-chord="${g.number}" aria-label="${c.name} 和弦，${g.label}"><div class="card-top"><span class="gesture-number">${g.number}<small>号手势</small></span><span class="card-selected">${icons.check}</span></div><div class="card-body">${handIcon(g.mask)}<div><strong>${c.name}</strong><p>${QUALITIES.find(q => q.id === c.quality).label}</p></div>${diagram(c)}</div><div class="card-bottom"><span>${g.label}</span></div></article>`;
  }).join('');
}

document.querySelector('#app').innerHTML = `
  <header class="site-header">
    <a href="/" class="brand" aria-label="Air Strum 首页"><span class="brand-mark">${icons.logo}</span><span>AIR<span class="brand-light">STRUM</span><small>空气吉他</small></span></a>
    <div class="header-right"><span class="local-badge"><i></i> 画面只在本机处理</span><span class="version">PLAY IN YOUR ELEMENT</span></div>
  </header>
  <main>
    <section class="intro">
      <div><div class="eyebrow"><span></span> NO GUITAR. JUST YOU.</div><h1>把空气，<span>弹成旋律。</span></h1><p>左手选和弦，右手轻轻一扫。你的双手，就是一把吉他。</p></div>
      <button id="help-toggle" class="text-button" aria-expanded="false" aria-controls="help-panel">初次上手 <span>↗</span></button>
    </section>
    <section id="help-panel" class="help-panel" hidden>
      <div><b>01 · 左手选和弦</b><p>像抱着吉他一样，手心朝自己、手背朝镜头。用下方 12 种手势选择和弦，握拳消音。数字是手势编号，不是伸出的手指数。</p></div>
      <div><b>02 · 右手来扫弦</b><p>右手也保持手心朝自己，可自然松握。在画面任意位置上下、左右或斜向摆动，每次有效挥动扫一次，反向摆动可连续扫弦。</p></div>
      <div><b>03 · 找到舒服的位置</b><p>在“歌曲预设”中配置每个手势的和弦，演奏前切换预设。双手完整入镜；若两手功能相反，点“交换双手”。</p></div>
    </section>
    <div class="workspace">
      <section class="performance-panel" aria-label="演奏区">
        <div class="panel-top"><div class="section-name"><span class="live-dot"></span> LIVE STUDIO <span class="tag" id="mode-tag">准备就绪</span></div><button id="swap-hands" class="quiet-button" aria-pressed="false">⇄ 交换双手</button></div>
        <div class="stage" id="stage">
          <video id="camera-video" autoplay muted playsinline hidden></video>
          <canvas id="landmarks" hidden aria-label="双手追踪画面"></canvas>
          <div class="stage-grid"></div>
          <div class="stage-corner top-left"></div><div class="stage-corner top-right"></div><div class="stage-corner bottom-left"></div><div class="stage-corner bottom-right"></div>
          <div class="stage-label left"><span>01</span> <b>左手</b> / 和弦</div><div class="stage-label right"><span>02</span> <b>右手</b> / 扫弦</div>
          <div class="string-field" aria-hidden="true">${Array.from({ length: 6 }, (_, i) => `<i style="--string:${i}"></i>`).join('')}</div>
          <div id="welcome" class="welcome">
            <div class="air-symbol">${icons.logo}<span class="orbit one"></span><span class="orbit two"></span></div>
            <h2>你的舞台，随时开场</h2><p>打开摄像头，让双手进入画面</p>
            <button id="start-camera" class="primary-button">${icons.camera}<span>开启摄像头</span><span class="button-arrow">↗</span></button>
            <span class="camera-tip">手心朝自己 · 手背朝镜头 · 双手完整入镜</span>
          </div>
          <div class="stage-bottom"><span id="stage-status">${icons.check} 无需注册 · 无需上传画面</span><button id="stop-camera" class="stage-stop" hidden>结束演奏</button></div>
          <div id="strum-flash" class="strum-flash" aria-hidden="true"></div>
        </div>
        <div class="status-bar"><div><span class="status-light" id="left-light"></span><span id="left-status">等待左手</span></div><div><span class="status-light" id="right-light"></span><span id="right-status">等待右手</span></div><div class="performance-metrics"><span id="fps">— FPS</span><span class="metric-divider"></span><span id="latency">— ms 识别</span></div></div>
        <div id="notice" class="notice" role="status" hidden></div>
        <div class="play-controls"><div class="volume-control"><label for="volume">${icons.volume}<span>音量</span></label><input id="volume" type="range" min="0" max="100" value="70" aria-label="音量"/><output id="volume-value" for="volume">70%</output></div><span class="play-hint">↑ 上扫 <span>·</span> ↓ 下扫 <span>·</span> 握拳消音</span></div>
      </section>
      <aside class="session-panel">
        <div class="section-name">YOUR SOUND <span class="tiny-lines">▥</span></div>
        <div class="current-chord"><div class="small-label">当前和弦 <span id="chord-source">等待选择</span></div><div class="chord-title"><strong id="current-chord">—</strong><span id="chord-quality">选一个，开始弹奏</span></div><div class="sound-bars" aria-hidden="true">${Array.from({ length: 27 }, (_, i) => `<i style="--bar:${i};--height:${10 + Math.sin(i * 1.7) ** 2 * 29}px"></i>`).join('')}</div><div class="current-bottom"><span id="direction-label">ACOUSTIC GUITAR</span><span id="strum-count">0 次扫弦</span></div></div>
        <div class="sensitivity-setting"><div><label for="sensitivity">扫弦灵敏度</label><output for="sensitivity" id="sensitivity-value">55</output></div><input id="sensitivity" type="range" min="10" max="90" value="55"/><p>调高后，小幅度、轻一点的扫弦也能发声</p></div>
        <div class="mini-guide"><span class="guide-hand">✦</span><div><b>一个手势，一种心情</b><p>左手稳住约 0.1 秒切换和弦<br/>握拳消音，让音乐也有留白</p></div></div>
        <div class="session-footnote"><span class="local-dot"></span> 木吉他合成音色 · 双向扫弦</div>
      </aside>
    </div>
    <section class="preset-panel" aria-label="歌曲预设">
      <div class="preset-heading"><label for="preset-select">歌曲预设</label><span>${CHORD_CATALOG.length} 个和弦 · 12 种演奏手势 + 握拳消音</span></div>
      <div class="preset-toolbar"><select id="preset-select" aria-label="切换歌曲预设"></select><button id="edit-preset">编辑映射</button><button id="new-preset">另存为新曲</button><button id="delete-preset">删除预设</button><button id="export-presets">导出备份</button><label class="import-label" for="import-presets">导入预设<input id="import-presets" type="file" accept=".json,application/json" hidden/></label></div>
      <p id="preset-message" role="status">演奏仅用摄像头。预设在本机保存，可为不同曲子重复使用同一种手势。</p>
    </section>
    <section class="chord-library" aria-labelledby="chord-library-title"><div class="library-header"><h2 id="chord-library-title">你的手势，你的和弦。<span>CHORD PALETTE</span></h2><span>手心朝自己 <span class="hide-mobile">· 手背朝镜头，自然演奏</span></span></div><div class="chord-cards">${chordCards()}</div></section>
    <dialog id="preset-editor" aria-labelledby="editor-title"><form id="preset-form"><div class="editor-header"><h2 id="editor-title">编辑歌曲映射</h2><button type="button" id="close-editor" aria-label="关闭编辑">×</button></div><label class="preset-name-label" for="preset-name">歌曲 / 预设名称</label><input id="preset-name" maxlength="60" required/><p class="editor-hint">每个手势选择根音和类型。C# = D♭，D# = E♭，F# = G♭，G# = A♭，A# = B♭。数字为手势编号。</p><div id="mapping-rows"></div><p id="editor-error" role="alert"></p><div class="editor-actions"><button type="button" id="cancel-editor">取消</button><button type="submit" class="primary-button">保存映射</button></div></form></dialog>
    <footer><span>不必拥有一把吉他，也能拥有一段旋律。</span><span>AIR STRUM <span class="footer-star">✳</span> MADE FOR THE MOMENT</span></footer>
  </main>
`;

const $ = selector => document.querySelector(selector);
const video = $('#camera-video'), canvas = $('#landmarks'), ctx = canvas.getContext('2d');
const audio = new GuitarAudio(), latch = new GestureLatch(), strum = new StrumDetector();
const state = { mode: 'idle', chord: null, swapped: false, worker: null, stream: null, busy: false, receivedFrame: false, epoch: 0, count: 0, lastVideoTime: -1, sentAt: 0, fpsAt: 0, frames: 0, raf: 0, initReject: null, initTimer: null, audioPromise: null };

function notice(message, error = false) {
  const el = $('#notice'); el.textContent = message; el.hidden = !message; el.classList.toggle('error', error);
}
async function prepareAudio() {
  if (!state.audioPromise) state.audioPromise = audio.unlock().then(() => audio.warmup(GESTURES.map(g => mappedChord(activePreset().mapping, g.number)))).finally(() => { state.audioPromise = null; });
  await state.audioPromise;
}
function selectChord(number, source = '左手手势') {
  const chord = mappedChord(activePreset().mapping, number);
  const changed = state.chord?.id !== chord?.id;
  state.chord = chord;
  $('#current-chord').textContent = chord?.name ?? (number === 0 ? '休止' : '—');
  $('#chord-quality').textContent = chord?.label ?? (number === 0 ? '握拳消音' : '等待左手选择和弦');
  $('#chord-source').textContent = chord ? source : '未选和弦';
  document.querySelectorAll('.chord-card').forEach(el => {
    const selected = Number(el.dataset.chord) === number;
    el.classList.toggle('selected', selected); el.setAttribute('aria-label', `${mappedChord(activePreset().mapping, el.dataset.chord).name} 和弦，手势 ${el.dataset.chord}${selected ? '，当前选中' : ''}`);
  });
  if (!chord && changed) audio.mute();
}
function showHit(direction) {
  state.count++; $('#strum-count').textContent = `${state.count} 次扫弦`;
  $('#direction-label').textContent = direction === 'down' ? '↓ DOWNSTROKE · 下扫' : '↑ UPSTROKE · 上扫';
  $('#stage').classList.remove('hit-down', 'hit-up');
  void $('#stage').offsetWidth;
  $('#stage').classList.add(direction === 'down' ? 'hit-down' : 'hit-up');
  $('.sound-bars').classList.remove('playing'); void $('.sound-bars').offsetWidth; $('.sound-bars').classList.add('playing');
}
function play(direction, strength = 0.75) {
  if (audio.strum(state.chord, direction, strength)) showHit(direction);
}
function handStatus(role, active, text) {
  $(`#${role}-light`).classList.toggle('active', active); $(`#${role}-status`).textContent = text;
}
function stopCamera() {
  state.epoch++; cancelAnimationFrame(state.raf);
  state.initReject?.(new DOMException('Cancelled', 'AbortError')); state.initReject = null;
  clearTimeout(state.initTimer); state.initTimer = null;
  state.worker?.terminate(); state.worker = null;
  state.stream?.getTracks().forEach(track => track.stop()); state.stream = null;
  video.srcObject = null; video.hidden = true; canvas.hidden = true;
  state.mode = 'idle'; state.busy = false; state.receivedFrame = false; state.lastVideoTime = -1;
  latch.reset(); strum.reset(); audio.mute(); selectChord(null);
  $('#welcome').hidden = false;
  $('#stop-camera').hidden = true; $('#start-camera').disabled = false;
  $('#start-camera span').textContent = '开启摄像头'; $('#mode-tag').textContent = '准备就绪';
  $('#stage-status').textContent = '✓ 无需注册 · 无需上传画面';
  $('#fps').textContent = '— FPS'; $('#latency').textContent = '— ms 识别';
  handStatus('left', false, '等待左手'); handStatus('right', false, '等待右手');
}

async function startCamera() {
  if (state.mode === 'loading' || state.mode === 'camera') return;
  notice('');
  if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
    notice('摄像头需要安全连接。请在本机用 localhost 打开；手机访问需要 HTTPS。请使用支持摄像头的浏览器打开。', true); return;
  }
  const epoch = ++state.epoch; state.mode = 'loading';
  $('#start-camera').disabled = true; $('#start-camera span').textContent = '正在准备…';
  $('#mode-tag').textContent = '正在连接'; $('#stop-camera').hidden = false;
  $('#stage-status').textContent = '请允许摄像头权限，首次需下载识别模型，请稍候';
  try {
    await prepareAudio(); if (epoch !== state.epoch) return;
    // Some camera backends release asynchronously after track.stop(). Briefly
    // retry only NotReadableError; permission denials must never loop.
    let stream;
    for (let attempt = 0; attempt < 3; attempt++) {
      if (epoch !== state.epoch) return;
      try {
        stream = await navigator.mediaDevices.getUserMedia({ audio: false, video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 400 }, frameRate: { ideal: 60, max: 60 } } });
        break;
      } catch (error) {
        if (error.name !== 'NotReadableError' || attempt === 2) throw error;
        await new Promise(resolve => setTimeout(resolve, attempt === 0 ? 250 : 750));
      }
    }
    if (epoch !== state.epoch) { stream.getTracks().forEach(t => t.stop()); return; }
    state.stream = stream; video.srcObject = stream;
    await video.play(); if (epoch !== state.epoch) return;
    canvas.width = video.videoWidth; canvas.height = video.videoHeight;
    $('#stage').style.setProperty('--video-ratio', `${video.videoWidth} / ${video.videoHeight}`);
    const worker = new Worker('/vision.worker.js');
    state.worker = worker;
    await new Promise((resolve, reject) => {
      state.initReject = reject;
      // A public deployment must download the WASM runtime and model before
      // initialization; slower connections need longer than local development.
      state.initTimer = setTimeout(() => reject(new Error('模型加载超时，请检查网络后重新开启摄像头。')), 120_000);
      worker.onerror = event => reject(new Error(event.message || '识别线程未能启动'));
      worker.onmessage = ({ data }) => {
        if (data.type === 'ready') { clearTimeout(state.initTimer); state.initReject = null; resolve(data); }
        if (data.type === 'error') reject(new Error(data.message));
      };
      worker.postMessage({ type: 'init', wasmRoot: new URL('/mediapipe/wasm', location.href).href, model: new URL('/models/hand_landmarker.task', location.href).href });
    });
    if (epoch !== state.epoch) return;
    worker.onmessage = ({ data }) => {
      if (epoch !== state.epoch) return;
      state.busy = false;
      if (data.type === 'error') { stopCamera(); notice(`识别暂停：${data.message}。请重新开启摄像头。`, true); return; }
      if (data.type === 'result') { state.receivedFrame = true; processFrame(data); }
    };
    worker.onerror = () => { if (epoch === state.epoch) { stopCamera(); notice('识别线程意外停止，请重新开启摄像头。', true); } };
    state.mode = 'camera'; state.fpsAt = performance.now(); state.frames = 0;
    $('#welcome').hidden = true; video.hidden = false; canvas.hidden = false;
    $('#mode-tag').textContent = '手势模式'; $('#stage-status').textContent = '手心朝自己 · 左手选和弦 · 右手自由摆动扫弦';
    stream.getVideoTracks()[0].addEventListener('ended', () => { if (epoch === state.epoch) { stopCamera(); notice('摄像头连接已结束，可以重新开启。'); } });
    captureFrame();
  } catch (error) {
    if (epoch !== state.epoch) return;
    stopCamera();
    const messages = {
      NotAllowedError: '摄像头权限未开启。请点击地址栏的摄像头图标允许访问，再重试；',
      NotFoundError: '没有找到摄像头。请接入摄像头后重试。',
      NotReadableError: '摄像头可能正被其他程序占用，请关闭占用它的程序后重试。',
    };
    notice(messages[error.name] ?? `暂时无法开启：${error.message}。请确认已运行 npm run setup，再重试。`, true);
  }
}

function captureFrame() {
  if (state.mode !== 'camera') return;
  state.raf = requestAnimationFrame(captureFrame);
  const now = performance.now();
  // A cold GPU can take several seconds to compile its first inference shaders.
  const frameTimeout = state.receivedFrame ? 5000 : 15000;
  if (state.busy && now - state.sentAt > frameTimeout) { stopCamera(); notice('识别响应超时，摄像头已停止。请重新开启。', true); return; }
  if (state.busy || video.readyState < 2 || video.currentTime === state.lastVideoTime) return;
  state.busy = true; state.lastVideoTime = video.currentTime; state.sentAt = now;
  const epoch = state.epoch;
  createImageBitmap(video).then(bitmap => {
    if (epoch !== state.epoch || !state.worker) { bitmap.close(); return; }
    state.worker.postMessage({ type: 'frame', bitmap, timestamp: now }, [bitmap]);
  }).catch(() => { if (epoch === state.epoch) { stopCamera(); notice('浏览器无法读取视频帧，请更新浏览器后重试。', true); } });
}

const CONNECTIONS = [[0,1],[1,2],[2,3],[3,4],[0,5],[5,6],[6,7],[7,8],[5,9],[9,10],[10,11],[11,12],[9,13],[13,14],[14,15],[15,16],[13,17],[0,17],[17,18],[18,19],[19,20]];
function drawHands(roles) {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  for (const [role, points] of Object.entries(roles)) {
    if (!points) continue;
    const color = role === 'chord' ? '#c6f38a' : '#f6c9a3';
    ctx.strokeStyle = color; ctx.fillStyle = color; ctx.lineWidth = 2;
    for (const [a, b] of CONNECTIONS) { ctx.beginPath(); ctx.moveTo((1 - points[a].x) * canvas.width, points[a].y * canvas.height); ctx.lineTo((1 - points[b].x) * canvas.width, points[b].y * canvas.height); ctx.stroke(); }
    for (const p of points) { ctx.beginPath(); ctx.arc((1 - p.x) * canvas.width, p.y * canvas.height, 3, 0, Math.PI * 2); ctx.fill(); }
    const palm = palmCenter(points);
    ctx.font = 'bold 13px sans-serif'; ctx.fillText(role === 'chord' ? '和弦手' : '扫弦手', (1 - palm.x) * canvas.width + 12, palm.y * canvas.height);
  }
}
function processFrame(data) {
  const now = performance.now();
  state.frames++;
  if (now - state.fpsAt > 800) {
    $('#fps').textContent = `${Math.round(state.frames * 1000 / (now - state.fpsAt))} FPS`;
    state.frames = 0; state.fpsAt = now;
  }
  const delay = now - data.timestamp;
  $('#latency').textContent = `${Math.round(delay)} ms 识别`;
  // Never play from an old frame after a device stall.
  if (delay > 300) { latch.reset(); strum.reset(); selectChord(null); drawHands({}); return; }
  const roles = assignHands(data, state.swapped);
  // Keep metric geometry paired with the selected hand, regardless of result order.
  const chordIndex = roles.chord ? data.landmarks.indexOf(roles.chord) : -1;
  const gesture = roles.chord ? classifyGesture(roles.chord, data.worldLandmarks?.[chordIndex]) : null;
  const number = latch.update(gesture, data.timestamp);
  selectChord(number, '左手手势');
  handStatus('left', !!roles.chord, roles.chord ? (number > 0 ? `和弦手 · ${mappedChord(activePreset().mapping, number).name}` : number === 0 ? '和弦手 · 握拳消音' : '和弦手 · 请摆出下方手势') : '等待和弦手');
  handStatus('right', !!roles.strum, roles.strum ? '扫弦手 · 已追踪' : '等待扫弦手');
  const center = roles.strum ? palmCenter(roles.strum) : null;
  // Express both axes in image-height units so a horizontal swing has the
  // same threshold as a vertical one on wide and portrait cameras.
  const hit = strum.update(center ? { x: center.x * canvas.width / canvas.height, y: center.y } : null, data.timestamp);
  if (hit && number > 0) play(hit.direction, hit.velocity);
  drawHands(roles);
}

$('#start-camera').addEventListener('click', startCamera);
$('#stop-camera').addEventListener('click', () => { stopCamera(); notice(''); });
$('#help-toggle').addEventListener('click', () => { const open = $('#help-panel').hidden; $('#help-panel').hidden = !open; $('#help-toggle').setAttribute('aria-expanded', open); });
$('#swap-hands').addEventListener('click', () => {
  state.swapped = !state.swapped; $('#swap-hands').setAttribute('aria-pressed', state.swapped);
  $('#swap-hands').textContent = state.swapped ? '⇄ 双手已交换' : '⇄ 交换双手';
  $('.stage-label.left b').textContent = state.swapped ? '右手' : '左手'; $('.stage-label.right b').textContent = state.swapped ? '左手' : '右手';
  latch.reset(); strum.reset(); if (state.mode === 'camera') selectChord(null);
});
$('#volume').addEventListener('input', event => { audio.setVolume(Number(event.target.value) / 100); $('#volume-value').textContent = `${event.target.value}%`; });
$('#sensitivity').addEventListener('input', event => { strum.sensitivity = Number(event.target.value); $('#sensitivity-value').textContent = event.target.value; });

function presetMessage(text, error = false) {
  $('#preset-message').textContent = text; $('#preset-message').classList.toggle('error', error);
}
function persist(next) {
  const clean = validatePresets(next);
  try { savePresets(localStorage, clean); }
  catch { presetMessage('本机存储不可用或已满。本次更改仅在当前页面生效，请导出备份。', true); presetData = clean; return false; }
  presetData = clean; return true;
}
function refreshPresets() {
  $('#preset-select').replaceChildren(...presetData.presets.map(p => new Option(p.name, p.id, false, p.id === presetData.activeId)));
  $('#delete-preset').disabled = presetData.presets.length === 1;
  $('.chord-cards').innerHTML = chordCards();
  latch.reset(); strum.reset(); selectChord(null); audio.mute();
  if (audio.context) audio.warmup(GESTURES.map(g => mappedChord(activePreset().mapping, g.number)));
}
function openEditor(copy = false) {
  // Configuration pauses camera performance, so editing never produces notes.
  if (state.mode !== 'idle') stopCamera();
  editingId = copy ? null : activePreset().id;
  $('#editor-title').textContent = copy ? '另存为新曲' : '编辑歌曲映射';
  $('#preset-name').value = copy ? `${activePreset().name.slice(0, 53)} · 副本` : activePreset().name;
  $('#editor-error').textContent = '';
  $('#mapping-rows').replaceChildren(...GESTURES.map(g => {
    const chord = mappedChord(activePreset().mapping, g.number);
    const row = document.createElement('div'); row.className = 'mapping-row'; row.dataset.gesture = g.number;
    const label = document.createElement('span'); label.textContent = `${g.number}. ${g.label}`;
    const root = document.createElement('select'); root.className = 'mapping-root'; root.setAttribute('aria-label', `手势 ${g.number} 根音`);
    root.replaceChildren(...ROOTS.map(note => new Option(note, note, false, note === chord.root)));
    const quality = document.createElement('select'); quality.className = 'mapping-quality'; quality.setAttribute('aria-label', `手势 ${g.number} 类型`);
    quality.replaceChildren(...QUALITIES.map(q => new Option(`${q.suffix || '大三'} · ${q.label}`, q.id, false, q.id === chord.quality)));
    row.append(label, root, quality); return row;
  }));
  $('#preset-editor').showModal();
}
$('#preset-select').addEventListener('change', event => {
  const next = { ...presetData, activeId: event.target.value };
  const saved = persist(next); refreshPresets();
  if (saved) presetMessage(`已切换到「${activePreset().name}」，请重新摆出手势开始。`);
});
$('#edit-preset').addEventListener('click', () => openEditor());
$('#new-preset').addEventListener('click', () => openEditor(true));
$('#close-editor').addEventListener('click', () => $('#preset-editor').close());
$('#cancel-editor').addEventListener('click', () => $('#preset-editor').close());
$('#preset-form').addEventListener('submit', event => {
  event.preventDefault();
  try {
    const name = $('#preset-name').value.trim();
    if (!name) throw new Error('请填写预设名称。');
    const mapping = Object.fromEntries([...document.querySelectorAll('.mapping-row')].map(row => [row.dataset.gesture, `${row.querySelector('.mapping-root').value}:${row.querySelector('.mapping-quality').value}`]));
    const id = editingId ?? crypto.randomUUID();
    const preset = { id, name, mapping };
    const next = { ...presetData, activeId: id, presets: editingId ? presetData.presets.map(p => p.id === id ? preset : p) : [...presetData.presets, preset] };
    const saved = persist(next); refreshPresets(); $('#preset-editor').close();
    if (saved) presetMessage(`已保存「${name}」。开启摄像头后即可按新映射演奏。`);
  } catch (error) { $('#editor-error').textContent = error.message; }
});
$('#delete-preset').addEventListener('click', () => {
  if (presetData.presets.length <= 1) return;
  const name = activePreset().name;
  const presets = presetData.presets.filter(p => p.id !== presetData.activeId);
  const saved = persist({ ...presetData, activeId: presets[0].id, presets }); refreshPresets();
  if (saved) presetMessage(`已删除「${name}」。其他预设仍保存在本机。`);
});
$('#export-presets').addEventListener('click', () => {
  const blob = new Blob([JSON.stringify(presetData, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob), link = document.createElement('a');
  link.href = url; link.download = 'air-strum-presets.json'; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
});
$('#import-presets').addEventListener('change', async event => {
  const file = event.target.files?.[0]; if (!file) return;
  try {
    if (file.size > 1_000_000) throw new Error('预设文件不能超过 1 MB。');
    const imported = validatePresets(JSON.parse(await file.text()));
    const presets = imported.presets.map(p => ({ ...p, id: crypto.randomUUID() }));
    const saved = persist({ ...presetData, activeId: presets[0].id, presets: [...presetData.presets, ...presets] });
    refreshPresets(); if (saved) presetMessage(`已导入 ${presets.length} 套预设，原有预设已保留。`);
  } catch (error) { presetMessage(`导入失败：${error.message}`, true); }
  finally { event.target.value = ''; }
});
refreshPresets();
if (loaded.warning) presetMessage(loaded.warning, true);
document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    if (state.mode === 'camera' || state.mode === 'loading') { stopCamera(); notice('页面进入后台，摄像头已关闭。回来后可重新开启演奏。'); }
    audio.mute();
  }
});
window.addEventListener('pagehide', stopCamera);
