(() => {
  'use strict';

  const byId = id => document.getElementById(id);
  const form = byId('bank-form');
  const template = byId('payslip-template');
  const bank = byId('teacher-bank');
  const otherBank = byId('other-bank-name');
  const holder = byId('account-holder');
  const account = byId('account-number');
  const saveButton = byId('save-slip');
  const printButton = byId('print-slip');
  const status = byId('save-status');
  const local = (zh, en) => document.documentElement.lang === 'zh-CN' ? zh : en;
  let saving = false;
  let saved = false;

  function updatePreview() {
    document.body.dataset.template = template.value;
    let ready = true;
    if (bank) {
      const isOther = bank.value === '__other_bank__';
      byId('other-bank-field').hidden = !isOther;
      otherBank.disabled = !isOther || saving || saved;
      otherBank.required = isOther;
      const bankName = isOther ? otherBank.value.trim() : bank.value;
      const accountHolder = holder.value.trim();
      const digits = account.value.trim().replace(/[ -]/g, '');
      const validNumber = /^[0-9]{5,34}$/.test(digits);
      const invalidNumber = Boolean(account.value.trim()) && !validNumber;
      byId('slip-bank').textContent = bankName || '—';
      byId('slip-holder').textContent = accountHolder || '—';
      byId('slip-number').textContent = validNumber ? digits : '—';
      account.setAttribute('aria-invalid', String(invalidNumber));
      byId('bank-number-hint').hidden = !invalidNumber;
      ready = Boolean(bankName && accountHolder && validNumber);
    }
    document.body.toggleAttribute('data-bank-ready', ready);
    if (saveButton) saveButton.disabled = !ready || saving || saved;
    if (printButton) printButton.disabled = !ready;
    return ready;
  }

  // Render the same labels and values shown in the preview, using the device's
  // font fallback for names and subjects in any supported writing system.
  async function renderPages() {
    await document.fonts.ready;
    const width = 595, height = 842, margin = 36, usable = width - 2 * margin;
    const bottom = height - 48;
    const ink = '#24212d', muted = '#545060', purple = '#5942a9', pale = '#f4f1fa', rule = '#e3deeb';
    const canvas = document.createElement('canvas');
    canvas.width = 1190;
    canvas.height = 1684;
    const ctx = canvas.getContext('2d', {alpha: false});
    if (!ctx) throw Error('canvas');
    ctx.scale(2, 1684 / height);
    ctx.textBaseline = 'top';
    const fontFamily = 'Arial, "Microsoft YaHei", "Noto Sans CJK SC", sans-serif';
    const paper = document.querySelector('.paper');
    const name = paper.querySelector('h1').textContent;
    const institution = paper.querySelector('.institution').textContent;
    const reference = paper.querySelector('.reference').textContent;
    const pages = [];
    let y = 0;

    function font(size, bold) {
      ctx.font = `${bold ? 700 : 400} ${size}px ${fontFamily}`;
    }

    function wrap(value, maxWidth) {
      const lines = [];
      for (const paragraph of value.split('\n')) {
        let line = '';
        for (const word of paragraph.split(/\s+/)) {
          if (!word) continue;
          const joined = line ? line + ' ' + word : word;
          if (ctx.measureText(joined).width <= maxWidth) {
            line = joined;
            continue;
          }
          if (line) lines.push(line);
          line = '';
          for (const letter of word) {
            if (line && ctx.measureText(line + letter).width > maxWidth) {
              lines.push(line);
              line = '';
            }
            line += letter;
          }
        }
        lines.push(line);
      }
      return lines;
    }

    function linesText(lines, x, top, lineHeight, color, align = 'left') {
      ctx.fillStyle = color;
      ctx.textAlign = align;
      lines.forEach((line, index) => ctx.fillText(line, x, top + lineHeight * index));
    }

    function text(value, x, top, maxWidth, {size = 11, bold = false, color = ink, align = 'left'} = {}) {
      font(size, bold);
      const lines = wrap(value, maxWidth);
      linesText(lines, x, top, size + 4, color, align);
      return lines.length * (size + 4);
    }

    function box(color, x, top, boxWidth, boxHeight) {
      ctx.fillStyle = color;
      ctx.fillRect(x, top, boxWidth, boxHeight);
    }

    function beginPage() {
      box('#ffffff', 0, 0, width, height);
      y = margin;
      if (pages.length) {
        text(name, margin, y, usable / 2, {size: 13, bold: true});
        text(reference, width - margin, y, usable / 2, {size: 9, color: muted, align: 'right'});
        y += 28;
      }
    }

    async function finishPage() {
      if (pages.length >= 40) throw Error('size');
      box(rule, margin, height - 39, usable, 1);
      text(reference, margin, height - 31, usable / 2, {size: 8, color: muted});
      text(String(pages.length + 1), width - margin, height - 31, 48, {size: 8, color: muted, align: 'right'});
      const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', .96));
      if (!blob) throw Error('canvas');
      pages.push(blob);
    }

    async function space(h) {
      if (y + h <= bottom) return;
      await finishPage();
      beginPage();
    }

    function header() {
      box(purple, margin, y, usable, 3);
      y += 14;
      const centred = template.value === 'centered';
      const brand = template.value === 'brand';
      if (brand) {
        font(13, true);
        const institutionLines = wrap(institution, usable - 32);
        const bandHeight = institutionLines.length * 17 + 75;
        box(purple, margin, y, usable, bandHeight);
        linesText(institutionLines, margin + 16, y + 12, 17, '#ffffff');
        const titleY = y + 12 + institutionLines.length * 17;
        text(name, margin + 16, titleY, usable - 32, {size: 24, bold: true, color: '#ffffff'});
        text(reference, margin + 16, titleY + 34, usable - 32, {size: 9, color: '#ffffff'});
        y += bandHeight + 16;
        return;
      }
      const align = centred ? 'center' : 'left';
      const x = centred ? width / 2 : margin;
      y += text(institution, x, y, usable, {size: 13, bold: true, color: purple, align}) + 5;
      y += text(name, x, y, usable, {size: 24, bold: true, align}) + 6;
      y += text(reference, x, y, usable, {size: 9, color: muted, align}) + 18;
    }

    function information(list) {
      const items = [...list.children];
      const cellWidth = usable / items.length;
      font(12, true);
      const values = items.map(item => wrap(item.querySelector('dd').textContent.trim(), cellWidth - 22));
      font(10, false);
      const labels = items.map(item => wrap(item.querySelector('dt').textContent.trim(), cellWidth - 22));
      const labelHeight = Math.max(...labels.map(lines => lines.length)) * 14;
      const boxHeight = 25 + labelHeight + Math.max(...values.map(lines => lines.length)) * 16;
      box(pale, margin, y, usable, boxHeight);
      items.forEach((_, index) => {
        const x = margin + cellWidth * index + 11;
        font(10, false);
        linesText(labels[index], x, y + 9, 14, muted);
        font(12, true);
        linesText(values[index], x, y + 11 + labelHeight, 16, ink);
      });
      y += boxHeight + 18;
    }

    function earnings(list) {
      for (const entry of list.children) {
        const net = entry.classList.contains('net');
        if (net) box(pale, margin + usable * .46, y - 3, usable * .54, 24);
        text(entry.querySelector('dt').textContent, margin + usable * .46 + 10, y, usable * .32,
          {size: 11, bold: net});
        text(entry.querySelector('dd').textContent, width - margin - 10, y, usable * .21,
          {size: 11, bold: net, align: 'right'});
        y += 23;
      }
      y += 10;
    }

    function rowText(cell) {
      return [...cell.childNodes].map(node => node.textContent.trim()).filter(Boolean).join('\n');
    }

    async function tableRows(table, heading) {
      const columns = table.classList.contains('lesson-table') ? [.22, .27, .16, .16, .19] : [.7, .3];
      const sizes = columns.map(amount => amount * usable);
      const header = [...table.tHead.rows[0].cells].map(rowText);
      function layout(cells, bold) {
        font(10, bold);
        const lines = cells.map((cell, col) => wrap(cell, sizes[col] - 14));
        return {lines, h: Math.max(...lines.map(item => item.length)) * 14 + 11};
      }
      const headerRow = layout(header, true);
      function draw(row, bold) {
        if (bold) box(pale, margin, y, usable, row.h);
        font(10, bold);
        let x = margin;
        row.lines.forEach((lines, col) => {
          const last = col === row.lines.length - 1;
          linesText(lines, last ? x + sizes[col] - 7 : x + 7, y + 5, 14, ink, last ? 'right' : 'left');
          x += sizes[col];
        });
        y += row.h;
        box(rule, margin, y - 1, usable, 1);
      }
      function drawHeading() {
        y += text(heading, margin, y, usable, {size: 13, bold: true}) + 6;
        draw(headerRow, true);
      }
      await space(headerRow.h + 65);
      drawHeading();
      for (const row of table.tBodies[0].rows) {
        const nextRow = layout([...row.cells].map(rowText), false);
        if (y + nextRow.h > bottom) {
          await finishPage();
          beginPage();
          drawHeading();
        }
        draw(nextRow, false);
      }
      y += 18;
    }

    beginPage();
    header();
    information(paper.querySelector('.metadata'));
    for (const section of paper.querySelectorAll('.section')) {
      const heading = section.querySelector('h2').textContent;
      const table = section.querySelector('table');
      if (table) {
        await tableRows(table, heading);
        continue;
      }
      await space(165);
      y += text(heading, margin, y, usable, {size: 13, bold: true}) + 8;
      const list = section.querySelector('dl');
      if (list.classList.contains('bank')) information(list);
      else earnings(list);
    }
    await finishPage();
    return pages;
  }

  async function archive() {
    if (saving || saved || !updatePreview()) return;
    saving = true;
    form.querySelectorAll('input, select').forEach(input => {input.disabled = true;});
    updatePreview();
    status.textContent = local('正在存档薪资单…', 'Saving payslip…');
    try {
      const pages = await renderPages();
      if (pages.reduce((total, page) => total + page.size, 0) > 8 * 1024 * 1024 - 16384) throw Error('size');
      const data = new FormData();
      data.set('revision', form.dataset.revision);
      data.set('bankVersion', form.dataset.bankVersion);
      data.set('template', template.value);
      pages.forEach((page, index) => data.append('page', page, 'page-' + (index + 1) + '.jpg'));
      const response = await fetch(location.pathname, {method: 'POST', body: data, cache: 'no-store', credentials: 'same-origin'});
      if (!response.ok) throw Error(String(response.status));
      saved = true;
      const open = byId('open-saved-slip');
      open.href = location.pathname;
      open.hidden = false;
      const download = byId('download-saved-slip');
      download.href = location.pathname + '?download=1';
      download.download = document.title + '.pdf';
      download.hidden = false;
      saveButton.hidden = true;
      status.textContent = local('PDF 已存档。', 'PDF saved.');
      download.click();
    } catch (error) {
      const reason = error instanceof Error && error.message;
      status.textContent = reason === '409'
        ? local('薪资或收款户口已更新，请重新打开预览。', 'Payroll or bank details have changed. Reopen the preview.')
        : reason === 'size' || reason === '413'
          ? local('薪资单超过存档大小上限。', 'The payslip exceeds the archive size limit.')
          : local('暂时无法存档，请重试。', 'Could not save the payslip. Try again.');
    } finally {
      saving = false;
      if (!saved) form.querySelectorAll('input, select').forEach(input => {input.disabled = false;});
      updatePreview();
    }
  }

  form.addEventListener('input', updatePreview);
  form.addEventListener('change', updatePreview);
  form.addEventListener('submit', event => {
    event.preventDefault();
    if (saveButton) void archive();
    else if (updatePreview()) window.print();
  });
  window.addEventListener('beforeprint', updatePreview);
  updatePreview();
})();
