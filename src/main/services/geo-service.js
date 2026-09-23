'use strict';

const geoipDatabase = require('../../../assets/geoip.json');

const INDEX_COUNTRY = 1;
const INDEX_PROVINCE = 2;
const INDEX_CITY = 3;
const INDEX_ISP = 4;
const INDEX_INTRANET = 5;

const city_code = geoipDatabase['cn_city_name'];
const ISO3116 = geoipDatabase['iso3116'];
const china_province = geoipDatabase['cn_province_name'];
const ispMap = geoipDatabase['isp_name'];
const index_table = {
  [INDEX_COUNTRY]: geoipDatabase['country_index'],
  [INDEX_PROVINCE]: geoipDatabase['province_index'],
  [INDEX_CITY]: geoipDatabase['city_index'],
  [INDEX_ISP]: geoipDatabase['isp_index'],
  [INDEX_INTRANET]: geoipDatabase['intranet_index'],
};

function parse_ipv4(ip) {
  if (typeof ip !== 'string') return 0;
  const parts = ip.split('.');
  if (parts.length !== 4) return 0;
  let n = 0;
  for (const p of parts) {
    const v = Number(p);
    if (!Number.isInteger(v) || v < 0 || v > 255) return 0;
    n = n * 256 + v;
  }
  return n >>> 0;
}

function parse_cidr_to_range(cidr) {
  const slash = cidr.indexOf('/');
  if (slash < 0) throw new Error('invalid cidr');
  const ip = cidr.slice(0, slash);
  const ones = Number(cidr.slice(slash + 1));
  if (!Number.isInteger(ones) || ones < 0 || ones > 32) throw new Error('invalid mask');
  const ip_u32 = parse_ipv4(ip);
  if (ip_u32 === 0 && ip !== '0.0.0.0') throw new Error('not an IPv4 address');
  const net_mask = ones === 0 ? 0 : (0xffffffff << (32 - ones)) >>> 0;
  const host_mask = ~net_mask >>> 0;
  const start = (ip_u32 & net_mask) >>> 0;
  const end = (start | host_mask) >>> 0;
  return [start, end];
}

function find_index(items, addr) {
  if (!items) return null;
  for (const it of items) {
    if (addr >= it[0] && addr <= it[1]) return it;
  }
  return null;
}

function base_strip_dot(s) {
  if (!s) return '';
  const idx = s.lastIndexOf('/');
  const base = idx >= 0 ? s.slice(idx + 1) : s;
  return base.replace('.', '');
}

function buildInfo(raw) {
  const info = {
    iso_3166: '',
    country: base_strip_dot(raw.country),
    province: base_strip_dot(raw.province),
    city: base_strip_dot(raw.city),
    isp: base_strip_dot(raw.isp),
  };

  info.iso_3166 = info.country;
  info.country = info.iso_3166;
  info.province = info.province.replace(/^[CN-]+/, '');

  if (ISO3116[info.country]) info.country = ISO3116[info.country];
  if (china_province[info.province]) info.province = china_province[info.province];
  if (city_code[info.city]) info.city = city_code[info.city];

  if (info.province === info.city) info.city = '';

  if (info.iso_3166 === 'TW') {
    info.city = info.province;
    info.province = '台湾';
  }

  if (ispMap[info.isp]) info.isp = ispMap[info.isp];

  const out = {};
  for (const key of ['iso_3166', 'country', 'province', 'city', 'isp']) {
    if (info[key]) out[key] = info[key];
  }
  return out;
}

function lookup(addr) {
  const ip = parse_ipv4(addr);
  if (ip === 0) return null;

  if (find_index(index_table[INDEX_INTRANET]['intranet'], ip)) {
    return buildInfo({ isp: '保留地址' });
  }

  for (const [code, items] of Object.entries(index_table[INDEX_COUNTRY])) {
    if (!find_index(items, ip)) continue;

    const raw = { country: code };

    for (const [province, p_items] of Object.entries(index_table[INDEX_PROVINCE])) {
      if (!province.startsWith(code)) continue;
      if (!find_index(p_items, ip)) continue;

      raw.province = province;

      for (const [isp, isp_items] of Object.entries(index_table[INDEX_ISP])) {
        if (find_index(isp_items, ip)) {
          raw.isp = isp;
          break;
        }
      }

      if (code !== 'country/CN') return buildInfo(raw);

      for (const [city, c_items] of Object.entries(index_table[INDEX_CITY])) {
        if (find_index(c_items, ip)) {
          raw.city = city;
          return buildInfo(raw);
        }
      }
    }
  }

  return null;
}

module.exports = { lookup, parse_ipv4, parse_cidr_to_range };
