'use strict';

(function registerNutrientTool() {
  const { el, section, inputField, persistState, copyText, Icons } = window.ShipsUI;
  const i18n = window.ShipsI18n;

  i18n.extend({
    zh: {
      nutrient: {
        hint: '输入每 100g 的营养成分，实时换算为能量与运动消耗',
        name: '商品名',
        namePlaceholder: '商品的名称',
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
        runRemark: '{minutes} 分钟',
        walkRemark: '{minutes} 分钟（{steps}步）',
        km: '约 {value} 公里',
        clear: '清空',
        copyInput: '复制输入',
        copyResult: '复制结果',
        copied: '已复制',
      },
    },
    en: {
      nutrient: {
        hint: 'Enter nutrition per 100g to convert into energy and exercise',
        name: 'Product name',
        namePlaceholder: 'Name of the product',
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
        runRemark: '{minutes} min',
        walkRemark: '{minutes} min ({steps} steps)',
        km: 'about {value} km',
        clear: 'Clear',
        copyInput: 'Copy input',
        copyResult: 'Copy result',
        copied: 'Copied',
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

  function mount(container) {
    const store = persistState('nutrient');

    const nameInput = el('input', {
      class: 'field',
      type: 'text',
      spellcheck: 'false',
      placeholder: i18n.t('nutrient.namePlaceholder'),
    });
    const nameWrap = inputField(i18n.t('nutrient.name'), nameInput);

    const inputs = {};
    const grid = el('div', { class: 'grid grid-cols-2 gap-x-2' });
    for (const field of FIELDS) {
      const input = el('input', { class: 'field font-mono', type: 'number', min: '0', spellcheck: 'false' });
      input.value = String(field.def);
      inputs[field.key] = input;
      grid.appendChild(inputField(i18n.t(field.label), input));
    }

    const inputSection = section();
    inputSection.appendChild(nameWrap);
    inputSection.appendChild(grid);

    const inputActions = el('div', { class: 'mt-1 flex items-center gap-2' });
    const clearBtn = el('button', { class: 'btn', type: 'button' }, i18n.t('nutrient.clear'));
    const copyInputBtn = el('button', { class: 'btn', type: 'button' }, i18n.t('nutrient.copyInput'));
    inputActions.append(clearBtn, copyInputBtn);
    inputSection.appendChild(inputActions);

    // Results
    const resultSection = section(i18n.t('nutrient.results'));
    const resultRows = {
      salt: makeResultRow(i18n.t('nutrient.salt')),
      kcal: makeResultRow(i18n.t('nutrient.kcal')),
      kj: makeResultRow(i18n.t('nutrient.kj')),
      run: makeResultRow(i18n.t('nutrient.run')),
      walk: makeResultRow(i18n.t('nutrient.walk')),
    };
    for (const key of Object.keys(resultRows)) resultSection.appendChild(resultRows[key].root);

    const resultActions = el('div', { class: 'mt-1 flex items-center gap-2' });
    const copyResultBtn = el('button', { class: 'btn', type: 'button' }, i18n.t('nutrient.copyResult'));
    resultActions.appendChild(copyResultBtn);
    resultSection.appendChild(resultActions);

    container.append(inputSection, resultSection);

    function makeResultRow(labelText) {
      const root = el('div', { class: 'mb-2.5 flex items-center justify-between gap-2 rounded-card border border-border bg-surface px-2.5 py-1.5' });
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
      const perKj = perKcal * 4.184;
      const totalKj = totalKcal * 4.184;
      const runKm = totalKcal / 90;
      const walkKm = totalKcal / 70;
      const steps = (walkKm * 1000 * 100) / 70;

      resultRows.salt.setValue(`${salt.toFixed(0)}mg (${(salt / 1000).toFixed(2)}g)`);
      resultRows.salt.setRemark(i18n.t('nutrient.saltRemark'));

      resultRows.kcal.setValue(`${((totalKcal / total) * 100).toFixed(0)} / ${totalKcal.toFixed(0)}kcal`);
      resultRows.kcal.setRemark(
        totalKcal > 2250
          ? i18n.t('nutrient.kcalOver', { value: (totalKcal - 2250).toFixed(0) })
          : i18n.t('nutrient.kcalRemark')
      );

      resultRows.kj.setValue(`${((totalKj / total) * 100).toFixed(0)} / ${totalKj.toFixed(0)}kJ`);
      resultRows.kj.setRemark(
        totalKj > 9410
          ? i18n.t('nutrient.kjOver', { value: (totalKj - 9410).toFixed(0) })
          : i18n.t('nutrient.kjRemark')
      );

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
        [i18n.t('nutrient.run'), resultRows.run],
        [i18n.t('nutrient.walk'), resultRows.walk],
      ];
    }

    function saveState() {
      const state = { label: nameInput.value };
      for (const field of FIELDS) state[field.key] = inputs[field.key].value;
      store.save(state);
    }

    function flash(button) {
      const original = button.textContent;
      button.textContent = i18n.t('nutrient.copied');
      button.style.color = 'var(--color-success)';
      setTimeout(() => {
        button.textContent = original;
        button.style.color = '';
      }, 1200);
    }

    clearBtn.addEventListener('click', () => {
      nameInput.value = '';
      for (const field of FIELDS) inputs[field.key].value = String(field.def);
      store.clear();
      compute();
    });

    copyInputBtn.addEventListener('click', async () => {
      const lines = [];
      if (nameInput.value.trim()) lines.push(`${i18n.t('nutrient.name')}: ${nameInput.value.trim()}`);
      for (const field of FIELDS) lines.push(`${i18n.t(field.label)}: ${inputs[field.key].value}`);
      if (await copyText(lines.join('\n'))) flash(copyInputBtn);
    });

    copyResultBtn.addEventListener('click', async () => {
      const lines = currentResults.map(
        ([label, row]) => `${label}: ${row.root.querySelector('.result-value').textContent}`
      );
      if (await copyText(lines.join('\n'))) flash(copyResultBtn);
    });

    nameInput.addEventListener('input', saveState);
    for (const field of FIELDS) {
      inputs[field.key].addEventListener('input', () => {
        compute();
        saveState();
      });
    }

    compute();

    store.load((saved) => {
      if (!saved) return;
      if (saved.label != null) nameInput.value = saved.label;
      for (const field of FIELDS) {
        if (saved[field.key] != null) inputs[field.key].value = String(saved[field.key]);
      }
      compute();
    });
  }

  window.ShipsToolRegistry.register({ id: 'nutrient', icon: 'nutrition', mount });
})();
