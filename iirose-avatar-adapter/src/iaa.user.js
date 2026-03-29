// ==UserScript==
// @name         IAA - IIROSE Avatar Adapter
// @namespace    https://iirose.com/
// @version      __IAA_VERSION__
// @description  IIROSE external avatar visual cropper powered by wsrv.nl (weserv).
// @author       IIorse
// @match        *://iirose.com/*
// @grant        none
// @run-at       document-idle
// ==/UserScript==

(function () {
  'use strict';

  if (window.__IAA_V010_LOADED__) {
    return;
  }
  window.__IAA_V010_LOADED__ = true;

  const IAA_VERSION = '__IAA_VERSION__';
  const VIEWPORT_SIZE = 320;
  const OUTPUT_SIZE = 512;
  const WESERV_HOST = 'https://images.weserv.nl/';

  let observer = null;
  let scanTimer = null;

  function wait(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function toNumber(value, fallback) {
    const n = Number(value);
    return Number.isFinite(n) ? n : fallback;
  }

  function toast(message) {
    const text = String(message || '').trim();
    if (!text) return;
    const versionedText = `[IAA v${IAA_VERSION}] ${text}`;
    if (typeof window._alert === 'function') {
      window._alert(versionedText);
      return;
    }
    console.info(versionedText);
  }

  function notifyLoaded() {
    if (window.__IAA_V010_NOTIFY_DONE__) {
      return;
    }
    window.__IAA_V010_NOTIFY_DONE__ = true;
    toast('已加载。当前版本 v' + IAA_VERSION + '。请进入头像编辑面板，在外链入口左侧点击 IAA 按钮。');
  }

  async function ensureSubmitReady(userRE) {
    if (!userRE || !userRE.info) {
      return false;
    }
    if (typeof userRE.info.question !== 'undefined') {
      return true;
    }
    if (!window.socket || typeof window.socket.send !== 'function') {
      return false;
    }

    window.socket.send('$1');
    for (let i = 0; i < 30; i += 1) {
      if (typeof userRE.info.question !== 'undefined') {
        return true;
      }
      await wait(200);
    }
    return typeof userRE.info.question !== 'undefined';
  }

  function parseSubmitPayload(rawSubmitText) {
    const text = String(rawSubmitText || '');
    const jsonStart = text.indexOf('{');
    if (jsonStart < 0) {
      return null;
    }
    try {
      return JSON.parse(text.slice(jsonStart));
    } catch {
      return null;
    }
  }

  function hasCropParams(url) {
    const text = String(url || '');
    return /(?:\?|&)cx=/.test(text) && /(?:\?|&)cy=/.test(text) && /(?:\?|&)cw=/.test(text) && /(?:\?|&)ch=/.test(text);
  }

  async function submitAvatarWithVerification(url) {
    const userRE = getUserRE();
    if (!userRE || !userRE.function || typeof userRE.function.submit !== 'function') {
      throw new Error('未找到资料提交函数 submit');
    }

    const ready = await ensureSubmitReady(userRE);
    if (!ready) {
      throw new Error('资料面板未准备完成，无法提交（question 未加载）');
    }

    const socket = window.socket;
    if (!socket || typeof socket.send !== 'function') {
      throw new Error('未找到 socket.send，无法校验提交包');
    }

    const rawSend = socket.send.bind(socket);
    let submitText = null;

    socket.send = function iaaPatchedSend(data) {
      const text = String(data || '');
      if (!submitText && (text.startsWith('$2{') || text.startsWith('${'))) {
        submitText = text;
      }
      return rawSend(data);
    };

    try {
      applyAvatarToProfile(url, false);
      userRE.function.submit();
      await wait(1800);
    } finally {
      socket.send = rawSend;
    }

    if (!submitText) {
      throw new Error('未捕获到资料提交包，请确认站内提交是否成功触发');
    }

    const parsed = parseSubmitPayload(submitText);
    if (!parsed) {
      throw new Error('提交包解析失败');
    }
    if (!Object.prototype.hasOwnProperty.call(parsed, 'avatar')) {
      throw new Error('提交包中未包含 avatar 字段（可能被判定为未变化）');
    }
    if (!hasCropParams(parsed.avatar)) {
      throw new Error('提交包 avatar 未携带裁切参数 cx/cy/cw/ch');
    }

    return {
      payload: parsed,
      avatar: String(parsed.avatar || ''),
    };
  }

  function getUserRE() {
    return window.Objs && window.Objs.userREHolder ? window.Objs.userREHolder : null;
  }

  function getUserREContentRoot() {
    const userRE = getUserRE();
    if (!userRE || !userRE.content_icon || !userRE.content_icon[0]) {
      return null;
    }
    return userRE.content_icon[0];
  }

  function normalizeSourceUrl(rawUrl) {
    const value = String(rawUrl || '').trim();
    if (!value) return '';

    if (/^https?:\/\//i.test(value)) {
      return value;
    }

    if (value.startsWith('//')) {
      return `https:${value}`;
    }

    if (typeof window.avatarconv === 'function') {
      try {
        const converted = String(window.avatarconv(value) || '').trim();
        if (/^https?:\/\//i.test(converted) || converted.startsWith('//')) {
          return converted.startsWith('//') ? `https:${converted}` : converted;
        }
      } catch (error) {
        console.warn('[IAA] avatarconv failed:', error);
      }
    }

    return value;
  }

  function currentAvatarUrl() {
    const userRE = getUserRE();
    const aidValue = userRE && userRE.icon && typeof userRE.icon.attr === 'function'
      ? userRE.icon.attr('aid')
      : '';
    const fromAid = normalizeSourceUrl(aidValue);
    if (fromAid) return fromAid;

    const globalAvatar = normalizeSourceUrl(window.avatar || '');
    if (globalAvatar) return globalAvatar;

    return '';
  }

  function buildWeservUrl(sourceUrl, cropRect) {
    const params = new URLSearchParams();
    params.set('url', sourceUrl);
    params.set('cx', String(cropRect.cx));
    params.set('cy', String(cropRect.cy));
    params.set('cw', String(cropRect.cw));
    params.set('ch', String(cropRect.ch));
    // Ensure crop happens on original image before resize.
    params.set('precrop', '1');
    params.set('w', String(OUTPUT_SIZE));
    params.set('h', String(OUTPUT_SIZE));
    params.set('fit', 'cover');
    params.set('output', 'jpg');
    params.set('q', '92');
    return `${WESERV_HOST}?${params.toString()}`;
  }

  function applyAvatarToProfile(url, submitNow) {
    const userRE = getUserRE();
    if (!userRE || !userRE.icon || typeof userRE.icon.attr !== 'function') {
      throw new Error('未找到 userREHolder.icon');
    }

    userRE.icon.attr('aid', url);

    if (window.Utils && typeof window.Utils.img === 'function') {
      window.Utils.img(userRE.icon, url);
    }

    if (submitNow) {
      if (!userRE.function || typeof userRE.function.submit !== 'function') {
        throw new Error('未找到 userREHolder.function.submit');
      }
      userRE.function.submit();
    }
  }

  function injectGlobalStyle() {
    if (document.getElementById('iaa-v010-style')) {
      return;
    }

    const style = document.createElement('style');
    style.id = 'iaa-v010-style';
    style.textContent = `
      .iaa-open-btn {
        position: absolute;
        right: calc(100% + 8px);
        top: 0;
        width: 62px;
        height: 200px;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        gap: 8px;
        border-radius: 4px;
        box-shadow: 0 0 1px rgba(0, 0, 0, 0.12), 0 1px 1px rgba(0, 0, 0, 0.24);
        font-size: 13px;
        line-height: 1.2;
        cursor: pointer;
        z-index: 3;
      }

      .iaa-open-btn .iaa-open-icon {
        font-size: 20px;
        line-height: 1;
      }

      .iaa-open-btn .iaa-open-label {
        text-align: center;
        font-weight: 700;
        letter-spacing: 0.2px;
      }

      .iaa-overlay {
        position: fixed;
        inset: 0;
        z-index: 2147483640;
        background: rgba(6, 10, 18, 0.58);
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 12px;
      }

      .iaa-panel {
        width: min(920px, calc(100vw - 24px));
        max-height: calc(100vh - 24px);
        overflow: auto;
        border-radius: 8px;
        box-shadow: 0 20px 40px rgba(0, 0, 0, 0.35);
        background: #1b2533 !important;
        color: #eef4ff !important;
        border: 1px solid rgba(255, 255, 255, 0.18) !important;
        opacity: 1 !important;
        padding: 14px;
      }

      .iaa-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        margin-bottom: 12px;
      }

      .iaa-title {
        font-size: 18px;
        font-weight: 700;
      }

      .iaa-subtitle {
        font-size: 12px;
        opacity: 0.75;
      }

      .iaa-close {
        height: 36px;
        min-width: 36px;
        border: 0;
        border-radius: 4px;
        cursor: pointer;
        font-size: 20px;
      }

      .iaa-url-row {
        display: grid;
        grid-template-columns: 1fr auto auto;
        gap: 8px;
        margin-bottom: 12px;
      }

      .iaa-url-input {
        width: 100%;
        min-height: 38px;
        border: 1px solid rgba(255, 255, 255, 0.34);
        border-radius: 4px;
        padding: 8px 10px;
        background: #0f1722;
        color: #eef4ff;
      }

      .iaa-url-input::placeholder {
        color: rgba(238, 244, 255, 0.72);
      }

      .iaa-btn {
        min-height: 38px;
        border: 0;
        border-radius: 4px;
        padding: 0 14px;
        cursor: pointer;
      }

      .iaa-main {
        display: grid;
        grid-template-columns: minmax(300px, 360px) 1fr;
        gap: 14px;
      }

      .iaa-viewport-wrap {
        display: flex;
        flex-direction: column;
        gap: 10px;
      }

      .iaa-viewport {
        width: ${VIEWPORT_SIZE}px;
        height: ${VIEWPORT_SIZE}px;
        border-radius: 6px;
        border: 1px solid rgba(255, 255, 255, 0.24);
        background:
          linear-gradient(45deg, rgba(255, 255, 255, 0.04) 25%, transparent 25%, transparent 75%, rgba(255, 255, 255, 0.04) 75%),
          linear-gradient(45deg, rgba(255, 255, 255, 0.04) 25%, transparent 25%, transparent 75%, rgba(255, 255, 255, 0.04) 75%),
          rgba(0, 0, 0, 0.25);
        background-size: 18px 18px;
        background-position: 0 0, 9px 9px;
        position: relative;
        overflow: hidden;
        cursor: grab;
        touch-action: none;
      }

      .iaa-viewport.dragging {
        cursor: grabbing;
      }

      .iaa-preview-image {
        position: absolute;
        top: 0;
        left: 0;
        transform-origin: 0 0;
        will-change: transform;
        user-select: none;
        -webkit-user-drag: none;
        max-width: none;
      }

      .iaa-crosshair::before,
      .iaa-crosshair::after {
        content: '';
        position: absolute;
        pointer-events: none;
      }

      .iaa-crosshair::before {
        left: 50%;
        top: 0;
        bottom: 0;
        width: 1px;
        background: rgba(255, 255, 255, 0.2);
      }

      .iaa-crosshair::after {
        top: 50%;
        left: 0;
        right: 0;
        height: 1px;
        background: rgba(255, 255, 255, 0.2);
      }

      .iaa-zoom-wrap {
        display: grid;
        grid-template-columns: auto 1fr auto;
        align-items: center;
        gap: 8px;
      }

      .iaa-side {
        display: flex;
        flex-direction: column;
        gap: 10px;
      }

      .iaa-meta {
        min-height: 72px;
        padding: 8px;
        border-radius: 4px;
        background: #111b28;
        border: 1px solid rgba(255, 255, 255, 0.2);
        line-height: 1.5;
        font-size: 12px;
      }

      .iaa-output {
        width: 100%;
        min-height: 92px;
        border: 1px solid rgba(255, 255, 255, 0.34);
        border-radius: 4px;
        padding: 8px;
        resize: vertical;
        background: #0f1722;
        color: #eef4ff;
      }

      .iaa-actions {
        margin-top: 14px;
        display: grid;
        grid-template-columns: repeat(3, minmax(120px, 1fr));
        gap: 8px;
      }

      .iaa-footnote {
        margin-top: 10px;
        font-size: 12px;
        opacity: 0.78;
        line-height: 1.6;
      }

      @media (max-width: 900px) {
        .iaa-open-btn {
          width: 52px;
          height: 120px;
          top: 40px;
          font-size: 12px;
        }

        .iaa-main {
          grid-template-columns: 1fr;
        }

        .iaa-viewport {
          width: min(${VIEWPORT_SIZE}px, calc(100vw - 80px));
          height: min(${VIEWPORT_SIZE}px, calc(100vw - 80px));
          margin: 0 auto;
        }

        .iaa-actions {
          grid-template-columns: 1fr;
        }

        .iaa-url-row {
          grid-template-columns: 1fr;
        }
      }
    `;

    document.head.appendChild(style);
  }

  function createButton(text, extraClass) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = `iaa-btn mainColor whoisTouch2 ${extraClass || ''}`;
    btn.textContent = text;
    return btn;
  }

  function createCropController(viewportEl, imageEl, zoomInput, zoomTextEl, metaEl, outputEl) {
    const state = {
      loaded: false,
      sourceUrl: '',
      naturalWidth: 0,
      naturalHeight: 0,
      baseScale: 1,
      userZoom: 1,
      scale: 1,
      tx: 0,
      ty: 0,
      pointerId: null,
      lastX: 0,
      lastY: 0,
    };

    function viewportSize() {
      return viewportEl.clientWidth || VIEWPORT_SIZE;
    }

    function clampTransform() {
      if (!state.loaded) return;

      const box = viewportSize();
      const scaledW = state.naturalWidth * state.scale;
      const scaledH = state.naturalHeight * state.scale;

      if (scaledW <= box) {
        state.tx = (box - scaledW) / 2;
      } else {
        state.tx = clamp(state.tx, box - scaledW, 0);
      }

      if (scaledH <= box) {
        state.ty = (box - scaledH) / 2;
      } else {
        state.ty = clamp(state.ty, box - scaledH, 0);
      }
    }

    function applyTransform() {
      imageEl.style.transform = `translate(${state.tx}px, ${state.ty}px) scale(${state.scale})`;
    }

    function computeCropRect() {
      if (!state.loaded) {
        return null;
      }

      const box = viewportSize();
      const sourceX = clamp((-state.tx) / state.scale, 0, state.naturalWidth - 1);
      const sourceY = clamp((-state.ty) / state.scale, 0, state.naturalHeight - 1);
      const sourceW = clamp(box / state.scale, 1, state.naturalWidth - sourceX);
      const sourceH = clamp(box / state.scale, 1, state.naturalHeight - sourceY);

      let cx = Math.round(sourceX);
      let cy = Math.round(sourceY);
      let cw = Math.max(1, Math.round(sourceW));
      let ch = Math.max(1, Math.round(sourceH));

      // Keep a strict square crop so downstream resize won't re-center unexpectedly.
      const side = Math.max(1, Math.min(cw, ch));
      cx += Math.max(0, Math.floor((cw - side) / 2));
      cy += Math.max(0, Math.floor((ch - side) / 2));
      cw = side;
      ch = side;

      cx = clamp(cx, 0, Math.max(0, state.naturalWidth - cw));
      cy = clamp(cy, 0, Math.max(0, state.naturalHeight - ch));

      return {
        cx,
        cy,
        cw,
        ch,
      };
    }

    function refreshInfo() {
      const crop = computeCropRect();
      if (!state.loaded || !crop) {
        metaEl.textContent = '尚未加载图片。';
        return;
      }

      metaEl.innerHTML = [
        `原图尺寸: ${state.naturalWidth} x ${state.naturalHeight}`,
        `缩放倍率: ${state.userZoom.toFixed(2)}x`,
        `裁切框: cx=${crop.cx}, cy=${crop.cy}, cw=${crop.cw}, ch=${crop.ch}`,
        `输出尺寸: ${OUTPUT_SIZE} x ${OUTPUT_SIZE}`,
      ].join('<br>');
    }

    function refreshAll() {
      clampTransform();
      applyTransform();
      refreshInfo();
    }

    function setZoom(nextZoom, anchorX, anchorY) {
      if (!state.loaded) return;

      const oldScale = state.scale;
      state.userZoom = clamp(nextZoom, 1, 4);
      state.scale = state.baseScale * state.userZoom;

      const ax = toNumber(anchorX, viewportSize() / 2);
      const ay = toNumber(anchorY, viewportSize() / 2);

      state.tx = ax - ((ax - state.tx) / oldScale) * state.scale;
      state.ty = ay - ((ay - state.ty) / oldScale) * state.scale;

      zoomInput.value = String(state.userZoom);
      zoomTextEl.textContent = `${state.userZoom.toFixed(2)}x`;
      refreshAll();
    }

    function loadImage(url) {
      const normalized = normalizeSourceUrl(url);
      if (!normalized) {
        throw new Error('请输入可访问的图片链接');
      }

      state.loaded = false;
      state.sourceUrl = normalized;
      outputEl.value = '';
      metaEl.textContent = '正在加载图片...';

      imageEl.onload = function onLoaded() {
        state.loaded = true;
        state.naturalWidth = imageEl.naturalWidth;
        state.naturalHeight = imageEl.naturalHeight;
        state.baseScale = Math.max(viewportSize() / state.naturalWidth, viewportSize() / state.naturalHeight);
        state.userZoom = 1;
        state.scale = state.baseScale;
        zoomInput.value = '1';
        zoomTextEl.textContent = '1.00x';

        state.tx = (viewportSize() - state.naturalWidth * state.scale) / 2;
        state.ty = (viewportSize() - state.naturalHeight * state.scale) / 2;

        refreshAll();
      };

      imageEl.onerror = function onError() {
        state.loaded = false;
        metaEl.textContent = '图片加载失败，请检查链接可访问性。';
      };

      imageEl.referrerPolicy = 'no-referrer';
      imageEl.src = normalized;
    }

    function buildOutputUrl() {
      if (!state.loaded) {
        throw new Error('请先加载图片');
      }

      const crop = computeCropRect();
      if (!crop) {
        throw new Error('裁切参数计算失败');
      }

      const built = buildWeservUrl(state.sourceUrl, crop);
      outputEl.value = built;
      return built;
    }

    viewportEl.addEventListener('pointerdown', (event) => {
      if (!state.loaded) return;
      state.pointerId = event.pointerId;
      state.lastX = event.clientX;
      state.lastY = event.clientY;
      viewportEl.classList.add('dragging');
      viewportEl.setPointerCapture(event.pointerId);
    });

    viewportEl.addEventListener('pointermove', (event) => {
      if (state.pointerId !== event.pointerId || !state.loaded) return;
      const dx = event.clientX - state.lastX;
      const dy = event.clientY - state.lastY;
      state.lastX = event.clientX;
      state.lastY = event.clientY;
      state.tx += dx;
      state.ty += dy;
      refreshAll();
    });

    function stopDrag(event) {
      if (state.pointerId !== event.pointerId) return;
      state.pointerId = null;
      viewportEl.classList.remove('dragging');
    }

    viewportEl.addEventListener('pointerup', stopDrag);
    viewportEl.addEventListener('pointercancel', stopDrag);

    viewportEl.addEventListener('wheel', (event) => {
      if (!state.loaded) return;
      event.preventDefault();
      const direction = event.deltaY > 0 ? -1 : 1;
      const next = state.userZoom + direction * 0.05;
      const rect = viewportEl.getBoundingClientRect();
      const ax = event.clientX - rect.left;
      const ay = event.clientY - rect.top;
      setZoom(next, ax, ay);
    }, { passive: false });

    zoomInput.addEventListener('input', () => {
      const next = toNumber(zoomInput.value, 1);
      setZoom(next);
    });

    return {
      loadImage,
      buildOutputUrl,
    };
  }

  function openCropperModal(initialSource) {
    injectGlobalStyle();

    const existing = document.getElementById('iaa-v010-overlay');
    if (existing) {
      existing.remove();
    }

    const overlay = document.createElement('div');
    overlay.className = 'iaa-overlay';
    overlay.id = 'iaa-v010-overlay';

    const panel = document.createElement('div');
    panel.className = 'iaa-panel';

    const header = document.createElement('div');
    header.className = 'iaa-header';
    header.innerHTML = `
      <div>
        <div class="iaa-title">IAA 图形化头像裁剪</div>
        <div class="iaa-subtitle">拖拽定位 + 缩放预览，输出 wsrv.nl (weserv) 变换 URL</div>
      </div>
    `;

    const closeBtn = document.createElement('button');
    closeBtn.type = 'button';
    closeBtn.className = 'iaa-close mainColor whoisTouch2';
    closeBtn.textContent = '×';
    closeBtn.addEventListener('click', () => overlay.remove());
    header.appendChild(closeBtn);

    const urlRow = document.createElement('div');
    urlRow.className = 'iaa-url-row';

    const urlInput = document.createElement('input');
    urlInput.className = 'iaa-url-input';
    urlInput.placeholder = '输入第三方图片 URL（http/https）';
    urlInput.value = initialSource || '';

    const loadBtn = createButton('加载图片', '');
    const useCurrentBtn = createButton('当前头像', '');

    urlRow.appendChild(urlInput);
    urlRow.appendChild(loadBtn);
    urlRow.appendChild(useCurrentBtn);

    const main = document.createElement('div');
    main.className = 'iaa-main';

    const left = document.createElement('div');
    left.className = 'iaa-viewport-wrap';

    const viewport = document.createElement('div');
    viewport.className = 'iaa-viewport iaa-crosshair';

    const previewImg = document.createElement('img');
    previewImg.className = 'iaa-preview-image';
    previewImg.alt = 'IAA Preview';
    previewImg.draggable = false;
    viewport.appendChild(previewImg);

    const zoomWrap = document.createElement('div');
    zoomWrap.className = 'iaa-zoom-wrap';

    const zoomLabel = document.createElement('span');
    zoomLabel.textContent = '缩放';

    const zoomInput = document.createElement('input');
    zoomInput.type = 'range';
    zoomInput.min = '1';
    zoomInput.max = '4';
    zoomInput.step = '0.01';
    zoomInput.value = '1';

    const zoomValue = document.createElement('span');
    zoomValue.textContent = '1.00x';

    zoomWrap.appendChild(zoomLabel);
    zoomWrap.appendChild(zoomInput);
    zoomWrap.appendChild(zoomValue);

    left.appendChild(viewport);
    left.appendChild(zoomWrap);

    const right = document.createElement('div');
    right.className = 'iaa-side';

    const guide = document.createElement('div');
    guide.className = 'iaa-meta';
    guide.textContent = '请先加载图片。';

    const outputLabel = document.createElement('div');
    outputLabel.textContent = '生成 URL';

    const output = document.createElement('textarea');
    output.className = 'iaa-output';
    output.readOnly = true;

    right.appendChild(guide);
    right.appendChild(outputLabel);
    right.appendChild(output);

    main.appendChild(left);
    main.appendChild(right);

    const actions = document.createElement('div');
    actions.className = 'iaa-actions';

    const buildBtn = createButton('生成 URL', '');
    const applyBtn = createButton('应用到头像', '');
    const applySubmitBtn = createButton('应用并提交', '');

    actions.appendChild(buildBtn);
    actions.appendChild(applyBtn);
    actions.appendChild(applySubmitBtn);

    const footnote = document.createElement('div');
    footnote.className = 'iaa-footnote';
    footnote.innerHTML = [
      '提示: 在预览区拖拽改变位置，滚轮或滑块缩放。',
      '点击“应用并提交”会直接调用站内资料提交流程。',
      '输出 URL 使用第三方 wsrv.nl (weserv) 即开即用服务。',
    ].join('<br>');

    panel.appendChild(header);
    panel.appendChild(urlRow);
    panel.appendChild(main);
    panel.appendChild(actions);
    panel.appendChild(footnote);

    overlay.appendChild(panel);
    document.body.appendChild(overlay);

    const cropController = createCropController(
      viewport,
      previewImg,
      zoomInput,
      zoomValue,
      guide,
      output,
    );

    function resolveOutputUrl() {
      // Always build from current drag/zoom state to avoid stale centered URLs.
      return cropController.buildOutputUrl();
    }

    function tryLoadFromInput() {
      const raw = urlInput.value;
      try {
        cropController.loadImage(raw);
      } catch (error) {
        toast(error && error.message ? error.message : String(error));
      }
    }

    loadBtn.addEventListener('click', tryLoadFromInput);
    urlInput.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        tryLoadFromInput();
      }
    });

    useCurrentBtn.addEventListener('click', () => {
      const current = currentAvatarUrl();
      if (!current) {
        toast('当前头像 URL 读取失败');
        return;
      }
      urlInput.value = current;
      tryLoadFromInput();
    });

    buildBtn.addEventListener('click', () => {
      try {
        cropController.buildOutputUrl();
        toast('已生成可提交头像 URL');
      } catch (error) {
        toast(error && error.message ? error.message : String(error));
      }
    });

    applyBtn.addEventListener('click', () => {
      try {
        const url = resolveOutputUrl();
        applyAvatarToProfile(url, false);
        toast('已写入头像字段，点站内保存即可提交');
      } catch (error) {
        toast(error && error.message ? error.message : String(error));
      }
    });

    applySubmitBtn.addEventListener('click', async () => {
      try {
        const url = resolveOutputUrl();
        const confirmed = window.confirm('将立即提交头像变更，是否继续？');
        if (!confirmed) {
          return;
        }
        const submitResult = await submitAvatarWithVerification(url);
        toast(`头像已提交，已确认参数入包（cx/cy/cw/ch）。`);
        console.info(`[IAA v${IAA_VERSION}] submit avatar = ${submitResult.avatar}`);
        overlay.remove();
      } catch (error) {
        toast(error && error.message ? error.message : String(error));
      }
    });

    overlay.addEventListener('click', (event) => {
      if (event.target === overlay) {
        overlay.remove();
      }
    });

    if (urlInput.value.trim()) {
      tryLoadFromInput();
    }
  }

  function ensureLaunchButton() {
    const root = getUserREContentRoot();
    if (!root) {
      return;
    }

    if (root.querySelector('.iaa-open-btn')) {
      return;
    }

    const candidates = Array.from(root.querySelectorAll('div.whoisTouch2, div.whoisTouch2Important'));
    const linkTile = candidates.find((node) => {
      const onclickText = node.getAttribute('onclick') || '';
      return onclickText.includes('btnProcesser(4)');
    });

    if (!linkTile || !linkTile.parentElement) {
      return;
    }

    if (linkTile.querySelector('.iaa-open-btn')) {
      return;
    }

    if (!linkTile.style.position) {
      linkTile.style.position = 'relative';
    }
    linkTile.style.overflow = 'visible';

    const launchTile = document.createElement('div');
    launchTile.className = 'iaa-open-btn mainColor whoisTouch2';
    launchTile.innerHTML = '<span class="iaa-open-icon mdi-crop"></span><span class="iaa-open-label">IAA<br>裁剪</span>';
    launchTile.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      openCropperModal(currentAvatarUrl());
    });
    launchTile.addEventListener('pointerdown', (event) => {
      event.stopPropagation();
    });

    linkTile.appendChild(launchTile);
  }

  function startWatchers() {
    if (!document.body) {
      return;
    }

    injectGlobalStyle();
    ensureLaunchButton();

    if (!observer) {
      observer = new MutationObserver(() => {
        ensureLaunchButton();
      });

      observer.observe(document.body, {
        childList: true,
        subtree: true,
      });
    }

    if (!scanTimer) {
      scanTimer = window.setInterval(() => {
        ensureLaunchButton();
      }, 1200);
    }
  }

  function bootstrap() {
    try {
      startWatchers();
      notifyLoaded();
      console.info(`[IAA ${IAA_VERSION}] userscript started`);
    } catch (error) {
      console.error('[IAA] bootstrap failed:', error);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bootstrap, { once: true });
  } else {
    bootstrap();
  }
})();
