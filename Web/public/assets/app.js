import { calculate, defaults, restoreState, parseDecimal, format, mm, shiftText, turnText, reportText, triangleIsActive } from './calculation.js';
import { wallDiagram, sideDiagram, planDiagram, triangleDiagram } from './diagrams.js';

const $ = selector => document.querySelector(selector);
const icon = name => `<svg class="icon" aria-hidden="true"><use href="#i-${name}"/></svg>`;
const storageKey = 'svet.web.v1';
let state = { ...defaults }, storageAvailable = true, diagramMode = 'wall', currentResult;
try { state = restoreState(JSON.parse(localStorage.getItem(storageKey))); } catch { storageAvailable = false; }

const fields = [
  ['distance', 'Расстояние до стены', 'От оптического центра фары до стены'],
  ['height', 'Высота центров фар', 'От пола до оптического центра'],
  ['rightHeight', 'Высота правой фары', 'От пола до оптического центра'],
  ['inclination', 'Уклон по маркировке', 'Например, 1,0% на корпусе фары', '%'],
  ['spacing', 'Между центрами фар', 'В горизонтальной плоскости, поперёк автомобиля'],
  ['lensSetback', 'Линза → стекло', 'Общая поправка для обеих фар. До линзы = до стекла + это значение, по перпендикуляру к стене.'],
  ['frontSide', 'Центр переднего бампера'], ['rearSide', 'Центр заднего бампера', 'Для проверки согласованности замеров'],
  ['leftFront', 'Левая фара'], ['rightFront', 'Правая фара'], ['bumperFront', 'Центр переднего бампера', 'Та же точка, что в замере до боковой стены'],
  ['triangleSide', 'OA · вдоль боковой стены'], ['triangleFront', 'OB · вдоль передней стены'], ['triangleDiagonal', 'AB · между выбранными точками'],
];
const fieldHTML = key => {
  const [, label, hint, unit = 'мм'] = fields.find(f => f[0] === key);
  return `<label class="field" data-field-wrap="${key}" for="field-${key}"><span class="field-label" data-label="${key}">${label}</span><span class="field-box"><input type="text" id="field-${key}" data-field="${key}" inputmode="decimal" spellcheck="false" aria-describedby="hint-${key}" aria-invalid="false"><span class="field-unit">${unit}</span></span><span class="field-hint" id="hint-${key}">${hint ?? ''}</span></label>`;
};
const toggleHTML = (key, label, small = false) => `<label class="toggle${small ? ' small' : ''}" for="toggle-${key}"><span>${label}</span><input type="checkbox" id="toggle-${key}" data-toggle="${key}"><span class="switch" aria-hidden="true"></span></label>`;

$('#basic-fields').innerHTML = '<div class="toggle-with-hint">' + toggleHTML('horizontal', 'Боковая поправка') + '<p id="horizontal-hint" class="field-description">Для корректировки смещения лево/право</p></div>' + toggleHTML('lensEnabled', 'Учесть линзу за стеклом') +
  fieldHTML('lensSetback') + fieldHTML('distance') + `<div class="presets" id="presets" role="group" aria-label="Расстояние до стены в миллиметрах">${[3000, 5000, 7500, 10000].map(v => `<button type="button" data-preset="${v}">${v}</button>`).join('')}</div><hr>` +
  fieldHTML('height') + toggleHTML('differentHeights', 'Разная высота фар', true) + fieldHTML('rightHeight') + fieldHTML('inclination') + fieldHTML('spacing');
$('#toggle-horizontal').setAttribute('aria-describedby', 'horizontal-hint');
$('#side-fields').innerHTML = fieldHTML('frontSide') + fieldHTML('rearSide');
$('#front-fields').innerHTML = fieldHTML('leftFront') + fieldHTML('rightFront');
$('#bumper-field').innerHTML = fieldHTML('bumperFront');
$('#corner-toggle').innerHTML = toggleHTML('measureCorner', 'Сравнить с треугольником');
$('#triangle-fields').innerHTML = fieldHTML('triangleSide') + fieldHTML('triangleFront') + fieldHTML('triangleDiagonal');
$('#triangle-diagram').innerHTML = triangleDiagram();

const preparation = [
  ['Выберите ровную площадку', 'Нужны горизонтальная площадка и вертикальные прямые стены. В простом режиме поставьте автомобиль перпендикулярно передней стене. С боковой поправкой приложение учтёт разворот. Колёса — прямо.'],
  ['Подготовьте автомобиль', 'Проверьте давление в шинах, очистите фары. Загрузку, уровень подвески и положение корректора установите по инструкции производителя.'],
  ['Найдите значение уклона', 'Используйте процент на корпусе фары или в сервисной документации. Начальное значение 1% — пример, а не универсальная настройка.'],
  ['Измерьте геометрию', 'Измерьте высоту оптических центров, расстояние между ними и кратчайшие перпендикуляры до стен. В обоих замерах переднего бампера используйте одну и ту же точку. При включённой поправке на линзу вводите расстояния до стекла.'],
  ['Проверьте режим регулировки', 'Автокорректор, LED и адаптивные системы могут требовать диагностического прибора и базового режима. Выполните процедуру производителя до механической регулировки.'],
];
$('#preparation-items').innerHTML = preparation.map(([title, description], n) => `<label class="card checklist-item" for="check-${n}"><input type="checkbox" id="check-${n}" data-check="${n}"><span><h2>${title}</h2><p>${description}</p></span></label>`).join('');
const steps = [
  ['Введите свои измерения', 'Все линейные размеры указываются в миллиметрах. Дробные значения можно вводить с точкой или запятой. При разной высоте фар включите отдельное поле для правой.'],
  ['Выберите способ разметки', 'В простом режиме отметьте ось автомобиля и половину расстояния между фарами в каждую сторону. С боковой поправкой выберите боковую стену и заполните замеры — получите расстояния от угла вдоль передней стены.'],
  ['Отметьте расчётные точки', 'На каждой вертикали отметьте расчётную высоту от пола. С боковой поправкой высоты могут различаться даже при одинаковой высоте фар: у лучей разная длина. Зелёные точки показывают целевые отметки, а не форму пучка.'],
  ['Проверяйте фары по очереди', 'Опорную точку светотеневой границы совместите с разметкой по процедуре производителя. Положение излома и форму пучка уточняйте в документации оптики. Боковое смещение в приложении относится к разметке на стене.'],
];
$('#guide-steps').innerHTML = steps.map(([title, description], n) => `<div class="guide-step"><span class="step-number">0${n + 1}</span><div><h2>${title}</h2><p>${description}</p></div></div>`).join('');

function persist() {
  try { localStorage.setItem(storageKey, JSON.stringify(state)); } catch { storageAvailable = false; }
  if (!storageAvailable) $('#storage-note').textContent = 'Расчёт на устройстве · Сохранение параметров недоступно в этом браузере';
}
function syncControls() {
  document.querySelectorAll('[data-field]').forEach(input => { input.value = state[input.dataset.field]; });
  document.querySelectorAll('[data-toggle]').forEach(input => { input.checked = state[input.dataset.toggle]; });
  document.querySelectorAll('input[name="side"]').forEach(input => { input.checked = input.value === state.side; });
  document.querySelectorAll('input[name="cornerSource"]').forEach(input => { input.checked = input.value === state.cornerSource; });
  syncChecklist();
}
function syncChecklist() {
  document.querySelectorAll('[data-check]').forEach(input => { input.checked = !!(state.checklist & (1 << Number(input.dataset.check))); });
  $('#checklist-progress').textContent = `Выполнено ${state.checklist.toString(2).replaceAll('0', '').length} из 5`;
}
function showField(key, show) {
  const wrapper = $(`[data-field-wrap="${key}"]`);
  wrapper.hidden = !show;
  wrapper.querySelector('input').disabled = !show;
}
function updateForm() {
  showField('lensSetback', state.lensEnabled);
  showField('distance', !state.horizontal);
  showField('rightHeight', state.differentHeights);
  $('#presets').hidden = state.horizontal;
  $('#geometry-card').hidden = !state.horizontal;
  $('#geometry-card').querySelectorAll('input').forEach(input => { input.disabled = !state.horizontal; });
  const triangleActive = triangleIsActive(state);
  $('#triangle-section').hidden = !triangleActive;
  $('#triangle-section').querySelectorAll('input').forEach(input => { input.disabled = !state.horizontal || !triangleActive; });
  $('#right-angle-note').hidden = triangleActive;
  $('#corner-toggle').hidden = state.cornerSource === 'triangle';
  $('#toggle-measureCorner').disabled = !state.horizontal || state.cornerSource === 'triangle';
  showField('bumperFront', state.horizontal && state.cornerSource === 'triangle');
  $('#bumper-not-needed').hidden = state.cornerSource === 'triangle';
  $('[data-diagram="plan"]').hidden = !state.horizontal;
  if (!state.horizontal && diagramMode === 'plan') diagramMode = 'wall';
  const lens = state.lensEnabled;
  $('[data-label="distance"]').textContent = lens ? 'От стекла до стены' : 'Расстояние до стены';
  $('#hint-distance').textContent = lens ? 'Кратчайшее расстояние от стекла фары' : 'От оптического центра фары до стены';
  $('[data-label="height"]').textContent = state.differentHeights ? `Высота левой ${lens ? 'линзы' : 'фары'}` : `Высота центров ${lens ? 'линз' : 'фар'}`;
  $('[data-label="rightHeight"]').textContent = `Высота правой ${lens ? 'линзы' : 'фары'}`;
  $('[data-label="spacing"]').textContent = `Между центрами ${lens ? 'линз' : 'фар'}`;
  $('[data-label="leftFront"]').textContent = lens ? 'Стекло левой фары' : 'Левая фара';
  $('[data-label="rightFront"]').textContent = lens ? 'Стекло правой фары' : 'Правая фара';
  document.querySelectorAll('[data-preset]').forEach(button => { button.classList.toggle('selected', parseDecimal(state.distance) === Number(button.dataset.preset)); });
}

function horizontalHTML(r) {
  const { horizontal: h } = r;
  return `<div class="card-heading">${icon('horizontal')}<h2>Горизонтальная разметка</h2></div><p class="field-description">От угла с ${state.side === 'left' ? 'левой' : 'правой'} боковой стеной — вдоль передней стены.</p><table class="result-table"><thead><tr><th scope="col">ФАРА</th><th scope="col">ОТ УГЛА</th><th scope="col">ОТ ПЕРПЕНДИКУЛЯРА</th></tr></thead><tbody><tr><td>Левая</td><td>${mm(h.leftCorner)}</td><td>${shiftText(h.leftShift)}</td></tr><tr><td>Правая</td><td>${mm(h.rightCorner)}</td><td>${shiftText(h.rightShift)}</td></tr></tbody></table><div class="angle-list"><div class="angle-row"><span>Разворот к нормали передней стены</span><span>${turnText(h.yawDegrees)}</span></div><div class="angle-row"><span>Угол между стенами · ${h.cornerSourceLabel}</span><span>${format(h.cornerDegrees, 2)}°</span></div><div class="angle-row"><span>Отклонение от боковой стены</span><span>${format(Math.abs(h.sideAngleDegrees), 2)}°</span></div></div><p class="result-explanation">${h.cornerSource === 'headlights' ? 'Для этого способа принята параллельность боковой стене.' : Math.abs(h.sideAngleDegrees) < 0.005 ? 'Автомобиль параллелен боковой стене.' : h.sideAngleDegrees > 0 ? 'Нос дальше от боковой стены, чем задняя часть.' : 'Нос ближе к боковой стене, чем задняя часть.'}</p><p class="angle-comment${h.triangleError ? ' comparison-error' : ''}" id="angle-comparison">${h.comment}</p>${h.warning ? `<p class="measurement-warning">${h.warning}</p>` : ''}<p class="result-explanation">Смещение — перенос целевой отметки от точки строго напротив ${state.lensEnabled ? 'линзы с учётом её положения за стеклом' : 'фары'}. Влево и вправо — по ходу движения. Угол поворота регулировочного винта по этим данным не определяется.</p>`;
}

function updateDiagram(r) {
  const ref = state.lensEnabled ? 'линз' : 'фар';
  document.querySelectorAll('[data-diagram]').forEach(button => {
    const selected = button.dataset.diagram === diagramMode;
    button.classList.toggle('selected', selected); button.setAttribute('aria-pressed', String(selected));
  });
  $('#beam-diagram').innerHTML = diagramMode === 'plan' ? planDiagram(r, state) : diagramMode === 'side' ? sideDiagram(r, state) : wallDiagram(r, state);
  $('#reference-legend').textContent = diagramMode === 'plan' ? 'Перпендикуляры' : `Напротив ${ref}`;
  $('#target-legend').textContent = diagramMode === 'plan' ? 'Направление света' : 'Целевые отметки';
  const captions = {
    wall: state.horizontal ? `Зелёные точки — целевые отметки левых горизонтальных участков СТГ. Подъём вправо у обеих фар показан условно. Серые вертикали — перпендикуляры от ${ref}. Размеры от угла отложите вдоль передней стены. Схема не в масштабе.` : `Вертикали — по центрам ${ref}: ±${mm(r.input.spacing / 2)} от оси автомобиля. Левые горизонтальные участки СТГ совместите с зелёными отметками. Подъём вправо у обеих фар показан условно.`,
    side: `Вид вдоль продольной оси для левой фары. Снижение ${mm(r.leftDrop)} на расстоянии ${mm(r.leftAxis)}. Угол увеличен для наглядности.`,
    plan: `Вид сверху: стены, ${state.lensEnabled ? 'линзы и стекло фар' : 'центры фар'} и направления света. Пунктир — перпендикуляры от ${ref}${state.lensEnabled ? '; серые точки — стекло' : ''}. Корпус показан условно.`,
  };
  $('#diagram-caption').textContent = captions[diagramMode];
}

function update() {
  updateForm();
  const r = currentResult = calculate(state);
  $('#error-card').hidden = !r.error;
  $('#valid-results').hidden = !!r.error;
  $('#print').disabled = $('#copy').disabled = !!r.error;
  document.querySelectorAll('[data-field]').forEach(input => { input.setAttribute('aria-invalid', String(!!r.error && input.dataset.field === r.field)); });
  $('#calculation-error').textContent = r.error ?? '';
  if (r.error) { $('#print-report').innerHTML = ''; return; }
  const { input: i, horizontal: h } = r;
  $('#target-height').textContent = format(r.leftTarget);
  $('#right-target').textContent = state.differentHeights || state.horizontal ? `Левая фара · правая ${mm(r.rightTarget)}` : 'Для левой и правой фары';
  $('#beam-drop').textContent = format(r.leftDrop);
  $('#drop-caption').textContent = h ? `Правая: ${mm(r.rightDrop)}` : `Угол ${format(r.angleDegrees, 2)}°`;
  $('#formula').textContent = `${mm(i.height)} − (${mm(r.leftAxis)} × ${format(i.inclination)} / 100) = ${mm(r.leftTarget)}`;
  $('#lens-explanation').hidden = !state.lensEnabled;
  $('#lens-explanation').textContent = !state.lensEnabled ? '' : h ? `До линз по перпендикуляру: Л ${mm(h.leftReference)} · П ${mm(h.rightReference)}. Поправка +${mm(i.lensSetback)} к замерам до стекла.` : `До линзы: ${format(i.distance)} + ${format(i.lensSetback)} = ${mm(r.leftAxis)}`;
  $('#axis-distances').hidden = !h;
  $('#axis-distances').textContent = h ? `Расстояние вдоль оси: Л ${mm(r.leftAxis)} · П ${mm(r.rightAxis)}` : '';
  $('#horizontal-result').hidden = !h;
  if (h) $('#horizontal-result').innerHTML = horizontalHTML(r);
  $('#surface-note').textContent = h ? 'Расчёт предполагает горизонтальный пол, вертикальные прямые стены и центры фар на одной поперечной линии автомобиля. Для адаптивных фар проверьте процедуру калибровки.' : 'Расчёт предполагает горизонтальную площадку и стену перпендикулярно автомобилю. Для адаптивных фар проверьте процедуру калибровки.';
  updateDiagram(r);
  buildPrintReport(r);
}

const table = rows => `<table><tbody>${rows.map(([label, value]) => `<tr><td>${label}</td><td><b>${value}</b></td></tr>`).join('')}</tbody></table>`;
function buildPrintReport(r) {
  const { input: i, horizontal: h } = r;
  const rows = [
    [state.lensEnabled ? 'От стекла до стены, Л / П' : 'От фар до стены, Л / П', h ? `${format(i.leftFront)} / ${mm(i.rightFront)}` : mm(i.distance)],
    ['Высота центров, Л / П', `${format(i.height)} / ${mm(i.rightHeight)}`], ['Между центрами', mm(i.spacing)], ['Уклон по маркировке', `${format(i.inclination)}%`],
  ];
  if (state.lensEnabled) rows.push(['Линза → стекло · перпендикуляр', mm(i.lensSetback)]);
  let html = `<h1>СВЕТ</h1><p class="print-meta">РАЗМЕТКА ДЛЯ РЕГУЛИРОВКИ ФАР · ${new Date().toLocaleDateString('ru-RU')}</p>${table(rows)}<div class="print-target"><span class="print-label">Граница света от пола</span><b>Л: ${mm(r.leftTarget)} &nbsp; П: ${mm(r.rightTarget)}</b><p>Снижение: Л ${mm(r.leftDrop)} / П ${mm(r.rightDrop)}</p></div><h2>Вид на стену из автомобиля</h2>${wallDiagram(r, state)}<p>Расстояние вдоль оси: Л ${mm(r.leftAxis)} / П ${mm(r.rightAxis)}. ${state.lensEnabled ? 'Расстояния введены до стекла. До линзы = до стекла + поправка по перпендикуляру.' : ''}</p><p>Пол горизонтальный, стены вертикальные. Уклон, корректор и процедура регулировки — по инструкции производителя. Высоты относятся к левым горизонтальным участкам СТГ; подъём вправо у обеих фар показан условно.</p>`;
  if (h) {
    const measured = [ ['Боковая стена', state.side === 'left' ? 'Слева' : 'Справа'], ['Передний / задний бампер до боковой стены', `${format(i.frontSide)} / ${mm(i.rearSide)}`], ['Передний бампер до передней стены', h.cornerSource === 'triangle' ? mm(i.bumperFront) : 'Не используется в способе по фарам'], [state.lensEnabled ? 'Стекло до передней стены, Л / П' : 'Фары до передней стены, Л / П', `${format(i.leftFront)} / ${mm(i.rightFront)}`] ];
    if (state.lensEnabled) measured.push(['Линза → стекло · перпендикуляр', mm(i.lensSetback)]);
    if (h.triangleCornerDegrees !== null) measured.push(['Треугольник OA / OB / AB', `${format(i.triangleSide)} / ${format(i.triangleFront)} / ${mm(i.triangleDiagonal)}`]);
    html += `<section class="print-geometry"><h1>ГЕОМЕТРИЯ</h1><p class="print-meta">РАЗМЕТКА ОТ УГЛА С ${state.side === 'left' ? 'ЛЕВОЙ' : 'ПРАВОЙ'} БОКОВОЙ СТЕНОЙ</p>${table([['Разворот к нормали передней стены', turnText(h.yawDegrees)], ['Угол между стенами', `${format(h.cornerDegrees, 2)}° (${h.cornerSourceLabel})`], ['Отклонение от боковой стены', `${format(h.sideAngleDegrees, 2)}°`]])}<div class="print-target"><table><thead><tr><th>Фара</th><th>От угла</th><th>От перпендикуляра ${state.lensEnabled ? 'линзы' : 'фары'}</th><th>От пола</th></tr></thead><tbody><tr><td>Левая</td><td>${mm(h.leftCorner)}</td><td>${shiftText(h.leftShift)}</td><td>${mm(r.leftTarget)}</td></tr><tr><td>Правая</td><td>${mm(h.rightCorner)}</td><td>${shiftText(h.rightShift)}</td><td>${mm(r.rightTarget)}</td></tr></tbody></table></div><h2>Исходные замеры</h2>${table(measured)}<p><b>Комментарий:</b> ${h.comment}</p><p>O — угол стен, OA — вдоль боковой стены, OB — вдоль передней, AB — между точками. Три стороны измеряются в одной горизонтальной плоскости. Размеры от угла откладываются вдоль передней стены. Стороны — по ходу движения. Центры фар — на одной поперечной линии.</p>${h.warning ? `<p class="print-warning">Проверьте замеры: ${h.warning}</p>` : ''}</section>`;
  }
  html += '<footer>Свет · setcarlight.vercel.app · Методика: HELLA, Headlamp adjustment</footer>';
  $('#print-report').innerHTML = html;
}

let toastTimer;
function toast(message) {
  clearTimeout(toastTimer); $('#toast').textContent = message; $('#toast').hidden = false;
  toastTimer = setTimeout(() => { $('#toast').hidden = true; }, 2600);
}
function route() {
  const name = ['calculator', 'preparation', 'guide'].includes(location.hash.slice(1)) ? location.hash.slice(1) : 'calculator';
  document.querySelectorAll('main>.page').forEach(page => { page.hidden = page.id !== name; });
  document.querySelectorAll('[data-nav]').forEach(link => {
    const selected = link.dataset.nav === name; link.classList.toggle('active', selected);
    if (selected) link.setAttribute('aria-current', 'page'); else link.removeAttribute('aria-current');
  });
  $('#breadcrumb-current').textContent = { calculator: 'Калькулятор', preparation: 'Подготовка', guide: 'Как пользоваться' }[name];
  $('#calculator-toolbar').hidden = name !== 'calculator';
}
$('#parameters').addEventListener('submit', event => { event.preventDefault(); if (currentResult && !currentResult.error) $('#results').scrollIntoView({ behavior: 'smooth', block: 'start' }); });
$('#parameters').addEventListener('input', event => {
  const target = event.target;
  if (target.dataset.field) state[target.dataset.field] = target.value;
  else if (target.dataset.toggle) state[target.dataset.toggle] = target.checked;
  else if (target.name === 'side') state.side = target.value;
  else if (target.name === 'cornerSource') {
    state.cornerSource = target.value;
    if (state.cornerSource === 'triangle') { state.measureCorner = true; $('#toggle-measureCorner').checked = true; }
  }
  else return;
  persist(); update();
});
$('#presets').addEventListener('click', event => {
  const button = event.target.closest('[data-preset]'); if (!button) return;
  state.distance = button.dataset.preset; $('#field-distance').value = state.distance; persist(); update();
});
$('.diagram-tabs').addEventListener('click', event => {
  const button = event.target.closest('[data-diagram]'); if (!button) return;
  diagramMode = button.dataset.diagram; if (currentResult && !currentResult.error) updateDiagram(currentResult);
});
$('#reset').addEventListener('click', () => {
  state = { ...defaults, checklist: state.checklist }; diagramMode = 'wall'; syncControls(); persist(); update(); toast('Исходные значения восстановлены');
});
$('#preparation-items').addEventListener('change', event => {
  if (!event.target.matches('[data-check]')) return;
  state.checklist ^= 1 << Number(event.target.dataset.check); syncChecklist(); persist();
});
$('#clear-checklist').addEventListener('click', () => { state.checklist = 0; syncChecklist(); persist(); });
$('#copy').addEventListener('click', async () => {
  if (!currentResult || currentResult.error) return;
  const report = reportText(state, currentResult);
  try {
    if (navigator.clipboard?.writeText) await navigator.clipboard.writeText(report);
    else {
      const area = document.createElement('textarea'); area.value = report; area.style.position = 'fixed'; area.style.opacity = '0'; document.body.append(area); area.select();
      const copied = document.execCommand('copy'); area.remove(); if (!copied) throw new Error('clipboard');
    }
    toast('Расчёт скопирован');
  } catch { toast('Копирование недоступно. Сохраните расчёт в PDF.'); }
});
$('#print').addEventListener('click', () => { if (currentResult && !currentResult.error) window.print(); });
window.addEventListener('beforeprint', () => { if (currentResult && !currentResult.error) buildPrintReport(currentResult); });
window.addEventListener('hashchange', route);
syncControls(); route(); update();
