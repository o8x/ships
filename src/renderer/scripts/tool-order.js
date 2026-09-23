'use strict';

// 顶部 TAB 工具顺序：改这个数组即可调整图标区顺序。
// 未在此列出的工具会按注册顺序追加到末尾。id 对应各工具注册时的 id。
window.ShipsToolOrder = [
  'ssh', // SSH 管理
  'encode', // 编码转换（字符串 / Base64 / 十六进制 / URL / ASCII）
  'timestamp', // 时间戳转换
  'ipNumber', // IP 与数字转换
  'subnet', // 网段与掩码计算
  'radix', // 进制转换
  'hash', // 哈希计算（MD5 / SHA1 / SHA256）
  'json', // JSON 格式化
  'clipboard', // 剪贴板
  'nutrient', // 营养成分
];
