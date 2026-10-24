import type {
  MatchEndReason,
  MatchState,
  ModeConfig,
  ObjectiveState,
  SnapshotPayload,
  TeamId,
} from '@diep-fried/shared';

const REASONS: Record<MatchEndReason, string> = {
  dominators: 'Tous les Dominators contrôlés',
  conversion: 'Tous les joueurs convertis',
  flags: 'Objectif de captures atteint',
  territories: 'Objectif de points atteint',
  lastSurvivor: 'Dernier survivant',
  mothership: 'Vaisseau-mère adverse détruit',
  timeLimit: 'Limite de temps atteinte',
};

export function teamName(config: ModeConfig, team: TeamId): string {
  return team === 0
    ? 'Neutre'
    : (config.teams.find((t) => t.id === team)?.name ?? `Équipe ${team}`);
}

/** Horloges exclusivement issues du tick serveur ; aucune fin de manche prédite. */
export function secondsLeft(endTick: number | null, tick: number, tickRate: number): number | null {
  return endTick === null ? null : Math.max(0, Math.ceil((endTick - tick) / tickRate));
}

export function clock(seconds: number): string {
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}

export function resultText(match: MatchState, config: ModeConfig): string {
  const result = match.result;
  if (!result) return 'Résultat en attente du serveur';
  const winner =
    result.playerId !== null
      ? `${result.name ?? `Joueur ${result.playerId}`} remporte la manche`
      : result.team !== null
        ? `Victoire : ${teamName(config, result.team)}`
        : 'Égalité';
  return `${winner} · ${REASONS[result.reason]}`;
}

export function matchHeading(match: MatchState, config: ModeConfig, tick: number): string {
  if (match.phase === 'waiting') {
    const missing = Math.max(0, match.minPlayers - match.players);
    return `En attente · ${match.players}/${match.minPlayers} joueurs minimum${missing ? ` · encore ${missing}` : ''}`;
  }
  const remaining = secondsLeft(match.endTick, tick, config.tickRate);
  return match.phase === 'finished'
    ? `${resultText(match, config)} · ${remaining === null ? 'Redémarrage en attente' : `Reprise dans ${remaining} s`}`
    : `Manche ${match.round} · En cours · ${remaining === null ? 'Sans limite de temps' : clock(remaining)}`;
}

export function scoreText(match: MatchState, config: ModeConfig): string {
  if (config.mode === 'survival')
    return `${match.survivors?.length ?? 0} survivant(s) · ${match.players} connecté(s)`;
  const unit =
    { domination: 'objectifs', tag: 'joueurs', ctf: 'captures', breakout: 'pts', mothership: 'PV' }[
      config.mode as string
    ] ?? 'pts';
  return match.scores
    .map((s) => `${teamName(config, s.team)} : ${Math.round(s.score)} ${unit} (${s.players} j.)`)
    .join(' · ');
}

export function objectiveLabel(objective: ObjectiveState): string {
  const prefix = { dominator: 'D', flag: 'F', territory: 'T', mothership: 'M' }[objective.kind];
  return `${prefix}${objective.id + 1}`;
}

export function objectiveText(o: ObjectiveState, config: ModeConfig, tick: number): string {
  const owner = teamName(config, o.team);
  const percent = `${Math.round(Math.max(0, Math.min(1, o.progress)) * 100)} %`;
  const pilot = o.possessedBy != null ? ` · piloté par #${o.possessedBy}` : '';
  if (o.kind === 'flag' && o.flag) {
    const flag = o.flag;
    const remaining = secondsLeft(flag.returnTick, tick, config.tickRate);
    const state =
      flag.status === 'home'
        ? 'à la base'
        : flag.status === 'carried'
          ? `porté par #${flag.carrierId ?? '?'}`
          : `au sol${remaining === null ? '' : ` · retour ${remaining} s`}`;
    return `${owner} · ${state}`;
  }
  if (o.kind === 'territory')
    return `${owner} · ${o.contested ? 'Contesté · ' : ''}${o.capturingTeam ? `Capture ${teamName(config, o.capturingTeam)} : ${percent}` : `Progression : ${percent}`}`;
  const health =
    o.health !== undefined && o.maxHealth !== undefined
      ? `${Math.ceil(o.health)}/${o.maxHealth} PV`
      : `Santé : ${percent}`;
  return `${owner} · ${health}${pilot}`;
}

/** Frontière visuelle : ne jamais interpoler une ancienne vie/manche vers la suivante. */
export function needsVisualReset(
  previous: SnapshotPayload | undefined,
  next: SnapshotPayload,
): boolean {
  return (
    !!previous &&
    (previous.match?.round !== next.match?.round ||
      previous.self.entityId !== next.self.entityId ||
      previous.self.alive !== next.self.alive)
  );
}
