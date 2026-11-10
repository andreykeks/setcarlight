// All lengths in the web application are millimeters. The geometry matches
// HeadlightCore, including the common lens correction before yaw compensation.
export const defaults = Object.freeze({
  distance: '5000', height: '700', rightHeight: '700', inclination: '1,0', spacing: '1400',
  differentHeights: false, horizontal: false, side: 'left', frontSide: '1700', rearSide: '1700',
  leftFront: '5000', rightFront: '5000', bumperFront: '4800', measureCorner: false, cornerSource: 'headlights',
  triangleSide: '3000', triangleFront: '4000', triangleDiagonal: '5000',
  lensEnabled: false, lensSetback: '0', checklist: 0,
});

export function restoreState(saved) {
  const state = { ...defaults };
  if (!saved || typeof saved !== 'object' || Array.isArray(saved)) return state;
  for (const key of Object.keys(defaults)) {
    if (typeof saved[key] === typeof defaults[key]) state[key] = saved[key];
  }
  if (!('cornerSource' in saved) && saved.measureCorner === true) state.cornerSource = 'triangle';
  if (!['headlights', 'triangle'].includes(state.cornerSource)) state.cornerSource = 'headlights';
  if (!['left', 'right'].includes(state.side)) state.side = 'left';
  state.checklist = Number.isInteger(state.checklist) ? state.checklist & 31 : 0;
  return state;
}

export function parseDecimal(raw) {
  if (typeof raw !== 'string' && typeof raw !== 'number') return null;
  const text = String(raw).trim().replace(',', '.');
  if (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i.test(text)) return null;
  const value = Number(text);
  return Number.isFinite(value) ? value : null;
}

export const format = (value, digits = 1) => new Intl.NumberFormat('ru-RU', {
  maximumFractionDigits: digits, useGrouping: false,
}).format(Object.is(value, -0) ? 0 : value);
export const mm = value => `${format(value)} мм`;
export const shiftText = value => Math.abs(value) < 0.05 ? 'без смещения' : `${mm(Math.abs(value))} ${value > 0 ? 'вправо' : 'влево'}`;
export const turnText = value => Math.abs(value) < 0.005 ? '0°' : `${format(Math.abs(value), 2)}° ${value > 0 ? 'вправо' : 'влево'}`;
const rad = degrees => degrees * Math.PI / 180;
const deg = radians => radians * 180 / Math.PI;

export function triangleAngle(a, b, c) {
  if (![a, b, c].every(v => Number.isFinite(v) && v > 0)) {
    return { error: 'Все три стороны треугольника должны быть положительными конечными числами.' };
  }
  const scale = Math.max(a, b, c);
  const sides = [a / scale, b / scale, c / scale].sort((x, y) => x - y);
  if (sides[0] + sides[1] <= sides[2] + 1e-12) {
    return { error: 'Такого треугольника не существует: сумма двух сторон должна быть больше третьей.' };
  }
  const [x, y, z] = [a / scale, b / scale, c / scale];
  return { angle: Math.acos(Math.min(1, Math.max(-1, (x * x + y * y - z * z) / (2 * x * y)))) };
}

export const triangleIsActive = state => state.measureCorner || state.cornerSource === 'triangle';

export function calculate(state) {
  const input = {};
  const trianglePrimary = state.cornerSource === 'triangle';
  const keys = ['height', 'inclination', 'spacing'];
  if (state.differentHeights) keys.push('rightHeight');
  if (state.lensEnabled) keys.push('lensSetback');
  if (state.horizontal) {
    keys.push('frontSide', 'rearSide', 'leftFront', 'rightFront');
    if (trianglePrimary) keys.push('bumperFront', 'triangleSide', 'triangleFront', 'triangleDiagonal');
  } else keys.push('distance');
  const fail = (error, field) => ({ error, field });
  for (const key of keys) {
    input[key] = parseDecimal(state[key]);
    if (input[key] === null) return fail('Заполните поля числами. Можно использовать точку или запятую.', key);
  }
  input.rightHeight = state.differentHeights ? input.rightHeight : input.height;
  input.lensSetback = state.lensEnabled ? input.lensSetback : 0;
  input.bumperFront = trianglePrimary ? input.bumperFront : null;
  if (input.lensSetback < 0 || input.lensSetback > 1000) return fail('Расстояние от линзы до стекла: от 0 до 1000 мм.', 'lensSetback');
  if (![input.height, input.rightHeight].every(v => v >= 100 && v <= 2500)) return fail('Высота центров фар: от 100 до 2500 мм.', input.height < 100 || input.height > 2500 ? 'height' : 'rightHeight');
  if (input.inclination < 0.1 || input.inclination > 5) return fail('Уклон: от 0,1 до 5%. Используйте маркировку фары.', 'inclination');
  if (input.spacing < 200 || input.spacing > 2500) return fail('Расстояние между центрами фар: от 200 до 2500 мм.', 'spacing');
  let horizontal = null;
  let leftAxis, rightAxis;
  if (state.horizontal) {
    for (const key of ['frontSide', 'rearSide', 'leftFront', 'rightFront', ...(trianglePrimary ? ['bumperFront'] : [])]) {
      if (input[key] <= 0 || input[key] > 100000) return fail('Расстояния до стен должны быть больше нуля и не превышать 100000 мм.', key);
    }
    const ratio = (input.rightFront - input.leftFront) / input.spacing;
    if (Math.abs(ratio) >= 1 || Math.cos(Math.asin(ratio)) <= 1e-6) return fail('Разница расстояний от фар до передней стены должна быть меньше расстояния между центрами фар.', 'rightFront');
    const yaw = Math.asin(ratio), cosine = Math.cos(yaw), tangent = Math.tan(yaw);
    const sign = state.side === 'right' ? -1 : 1;
    const headlightCorner = Math.PI / 2 + sign * yaw;
    let triangle = null;
    if (triangleIsActive(state)) {
      for (const key of ['triangleSide', 'triangleFront', 'triangleDiagonal']) input[key] = parseDecimal(state[key]);
      triangle = triangleAngle(input.triangleSide, input.triangleFront, input.triangleDiagonal);
      if (!triangle.error && (triangle.angle <= 1e-6 || triangle.angle >= Math.PI - 1e-6)) triangle = { error: 'Угол между стенами слишком близок к 0° или 180°. Проверьте треугольник.' };
      if (trianglePrimary && triangle.error) return fail(triangle.error, 'triangleDiagonal');
    }
    const corner = trianglePrimary ? triangle.angle : headlightCorner;
    const cornerSourceLabel = trianglePrimary ? 'по треугольнику' : 'по фарам';
    const sideAngle = Math.asin(Math.sin(sign * yaw - (corner - Math.PI / 2)));
    const leftReference = input.leftFront + input.lensSetback;
    const rightReference = input.rightFront + input.lensSetback;
    leftAxis = leftReference / cosine;
    rightAxis = rightReference / cosine;
    const halfSpacing = input.spacing / (2 * cosine);
    const diagramBumper = trianglePrimary ? input.bumperFront : Math.max(10, (input.leftFront + input.rightFront) / 2 - 200 * cosine);
    const axisX = trianglePrimary ? sign * (input.frontSide + Math.cos(corner) * input.bumperFront) / Math.sin(corner) + input.bumperFront * tangent : sign * input.frontSide / Math.sin(corner);
    const bumperX = axisX - diagramBumper * tangent;
    const leftCorner = sign * (axisX - halfSpacing), rightCorner = sign * (axisX + halfSpacing);
    const difference = input.frontSide - input.rearSide, sine = Math.sin(sideAngle);
    const bumperDistancesMatch = Math.abs(difference) <= 0.1 + 1e-9;
    let warning = null;
    if (!trianglePrimary) {
      if (!bumperDistancesMatch) warning = `Метод по фарам предполагает параллельность боковой стене. Замеры у бамперов различаются на ${mm(Math.abs(difference))}. Выровняйте автомобиль; пока результат этого способа условный.`;
    } else if (Math.abs(sine) < Math.sin(rad(0.05))) {
      if (Math.abs(difference) > 20) warning = 'Автомобиль параллелен боковой стене по углу фар, но замеры у бамперов различаются более чем на 20 мм. Проверьте точки и перпендикуляры.';
    } else if (Math.abs(difference) > 5 && difference * sine < 0) {
      warning = 'Замеры у бамперов показывают противоположный разворот. Проверьте выбор стены, левую и правую фару и стороны треугольника.';
    } else if (Math.abs(deg(sideAngle)) >= 0.5 && (difference / sine < 1000 || difference / sine > 20000)) {
      warning = 'Боковые замеры плохо согласуются с углом по фарам. Проверьте точки бамперов и перпендикуляры. Длину автомобиля вводить не нужно.';
    }
    const triangleCornerDegrees = triangle && !triangle.error ? deg(triangle.angle) : null;
    const headlightCornerDegrees = deg(headlightCorner);
    const angleDifferenceDegrees = triangleCornerDegrees === null ? null : Math.abs(triangleCornerDegrees - headlightCornerDegrees);
    let comment = `По фарам при параллельности автомобиля: ${format(headlightCornerDegrees, 2)}°. `;
    if (triangleCornerDegrees !== null) comment += `По треугольнику: ${format(triangleCornerDegrees, 2)}°. Разница: ${format(angleDifferenceDegrees, 2)}°. `;
    else if (triangle?.error) comment += `Треугольник: ${triangle.error} `;
    comment += `В разметке используется угол ${cornerSourceLabel}.`;
    if (!bumperDistancesMatch) comment += ` Замеры у бамперов различаются на ${mm(Math.abs(difference))}: оценка по фарам условна, пока автомобиль не выровнен параллельно боковой стене.`;
    else if (angleDifferenceDegrees !== null && angleDifferenceDegrees >= 0.005) comment += ' Расхождение может быть связано с погрешностью замеров или непараллельностью автомобиля.';
    horizontal = {
      yaw, yawDegrees: deg(yaw), corner, cornerDegrees: deg(corner), sideAngle, sideAngleDegrees: deg(sideAngle), sign,
      halfSpacing, bumperX, diagramBumper, axisX, leftCorner, rightCorner, leftReference, rightReference,
      leftShift: leftReference * tangent, rightShift: rightReference * tangent, warning,
      cornerSource: state.cornerSource, cornerSourceLabel, headlightCornerDegrees, triangleCornerDegrees, angleDifferenceDegrees,
      bumperDistancesMatch, comment, triangleError: triangle?.error ?? null,
    };
    if (Math.min(leftCorner, rightCorner) < 0) return fail('Отметка фары выходит за угол передней стены. Проверьте замеры и положение автомобиля.', 'frontSide');
    for (const [offset, distance] of [[-halfSpacing, leftReference], [halfSpacing, rightReference], [-halfSpacing, input.leftFront], [halfSpacing, input.rightFront]]) {
      const lampX = axisX + offset - distance * tangent;
      if (sign * Math.sin(corner) * lampX - Math.cos(corner) * distance <= 0) {
        return fail('По этим замерам одна из фар находится за боковой стеной. Проверьте расстояния и ширину между фарами.', 'frontSide');
      }
    }
  } else {
    if (input.distance < 500 || input.distance > 30000) return fail('Расстояние до стены: от 500 до 30000 мм.', 'distance');
    leftAxis = rightAxis = input.distance + input.lensSetback;
  }
  const leftDrop = leftAxis * input.inclination / 100, rightDrop = rightAxis * input.inclination / 100;
  const leftTarget = input.height - leftDrop, rightTarget = input.rightHeight - rightDrop;
  if (Math.min(leftTarget, rightTarget) <= 0) return fail('На этом расстоянии граница света достигает пола. Уменьшите расстояние до стены.', state.horizontal ? 'leftFront' : 'distance');
  return { input, horizontal, leftAxis, rightAxis, leftDrop, rightDrop, leftTarget, rightTarget, angleDegrees: deg(Math.atan(input.inclination / 100)) };
}

export function reportText(state, result) {
  if (result.error) return '';
  const { input: i, horizontal: h } = result;
  const lines = [
    'СВЕТ · Расчёт регулировки фар',
    `Высота центров, Л / П: ${mm(i.height)} / ${mm(i.rightHeight)}`,
    `Между центрами фар: ${mm(i.spacing)}`, `Уклон по маркировке: ${format(i.inclination)}%`,
    `Расстояние вдоль оси, Л / П: ${mm(result.leftAxis)} / ${mm(result.rightAxis)}`,
    `Снижение луча, Л / П: ${mm(result.leftDrop)} / ${mm(result.rightDrop)}`,
    `Граница света от пола, Л / П: ${mm(result.leftTarget)} / ${mm(result.rightTarget)}`,
  ];
  if (state.lensEnabled) lines.push(`Расчёт от линз. Ввод расстояний до стекла. Линза → стекло: ${mm(i.lensSetback)}.`, 'До линзы = до стекла + поправка по перпендикуляру.');
  if (h) {
    lines.push(`Боковая стена: ${state.side === 'right' ? 'справа' : 'слева'}`,
      `Бамперы до боковой стены, передний / задний: ${mm(i.frontSide)} / ${mm(i.rearSide)}`,
      `Передний бампер до передней стены: ${h.cornerSource === 'triangle' ? mm(i.bumperFront) : 'не используется в способе по фарам'}`,
      `${state.lensEnabled ? 'Стекло' : 'Фары'} до передней стены, Л / П: ${mm(i.leftFront)} / ${mm(i.rightFront)}`,
      `Разворот к нормали передней стены: ${turnText(h.yawDegrees)}`,
      `Угол между стенами: ${format(h.cornerDegrees, 2)}° (${h.cornerSourceLabel})`,
      `Комментарий: ${h.comment}`,
      `Отклонение от боковой стены: ${format(h.sideAngleDegrees, 2)}° (плюс — нос дальше от стены)`,
      `От угла стен, Л / П: ${mm(h.leftCorner)} / ${mm(h.rightCorner)}`,
      `Смещение от перпендикуляров ${state.lensEnabled ? 'линз' : 'фар'}: Л ${shiftText(h.leftShift)}, П ${shiftText(h.rightShift)}`);
    if (h.triangleCornerDegrees !== null) lines.push(`Треугольник OA / OB / AB: ${mm(i.triangleSide)} / ${mm(i.triangleFront)} / ${mm(i.triangleDiagonal)}`);
    if (h.warning) lines.push(`Проверьте замеры: ${h.warning}`);
  } else lines.push(`До ${state.lensEnabled ? 'стекла' : 'фары'}: ${mm(i.distance)}`);
  lines.push('Все расстояния до стен — кратчайшие перпендикуляры. Стороны — по ходу движения.',
    'Уклон и процедура регулировки — по инструкции производителя. Центры фар — на одной поперечной линии.',
    'https://setcarlight.vercel.app');
  return lines.join('\n');
}
