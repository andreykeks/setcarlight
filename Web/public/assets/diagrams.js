import { format, mm } from './calculation.js';

const palette = { green: '#d1f56e', muted: '#96a598', grid: '#ffffff09', floor: '#5a675c' };
const line = (x1, y1, x2, y2, color = palette.muted, dash = '', width = 1) => `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${color}" stroke-width="${width}"${dash ? ` stroke-dasharray="${dash}"` : ''}/>`;
const text = (value, x, y, color = palette.muted, size = 11, anchor = 'middle') => `<text x="${x}" y="${y}" fill="${color}" font-size="${size}" text-anchor="${anchor}" dominant-baseline="middle">${value}</text>`;
const dot = (x, y, radius = 3, color = palette.green) => `<circle cx="${x}" cy="${y}" r="${radius}" fill="${color}"/>`;
const wrap = (content, title, width = 600, height = 250) => `<svg class="diagram-svg" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" role="img" aria-label="${title}"><defs><pattern id="grid" width="25" height="25" patternUnits="userSpaceOnUse"><path d="M 25 0 L 0 0 0 25" fill="none" stroke="${palette.grid}"/></pattern><linearGradient id="beam" x1="0" y1="0" x2="0" y2="1"><stop stop-color="${palette.green}" stop-opacity=".16"/><stop offset="1" stop-color="${palette.green}" stop-opacity="0"/></linearGradient></defs><rect width="100%" height="100%" rx="12" fill="#121912"/><rect width="100%" height="100%" fill="url(#grid)"/>${content}</svg>`;

export function wallDiagram(result, state) {
  const { input: i, horizontal: h } = result;
  const half = h?.halfSpacing ?? i.spacing / 2;
  const shifts = [h?.leftShift ?? 0, h?.rightShift ?? 0];
  const feet = [-half - shifts[0], half - shifts[1]];
  const minimum = Math.min(-half, ...feet, 0) - 450, maximum = Math.max(half, ...feet, 0) + 450;
  const scale = Math.min(530 / (maximum - minimum), 170 / Math.max(i.height, i.rightHeight));
  const center = 300 - (minimum + maximum) * scale / 2, ground = 218;
  let content = line(22, ground, 578, ground, palette.floor) + line(center, 30, center, ground, '#96a59866', '3 5');
  for (const [index, value] of [result.leftTarget, result.rightTarget].entries()) {
    const x = center + (index ? half : -half) * scale, foot = center + feet[index] * scale;
    const height = index ? i.rightHeight : i.height;
    const y = ground - value * scale, initialY = ground - height * scale;
    content += line(foot, 36, foot, ground, '#96a59899', '4 5');
    content += line(foot - 38, initialY, foot + 38, initialY, '#96a598cc', '4 4');
    // The rise is illustrative; the target remains on the left horizontal segment.
    const halfWidth = Math.min(48, half * scale * 0.7);
    const rise = Math.min(halfWidth * 0.45, Math.max(0, y - 34));
    const upperRise = Math.min(halfWidth * 0.06, Math.max(0, y - rise - 32));
    const cutoff = `M${x - halfWidth} ${y} L${x} ${y} L${x + halfWidth * 0.4} ${y - rise} L${x + halfWidth} ${y - rise - upperRise}`;
    content += `<path d="${cutoff} L${x + halfWidth} ${ground} L${x - halfWidth} ${ground} Z" fill="url(#beam)"/>`;
    content += `<path d="${cutoff}" fill="none" stroke="${palette.green}" stroke-width="2" stroke-linejoin="round"/>` + dot(x, y);
    content += text(index ? 'ПРАВАЯ' : 'ЛЕВАЯ', x, 20, palette.muted, 10);
    content += text(mm(value), x, Math.min(y + 27, ground - 14), palette.green, 15);
  }
  content += h ? text(`ОТ УГЛА: Л ${format(h.leftCorner)} · П ${mm(h.rightCorner)}`, 300, 237, palette.muted, 10) : text('ОСЬ АВТОМОБИЛЯ', center, 237, palette.muted, 9);
  return wrap(content, `Разметка стены: левая ${mm(result.leftTarget)}, правая ${mm(result.rightTarget)} от пола. Высота левых горизонтальных участков СТГ; у обеих фар подъём вправо показан условно.`);
}

export function sideDiagram(result, state) {
  const { input: i } = result, ground = 197;
  const lamp = { x: 105, y: 69 }, wall = { x: 506, y: 121 };
  let content = line(20, ground, 575, ground, palette.floor) + line(wall.x, 25, wall.x, ground, palette.muted, '', 3);
  content += `<path d="M${lamp.x} ${lamp.y} L${wall.x} ${wall.y} L${wall.x} ${ground} Z" fill="url(#beam)"/>`;
  content += line(lamp.x, lamp.y, wall.x, lamp.y, palette.muted, '4 4');
  content += line(lamp.x, lamp.y, wall.x, wall.y, palette.green, '', 2);
  content += `<path d="M 23 95 V 55 L 53 55 L 69 73 L 101 78 L 106 95 Z" fill="#1a211b" stroke="${palette.muted}" stroke-width="1.4"/><circle cx="77" cy="96" r="10" fill="#121912" stroke="${palette.muted}"/>`;
  content += dot(lamp.x, lamp.y) + text(mm(i.height), lamp.x + 12, lamp.y - 17, palette.muted, 11);
  if (state.lensEnabled && i.lensSetback > 0) {
    const fraction = (i.lensSetback / Math.cos(result.horizontal?.yaw ?? 0)) / result.leftAxis;
    const x = lamp.x + (wall.x - lamp.x) * fraction, y = lamp.y + (wall.y - lamp.y) * fraction;
    content += line(x, y - 10, x, y + 10, palette.muted, '', 2) + text('Стекло', x + 22, 31, palette.muted, 10);
  }
  content += line(wall.x + 14, lamp.y, wall.x + 14, wall.y, palette.green);
  content += line(wall.x + 10, lamp.y, wall.x + 18, lamp.y, palette.green) + line(wall.x + 10, wall.y, wall.x + 18, wall.y, palette.green);
  content += text(`−${format(result.leftDrop)}`, wall.x + 48, 91, palette.green, 13) + text('мм', wall.x + 48, 108, palette.muted, 10);
  content += text(mm(result.leftTarget), wall.x - 14, wall.y + 26, palette.green, 14, 'end');
  content += line(lamp.x, 226, wall.x, 226, palette.muted) + line(lamp.x, 221, lamp.x, 231) + line(wall.x, 221, wall.x, 231);
  content += `<rect x="256" y="214" width="100" height="24" fill="#121912"/>` + text(mm(result.leftAxis), 306, 226);
  return wrap(content, 'Вид вдоль оси автомобиля: от фары до передней стены');
}

export function planDiagram(result, state) {
  const { input: i, horizontal: h } = result;
  if (!h) return wallDiagram(result, state);
  const yaw = h.yaw, halfBody = i.spacing / 2 + 150, length = Math.min(3800, Math.max(2000, h.diagramBumper * 0.65));
  const point = (long, transverse) => ({ x: h.bumperX + long * Math.sin(yaw) + transverse * Math.cos(yaw), y: h.diagramBumper - long * Math.cos(yaw) + transverse * Math.sin(yaw) });
  const body = [point(0, -halfBody), point(0, halfBody), point(-length, halfBody), point(-length, -halfBody)];
  const targets = [{ x: h.axisX - h.halfSpacing, y: 0 }, { x: h.axisX + h.halfSpacing, y: 0 }];
  const references = [h.leftReference, h.rightReference], measured = [i.leftFront, i.rightFront];
  const lamps = targets.map((p, n) => ({ x: p.x - references[n] * Math.tan(yaw), y: references[n] }));
  const maxY = Math.max(...body.map(p => p.y), ...lamps.map(p => p.y)) + 400;
  const sideEnd = { x: h.sign * Math.cos(h.corner) / Math.sin(h.corner) * maxY, y: maxY };
  const frontEnd = { x: h.sign * (Math.max(...targets.map(p => Math.abs(p.x)), Math.abs(h.bumperX)) + 700), y: 0 };
  const points = [...body, ...targets, ...lamps, sideEnd, frontEnd, { x: 0, y: 0 }];
  const minX = Math.min(...points.map(p => p.x)), maxX = Math.max(...points.map(p => p.x));
  const scale = Math.min(520 / Math.max(100, maxX - minX), 185 / maxY);
  const screen = p => ({ x: 300 + (p.x - (minX + maxX) / 2) * scale, y: 35 + p.y * scale });
  const origin = screen({ x: 0, y: 0 }), end = screen(frontEnd), side = screen(sideEnd);
  let content = line(origin.x, origin.y, end.x, end.y, palette.muted, '', 2) + line(origin.x, origin.y, side.x, side.y, palette.muted, '', 2);
  content += text('ПЕРЕДНЯЯ СТЕНА', (origin.x + end.x) / 2, 15, palette.muted, 10);
  content += text('O', origin.x - h.sign * 14, origin.y, palette.green, 11) + text(`${format(h.cornerDegrees, 1)}°`, origin.x + h.sign * 29, origin.y + 19, palette.muted, 10);
  content += `<polygon points="${body.map(screen).map(p => `${p.x},${p.y}`).join(' ')}" fill="#1a211b" stroke="#96a59899" stroke-width="1.2"/>`;
  const front = screen(point(-800, -halfBody * 0.8)), back = screen(point(-800, halfBody * 0.8));
  content += line(front.x, front.y, back.x, back.y, palette.floor);
  lamps.forEach((lamp, n) => {
    const l = screen(lamp), t = screen(targets[n]), foot = screen({ x: lamp.x, y: 0 });
    content += line(l.x, l.y, foot.x, foot.y, palette.muted, '4 4') + line(l.x, l.y, t.x, t.y, palette.green, '', 1.8) + dot(l.x, l.y) + dot(t.x, t.y);
    content += text(n ? 'П' : 'Л', l.x, l.y + 13, palette.green, 10);
    if (state.lensEnabled) {
      const glass = screen({ x: targets[n].x - measured[n] * Math.tan(yaw), y: measured[n] });
      content += dot(glass.x, glass.y, 2, palette.muted);
    }
  });
  content += text('КОРПУС ПОКАЗАН УСЛОВНО', 584, 236, palette.muted, 8, 'end');
  return wrap(content, `Вид сверху. Боковая стена ${state.side === 'left' ? 'слева' : 'справа'}, угол стен ${format(h.cornerDegrees, 2)}°`);
}

export const triangleDiagram = () => wrap(
  line(56, 163, 29, 32, palette.muted, '', 2) + line(29, 32, 266, 32, palette.muted, '', 2) + line(56, 163, 266, 32, palette.green, '5 4', 1.5) +
  text('O', 15, 22, palette.green, 13) + text('A', 43, 181, palette.green, 13) + text('B', 275, 21, palette.green, 13) +
  text('OA', 23, 101, palette.muted, 10) + text('OB', 145, 16, palette.muted, 10) + text('AB', 173, 114, palette.green, 10),
  'Треугольник: O — угол стен, A — на боковой, B — на передней стене', 300, 200);
