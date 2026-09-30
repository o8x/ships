'use strict';

// 窗口几何记忆的纯计算：屏幕签名 / 匹配 + 把记忆里的位置与尺寸夹回屏幕工作区。
// 不依赖 electron（只吃普通对象），便于用 node 直接跑断言；调用方见 window-manager。

/* 只接受数值（含数字字符串）；null / '' / 布尔等「像数字的空值」一律走 fallback，
   否则 Number(null) === 0 会被当成一个合法坐标。 */
function clampNumber(value, min, max, fallback) {
  if (value === null || value === undefined || value === '' || typeof value === 'boolean') return fallback;
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(min, Math.min(max, Math.trunc(number)));
}

/* 屏幕签名：id + 缩放 + 位置 / 分辨率。任一不同都视为「另一块屏幕」——
   分辨率 / 排列变了以后，记忆里的绝对坐标不再可靠，退回默认居中更安全。 */
function displaySignature(display) {
  if (!display || !display.bounds) return null;
  const bounds = display.bounds;
  return {
    id: display.id,
    scaleFactor: display.scaleFactor,
    bounds: { x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height },
  };
}

function displayBySignature(displays, signature) {
  if (!signature || !signature.bounds || !Array.isArray(displays)) return null;
  const saved = signature.bounds;
  const found = displays.find((display) => {
    const bounds = display.bounds || {};
    return (
      display.id === signature.id &&
      display.scaleFactor === signature.scaleFactor &&
      bounds.x === saved.x &&
      bounds.y === saved.y &&
      bounds.width === saved.width &&
      bounds.height === saved.height
    );
  });
  return found || null;
}

/* 记忆里的几何 → 真正可用的几何：尺寸不小于最小尺寸、不超过屏幕工作区，
   位置夹回工作区（超屏 / 换分辨率后不会跑到看不见的地方）。缺尺寸或位置时
   分别退回 fallbackSize 与「工作区居中」。 */
function clampBounds(bounds, display, fallbackSize, minSize) {
  const work = (display && display.workArea) || { x: 0, y: 0, width: 0, height: 0 };
  const fallback = fallbackSize || {};
  const min = minSize || {};
  const minWidth = clampNumber(min.width, 1, 10000, 480);
  const minHeight = clampNumber(min.height, 1, 10000, 320);
  const workWidth = clampNumber(work.width, minWidth, 100000, minWidth);
  const workHeight = clampNumber(work.height, minHeight, 100000, minHeight);
  const workX = clampNumber(work.x, -100000, 100000, 0);
  const workY = clampNumber(work.y, -100000, 100000, 0);
  const width = clampNumber(bounds && bounds.width, minWidth, workWidth, clampNumber(fallback.width, minWidth, 10000, minWidth));
  const height = clampNumber(bounds && bounds.height, minHeight, workHeight, clampNumber(fallback.height, minHeight, 10000, minHeight));
  return {
    width,
    height,
    x: clampNumber(bounds && bounds.x, workX, workX + workWidth - width, Math.round(workX + (workWidth - width) / 2)),
    y: clampNumber(bounds && bounds.y, workY, workY + workHeight - height, Math.round(workY + (workHeight - height) / 2)),
  };
}

module.exports = { clampNumber, displaySignature, displayBySignature, clampBounds };
