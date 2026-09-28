// wrap.js：循环距离与新旧
export function distanceOf(a, b, span) {
  return (((a - b) % span) + span) % span;
}

export function newerOf(a, b, span) {
  const d = distanceOf(a, b, span);
  if (d === 0) return 0;
  if (d * 2 === span) return -1;
  return d * 2 < span ? 1 : 0;
}
