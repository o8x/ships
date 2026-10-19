'use strict';

const fs = require('fs');
const { NUTRIENT_FILE } = require('../utils/paths');
const { readJson, writeJson } = require('../utils/json-store');

let state = readJson(NUTRIENT_FILE, null);

if (!state || typeof state !== 'object') state = { products: {}, tdee: null };
if (!state.products || typeof state.products !== 'object') state.products = {};
if (!('tdee' in state)) state.tdee = null;

function snapshot() {
  const products = Object.values(state.products)
    .slice()
    .sort((a, b) => (b.savedAt || 0) - (a.savedAt || 0));
  return { products, tdee: state.tdee || null };
}

function saveProduct(input) {
  const name = String((input && input.name) || '').trim();
  if (!name) return { ok: false, error: 'name-required' };
  const product = { name };
  for (const key of ['energy', 'protein', 'fat', 'carbohydrate', 'sodium', 'total']) {
    const value = Number(input && input[key]);
    product[key] = Number.isFinite(value) ? value : 0;
  }
  product.savedAt = Date.now();

  // 按商品名去重（忽略大小写与首尾空格）；同名覆盖旧记录。
  const existing = Object.keys(state.products).find(
    (key) => key.trim().toLowerCase() === name.toLowerCase()
  );
  if (existing) delete state.products[existing];
  state.products[name] = product;
  writeJson(NUTRIENT_FILE, state);
  return { ok: true, ...snapshot() };
}

function deleteProduct(name) {
  const wanted = String(name || '').trim().toLowerCase();
  const existing = Object.keys(state.products).find((key) => key.trim().toLowerCase() === wanted);
  if (!existing) return { ok: false, error: 'not-found' };
  delete state.products[existing];
  writeJson(NUTRIENT_FILE, state);
  return { ok: true, ...snapshot() };
}

function saveTdee(input) {
  const sex = input && input.sex === 'female' ? 'female' : 'male';
  const activity = String((input && input.activity) || 'moderate');
  const record = {
    sex,
    age: Number(input && input.age) || 0,
    height: Number(input && input.height) || 0,
    weight: Number(input && input.weight) || 0,
    activity,
    bmr: Number(input && input.bmr) || 0,
    tdee: Number(input && input.tdee) || 0,
    savedAt: Date.now(),
  };
  state.tdee = record;
  writeJson(NUTRIENT_FILE, state);
  return { ok: true, ...snapshot() };
}

function get() {
  return { ok: true, ...snapshot() };
}

function forget() {
  state = { products: {}, tdee: null };
  try {
    fs.rmSync(NUTRIENT_FILE, { force: true });
  } catch (err) {
    /* ignore */
  }
}

module.exports = { get, saveProduct, deleteProduct, saveTdee, forget };
