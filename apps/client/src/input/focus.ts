/** Une saisie ou un contrôle conserve toutes ses touches pour son propre usage. */
export function isTypingTarget(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    target instanceof HTMLSelectElement ||
    (target instanceof HTMLElement &&
      (target.isContentEditable || !!target.closest('[role="dialog"]')))
  );
}

export function isEditingTarget(target: EventTarget | null): boolean {
  return isTypingTarget(target) || (target instanceof HTMLElement && !!target.closest('button'));
}
