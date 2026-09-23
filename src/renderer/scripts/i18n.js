'use strict';

window.ShipsI18n = (function createI18n() {
  const dict = {
    zh: {
      appName: 'Ships',
      settings: '设置',
      emptyTools: '暂无可用工具',
      common: {
        copy: '复制',
        copied: '已复制',
        clear: '清空',
        reset: '重置',
        now: '现在',
        close: '关闭',
        cancel: '取消',
        save: '保存',
        delete: '删除',
        edit: '编辑',
        add: '新增',
        confirm: '确定',
        unknown: '未知',
        loading: '加载中',
      },
      tools: {
        timestamp: '时间戳转换',
        ipNumber: 'IP 与数字转换',
        subnet: '网段与掩码计算',
        radix: '进制转换',
        stringCodec: '字符串编码转换',
        json: 'JSON 格式化',
        ssh: 'SSH 管理',
        clipboard: '剪贴板',
        encode: '编码转换',
        hash: '哈希计算',
      },
    },
    en: {
      appName: 'Ships',
      settings: 'Settings',
      emptyTools: 'No tools available',
      common: {
        copy: 'Copy',
        copied: 'Copied',
        clear: 'Clear',
        reset: 'Reset',
        now: 'Now',
        close: 'Close',
        cancel: 'Cancel',
        save: 'Save',
        delete: 'Delete',
        edit: 'Edit',
        add: 'Add',
        confirm: 'OK',
        unknown: 'Unknown',
        loading: 'Loading',
      },
      tools: {
        timestamp: 'Timestamp',
        ipNumber: 'IP & Number',
        subnet: 'Subnet & Mask',
        radix: 'Radix',
        stringCodec: 'String Codec',
        json: 'JSON',
        ssh: 'SSH',
        clipboard: 'Clipboard',
        encode: 'Encode',
        hash: 'Hash',
      },
    },
  };

  let locale = 'zh';

  function lookup(target, key) {
    return key.split('.').reduce((acc, part) => (acc == null ? acc : acc[part]), target);
  }

  return {
    extend(extra) {
      for (const lang of Object.keys(extra)) {
        dict[lang] = Object.assign({}, dict[lang] || {}, extra[lang]);
      }
    },
    setLocale(next) {
      locale = dict[next] ? next : 'zh';
    },
    getLocale() {
      return locale;
    },
    t(key, vars) {
      let value = lookup(dict[locale], key);
      if (value == null) value = lookup(dict.zh, key);
      if (value == null) return key;
      if (vars) {
        value = value.replace(/\{(\w+)\}/g, (m, k) =>
          Object.prototype.hasOwnProperty.call(vars, k) ? vars[k] : m
        );
      }
      return value;
    },
  };
})();
