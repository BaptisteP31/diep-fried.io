export interface MovingCircle {
  id: number;
  x: number;
  y: number;
  prevX: number;
  prevY: number;
  radius: number;
}

/** Premier contact dans [0,1], en mouvement relatif : balles opposées comprises. */
export function contactTime(a: MovingCircle, b: MovingCircle): number | null {
  const x = a.prevX - b.prevX;
  const y = a.prevY - b.prevY;
  const dx = a.x - a.prevX - (b.x - b.prevX);
  const dy = a.y - a.prevY - (b.y - b.prevY);
  const radius = a.radius + b.radius;
  const c = x * x + y * y - radius * radius;
  if (c <= 0) return 0;
  const v2 = dx * dx + dy * dy;
  const dot = x * dx + y * dy;
  if (v2 === 0 || dot >= 0) return null;
  const discriminant = dot * dot - v2 * c;
  if (discriminant < 0) return null;
  const time = (-dot - Math.sqrt(discriminant)) / v2;
  return time >= 0 && time <= 1 ? time : null;
}

/** Grille de boîtes balayées, paires dédupliquées et ordre indépendant des cellules. */
export function collisionCandidates<T extends MovingCircle>(
  bodies: T[],
  cellSize: number,
  includePair: (a: T, b: T) => boolean = () => true,
): [T, T][] {
  const cells = new Map<string, T[]>();
  const pairs = new Map<string, [T, T]>();
  for (const body of bodies) {
    const minX = Math.floor((Math.min(body.x, body.prevX) - body.radius) / cellSize);
    const maxX = Math.floor((Math.max(body.x, body.prevX) + body.radius) / cellSize);
    const minY = Math.floor((Math.min(body.y, body.prevY) - body.radius) / cellSize);
    const maxY = Math.floor((Math.max(body.y, body.prevY) + body.radius) / cellSize);
    for (let x = minX; x <= maxX; x++) {
      for (let y = minY; y <= maxY; y++) {
        const key = `${x},${y}`;
        let cell = cells.get(key);
        if (!cell) cells.set(key, (cell = []));
        for (const other of cell) {
          if (!includePair(body, other)) continue;
          const a = body.id < other.id ? body : other;
          const b = body.id < other.id ? other : body;
          pairs.set(`${a.id},${b.id}`, [a, b]);
        }
        cell.push(body);
      }
    }
  }
  return [...pairs.values()].sort(([a, b], [c, d]) => a.id - c.id || b.id - d.id);
}
