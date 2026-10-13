'use strict';

window.ShipsConstants = {
  FALLBACK_VERSION: '0.0.0',
  COPY_FEEDBACK_MS: 1200,
  DEBOUNCE_MS: 120,
  ACCENT_PRESETS: ['#2e6bfc', '#7c3aed', '#e5484d', '#f59e0b', '#10b981', '#0ea5e9', '#ec4899'],
  JSON_HIGHLIGHT_MAX_BYTES: 1024 * 1024,
  LANGUAGES: [
    { value: 'zh', label: '简体中文' },
    { value: 'en', label: 'English' },
  ],
  ANSI_COLORS: {
    reset: '\u001b[0m',
  },
  // SSH 目录浏览：文件按扩展名 / 文件名映射到 assets/icons 里的图标。
  // 目录固定用 folder，未命中的文件用 DEFAULT_FILE_ICON。
  FILE_TYPE_ICONS: {
    // 代码
    js: 'code', mjs: 'code', cjs: 'code', ts: 'code', jsx: 'code', tsx: 'code', vue: 'code',
    py: 'code', rb: 'code', go: 'code', rs: 'code', c: 'code', h: 'code', cc: 'code',
    cpp: 'code', hpp: 'code', cs: 'code', java: 'code', kt: 'code', swift: 'code',
    php: 'code', pl: 'code', lua: 'code', html: 'code', htm: 'code', css: 'code',
    scss: 'code', less: 'code', sql: 'code',
    // 脚本
    sh: 'terminal', bash: 'terminal', zsh: 'terminal', fish: 'terminal', ps1: 'terminal', bat: 'terminal',
    // 结构化数据 / 配置
    json: 'braces', jsonc: 'braces', yml: 'braces', yaml: 'braces', toml: 'braces', ini: 'braces',
    conf: 'braces', cfg: 'braces', env: 'braces', properties: 'braces', xml: 'braces',
    // 文本 / 文档
    md: 'doc', markdown: 'doc', txt: 'doc', log: 'doc', rst: 'doc', csv: 'doc', tsv: 'doc',
    doc: 'doc', docx: 'doc', pdf: 'doc', rtf: 'doc',
    // 图片
    png: 'image', jpg: 'image', jpeg: 'image', gif: 'image', webp: 'image', bmp: 'image',
    svg: 'image', ico: 'image', tif: 'image', tiff: 'image', heic: 'image', avif: 'image',
    // 音视频
    mp3: 'play', wav: 'play', flac: 'play', aac: 'play', m4a: 'play', ogg: 'play',
    mp4: 'play', mov: 'play', mkv: 'play', avi: 'play', webm: 'play', mpg: 'play',
    // 压缩包 / 镜像
    zip: 'archive', gz: 'archive', tgz: 'archive', bz2: 'archive', xz: 'archive', zst: 'archive',
    tar: 'archive', '7z': 'archive', rar: 'archive', dmg: 'archive', iso: 'archive',
  },
  FILE_NAME_ICONS: {
    makefile: 'code',
    dockerfile: 'code',
    license: 'doc',
    readme: 'doc',
  },
  DEFAULT_FILE_ICON: 'file',
  // IP 工具：端口测试可选协议（needsPort=false 时禁用端口输入）。
  // 需与 src/main/utils/net-test.js 的 PROTOCOLS 保持一致。
  NET_TEST_PROTOCOLS: [
    { value: 'tcp', label: 'TCP', tipKey: 'tipTcp', port: 'required' },
    { value: 'udp', label: 'UDP', tipKey: 'tipUdp', port: 'required' },
    // 标签保持短（单行 TAB 放得下），完整含义见 tipKey 文案。
    { value: 'http', label: 'HTTP', tipKey: 'tipHttp', port: 'required' },
    { value: 'icmp', label: 'ICMP', tipKey: 'tipIcmp', port: 'none' },
    { value: 'arp', label: 'ARP', tipKey: 'tipArp', port: 'none' },
    // 扫描应用单地址 / 网段都行，端口可留空（扫可用端口）；扫描主机需要网段。
    { value: 'scan-app', labelKey: 'scanApp', tipKey: 'tipScanApp', port: 'optional' },
    { value: 'scan-host', labelKey: 'scanHost', tipKey: 'tipScanHost', port: 'none', subnetOnly: true },
  ],
  NET_TEST_DEFAULT_PORT: 80,
  NET_TEST_SCAN_PREFIX_MIN: 16,
  NET_TEST_SCAN_PREFIX_MAX: 30,
};
