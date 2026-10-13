'use strict';

window.ShipsI18n = (function createI18n() {
  const dict = {
    zh: {
      appName: 'Ships',
      settings: '设置',
      networkTest: '网络测试',
      terminal: '终端（置顶）',
      fileManager: '文件管理',
      themeSystem: '外观：跟随系统',
      themeLight: '外观：浅色',
      themeDark: '外观：深色',
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
        pin: '固定悬浮',
        unpin: '取消固定',
      },
      tools: {
        timestamp: '时间戳转换',
        subnet: 'IP / 网段',
        radix: '进制转换',
        json: 'JSON 格式化',
        ssh: 'SSH 管理',
        clipboard: '剪贴板',
        encode: '编码转换',
        hash: '哈希计算',
        nutrient: '营养成分',
      },
      toolDesc: {
        timestamp: '秒 / 毫秒 / 纳秒与日期互转',
        subnet: 'IP 进制与网段 / 掩码计算，含归属地与网络测试',
        radix: '2–36 进制之间实时换算',
        json: '粘贴 JSON 自动原地格式化与结构查看',
        ssh: '读取 ~/.ssh/config，点击或双击在 iTerm 连接',
        clipboard: '最近的剪贴板记录，支持复制与清空',
        encode: '字符串与 Base64 / 十六进制 / URL / ASCII 互转',
        hash: '计算文本或文件的 MD5 / SHA1 / SHA256',
        nutrient: '营养成分换算为能量与运动消耗',
      },
    },
    en: {
      appName: 'Ships',
      settings: 'Settings',
      networkTest: 'Network test',
      terminal: 'Terminal (on top)',
      fileManager: 'Files',
      themeSystem: 'Appearance: system',
      themeLight: 'Appearance: light',
      themeDark: 'Appearance: dark',
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
        pin: 'Keep on top',
        unpin: 'Unpin',
      },
      tools: {
        timestamp: 'Timestamp',
        subnet: 'IP / Subnet',
        radix: 'Radix',
        json: 'JSON',
        ssh: 'SSH',
        clipboard: 'Clipboard',
        encode: 'Encode',
        hash: 'Hash',
        nutrient: 'Nutrition',
      },
      toolDesc: {
        timestamp: 'Convert between s / ms / ns and dates',
        subnet: 'IP bases and subnet / mask, with location and network test',
        radix: 'Live conversion across bases 2–36',
        json: 'Paste JSON to format in place and view its structure',
        ssh: 'Read ~/.ssh/config; click or double-click to open in iTerm',
        clipboard: 'Recent clipboard items with copy and clear',
        encode: 'Text ↔ Base64 / Hex / URL / ASCII',
        hash: 'MD5 / SHA1 / SHA256 of text or a file',
        nutrient: 'Convert nutrition into energy and exercise',
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
