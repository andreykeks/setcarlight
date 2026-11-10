import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { calculate, defaults, restoreState, parseDecimal, triangleAngle, reportText, shiftText } from '../public/assets/calculation.js';
const near = (actual, expected, label = '') => assert.ok(Math.abs(actual - expected) < 1e-7, `${label}: ${actual} != ${expected}`);
const state = changes => ({ ...defaults, ...changes });
const angled = (changes = {}) => state({ horizontal: true, cornerSource: 'triangle', measureCorner: true, leftFront: '5000', rightFront: '5140', frontSide: '1700', rearSide: '1250', ...changes });

test('default dimensions in millimeters produce a 650 mm target', () => {
  const r = calculate(defaults); assert.equal(r.error, undefined);
  near(r.leftDrop, 50); near(r.leftTarget, 650); near(r.rightTarget, 650);
});
test('decimal comma, fractional dimensions and independent heights', () => {
  const r = calculate(state({ distance: '7500', height: '680', rightHeight: '695', differentHeights: true, inclination: '1,2' }));
  near(r.leftDrop, 90); near(r.leftTarget, 590); near(r.rightTarget, 605);
});
test('invalid and nonfinite decimal input is rejected', () => {
  for (const value of ['', 'NaN', 'Infinity', '1e999', '1,2,3', '0x10', '<script>', null, {}]) assert.equal(parseDecimal(value), null);
  assert.equal(parseDecimal(' 1,25 '), 1.25);
});
test('lens setback is added before calculating vertical drop', () => {
  const r = calculate(state({ lensEnabled: true, lensSetback: '100' }));
  near(r.leftAxis, 5100); near(r.leftTarget, 649);
});
test('disabled optional fields do not participate in validation', () => {
  const r = calculate(state({ lensSetback: 'invalid', rightHeight: '', triangleDiagonal: '', leftFront: '' }));
  near(r.leftTarget, 650);
});
test('yaw and absolute corner marks use measured front distances', () => {
  const r = calculate(angled()); assert.equal(r.error, undefined);
  near(r.horizontal.yawDegrees, 5.739170477266787);
  near(r.horizontal.leftCorner, 1478.8916806429725);
  near(r.horizontal.rightCorner, 2885.9446220058694);
});
test('a common lens setback preserves yaw and corner marks', () => {
  const baseline = calculate(angled()), r = calculate(angled({ lensEnabled: true, lensSetback: '100' }));
  near(r.horizontal.leftReference, 5100); near(r.horizontal.rightReference, 5240);
  near(r.horizontal.yaw, baseline.horizontal.yaw);
  near(r.horizontal.leftCorner, baseline.horizontal.leftCorner);
  near(r.horizontal.leftShift, 512.569285782197);
  near(r.leftAxis - baseline.leftAxis, 100 / Math.cos(r.horizontal.yaw));
});
test('right side mirrors corner marks and lateral corrections', () => {
  const l = calculate(angled()).horizontal;
  const r = calculate(angled({ side: 'right', leftFront: '5140', rightFront: '5000' })).horizontal;
  near(l.leftCorner, r.rightCorner); near(l.rightCorner, r.leftCorner); near(l.leftShift, -r.rightShift);
});
test('wall triangle handles acute, right, obtuse and huge sides', () => {
  near(triangleAngle(3000, 4000, 5000).angle, Math.PI / 2);
  near(triangleAngle(2, 2, 2).angle, Math.PI / 3);
  near(triangleAngle(2, 3, Math.sqrt(19)).angle, Math.PI * 2 / 3);
  near(triangleAngle(3e200, 4e200, 5e200).angle, Math.PI / 2);
  for (const sides of [[1, 2, 3], [1, 2, 4], [0, 1, 1], [NaN, 2, 2]]) assert.ok(triangleAngle(...sides).error);
});
test('impossible measurements and targets below the floor are rejected', () => {
  for (const changes of [{distance:'0'}, {height:'-1'}, {spacing:'0'}, {inclination:'0'}, {lensEnabled:true,lensSetback:'-1'}, {lensEnabled:true,lensSetback:'1001'}, {distance:'30000',height:'100',inclination:'1'}]) assert.ok(calculate(state(changes)).error);
  assert.ok(calculate(angled({ rightFront: '7000' })).error);
  assert.ok(calculate(angled({ frontSide: '200' })).error);
  assert.ok(calculate(angled({ measureCorner: true, triangleSide: '1', triangleFront: '2', triangleDiagonal: '4' })).error);
});
test('inconsistent bumper measurements warn but do not alter yaw', () => {
  const a = calculate(angled()), b = calculate(angled({ rearSide:'2000' }));
  assert.ok(b.horizontal.warning); near(a.horizontal.yaw, b.horizontal.yaw);
});
test('persisted state accepts only known keys and expected types', () => {
  const r = restoreState({ height: '733', side: '<script>', horizontal: 'true', checklist: 127, unexpected: 'x' });
  assert.equal(r.height, '733'); assert.equal(r.side, 'left'); assert.equal(r.horizontal, false);
  assert.equal(r.checklist, 31); assert.equal(r.unexpected, undefined);
  assert.deepEqual(restoreState(null), { ...defaults });
});
test('report includes glass inputs, lens origin and millimeter dimensions', () => {
  const s = angled({ lensEnabled: true, lensSetback: '100', measureCorner: true });
  const text = reportText(s, calculate(s));
  for (const value of ['100 мм', '5000 мм', '5140 мм', '1478,9 мм', '3000 мм', 'Расчёт от линз']) assert.ok(text.includes(value), value);
  assert.equal(shiftText(-0.1), '0,1 мм влево'); assert.equal(shiftText(0), 'без смещения');
});
test('calculation matches reference scenarios', () => {
  const fixtures = JSON.parse(readFileSync(new URL('./reference-fixtures.json', import.meta.url)));
  for (const fixture of fixtures) {
    const r = calculate(restoreState(fixture.state));
    assert.equal(!!r.error, fixture.invalid, fixture.name);
    if (fixture.invalid) continue;
    for (const [key, expected] of Object.entries(fixture.expected)) {
      const actual = key.startsWith('horizontal.') ? r.horizontal[key.slice(11)] : r[key];
      near(actual, expected, `${fixture.name}: ${key}`);
    }
    assert.equal(!!r.horizontal?.warning, fixture.warning, fixture.name);
  }
});


test('headlight method derives wall angle without bumper/front measurement', () => {
  const s = state({ horizontal: true, cornerSource: 'headlights', leftFront: '5000', rightFront: '5020', bumperFront: '' });
  const r = calculate(s); assert.equal(r.error, undefined);
  near(r.horizontal.cornerDegrees, 90 + Math.asin(20 / 1400) * 180 / Math.PI);
  near(r.horizontal.sideAngleDegrees, 0);
  assert.equal(r.input.bumperFront, null);
  assert.equal(r.horizontal.warning, null);
  const right = calculate({ ...s, side: 'right' });
  near(right.horizontal.cornerDegrees, 90 - Math.asin(20 / 1400) * 180 / Math.PI);
});
test('explicit method switch preserves both angle estimates and changes marks', () => {
  const s = state({ horizontal: true, cornerSource: 'headlights', measureCorner: true, leftFront: '5000', rightFront: '5020' });
  const head = calculate(s), triangle = calculate({ ...s, cornerSource: 'triangle' });
  near(triangle.horizontal.cornerDegrees, 90);
  near(head.horizontal.headlightCornerDegrees, triangle.horizontal.headlightCornerDegrees);
  near(head.horizontal.triangleCornerDegrees, triangle.horizontal.triangleCornerDegrees);
  assert.notEqual(head.horizontal.leftCorner, triangle.horizontal.leftCorner);
  assert.match(head.horizontal.comment, /Разница: 0,82°/);
  assert.match(triangle.horizontal.comment, /используется угол по треугольнику/);
  assert.match(reportText(s, head), /Разница: 0,82°/);
});
test('invalid optional triangle does not disable the selected headlight method', () => {
  const s = state({ horizontal: true, cornerSource: 'headlights', measureCorner: true, triangleDiagonal: '9000' });
  const r = calculate(s); assert.equal(r.error, undefined);
  assert.match(r.horizontal.comment, /не существует/);
  assert.ok(calculate({ ...s, cornerSource: 'triangle' }).error);
  assert.equal(calculate({ ...s, triangleDiagonal: '' }).error, undefined);
});
test('triangle requires a bumper/front anchor while headlight mode ignores it', () => {
  const s = state({ horizontal: true, cornerSource: 'triangle', bumperFront: '' });
  assert.ok(calculate(s).error);
  assert.equal(calculate({ ...s, cornerSource: 'headlights' }).error, undefined);
});
test('nonparallel side measurements warn without blocking comparison', () => {
  const r = calculate(state({ horizontal: true, cornerSource: 'headlights', rearSide: '2000', measureCorner: true }));
  assert.equal(r.error, undefined);
  assert.match(r.horizontal.warning, /условный/);
  assert.match(r.horizontal.comment, /300 мм/);
});
