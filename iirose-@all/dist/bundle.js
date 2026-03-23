"use strict";
(() => {
  // src/utils/id.ts
  function generateMessageId() {
    return `${Date.now()}${Math.random().toString(36).slice(2, 8)}`;
  }

  // src/utils/string.ts
  function normalizeWhitespace(value) {
    return value.replace(/\s+/g, " ").trim();
  }
  function safeTrim(value) {
    return (value ?? "").trim();
  }

  // src/feature/at-all.ts
  var TRIGGER_TOKEN = "[@\u5168\u4F53\u6210\u5458]";
  var MARKDOWN_HEADER = "\\\\\\*";
  var MARKDOWN_TITLE = "### @\u5168\u4F53\u6210\u5458";
  var DEFAULT_MAX_MESSAGE_LENGTH = 1800;
  function hasAtAllTrigger(text) {
    return text.includes(TRIGGER_TOKEN);
  }
  function buildAtAllMessage(usernames) {
    const mentions = usernames.map((username) => ` [*${username}*] `).join(" ");
    return `${MARKDOWN_HEADER}
${MARKDOWN_TITLE}
${mentions}`;
  }
  function isMessageTooLong(text, limit = DEFAULT_MAX_MESSAGE_LENGTH) {
    return text.length > limit;
  }
  function sanitizeMembers(members, options = {}) {
    const seen = /* @__PURE__ */ new Set();
    const selfId = safeTrim(options.selfId);
    const selfUsername = safeTrim(options.selfUsername);
    const cleaned = [];
    for (const member of members) {
      const username = safeTrim(member.username);
      if (!username) continue;
      if (/[\r\n]/.test(username)) continue;
      if (selfId && member.uid && safeTrim(member.uid) === selfId) continue;
      if (selfUsername && username === selfUsername) continue;
      if (seen.has(username)) continue;
      seen.add(username);
      cleaned.push({ ...member, username });
    }
    return cleaned;
  }
  function buildFinalPayload(originalPayload, finalMessage) {
    return {
      ...originalPayload,
      m: finalMessage,
      i: generateMessageId()
    };
  }

  // src/iirose/editor.ts
  function captureDraftSnapshot(doc) {
    const element = findBestEditor(doc);
    return {
      element,
      text: element ? readEditorText(element) : ""
    };
  }
  function restoreDraftSnapshot(snapshot) {
    if (!snapshot.element) return;
    writeEditorText(snapshot.element, snapshot.text);
  }
  function findBestEditor(doc) {
    const active = doc.activeElement;
    if (isEditable(active)) return active;
    const selectors = [
      "textarea",
      'input[type="text"]',
      '[contenteditable="true"]',
      '[contenteditable=""]',
      '[role="textbox"]'
    ];
    for (const selector of selectors) {
      const element = doc.querySelector(selector);
      if (isEditable(element)) return element;
    }
    return null;
  }
  function isEditable(node) {
    if (!node) return false;
    if (node instanceof HTMLTextAreaElement) return true;
    if (node instanceof HTMLInputElement && node.type === "text") return true;
    if (node instanceof HTMLElement && (node.isContentEditable || node.getAttribute("role") === "textbox")) {
      return true;
    }
    return false;
  }
  function readEditorText(element) {
    if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) {
      return element.value;
    }
    return element.textContent ?? "";
  }
  function writeEditorText(element, text) {
    if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) {
      element.value = text;
      element.dispatchEvent(new Event("input", { bubbles: true }));
      return;
    }
    element.textContent = text;
    element.dispatchEvent(new Event("input", { bubbles: true }));
  }

  // src/iirose/context.ts
  function resolveRuntimeContext(hostWin) {
    return {
      roomId: resolveCurrentRoomId(hostWin),
      selfUsername: resolveCurrentUsername(hostWin)
    };
  }
  function resolveCurrentRoomId(hostWin) {
    const href = hostWin.location?.href ?? "";
    const roomMatch = href.match(/\[__([^\]]+)\]/);
    if (roomMatch) return roomMatch[1];
    const hashMatch = href.match(/[?&]room(?:Id)?=([^&#]+)/i);
    if (hashMatch) return decodeURIComponent(hashMatch[1]);
    return null;
  }
  function resolveCurrentUsername(hostWin) {
    const candidates = [
      "iirose_username",
      "iirose_user_name",
      "username",
      "nickName"
    ];
    for (const key of candidates) {
      const value = safeTrim(hostWin.localStorage?.getItem(key));
      if (value) return value;
    }
    const meta = hostWin.document?.querySelector("[data-iia-self-username]");
    const fromMeta = safeTrim(meta?.dataset.iiaSelfUsername);
    if (fromMeta) return fromMeta;
    return null;
  }

  // src/iirose/member-resolver.ts
  var USERNAME_KEYS = ["username", "name", "nick", "nickname", "uname", "userName"];
  var UID_KEYS = ["uid", "id", "userId"];
  var MemberResolver = class {
    constructor(hostWin, transport) {
      this.hostWin = hostWin;
      this.transport = transport;
    }
    async resolveOnce(timeoutMs = 2500) {
      const currentSiteMembers = resolveCurrentSiteMembers(this.hostWin);
      if (currentSiteMembers.length > 0) {
        return currentSiteMembers;
      }
      const responsePromise = this.transport.waitForIncoming((payload2) => payload2.startsWith("u2"), timeoutMs);
      this.transport.sendRaw("r2");
      const payload = await responsePromise;
      return parseMemberResponse(payload);
    }
  };
  function resolveCurrentSiteMembers(hostWin) {
    const doc = hostWin.document;
    const findUserByUid = hostWin.Objs?.mapHolder?.function?.findUserByUid;
    if (typeof findUserByUid !== "function") {
      return [];
    }
    const items = Array.from(doc.querySelectorAll(".homeHolderMsgContentBoxMemberItem[data-uid]"));
    const members = [];
    for (const item of items) {
      const uid = item.getAttribute("data-uid");
      if (!uid) continue;
      const user = findUserByUid(uid);
      if (!Array.isArray(user)) continue;
      const username = typeof user[2] === "string" ? user[2] : "";
      const resolvedUid = typeof user[8] === "string" ? user[8] : uid;
      if (!username) continue;
      members.push({
        username: normalizeWhitespace(username),
        uid: resolvedUid,
        raw: user
      });
    }
    return members;
  }
  function parseMemberResponse(payload) {
    const body = payload.startsWith("u2") ? payload.slice(2) : payload;
    const trimmed = body.trim();
    if (!trimmed) return [];
    const jsonLike = extractJsonLikeBody(trimmed);
    if (jsonLike) {
      try {
        const parsed = JSON.parse(jsonLike);
        const members = extractMembersFromUnknown(parsed);
        if (members.length > 0) return members;
      } catch {
      }
    }
    return parseHeuristicTextMembers(trimmed);
  }
  function extractJsonLikeBody(text) {
    const firstBrace = text.indexOf("{");
    const firstBracket = text.indexOf("[");
    const positions = [firstBrace, firstBracket].filter((pos) => pos >= 0);
    if (positions.length === 0) return null;
    return text.slice(Math.min(...positions));
  }
  function extractMembersFromUnknown(input) {
    const output = [];
    visitUnknown(input, output);
    return output;
  }
  function visitUnknown(input, output) {
    if (Array.isArray(input)) {
      for (const item of input) visitUnknown(item, output);
      return;
    }
    if (typeof input !== "object" || input === null) {
      return;
    }
    const record = input;
    const username = findFirstString(record, USERNAME_KEYS);
    const uid = findFirstString(record, UID_KEYS);
    if (username) {
      output.push({ username: normalizeWhitespace(username), uid: uid || void 0, raw: input });
    }
    for (const value of Object.values(record)) {
      visitUnknown(value, output);
    }
  }
  function findFirstString(record, keys) {
    for (const key of keys) {
      if (typeof record[key] === "string" && record[key]) {
        return record[key];
      }
    }
    return null;
  }
  function parseHeuristicTextMembers(text) {
    const rows = text.split(/\r?\n/).map((row) => row.trim()).filter(Boolean);
    const members = [];
    for (const row of rows) {
      const pipeMatch = row.match(/^([^|>]{1,40})[|>](\w+)$/);
      if (pipeMatch) {
        members.push({ username: normalizeWhitespace(pipeMatch[1]), uid: pipeMatch[2], raw: row });
        continue;
      }
      const simpleMatch = row.match(/^([^\s|>]{1,40})$/);
      if (simpleMatch) {
        members.push({ username: normalizeWhitespace(simpleMatch[1]), raw: row });
      }
    }
    return members;
  }

  // src/iirose/payload.ts
  function parsePublicMessagePayload(raw) {
    if (typeof raw === "string") {
      try {
        const parsed = JSON.parse(raw);
        return toPublicPayload(parsed);
      } catch {
        return null;
      }
    }
    if (typeof raw === "object" && raw !== null) {
      return toPublicPayload(raw);
    }
    return null;
  }
  function toPublicPayload(input) {
    if (typeof input.m !== "string") return null;
    if (typeof input.mc !== "string") return null;
    if (typeof input.g === "string" && input.g.length > 0) return null;
    return input;
  }
  function serializePublicMessagePayload(payload) {
    return JSON.stringify(payload);
  }

  // src/iirose/transport.ts
  var IiroseTransport = class {
    constructor(hostWin) {
      this.hostWin = hostWin;
      this.incomingListeners = /* @__PURE__ */ new Set();
      this.bypassDepth = 0;
      this.originalSend = typeof hostWin.send === "function" ? hostWin.send.bind(hostWin) : null;
      this.wsCtor = hostWin.WebSocket;
    }
    install(onOutgoing) {
      const transport = this;
      if (this.originalSend && onOutgoing) {
        this.hostWin.send = function patchedSend(data) {
          if (transport.bypassDepth > 0) {
            return transport.originalSend?.(data);
          }
          const shouldBypass = onOutgoing(data);
          if (shouldBypass === true) {
            return void 0;
          }
          return transport.originalSend?.(data);
        };
      }
      const wsProto = this.wsCtor?.prototype;
      if (wsProto && typeof wsProto.dispatchEvent === "function") {
        const originalDispatch = wsProto.dispatchEvent;
        wsProto.dispatchEvent = function patchedDispatchEvent(event) {
          if (event instanceof MessageEvent) {
            const decoded = decodeIncomingData(event.data);
            if (decoded) {
              transport.emitIncoming(decoded);
            }
          }
          return originalDispatch.call(this, event);
        };
      }
    }
    withBypass(fn) {
      this.bypassDepth += 1;
      try {
        return fn();
      } finally {
        this.bypassDepth -= 1;
      }
    }
    sendRaw(data) {
      const socketSend = this.resolveSocketSend();
      if (typeof data === "string" && socketSend) {
        return this.withBypass(() => socketSend(data));
      }
      if (!this.originalSend) {
        throw new Error("IIROSE send() is unavailable");
      }
      return this.withBypass(() => this.originalSend?.(data));
    }
    onIncoming(listener) {
      this.incomingListeners.add(listener);
      return () => {
        this.incomingListeners.delete(listener);
      };
    }
    waitForIncoming(predicate, timeoutMs) {
      return new Promise((resolve, reject) => {
        const timeout = this.hostWin.setTimeout(() => {
          unsubscribe();
          reject(new Error("Timed out waiting for matching incoming payload"));
        }, timeoutMs);
        const unsubscribe = this.onIncoming((payload) => {
          if (!predicate(payload)) return;
          this.hostWin.clearTimeout(timeout);
          unsubscribe();
          resolve(payload);
        });
      });
    }
    emitIncoming(payload) {
      for (const listener of this.incomingListeners) {
        listener(payload);
      }
    }
    resolveSocketSend() {
      const socket = this.hostWin.socket;
      if (socket && typeof socket.send === "function") {
        return socket.send.bind(socket);
      }
      return null;
    }
  };
  function decodeIncomingData(data) {
    if (typeof data === "string") return data;
    if (data instanceof ArrayBuffer) {
      return new TextDecoder().decode(new Uint8Array(data));
    }
    if (typeof Blob !== "undefined" && data instanceof Blob) {
      return null;
    }
    return null;
  }

  // src/utils/logger.ts
  var PREFIX = "[I@A]";
  function logInfo(message, ...args) {
    console.info(PREFIX, message, ...args);
  }
  function logWarn(message, ...args) {
    console.warn(PREFIX, message, ...args);
  }
  function logError(message, ...args) {
    console.error(PREFIX, message, ...args);
  }

  // src/ui/notice.ts
  var Notifier = class {
    constructor(hostWin) {
      this.hostWin = hostWin;
    }
    info(message) {
      logInfo(message);
      this.render(message);
    }
    warn(message) {
      logWarn(message);
      this.render(message, true);
    }
    render(message, isWarn = false) {
      const doc = this.hostWin.document;
      if (!doc?.body) return;
      let container = doc.getElementById("iia-toast");
      if (!container) {
        container = doc.createElement("div");
        container.id = "iia-toast";
        container.setAttribute(
          "style",
          [
            "position:fixed",
            "right:16px",
            "bottom:16px",
            "z-index:2147483647",
            "padding:10px 12px",
            "border-radius:8px",
            "font-size:12px",
            "background:rgba(0,0,0,.75)",
            "color:#fff",
            "max-width:320px",
            "box-shadow:0 8px 24px rgba(0,0,0,.2)"
          ].join(";")
        );
        doc.body.appendChild(container);
      }
      container.textContent = message;
      if (isWarn) {
        container.style.background = "rgba(160, 40, 20, .92)";
      } else {
        container.style.background = "rgba(0,0,0,.75)";
      }
      this.hostWin.clearTimeout(Number(container.dataset.timer || 0));
      const timer = this.hostWin.setTimeout(() => {
        container?.remove();
      }, 2200);
      container.dataset.timer = String(timer);
    }
  };

  // src/app.ts
  var AtAllApp = class {
    constructor(hostWin) {
      this.hostWin = hostWin;
      this.sendTaskPending = false;
      this.bypassMoveinputDo = false;
      this.notifier = new Notifier(hostWin);
      this.transport = new IiroseTransport(hostWin);
      this.memberResolver = new MemberResolver(hostWin, this.transport);
    }
    install() {
      const moveinputInstalled = this.installMoveinputDoInterceptor();
      this.transport.install(moveinputInstalled ? void 0 : (data) => this.handleLegacyOutgoing(data));
      this.notifier.info("I@A \u5DF2\u52A0\u8F7D");
      logInfo("initialized");
    }
    handleLegacyOutgoing(data) {
      const payload = parsePublicMessagePayload(data);
      if (!payload) return false;
      if (!hasAtAllTrigger(payload.m)) return false;
      if (this.sendTaskPending) {
        this.notifier.warn("I@A \u6B63\u5728\u5904\u7406\u4E2D\uFF0C\u8BF7\u7A0D\u5019");
        return true;
      }
      const draft = captureDraftSnapshot(this.hostWin.document);
      void this.processPayloadSubmission(
        {
          rawText: payload.m,
          selfId: payload.mc,
          submit: (finalMessage) => {
            const finalPayload = buildFinalPayload(payload, finalMessage);
            this.transport.sendRaw(serializePublicMessagePayload(finalPayload));
          }
        },
        draft
      );
      return true;
    }
    installMoveinputDoInterceptor() {
      const service = this.hostWin.Utils?.service;
      if (!service || typeof service.moveinputDo !== "function") {
        return false;
      }
      const originalMoveinputDo = service.moveinputDo.bind(service);
      const app = this;
      service.moveinputDo = function patchedMoveinputDo(text, ...args) {
        if (app.bypassMoveinputDo) {
          return originalMoveinputDo(text, ...args);
        }
        if (typeof text !== "string" || !hasAtAllTrigger(text)) {
          return originalMoveinputDo(text, ...args);
        }
        if (app.sendTaskPending) {
          app.notifier.warn("I@A \u6B63\u5728\u5904\u7406\u4E2D\uFF0C\u8BF7\u7A0D\u5019");
          return false;
        }
        const draft = captureDraftSnapshot(app.hostWin.document);
        void app.processPayloadSubmission(
          {
            rawText: text,
            selfId: null,
            submit: (finalMessage) => {
              app.bypassMoveinputDo = true;
              try {
                originalMoveinputDo(finalMessage, ...args);
              } finally {
                app.bypassMoveinputDo = false;
              }
            }
          },
          draft
        );
        return false;
      };
      return true;
    }
    async processPayloadSubmission(submission, draft) {
      this.sendTaskPending = true;
      const context = resolveRuntimeContext(this.hostWin);
      try {
        const members = await this.memberResolver.resolveOnce();
        const cleaned = sanitizeMembers(members, {
          selfId: submission.selfId,
          selfUsername: context.selfUsername
        });
        if (cleaned.length === 0) {
          this.notifier.warn("\u5F53\u524D\u623F\u95F4\u6682\u65E0\u53EF\u63D0\u53CA\u6210\u5458");
          restoreDraftSnapshot(draft);
          return;
        }
        const finalMessage = buildAtAllMessage(cleaned.map((item) => item.username));
        if (isMessageTooLong(finalMessage, DEFAULT_MAX_MESSAGE_LENGTH)) {
          this.notifier.warn("\u5F53\u524D\u6D88\u606F\u8FC7\u957F\uFF0C\u5DF2\u963B\u6B62\u53D1\u9001");
          restoreDraftSnapshot(draft);
          return;
        }
        submission.submit(finalMessage);
        logInfo("send success", {
          roomId: context.roomId,
          mentionCount: cleaned.length,
          finalLength: finalMessage.length
        });
      } catch (error) {
        logError("send failed", error);
        this.notifier.warn("I@A \u5904\u7406\u5931\u8D25\uFF0C\u8BF7\u91CD\u8BD5");
        restoreDraftSnapshot(draft);
      } finally {
        this.sendTaskPending = false;
      }
    }
  };

  // src/main.ts
  (function bootstrap() {
    const topWin = window;
    const frame = topWin.document.getElementById("mainFrame");
    const hostWin = frame?.contentWindow || topWin;
    if (hostWin.__IIROSE_AT_ALL_APP__) {
      return;
    }
    const init = () => {
      const canInstallWithLegacySend = typeof hostWin.send === "function";
      const canInstallWithMoveinputDo = Boolean(
        hostWin.Utils?.service?.moveinputDo
      );
      if (!canInstallWithLegacySend && !canInstallWithMoveinputDo) {
        hostWin.setTimeout(init, 500);
        return;
      }
      const app = new AtAllApp(hostWin);
      hostWin.__IIROSE_AT_ALL_APP__ = app;
      app.install();
    };
    if (hostWin.document.readyState === "complete") {
      init();
    } else {
      hostWin.addEventListener("load", init, { once: true });
    }
  })();
})();
//# sourceMappingURL=bundle.js.map
