'use strict';

const { clipboard, nativeImage, ClipboardItem } = require('electron');
const { EventEmitter } = require('events');
const settings = require('./settings-service');
const logger = require('../utils/logger');

const MAX_ITEMS_DEFAULT = 3;
const MAX_ITEMS_LIMIT = 50;
const POLL_INTERVAL_DEFAULT = 1200;
const POLL_INTERVAL_MIN = 300;
const MAX_TEXT_LENGTH = 100000;
const MAX_SVG_LENGTH = 200000;
const THUMB_WIDTH = 120;

function hashBuffer(buffer) {
  let hash = 5381;
  for (let i = 0; i < buffer.length; i++) hash = ((hash * 33) ^ buffer[i]) >>> 0;
  return hash;
}

function clamp(value, min, max, fallback) {
  const num = Number(value);
  if (!Number.isFinite(num)) return fallback;
  return Math.min(max, Math.max(min, Math.floor(num)));
}

// Returns a data URL when the text is an inline SVG document (small enough).
function svgThumbnail(text) {
  const trimmed = String(text || '').trim();
  if (!trimmed || trimmed.length > MAX_SVG_LENGTH) return '';
  if (!trimmed.startsWith('<')) return '';
  if (!/<svg[\s>]/i.test(trimmed.slice(0, 600))) return '';
  if (!/<\/svg>/i.test(trimmed)) return '';
  try {
    return `data:image/svg+xml;base64,${Buffer.from(trimmed, 'utf8').toString('base64')}`;
  } catch (err) {
    return '';
  }
}

class ClipboardService extends EventEmitter {
  constructor() {
    super();
    this.items = [];
    this.buffers = new Map();
    this.lastText = null;
    this.lastImageSig = null;
    this.nextId = 1;
    this.timer = null;
    this.polling = false;
    this.maxItems = MAX_ITEMS_DEFAULT;
    this.pollMs = POLL_INTERVAL_DEFAULT;
  }

  start() {
    if (this.timer) return;
    settings.on('changed', () => this.applySettings());
    this.applySettings();
    if (!this.timer) this.timer = setInterval(() => this.poll(), this.pollMs);
  }

  applySettings() {
    const limit = clamp(settings.get('clipboardLimit'), 1, MAX_ITEMS_LIMIT, MAX_ITEMS_DEFAULT);
    const poll = clamp(settings.get('clipboardPollMs'), POLL_INTERVAL_MIN, 60000, POLL_INTERVAL_DEFAULT);
    if (limit !== this.maxItems) {
      this.maxItems = limit;
      if (this.items.length > limit) this.trim();
    }
    if (poll !== this.pollMs) {
      this.pollMs = poll;
      if (this.timer) {
        clearInterval(this.timer);
        this.timer = setInterval(() => this.poll(), this.pollMs);
      }
    }
  }

  trim() {
    while (this.items.length > this.maxItems) {
      const removed = this.items.pop();
      if (removed) this.buffers.delete(removed.id);
    }
    this.emit('changed', this.list());
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  async poll() {
    if (this.polling) return;
    this.polling = true;
    try {
      let text = '';
      try {
        text = (await clipboard.readText()) || '';
      } catch (err) {
        text = '';
      }

      if (text) {
        if (text === this.lastText) return;
        this.lastText = text;
        this.lastImageSig = null;
        const truncated = text.length > MAX_TEXT_LENGTH;
        const entry = {
          type: 'text',
          text: truncated ? text.slice(0, MAX_TEXT_LENGTH) : text,
          truncated,
        };
        const thumb = svgThumbnail(text);
        if (thumb) {
          entry.type = 'svg';
          entry.thumb = thumb;
        }
        this.push(entry);
        return;
      }

      this.lastText = '';
      await this.pollImage();
    } finally {
      this.polling = false;
    }
  }

  async pollImage() {
    let has = false;
    try {
      has = await clipboard.has('image/png');
    } catch (err) {
      return;
    }
    if (!has) return;

    let buffer;
    try {
      const items = await clipboard.read('image/png');
      const item = items && items[0];
      const blob = item && typeof item.getType === 'function' ? await item.getType('image/png') : null;
      if (!blob) return;
      buffer = Buffer.from(await blob.arrayBuffer());
    } catch (err) {
      return;
    }
    if (!buffer || !buffer.length) return;

    const signature = `${buffer.length}:${hashBuffer(buffer)}`;
    if (signature === this.lastImageSig) return;
    this.lastImageSig = signature;

    let thumb = '';
    let width = 0;
    let height = 0;
    try {
      const image = nativeImage.createFromBuffer(buffer);
      if (!image.isEmpty()) {
        const size = image.getSize();
        width = size.width;
        height = size.height;
        const target = Math.max(1, Math.min(THUMB_WIDTH, width || THUMB_WIDTH));
        thumb = image.resize({ width: target }).toDataURL();
      }
    } catch (err) {
      logger.debug('clipboard thumb failed:', err.message);
    }

    this.push({ type: 'image', thumb, width, height, buffer });
  }

  push(entry) {
    if (entry.type === 'text' && this.items[0] && this.items[0].type === 'text' && this.items[0].text === entry.text) {
      return;
    }
    entry.id = this.nextId++;
    entry.at = Date.now();
    if (entry.buffer) {
      this.buffers.set(entry.id, entry.buffer);
      delete entry.buffer;
    }
    this.items.unshift(entry);
    while (this.items.length > this.maxItems) {
      const removed = this.items.pop();
      if (removed) this.buffers.delete(removed.id);
    }
    this.emit('changed', this.list());
  }

  list() {
    return this.items.map((item) => {
      const out = { id: item.id, type: item.type, at: item.at };
      if (item.text != null) out.text = item.text;
      if (item.thumb != null) out.thumb = item.thumb;
      if (item.width != null) out.width = item.width;
      if (item.height != null) out.height = item.height;
      if (item.truncated) out.truncated = true;
      return out;
    });
  }

  async copy(id) {
    const item = this.items.find((entry) => entry.id === id);
    if (!item) return { ok: false };
    try {
      if (item.type === 'image') {
        const buffer = this.buffers.get(id);
        if (!buffer) return { ok: false };
        await clipboard.write([
          new ClipboardItem({ 'image/png': new Blob([buffer], { type: 'image/png' }) }),
        ]);
        this.lastImageSig = `${buffer.length}:${hashBuffer(buffer)}`;
      } else if (item.type === 'text' || item.type === 'svg') {
        await clipboard.writeText(item.text);
        this.lastText = item.text;
      } else {
        return { ok: false };
      }
    } catch (err) {
      logger.warn('clipboard copy failed:', err.message);
      return { ok: false, error: err.message };
    }
    return { ok: true };
  }

  clear() {
    this.items = [];
    this.buffers.clear();
    this.emit('changed', []);
    return { ok: true };
  }
}

module.exports = new ClipboardService();
