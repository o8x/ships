'use strict';

(function registerNutrientTool() {
  const { el, section, inputField, copyText, segmented, createSelect, debounce } = window.ShipsUI;
  const i18n = window.ShipsI18n;

  i18n.extend({
    zh: {
      nutrient: {
        hint: '输入每 100g 的营养成分，实时换算为能量与运动消耗',
        name: '商品名',
        namePlaceholder: '商品的名称',
        save: '保存',
        saved: '已保存',
        delete: '删除',
        confirmDelete: '确认删除？',
        deleted: '已删除',
        selectRecord: '选择记录',
        noRecords: '暂无记录',
        nameRequired: '请先输入商品名',
        energy: '能量 (kJ)',
        protein: '蛋白质 (g)',
        fat: '脂肪 (g)',
        carbohydrate: '碳水 (g)',
        sodium: '钠 (mg)',
        total: '商品总重 (g/ml)',
        results: '计算结果',
        salt: '盐',
        kcal: '千卡',
        kj: '千焦',
        run: '慢跑消耗',
        walk: '步行消耗',
        saltRemark: '1mg 钠 ≈ 2.5mg 盐',
        kcalRemark: '每天推荐摄入 2250kcal',
        kcalOver: '每天推荐摄入 2250kcal，已超出：{value}kcal',
        kjRemark: '每天推荐摄入 9410kJ',
        kjOver: '每天推荐摄入 9410kJ，已超出：{value}kJ',
        tdeeKcalRemark: '每日推荐（TDEE）{value}kcal',
        tdeeKcalOver: '每日推荐（TDEE）{value}kcal，已超出：{over}kcal',
        tdeeKjRemark: '每日推荐（TDEE）{value}kJ',
        tdeeKjOver: '每日推荐（TDEE）{value}kJ，已超出：{over}kJ',
        tdeeRatio: 'TDEE ÷ 每 100g',
        tdeeRatioValue: '≈ {value} 份',
        tdeeRatioHint: '填写 TDEE 后显示',
        runRemark: '{minutes} 分钟',
        walkRemark: '{minutes} 分钟（{steps}步）',
        km: '约 {value} 公里',
        copy: '复制输入与结果',
        copied: '已复制',
      },
      tdee: {
        title: 'TDEE 计算器',
        sex: '性别',
        male: '男',
        female: '女',
        age: '年龄（岁）',
        height: '身高（cm）',
        weight: '体重（kg）',
        activity: '活动水平',
        activityPlaceholder: '请选择',
        activitySedentary: '久坐（1.2）',
        activityLight: '轻度（1.375）',
        activityModerate: '中度（1.55）',
        activityActive: '高度（1.725）',
        activityVeryActive: '极高（1.9）',
        bmr: '基础代谢（BMR）',
        daily: '每日总消耗（TDEE）',
        formula: 'Mifflin-St Jeor · {activity}',
      },
    },
    en: {
      nutrient: {
        hint: 'Enter nutrition per 100g to convert into energy and exercise',
        name: 'Product name',
        namePlaceholder: 'Name of the product',
        save: 'Save',
        saved: 'Saved',
        delete: 'Delete',
        confirmDelete: 'Delete?',
        deleted: 'Deleted',
        selectRecord: 'Select record',
        noRecords: 'No records',
        nameRequired: 'Enter a product name first',
        energy: 'Energy (kJ)',
        protein: 'Protein (g)',
        fat: 'Fat (g)',
        carbohydrate: 'Carbs (g)',
        sodium: 'Sodium (mg)',
        total: 'Total weight (g/ml)',
        results: 'Results',
        salt: 'Salt',
        kcal: 'Kilocalories',
        kj: 'Kilojoules',
        run: 'Running burns',
        walk: 'Walking burns',
        saltRemark: '1mg sodium ≈ 2.5mg salt',
        kcalRemark: 'Recommended daily intake 2250kcal',
        kcalOver: 'Recommended 2250kcal, over by {value}kcal',
        kjRemark: 'Recommended daily intake 9410kJ',
        kjOver: 'Recommended 9410kJ, over by {value}kJ',
        tdeeKcalRemark: 'TDEE recommendation {value}kcal',
        tdeeKcalOver: 'TDEE recommendation {value}kcal, over by {over}kcal',
        tdeeKjRemark: 'TDEE recommendation {value}kJ',
        tdeeKjOver: 'TDEE recommendation {value}kJ, over by {over}kJ',
        tdeeRatio: 'TDEE ÷ per 100g',
        tdeeRatioValue: '≈ {value} servings',
        tdeeRatioHint: 'Shown after TDEE is filled',
        runRemark: '{minutes} min',
        walkRemark: '{minutes} min ({steps} steps)',
        km: 'about {value} km',
        copy: 'Copy input & result',
        copied: 'Copied',
      },
      tdee: {
        title: 'TDEE calculator',
        sex: 'Sex',
        male: 'Male',
        female: 'Female',
        age: 'Age (years)',
        height: 'Height (cm)',
        weight: 'Weight (kg)',
        activity: 'Activity level',
        activityPlaceholder: 'Select',
        activitySedentary: 'Sedentary (1.2)',
        activityLight: 'Light (1.375)',
        activityModerate: 'Moderate (1.55)',
        activityActive: 'Active (1.725)',
        activityVeryActive: 'Very active (1.9)',
        bmr: 'Basal metabolism (BMR)',
        daily: 'Daily total (TDEE)',
        formula: 'Mifflin-St Jeor · {activity}',
      },
    },
  });

  const FIELDS = [
    { key: 'energy', label: 'nutrient.energy', def: 0 },
    { key: 'protein', label: 'nutrient.protein', def: 0 },
    { key: 'fat', label: 'nutrient.fat', def: 0 },
    { key: 'carbohydrate', label: 'nutrient.carbohydrate', def: 0 },
    { key: 'sodium', label: 'nutrient.sodium', def: 0 },
    { key: 'total', label: 'nutrient.total', def: 100 },
  ];

  const ACTIVITIES = [
    { value: 'sedentary', factor: 1.2, label: 'tdee.activitySedentary' },
    { value: 'light', factor: 1.375, label: 'tdee.activityLight' },
    { value: 'moderate', factor: 1.55, label: 'tdee.activityModerate' },
    { value: 'active', factor: 1.725, label: 'tdee.activityActive' },
    { value: 'veryActive', factor: 1.9, label: 'tdee.activityVeryActive' },
  ];

  function mount(container) {
    const state = { products: [], tdee: null, ready: false, applying: false, activeName: null, confirmingDelete: false, deleteTimer: null };
    let saveTdee = null;

    const nameInput = el('input', {
      class: 'field min-w-0 flex-1',
      type: 'text',
      spellcheck: 'false',
      placeholder: i18n.t('nutrient.namePlaceholder'),
    });
    const saveBtn = el('button', { class: 'btn shrink-0', type: 'button' }, i18n.t('nutrient.save'));
    const recordSelect = createSelect({
      options: [],
      value: '',
      align: 'right',
      className: 'shrink-0',
      placeholder: i18n.t('nutrient.selectRecord'),
      onChange: (name) => loadProduct(name),
    });
    const nameRow = el('div', { class: 'flex items-center gap-2' });
    nameRow.append(nameInput, saveBtn, recordSelect.el);

    const inputs = {};
    const grid = el('div', { class: 'grid grid-cols-2 gap-2' });
    for (const field of FIELDS) {
      const input = el('input', { class: 'field font-mono', type: 'number', min: '0', spellcheck: 'false' });
      input.value = String(field.def);
      inputs[field.key] = input;
      grid.appendChild(inputField(i18n.t(field.label), input));
    }

    const inputSection = section();
    inputSection.append(nameRow, grid);

    const resultSection = section(i18n.t('nutrient.results'));
    const resultRows = {
      salt: makeResultRow(i18n.t('nutrient.salt')),
      kcal: makeResultRow(i18n.t('nutrient.kcal')),
      kj: makeResultRow(i18n.t('nutrient.kj')),
      tdeeRatio: makeResultRow(i18n.t('nutrient.tdeeRatio')),
      run: makeResultRow(i18n.t('nutrient.run')),
      walk: makeResultRow(i18n.t('nutrient.walk')),
    };
    for (const key of Object.keys(resultRows)) resultSection.appendChild(resultRows[key].root);

    const actions = el('div', { class: 'flex items-center gap-2' });
    const copyBtn = el('button', { class: 'btn', type: 'button' }, i18n.t('nutrient.copy'));
    actions.append(copyBtn);

    const tdeeSection = section(i18n.t('tdee.title'));
    let sexValue = '';
    const sexSegment = segmented(
      [
        { value: 'male', label: i18n.t('tdee.male') },
        { value: 'female', label: i18n.t('tdee.female') },
      ],
      sexValue,
      (value) => {
        sexValue = value;
        onTdeeChange();
      }
    );
    const sexWrap = el('div', { class: 'col-span-2' });
    sexWrap.appendChild(inputField(i18n.t('tdee.sex'), sexSegment.root));

    const ageInput = numberField('tdee.age', '');
    const heightInput = numberField('tdee.height', '');
    const weightInput = numberField('tdee.weight', '');
    const activitySelect = createSelect({
      options: ACTIVITIES.map((item) => ({ value: item.value, label: i18n.t(item.label) })),
      value: '',
      align: 'right',
      className: '',
      placeholder: i18n.t('tdee.activityPlaceholder'),
      onChange: () => onTdeeChange(),
    });

    const tdeeGrid = el('div', { class: 'grid grid-cols-2 gap-2' });
    tdeeGrid.append(
      sexWrap,
      inputField(i18n.t('tdee.age'), ageInput),
      inputField(i18n.t('tdee.height'), heightInput),
      inputField(i18n.t('tdee.weight'), weightInput),
      inputField(i18n.t('tdee.activity'), activitySelect.el)
    );

    const tdeeRows = {
      bmr: makeResultRow(i18n.t('tdee.bmr')),
      daily: makeResultRow(i18n.t('tdee.daily')),
    };
    tdeeSection.append(tdeeGrid, tdeeRows.bmr.root, tdeeRows.daily.root);

    container.append(inputSection, resultSection, actions, tdeeSection);

    function numberField(labelKey, value) {
      const input = el('input', { class: 'field font-mono', type: 'number', min: '0', spellcheck: 'false' });
      input.value = value;
      return input;
    }

    function makeResultRow(labelText) {
      const root = el('div', { class: 'flex items-center justify-between gap-2 rounded-card border border-border bg-surface px-2.5 py-1.5' });
      const left = el('div', { class: 'min-w-0 flex-1' });
      left.appendChild(el('div', { class: 'text-[10px] uppercase tracking-wide text-fg-muted' }, labelText));
      const value = el('div', { class: 'result-value' }, '—');
      const remark = el('div', { class: 'text-[10px] text-fg-muted' }, '');
      left.append(value, remark);
      root.appendChild(left);
      return { root, setValue: (v) => (value.textContent = v), setRemark: (r) => (remark.textContent = r) };
    }

    function num(key) {
      const value = Number(inputs[key].value);
      return Number.isFinite(value) && value > 0 ? value : 0;
    }

    let currentResults = [];

    function compute() {
      const energy = num('energy');
      const protein = num('protein');
      const fat = num('fat');
      const carbohydrate = num('carbohydrate');
      const sodium = num('sodium');
      const total = num('total') || 100;

      const salt = sodium * 2.5;
      const perKcal = energy * 0.2389 + protein / 4 + carbohydrate / 4 + fat / 9;
      const totalKcal = (perKcal / 100) * total;
      const totalKj = totalKcal * 4.184;
      const runKm = totalKcal / 90;
      const walkKm = totalKcal / 70;
      const steps = (walkKm * 1000 * 100) / 70;

      resultRows.salt.setValue(`${salt.toFixed(0)}mg (${(salt / 1000).toFixed(2)}g)`);
      resultRows.salt.setRemark(i18n.t('nutrient.saltRemark'));

      const per100Kcal = (totalKcal / total) * 100;
      const tdeeResult = calcTdee();
      const tdeeKcal = tdeeResult.tdee == null ? null : Math.round(tdeeResult.tdee);
      const tdeeKj = tdeeKcal == null ? null : Math.round(tdeeKcal * 4.184);

      resultRows.kcal.setValue(`${per100Kcal.toFixed(0)} / ${totalKcal.toFixed(0)}kcal`);
      if (tdeeKcal != null) {
        resultRows.kcal.setRemark(
          totalKcal > tdeeKcal
            ? i18n.t('nutrient.tdeeKcalOver', { value: tdeeKcal, over: (totalKcal - tdeeKcal).toFixed(0) })
            : i18n.t('nutrient.tdeeKcalRemark', { value: tdeeKcal })
        );
      } else {
        resultRows.kcal.setRemark(
          totalKcal > 2250
            ? i18n.t('nutrient.kcalOver', { value: (totalKcal - 2250).toFixed(0) })
            : i18n.t('nutrient.kcalRemark')
        );
      }

      resultRows.kj.setValue(`${((totalKj / total) * 100).toFixed(0)} / ${totalKj.toFixed(0)}kJ`);
      if (tdeeKj != null) {
        resultRows.kj.setRemark(
          totalKj > tdeeKj
            ? i18n.t('nutrient.tdeeKjOver', { value: tdeeKj, over: (totalKj - tdeeKj).toFixed(0) })
            : i18n.t('nutrient.tdeeKjRemark', { value: tdeeKj })
        );
      } else {
        resultRows.kj.setRemark(
          totalKj > 9410
            ? i18n.t('nutrient.kjOver', { value: (totalKj - 9410).toFixed(0) })
            : i18n.t('nutrient.kjRemark')
        );
      }

      if (tdeeKcal != null && per100Kcal > 0) {
        resultRows.tdeeRatio.setValue(
          i18n.t('nutrient.tdeeRatioValue', { value: (tdeeKcal / per100Kcal).toFixed(1) })
        );
        resultRows.tdeeRatio.setRemark('');
      } else {
        resultRows.tdeeRatio.setValue('—');
        resultRows.tdeeRatio.setRemark(i18n.t('nutrient.tdeeRatioHint'));
      }

      resultRows.run.setValue(i18n.t('nutrient.km', { value: runKm.toFixed(2) }));
      resultRows.run.setRemark(i18n.t('nutrient.runRemark', { minutes: (runKm * 7).toFixed(0) }));

      resultRows.walk.setValue(i18n.t('nutrient.km', { value: walkKm.toFixed(2) }));
      resultRows.walk.setRemark(
        i18n.t('nutrient.walkRemark', { minutes: (walkKm * 15).toFixed(1), steps: steps.toFixed(0) })
      );

      currentResults = [
        [i18n.t('nutrient.salt'), resultRows.salt],
        [i18n.t('nutrient.kcal'), resultRows.kcal],
        [i18n.t('nutrient.kj'), resultRows.kj],
        [i18n.t('nutrient.tdeeRatio'), resultRows.tdeeRatio],
        [i18n.t('nutrient.run'), resultRows.run],
        [i18n.t('nutrient.walk'), resultRows.walk],
      ];
    }

    function activityFactor() {
      const found = ACTIVITIES.find((item) => item.value === activitySelect.getValue());
      return found ? found.factor : null;
    }

    function calcTdee() {
      const age = Number(ageInput.value);
      const height = Number(heightInput.value);
      const weight = Number(weightInput.value);
      const factor = activityFactor();
      if (!sexValue || !factor || !(age > 0 && height > 0 && weight > 0)) return { bmr: null, tdee: null };
      const bmr = 10 * weight + 6.25 * height - 5 * age + (sexValue === 'female' ? -161 : 5);
      return { bmr, tdee: bmr * factor };
    }

    function tdeePayload() {
      const result = calcTdee();
      return {
        sex: sexValue,
        age: Number(ageInput.value) || 0,
        height: Number(heightInput.value) || 0,
        weight: Number(weightInput.value) || 0,
        activity: activitySelect.getValue(),
        bmr: result.bmr || 0,
        tdee: result.tdee || 0,
      };
    }

    function computeTdee() {
      const result = calcTdee();
      const activity = ACTIVITIES.find((item) => item.value === activitySelect.getValue());
      const remark = activity ? i18n.t('tdee.formula', { activity: i18n.t(activity.label) }) : '';
      if (result.bmr == null) {
        tdeeRows.bmr.setValue('—');
        tdeeRows.bmr.setRemark('');
        tdeeRows.daily.setValue('—');
        tdeeRows.daily.setRemark('');
        return;
      }
      const bmrKcal = Math.round(result.bmr);
      const tdeeKcal = Math.round(result.tdee);
      tdeeRows.bmr.setValue(`${bmrKcal} kcal / ${Math.round(bmrKcal * 4.184)} kJ`);
      tdeeRows.bmr.setRemark(remark);
      tdeeRows.daily.setValue(`${tdeeKcal} kcal / ${Math.round(tdeeKcal * 4.184)} kJ`);
      tdeeRows.daily.setRemark(remark);
    }

    saveTdee = debounce(() => {
      if (!state.ready || state.applying) return;
      window.ships.nutrient.saveTdee(tdeePayload()).catch(() => {});
    }, 350);

    function onTdeeChange() {
      computeTdee();
      compute();
      saveTdee();
    }

    function applyTdee(record) {
      if (!record) return;
      state.applying = true;
      sexValue = record.sex === 'female' || record.sex === 'male' ? record.sex : '';
      sexSegment.set(sexValue);
      ageInput.value = record.age != null ? String(record.age) : '';
      heightInput.value = record.height != null ? String(record.height) : '';
      weightInput.value = record.weight != null ? String(record.weight) : '';
      activitySelect.setValue(record.activity || '');
      computeTdee();
      compute();
      state.applying = false;
    }

    function renderRecords(selected) {
      const options = state.products.map((product) => ({ value: product.name, label: product.name }));
      recordSelect.setOptions(options.length ? options : [{ header: true, label: i18n.t('nutrient.noRecords') }]);
      recordSelect.setValue(selected || '');
    }

    function productPayload() {
      const product = { name: nameInput.value.trim() };
      for (const field of FIELDS) product[field.key] = Number(inputs[field.key].value) || 0;
      return product;
    }

    function applyProduct(product) {
      state.applying = true;
      nameInput.value = product.name;
      for (const field of FIELDS) {
        inputs[field.key].value = String(Number.isFinite(product[field.key]) ? product[field.key] : field.def);
      }
      state.applying = false;
      compute();
    }

    function loadProduct(name) {
      const product = state.products.find((item) => item.name === name);
      if (!product) return;
      applyProduct(product);
      state.activeName = product.name;
      state.confirmingDelete = false;
      if (state.deleteTimer) clearTimeout(state.deleteTimer);
      state.deleteTimer = null;
      updateActionButton();
    }

    function updateActionButton() {
      saveBtn.classList.toggle('btn-danger', Boolean(state.activeName));
      if (!state.activeName) saveBtn.textContent = i18n.t('nutrient.save');
      else if (state.confirmingDelete) saveBtn.textContent = i18n.t('nutrient.confirmDelete');
      else saveBtn.textContent = i18n.t('nutrient.delete');
    }

    function markEdited() {
      if (state.deleteTimer) clearTimeout(state.deleteTimer);
      state.deleteTimer = null;
      state.activeName = null;
      state.confirmingDelete = false;
      recordSelect.setValue('');
      updateActionButton();
    }

    function flash(button, key) {
      const original = button.textContent;
      button.textContent = i18n.t(key);
      button.style.color = 'var(--color-success)';
      setTimeout(() => {
        button.textContent = original;
        button.style.color = '';
      }, 1200);
    }

    async function saveCurrentProduct() {
      const name = nameInput.value.trim();
      if (!name) {
        nameInput.classList.add('invalid');
        nameInput.focus();
        return;
      }
      const result = await window.ships.nutrient.saveProduct(productPayload());
      if (!result || !result.ok) return;
      state.products = result.products || [];
      renderRecords(name);
      state.activeName = null;
      state.confirmingDelete = false;
      updateActionButton();
      nameInput.classList.remove('invalid');
      flash(saveBtn, 'nutrient.saved');
    }

    async function deleteCurrentProduct() {
      if (!state.activeName) return;
      if (!state.confirmingDelete) {
        state.confirmingDelete = true;
        updateActionButton();
        state.deleteTimer = setTimeout(() => {
          state.deleteTimer = null;
          state.confirmingDelete = false;
          updateActionButton();
        }, 4000);
        return;
      }
      if (state.deleteTimer) clearTimeout(state.deleteTimer);
      state.deleteTimer = null;
      const name = state.activeName;
      const result = await window.ships.nutrient.deleteProduct(name);
      if (!result || !result.ok) {
        state.confirmingDelete = false;
        updateActionButton();
        return;
      }
      state.products = result.products || [];
      renderRecords('');
      state.activeName = null;
      state.confirmingDelete = false;
      updateActionButton();
      flash(saveBtn, 'nutrient.deleted');
    }

    function onActionClick() {
      if (state.activeName) deleteCurrentProduct();
      else saveCurrentProduct();
    }

    nameInput.addEventListener('input', () => {
      nameInput.classList.remove('invalid');
      markEdited();
    });

    saveBtn.addEventListener('click', onActionClick);

    copyBtn.addEventListener('click', async () => {
      const lines = [];
      if (nameInput.value.trim()) lines.push(`${i18n.t('nutrient.name')}: ${nameInput.value.trim()}`);
      for (const field of FIELDS) lines.push(`${i18n.t(field.label)}: ${inputs[field.key].value}`);
      lines.push('');
      for (const [label, row] of currentResults) {
        lines.push(`${label}: ${row.root.querySelector('.result-value').textContent}`);
      }
      if (await copyText(lines.join('\n'))) flash(copyBtn, 'nutrient.copied');
    });

    for (const field of FIELDS) {
      inputs[field.key].addEventListener('input', () => {
        compute();
        if (!state.applying) markEdited();
      });
    }
    for (const input of [ageInput, heightInput, weightInput]) {
      input.addEventListener('input', onTdeeChange);
    }

    updateActionButton();
    compute();
    computeTdee();

    window.ships.nutrient
      .get()
      .then((data) => {
        state.products = (data && data.products) || [];
        state.tdee = (data && data.tdee) || null;
        renderRecords();
        applyTdee(state.tdee);
        state.ready = true;
      })
      .catch(() => {
        state.ready = true;
      });
  }

  window.ShipsToolRegistry.register({ id: 'nutrient', icon: 'nutrition', mount });
})();
