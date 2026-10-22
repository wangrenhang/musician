import './style.css';
import { CHORDS, GestureLatch, StrumDetector, classifyGesture, assignHands, palmCenter } from './gestures.js';
import { GuitarAudio } from './audio.js';

const icons = {
  logo: '<svg viewBox="0 0 32 32" fill="none"><path d="M5 10h22M5 16h22M5 22h22M21 5 11 27" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"/></svg>',
  camera: '<svg viewBox="0 0 24 24" fill="none"><rect x="3" y="6" width="13" height="12" rx="3"/><path d="m16 10 5-3v10l-5-3"/></svg>',
  arrow: '<svg viewBox="0 0 24 24" fill="none"><path d="M12 4v16m-6-6 6 6 6-6"/></svg>',
  volume: '<svg viewBox="0 0 24 24" fill="none"><path d="m11 5-6 4H2v6h3l6 4V5Zm4 3c3 2 3 6 0 8m3-11c5 4 5 10 0 14"/></svg>',
  check: '<svg viewBox="0 0 24 24" fill="none"><path d="m5 12 4 4L19 6"/></svg>',
};

function diagram(chord) {
  const strings = chord.frets.map((f, i) => `<line x1="${18 + i * 12}" y1="24" x2="${18 + i * 12}" y2="84"/>${f > 0 ? `<circle class="fret-dot" cx="${18 + i * 12}" cy="${24 + (f - 0.5) * 15}" r="4.2"/>` : `<text x="${18 + i * 12}" y="16">${f < 0 ? '×' : '○'}</text>`}`).join('');
  return `<svg class="chord-diagram" viewBox="0 0 96 94" role="img" aria-label="${chord.name} 和弦指法">${[0, 1, 2, 3, 4].map(f => `<line x1="18" x2="78" y1="${24 + f * 15}" y2="${24 + f * 15}" class="${f === 0 ? 'nut' : ''}"/>`).join('')}${strings}</svg>`;
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
      <div><b>01 · 左手选和弦</b><p>手心朝向镜头，依次伸出食指、食指＋中指、再加无名指、四指、张开五指。握拳可消音。</p></div>
      <div><b>02 · 右手来扫弦</b><p>右手掌心在横线两侧上下穿过。下扫从低音到高音，上扫顺序相反。刚开始请动作大一点。</p></div>
      <div><b>03 · 找到舒服的位置</b><p>两只手都完整入镜，光线均匀，避免强背光。如果两手功能相反，点“交换双手”。</p></div>
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
            <span class="camera-tip">手心朝向镜头 · 两只手完整入镜</span>
          </div>
          <div class="sweep-line" id="sweep-line" hidden><span>右手越过这里扫弦</span></div>
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
        <div class="sensitivity-setting"><div><label for="sensitivity">扫弦灵敏度</label><output for="sensitivity" id="sensitivity-value">55</output></div><input id="sensitivity" type="range" min="10" max="90" value="55"/><p>调高后，轻一点的动作也能发声</p></div>
        <div class="mini-guide"><span class="guide-hand">✦</span><div><b>一个手势，一种心情</b><p>左手稳住约 0.1 秒切换和弦<br/>握拳消音，让音乐也有留白</p></div></div>
        <div class="session-footnote"><span class="local-dot"></span> 木吉他合成音色 · 双向扫弦</div>
      </aside>
    </div>
    <section class="chord-library" aria-labelledby="chord-library-title"><div class="library-header"><h2 id="chord-library-title">五个手势，无限可能。<span>CHORD PALETTE</span></h2><span>手心朝向镜头 <span class="hide-mobile">· 稳住手势，轻扫成曲</span></span></div><div class="chord-cards">${CHORDS.map(c => `<article class="chord-card" data-chord="${c.number}" aria-label="${c.name} 和弦，手势 ${c.number}"><div class="card-top"><span class="gesture-number">${c.number}<small>指</small></span><span class="card-selected">${icons.check}</span></div><div class="card-body"><div><strong>${c.name}</strong><p>${c.label.split(' · ')[0]}</p></div>${diagram(c)}</div><div class="card-bottom"><span>${['食指', '食指 + 中指', '食指 + 中指 + 无名指', '四指 · 拇指收起', '五指张开'][c.number - 1]}</span><span class="card-key">0${c.number}</span></div></article>`).join('')}</div></section>
    <footer><span>不必拥有一把吉他，也能拥有一段旋律。</span><span>AIR STRUM <span class="footer-star">✳</span> MADE FOR THE MOMENT</span></footer>
  </main>
`;

const $ = selector => document.querySelector(selector);
const video = $('#camera-video'), canvas = $('#landmarks'), ctx = canvas.getContext('2d');
const audio = new GuitarAudio(), latch = new GestureLatch(), strum = new StrumDetector();
const state = { mode: 'idle', chord: null, swapped: false, worker: null, stream: null, busy: false, epoch: 0, count: 0, lastVideoTime: -1, sentAt: 0, fpsAt: 0, frames: 0, raf: 0, initReject: null, initTimer: null, audioPromise: null };

function notice(message, error = false) {
  const el = $('#notice'); el.textContent = message; el.hidden = !message; el.classList.toggle('error', error);
}
async function prepareAudio() {
  if (!state.audioPromise) state.audioPromise = audio.unlock().then(() => audio.warmup(CHORDS)).finally(() => { state.audioPromise = null; });
  await state.audioPromise;
}
function selectChord(number, source = '左手手势') {
  const chord = CHORDS.find(c => c.number === number) ?? null;
  const changed = state.chord?.number !== chord?.number;
  state.chord = chord;
  $('#current-chord').textContent = chord?.name ?? (number === 0 ? '休止' : '—');
  $('#chord-quality').textContent = chord?.label ?? (number === 0 ? '握拳消音' : '等待左手选择和弦');
  $('#chord-source').textContent = chord ? source : '未选和弦';
  document.querySelectorAll('.chord-card').forEach(el => {
    const selected = Number(el.dataset.chord) === number;
    el.classList.toggle('selected', selected); el.setAttribute('aria-label', `${CHORDS[Number(el.dataset.chord) - 1].name} 和弦，手势 ${el.dataset.chord}${selected ? '，当前选中' : ''}`);
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
  state.mode = 'idle'; state.busy = false; state.lastVideoTime = -1;
  latch.reset(); strum.reset(); audio.mute(); selectChord(null);
  $('#welcome').hidden = false; $('#sweep-line').hidden = true;
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
  $('#stage-status').textContent = '请允许摄像头权限，首次加载模型可能需要片刻';
  try {
    await prepareAudio(); if (epoch !== state.epoch) return;
    const stream = await navigator.mediaDevices.getUserMedia({ audio: false, video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 400 }, frameRate: { ideal: 30, max: 30 } } });
    if (epoch !== state.epoch) { stream.getTracks().forEach(t => t.stop()); return; }
    state.stream = stream; video.srcObject = stream;
    await video.play(); if (epoch !== state.epoch) return;
    canvas.width = video.videoWidth; canvas.height = video.videoHeight;
    $('#stage').style.setProperty('--video-ratio', `${video.videoWidth} / ${video.videoHeight}`);
    const worker = new Worker('/vision.worker.js');
    state.worker = worker;
    await new Promise((resolve, reject) => {
      state.initReject = reject;
      state.initTimer = setTimeout(() => reject(new Error('模型初始化超时，请重新开启摄像头。')), 45_000);
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
      if (data.type === 'result') processFrame(data);
    };
    worker.onerror = () => { if (epoch === state.epoch) { stopCamera(); notice('识别线程意外停止，请重新开启摄像头。', true); } };
    state.mode = 'camera'; state.fpsAt = performance.now(); state.frames = 0;
    $('#welcome').hidden = true; video.hidden = false; canvas.hidden = false; $('#sweep-line').hidden = false;
    $('#mode-tag').textContent = '手势模式'; $('#stage-status').textContent = '双手完整入镜 · 左手选和弦 · 右手上下穿过横线';
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
  if (state.busy && now - state.sentAt > 5000) { stopCamera(); notice('识别响应超时，摄像头已停止。请重新开启。', true); return; }
  if (state.busy || video.readyState < 2 || video.currentTime === state.lastVideoTime || now - state.sentAt < 32) return;
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
  const gesture = roles.chord ? classifyGesture(roles.chord) : null;
  const number = latch.update(gesture, data.timestamp);
  selectChord(number, '左手手势');
  handStatus('left', !!roles.chord, roles.chord ? (number > 0 ? `和弦手 · ${CHORDS[number - 1].name}` : number === 0 ? '和弦手 · 握拳消音' : '和弦手 · 请摆出 1–5') : '等待和弦手');
  handStatus('right', !!roles.strum, roles.strum ? '扫弦手 · 已追踪' : '等待扫弦手');
  const hit = strum.update(roles.strum ? palmCenter(roles.strum).y : null, data.timestamp);
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
document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    if (state.mode === 'camera' || state.mode === 'loading') { stopCamera(); notice('页面进入后台，摄像头已关闭。回来后可重新开启演奏。'); }
    audio.mute();
  }
});
window.addEventListener('pagehide', stopCamera);
