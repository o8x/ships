'use strict';

window.ShipsConstants = {
  FALLBACK_VERSION: '0.0.0',
  COPY_FEEDBACK_MS: 1200,
  // 工具标题收起动画期间先锁住内容滚动，动画完成后再滚动内容。
  HEADER_COLLAPSE_LOCK_MS: 190,
  // Liquid Glass 表面透明度：glassOpacity(0–100，越大越透明) 映射到表面填充 alpha。
  // base = (100 - glassOpacity)/100 * GLASS_MAX_ALPHA，默认 80 → 0.08（现有观感）。
  GLASS_DEFAULT_OPACITY: 80,
  GLASS_MAX_ALPHA: 0.4,
  // 文件管理状态栏：所有提示的保留时长（到点惰性清除）。
  FILE_STATUS_TTL_MS: 30000,
  // 双击文件的默认打开方式：超过该体积、或属于下面的非文本类型时用系统默认程序「打开」，
  // 否则用 VS Code 打开。
  FILE_VSCODE_MAX_BYTES: 10 * 1024 * 1024,
  NON_TEXT_EXTENSIONS: [
    // 图片
    'png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'svg', 'ico', 'tif', 'tiff', 'heic', 'avif',
    // 文档（Word / Excel / PPT / PDF 等）
    'pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'odt', 'ods', 'odp', 'rtf',
    'pages', 'numbers', 'key',
    // 音视频
    'mp3', 'wav', 'flac', 'aac', 'm4a', 'ogg', 'mp4', 'mov', 'mkv', 'avi', 'webm', 'mpg', 'mpeg',
    // 压缩 / 镜像
    'zip', 'gz', 'tgz', 'bz2', 'xz', 'zst', 'tar', '7z', 'rar', 'dmg', 'iso',
    // 可执行 / 二进制
    'exe', 'dll', 'so', 'dylib', 'bin', 'app', 'pkg', 'deb', 'rpm',
    // 字体
    'ttf', 'otf', 'woff', 'woff2', 'eot',
  ],
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
