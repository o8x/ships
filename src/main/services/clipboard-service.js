'use strict';

const { clipboard, nativeImage, ClipboardItem } = require('electron');
const { EventEmitter } = require('events');
const logger = require('../utils/logger');

const MAX_ITEMS = 5;
const MAX_TEXT_LENGTH = 100000;
const POLL_INTERVAL_MS = 1200;
const THUMB_WIDTH = 120;

function hashBuffer(buffer) {
  let hash = 5381;
  for (let i = 0; i < buffer.length; i++) hash = ((hash * 33) ^ buffer[i]) >>> 0;
  return hash;
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
  }

  start() {
    if (this.timer) return;
    this.timer = setInterval(() => this.poll(), POLL_INTERVAL_MS);
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
        this.push({
          type: 'text',
          text: truncated ? text.slice(0, MAX_TEXT_LENGTH) : text,
          truncated,
        });
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
    while (this.items.length > MAX_ITEMS) {
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
      } else if (item.type === 'text') {
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
