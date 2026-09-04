"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.WhatsAppEngine = exports.defaultObfuscationOptions = void 0;
exports.obfuscateText = obfuscateText;
exports.obfuscateLine = obfuscateLine;
const node_events_1 = require("node:events");
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const dotObfuscation_1 = require("./dotObfuscation");
exports.defaultObfuscationOptions = {
    enabled: true,
    dotReplaceRatio: 0.3,
    invisibleCharDensity: 0.1,
    preserveLineBreaks: true,
    preservePunctuation: true,
    trailingSpacesCount: 3,
};
const INVISIBLE_CHARS = ["\u200B", "\u200C", "\u200D", "\u2060", "\uFEFF"];
const PUNCTUATION_REGEX = /[!"#$%&'()*+,\-.\/:;<=>?@[\\\]^_`{|}~]/g;
const WHITESPACE_REGEX = /\s/g;
function obfuscateText(text, options) {
    if (!options.enabled || text.trim().length === 0) {
        return text;
    }
    let result = text;
    if (options.preserveLineBreaks) {
        const lines = result.split("\n");
        result = lines.map((line) => obfuscateLine(line, options)).join("\n");
    }
    else {
        result = obfuscateLine(result, options);
    }
    if (options.trailingSpacesCount > 0 && !options.preserveLineBreaks) {
        result = result + " ".repeat(options.trailingSpacesCount);
    }
    return result;
}
function obfuscateLine(line, options) {
    if (line.trim().length === 0) {
        return line;
    }
    let result = line;
    if (options.invisibleCharDensity > 0) {
        const chars = result.split("");
        for (let i = 0; i < chars.length; i++) {
            if (Math.random() < options.invisibleCharDensity) {
                const invisible = INVISIBLE_CHARS[Math.floor(Math.random() * INVISIBLE_CHARS.length)];
                chars[i] = chars[i] + invisible;
            }
        }
        result = chars.join("");
    }
    if (options.dotReplaceRatio > 0) {
        result = result
            .split("")
            .map((char) => {
            if (options.preservePunctuation && PUNCTUATION_REGEX.test(char)) {
                return char;
            }
            if (WHITESPACE_REGEX.test(char)) {
                return char;
            }
            if (Math.random() < options.dotReplaceRatio) {
                return "\u2022";
            }
            return char;
        })
            .join("");
    }
    return result;
}
class WhatsAppEngine extends node_events_1.EventEmitter {
    client = null;
    ready = false;
    initializing = false;
    lastQr = null;
    lastError = null;
    lastState = null;
    obfuscationOptions;
    wapi = null;
    initPromise = null;
    reconnectAttempts = 0;
    reconnectTimer = null;
    maxReconnectAttempts = 10;
    reconnectDelayMs = 3000;
    constructor() {
        super();
        this.obfuscationOptions = { ...exports.defaultObfuscationOptions };
    }
    async loadLib() {
        if (!this.wapi) {
            this.wapi = await Promise.resolve().then(() => __importStar(require("whatsapp-web.js")));
        }
        return this.wapi;
    }
    getSessionDir() {
        if (process.env.SESSION_DIR) {
            return process.env.SESSION_DIR;
        }
        return path_1.default.resolve(process.cwd(), ".wwebjs_auth");
    }
    async ensureSessionDir() {
        const baseDir = this.getSessionDir();
        // LocalAuth expects dataPath to be the base directory; it creates its own
        // session subdirectories internally (e.g., "session-Name"). We only need
        // to ensure the base directory exists.
        fs_1.default.mkdirSync(baseDir, { recursive: true });
        return baseDir;
    }
    /** Returns true if an initialization attempt is currently in flight. */
    isInitializing() {
        return this.initializing;
    }
    async initialize(puppeteerOptions) {
        if (this.client && this.ready) {
            return;
        }
        if (this.initPromise) {
            return this.initPromise;
        }
        if (this.client && !this.ready) {
            try {
                await this.client.destroy();
            }
            catch {
                /* ignore */
            }
            this.client = null;
            this.lastQr = null;
        }
        this.ready = false;
        this.lastQr = null;
        this.lastError = null;
        this.initializing = true;
        this.initPromise = (async () => {
            const lib = await this.loadLib();
            const defaultPuppeteerOptions = {
                headless: true,
                protocolTimeout: 60000,
                args: [
                    "--no-sandbox",
                    "--disable-setuid-sandbox",
                    "--disable-dev-shm-usage",
                    "--disable-gpu",
                    "--disable-extensions",
                    "--disable-background-timer-throttling",
                    "--disable-backgrounding-occluded-windows",
                    "--disable-renderer-backgrounding",
                ],
            };
            if (process.env.PUPPETEER_EXECUTABLE_PATH) {
                defaultPuppeteerOptions.executablePath =
                    process.env.PUPPETEER_EXECUTABLE_PATH;
            }
            const dataPath = await this.ensureSessionDir();
            this.client = new lib.Client({
                authStrategy: new lib.LocalAuth({
                    dataPath: dataPath,
                    clientId: "session", // Use a fixed session name for consistency
                }),
                puppeteer: puppeteerOptions ?? defaultPuppeteerOptions,
            });
            // Track connection state for debugging and monitoring
            this.client.on("qr", (qr) => {
                this.ready = false;
                this.lastQr = qr;
                this.emit("qr", qr);
                console.log("[engine] QR code received, waiting for scan");
            });
            this.client.on("authenticated", () => {
                console.log("[engine] Client authenticated successfully");
                this.emit("authenticated");
            });
            this.client.on("ready", () => {
                this.ready = true;
                this.lastQr = null;
                this.lastError = null;
                this.initializing = false;
                this.reconnectAttempts = 0; // Reset reconnect counter on successful connection
                this.emit("ready");
                console.log("[engine] Client is ready and connected");
            });
            this.client.on("disconnected", (reason) => {
                this.ready = false;
                this.initializing = false;
                console.log(`[engine] Client disconnected: ${reason}`);
                this.emit("disconnected", reason);
                // Attempt auto-reconnect unless disconnect was intentional
                // (intentional disconnects go through the disconnect() method which clears client)
                if (this.client && reason !== "RESET_FOR_RECONNECT") {
                    this.attemptReconnect(reason);
                }
            });
            this.client.on("auth_failure", (msg) => {
                this.ready = false;
                this.initializing = false;
                this.lastError = msg;
                console.error(`[engine] Authentication failure: ${msg}`);
                this.emit("auth_failure", msg);
                this.clearSession().catch((err) => {
                    console.error("[engine] Failed to clear session after auth failure:", err);
                });
            });
            // Monitor connection state changes for debugging
            this.client.on("change_state", (state) => {
                const stateStr = typeof state === "string" ? state : String(state);
                if (this.lastState !== stateStr) {
                    console.log(`[engine] Connection state changed: ${this.lastState} -> ${stateStr}`);
                    this.lastState = stateStr;
                }
            });
            // Monitor loading screen changes (helpful for debugging connection issues)
            this.client.on("loading_screen", (processCode, message) => {
                console.log(`[engine] Loading screen: ${processCode} - ${message}`);
            });
            // Handle unexpected errors that might cause silent disconnects
            this.client.on("error", (err) => {
                console.error("[engine] Client error:", err);
                this.lastError = err.message;
            });
            try {
                await this.client.initialize();
            }
            catch (err) {
                const message = err instanceof Error ? err.message : String(err);
                this.lastError = message;
                console.error("[engine] initialize failed:", message);
                try {
                    await this.client?.destroy();
                }
                catch (destroyErr) {
                    console.error("[engine] Failed to destroy client after init error:", destroyErr);
                }
                this.client = null;
                this.ready = false;
                this.lastQr = null;
                this.initializing = false;
                throw err;
            }
            finally {
                this.initPromise = null;
                this.initializing = false;
            }
        })();
        return this.initPromise;
    }
    onQR(cb) {
        this.on("qr", cb);
    }
    onReady(cb) {
        this.on("ready", cb);
    }
    onDisconnected(cb) {
        this.on("disconnected", cb);
    }
    onAuthFailure(cb) {
        this.on("auth_failure", cb);
    }
    async getStatus() {
        if (this.initializing || this.initPromise) {
            return { state: "INITIALIZING", ready: false, qr: this.lastQr, phoneNumber: null, error: this.lastError };
        }
        if (!this.client) {
            if (this.lastError) {
                return { state: "UNLAUNCHED", ready: false, qr: null, phoneNumber: null, error: this.lastError };
            }
            return { state: "UNLAUNCHED", ready: false, qr: null, phoneNumber: null, error: null };
        }
        let state = "UNKNOWN";
        if (this.lastState) {
            state = this.lastState;
        }
        else {
            try {
                const withTimeout = Promise.race([
                    this.client.getState(),
                    new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 5000)),
                ]);
                state = String(await withTimeout);
            }
            catch {
                state = "UNKNOWN";
            }
        }
        const isReady = this.ready;
        const qr = isReady ? null : this.lastQr;
        return {
            state,
            ready: isReady,
            qr,
            phoneNumber: isReady ? await this.getPhoneNumber() : null,
            error: this.lastError,
        };
    }
    async getPhoneNumber() {
        if (!this.client)
            return null;
        try {
            const info = this.client.info;
            if (!info)
                return null;
            const wid = info.wid || info.me;
            if (!wid)
                return null;
            if (wid.user) {
                const phoneMatch = wid.user.match(/^\+?\d+$/);
                if (phoneMatch) {
                    return wid.user.replace(/^\+/, "");
                }
            }
            if (wid._serialized) {
                const atIndex = wid._serialized.indexOf("@");
                if (atIndex > 0) {
                    const phonePart = wid._serialized.substring(0, atIndex);
                    const phoneMatch = phonePart.match(/^\+?\d+$/);
                    if (phoneMatch) {
                        return phonePart.replace(/^\+/, "");
                    }
                }
            }
            try {
                const serialized = wid._serialized;
                if (serialized) {
                    const formatted = await this.client.getFormattedNumber(serialized);
                    if (formatted) {
                        const digits = formatted.replace(/\D/g, "");
                        if (digits.length >= 10) {
                            return digits;
                        }
                    }
                }
            }
            catch {
                // Ignore errors from getFormattedNumber
            }
            return null;
        }
        catch {
            return null;
        }
    }
    debugClientInfo() {
        if (!this.client)
            return null;
        try {
            const info = this.client.info;
            if (!info)
                return null;
            const wid = info.wid || info.me;
            return {
                wid,
                hasInfo: !!info,
                pushname: info.pushname,
                platform: info.platform,
                phoneInfo: info.phone,
            };
        }
        catch (err) {
            return { error: err instanceof Error ? err.message : "Unknown error" };
        }
    }
    sessionExists() {
        try {
            const baseDir = this.getSessionDir();
            // LocalAuth creates session subdirectories like "session-Number" under dataPath
            // Check if any session subdirectory exists in the base auth directory
            const entries = fs_1.default.readdirSync(baseDir, { withFileTypes: true });
            return entries.some((entry) => entry.isDirectory() &&
                (entry.name.startsWith("session-") || entry.name === "session"));
        }
        catch {
            return false;
        }
    }
    setObfuscationOptions(options) {
        this.obfuscationOptions = { ...this.obfuscationOptions, ...options };
    }
    obfuscateMessage(message) {
        return obfuscateText(message, this.obfuscationOptions);
    }
    SEND_TIMEOUT_MS = 45000;
    withTimeout(p, ms, label) {
        const timer = new Promise((_, reject) => setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms));
        return Promise.race([p, timer]);
    }
    async sendText(to, text) {
        if (!this.client) {
            throw new Error("WhatsApp client is not initialized");
        }
        if (!this.ready) {
            throw new Error("WhatsApp client is not ready yet");
        }
        const chatId = to.includes("@")
            ? to
            : `${to.replace(/[\+\s\-]/g, "")}@s.whatsapp.net`;
        const obfuscated = this.obfuscateMessage(text);
        const withDots = (0, dotObfuscation_1.addDots)(obfuscated);
        try {
            await this.withTimeout(this.client.sendMessage(chatId, withDots), this.SEND_TIMEOUT_MS, "sendText");
        }
        catch (err) {
            this.ready = false;
            this.lastError = err instanceof Error ? err.message : "sendText failed";
            this.emit("status_error", this.lastError);
            throw err;
        }
    }
    async sendImage(to, filePath, caption) {
        if (!this.client) {
            throw new Error("WhatsApp client is not initialized");
        }
        if (!this.ready) {
            throw new Error("WhatsApp client is not ready yet");
        }
        if (!this.wapi) {
            throw new Error("WhatsApp client is not initialized");
        }
        const chatId = to.includes("@")
            ? to
            : `${to.replace(/[\+\s\-]/g, "")}@s.whatsapp.net`;
        const media = this.wapi.MessageMedia.fromFilePath(filePath);
        const options = {};
        if (caption) {
            options.caption = this.obfuscateMessage(caption);
        }
        try {
            await this.withTimeout(this.client.sendMessage(chatId, media, options), this.SEND_TIMEOUT_MS, "sendImage");
        }
        catch (err) {
            this.ready = false;
            this.lastError = err instanceof Error ? err.message : "sendImage failed";
            this.emit("status_error", this.lastError);
            throw err;
        }
    }
    async sendVideo(to, filePath, caption) {
        if (!this.client) {
            throw new Error("WhatsApp client is not initialized");
        }
        if (!this.ready) {
            throw new Error("WhatsApp client is not ready yet");
        }
        if (!this.wapi) {
            throw new Error("WhatsApp client is not initialized");
        }
        const chatId = to.includes("@")
            ? to
            : `${to.replace(/[\+\s\-]/g, "")}@s.whatsapp.net`;
        const media = this.wapi.MessageMedia.fromFilePath(filePath);
        const options = {
            sendMediaAsDocument: false,
        };
        if (caption) {
            options.caption = this.obfuscateMessage(caption);
        }
        try {
            await this.withTimeout(this.client.sendMessage(chatId, media, options), this.SEND_TIMEOUT_MS, "sendVideo");
        }
        catch (err) {
            this.ready = false;
            this.lastError = err instanceof Error ? err.message : "sendVideo failed";
            this.emit("status_error", this.lastError);
            throw err;
        }
    }
    async sendCombined(to, filePath, text, mediaType) {
        if (mediaType === "image") {
            await this.sendImage(to, filePath, text);
        }
        else if (mediaType === "video") {
            await this.sendVideo(to, filePath, text);
        }
        else {
            await this.sendText(to, text);
        }
    }
    attemptReconnect(reason) {
        if (this.reconnectTimer) {
            clearTimeout(this.reconnectTimer);
        }
        if (this.reconnectAttempts >= this.maxReconnectAttempts) {
            console.error(`[engine] Max reconnect attempts (${this.maxReconnectAttempts}) reached, giving up. Last reason: ${reason}`);
            this.emit("reconnect_failed");
            return;
        }
        this.reconnectAttempts++;
        const baseDelay = this.reconnectDelayMs * this.reconnectAttempts;
        const jitter = Math.random() * 0.3 + 0.85;
        const delay = Math.round(baseDelay * jitter);
        console.log(`[engine] Reconnect attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts} in ${delay}ms. Reason: ${reason}`);
        this.emit("reconnect_attempt", this.reconnectAttempts, this.maxReconnectAttempts, delay);
        this.reconnectTimer = setTimeout(() => {
            this.reconnectTimer = null;
            this.initialize().catch((err) => {
                console.error("[engine] Reconnect failed:", err);
            });
        }, delay);
    }
    markUnhealthy(error) {
        if (this.ready) {
            this.ready = false;
            this.lastError = error;
            this.emit("status_error", error);
        }
    }
    async disconnect(clearSession = false) {
        if (this.reconnectTimer) {
            clearTimeout(this.reconnectTimer);
            this.reconnectTimer = null;
        }
        this.reconnectAttempts = 0;
        this.initializing = false;
        this.lastError = null;
        if (this.initPromise) {
            try {
                await this.initPromise;
            }
            catch {
                /* initialization failed, proceed with cleanup */
            }
        }
        if (!this.client) {
            this.ready = false;
            this.lastQr = null;
        }
        else {
            this.ready = false;
            this.lastQr = null;
            try {
                await this.client.logout();
                console.log("[engine] Logged out");
            }
            catch (err) {
                console.error("[engine] Logout failed:", err);
            }
            try {
                await this.client.destroy();
            }
            catch (err) {
                console.error("[engine] Destroy failed:", err);
            }
            this.client = null;
        }
        if (clearSession) {
            await this.clearSession();
        }
    }
    async clearSession() {
        const sessionPath = this.getSessionDir();
        try {
            if (fs_1.default.existsSync(sessionPath)) {
                fs_1.default.rmSync(sessionPath, { recursive: true, force: true });
                console.log("[engine] Session cleared successfully");
            }
        }
        catch (err) {
            console.error("[engine] Failed to clear session:", err);
        }
    }
}
exports.WhatsAppEngine = WhatsAppEngine;
