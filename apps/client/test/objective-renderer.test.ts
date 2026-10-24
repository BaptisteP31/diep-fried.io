import { afterEach, describe, expect, it, vi } from 'vitest';
import { resolveModeConfig } from '@diep-fried/shared';
import { Renderer } from '../src/render/renderer';
import { drawMinimap } from '../src/render/minimap';
import { match, snapshot, tank } from './helpers/match';

function context() {
  const calls: { name: string; args: any[] }[] = [];
  const ctx = new Proxy<Record<string, any>>(
    {},
    {
      get: (target, key: string) =>
        (target[key] ??= (...args: any[]) => calls.push({ name: key, args })),
      set: (target, key: string, value) => {
        target[key] = value;
        return true;
      },
    },
  ) as unknown as CanvasRenderingContext2D;
  return { ctx, calls };
}

function renderer() {
  vi.stubGlobal('window', { devicePixelRatio: 1 });
  const trace = context();
  const canvas = {
    getContext: () => trace.ctx,
    getBoundingClientRect: () => ({ width: 1200, height: 800 }),
  };
  const renderer = new Renderer(canvas as unknown as HTMLCanvasElement);
  renderer.setDisplaySettings({ grid: false, maxDpr: 1 });
  return { ...trace, renderer };
}
afterEach(() => vi.unstubAllGlobals());

describe('appels Canvas réels du renderer et de la minicarte', () => {
  it('dessine les quatre objectifs globaux hors FOV et les drapeaux à leur position courante', () => {
    const { ctx, calls } = context();
    const config = resolveModeConfig('domination', { arenaSize: 'small' });
    const objectives = [
      { id: 0, x: 600, y: 600 },
      { id: 1, x: 2400, y: 600 },
      { id: 2, x: 600, y: 2400 },
      { id: 3, x: 2400, y: 2400 },
    ].map((at) => ({
      ...at,
      kind: 'dominator' as const,
      radius: 70,
      team: 1,
      progress: 1,
      entityId: -1,
    }));
    drawMinimap(
      ctx,
      130,
      130,
      { ...snapshot({ entities: [], match: match({ objectives }) }) },
      config,
    );
    expect(calls.filter((c) => c.name === 'fillText').map((c) => c.args[0])).toEqual([
      'D1',
      'D2',
      'D3',
      'D4',
    ]);
    expect(calls.some((c) => c.name === 'arc' && c.args[0] === 100.4 && c.args[1] === 100.4)).toBe(
      true,
    );
    calls.length = 0;
    drawMinimap(
      ctx,
      130,
      130,
      {
        ...snapshot({
          entities: [],
          match: match({
            objectives: [
              {
                ...objectives[0]!,
                kind: 'flag',
                x: 1500,
                y: 1500,
                flag: { status: 'carried', carrierId: 2, homeX: 600, homeY: 600, returnTick: null },
              },
            ],
          }),
        }),
      },
      config,
    );
    expect(calls.find((c) => c.name === 'arc')?.args.slice(0, 3)).toEqual([65, 65, 5]);
    expect(calls.some((c) => c.name === 'setLineDash' && c.args[0].length === 2)).toBe(true);
  });

  it('trace le cercle sûr et remplit seulement son extérieur en monde et minicarte', () => {
    const { renderer: world, calls } = renderer();
    const config = resolveModeConfig('survival', { arenaSize: 'small' });
    const frame = snapshot({ match: match({ safeZone: { x: 500, y: 500, radius: 700 } }) });
    world.draw(frame, config, 100);
    expect(calls.filter((c) => c.name === 'fill' && c.args[0] === 'evenodd')).toHaveLength(2); // arène + extérieur cercle
    const safe = calls.find((c) => c.name === 'arc' && c.args[2] > 400);
    expect(safe?.args.slice(0, 2)).toEqual([600, 400]);
    const trace = context();
    drawMinimap(trace.ctx, 130, 130, frame, config);
    expect(trace.calls.some((c) => c.name === 'fill' && c.args[0] === 'evenodd')).toBe(true);
    expect(trace.calls.find((c) => c.name === 'arc')?.args[2]).toBeCloseTo((700 * 118) / 3000);
  });

  it.each([
    ['dominator-gunner', 6],
    ['mothership', 6],
    ['summoner', 4],
    ['guardian-of-the-pentagons', 3],
  ] as const)(
    'dessine réellement le corps %s à %i sommets depuis le catalogue spécial',
    (classId, sides) => {
      const { renderer: world, calls } = renderer();
      const entity = tank({ classId, radius: 70 });
      world.draw(
        snapshot({ entities: [entity], match: undefined }),
        resolveModeConfig('sandbox'),
        100,
      );
      const paths: any[][] = [];
      let points: any[] = [];
      for (const call of calls) {
        if (call.name === 'beginPath') points = [];
        if (call.name === 'moveTo' || call.name === 'lineTo') points.push(call.args);
        if (call.name === 'closePath') paths.push(points);
      }
      expect(
        paths.some(
          (path) =>
            path.length === sides &&
            path.every(([x, y]) => Math.abs(Math.hypot(x, y) - 70) < 0.001),
        ),
      ).toBe(true);
    },
  );

  it('place le calque objectif sous le tank et purge les fantômes lors du reset', () => {
    const { renderer: world, calls } = renderer();
    const config = resolveModeConfig('domination');
    const frame = snapshot({
      match: match({
        objectives: [
          {
            id: 0,
            kind: 'dominator',
            x: 500,
            y: 500,
            radius: 70,
            entityId: -2,
            team: 1,
            progress: 0.5,
          },
        ],
      }),
    });
    world.draw(frame, config, 100);
    expect(calls.findIndex((c) => c.name === 'fillText' && c.args[0] === 'D1')).toBeLessThan(
      calls.findIndex((c) => c.name === 'arc' && c.args[2] === 20),
    );
    world.reset();
    calls.length = 0;
    world.draw(snapshot({ entities: [], match: undefined }), config, 110);
    expect(calls.some((c) => c.name === 'arc' && c.args[2] === 20)).toBe(false);
  });
});
