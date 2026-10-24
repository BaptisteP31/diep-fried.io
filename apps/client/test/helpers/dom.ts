import { vi } from 'vitest';

/** Surface DOM déterministe, partagée par les tests de comportement client. */
export class Element extends EventTarget {
  hidden = true;
  disabled = false;
  checked = false;
  textContent = '';
  value = '';
  className = '';
  type = '';
  max = '';
  width = 0;
  height = 0;
  isContentEditable = false;
  children: Element[] = [];
  parent: Element | null = null;
  role = '';
  dataset: Record<string, string> = {};
  style: Record<string, string> = {};
  private classes = new Set<string>();
  classList = {
    add: (...names: string[]) => names.forEach((name) => this.classes.add(name)),
    remove: (...names: string[]) => names.forEach((name) => this.classes.delete(name)),
    toggle: (name: string, force?: boolean) => {
      const add = force ?? !this.classes.has(name);
      if (add) this.classes.add(name);
      else this.classes.delete(name);
      return add;
    },
  };
  set innerHTML(_value: string) {
    this.children = [];
  }
  appendChild(child: Element): Element {
    child.parent = this;
    this.children.push(child);
    return child;
  }
  replaceChildren(...children: Element[]): void {
    this.children = [];
    children.forEach((child) => this.appendChild(child));
    if (this instanceof Select) this.value = children[0]?.value ?? '';
  }
  focus(): void {
    (document as unknown as { activeElement: Element }).activeElement = this;
  }
  closest(selector: string): Element | null {
    if (
      (selector.includes('button') && this.type === 'button') ||
      (selector.includes('[role="dialog"]') && this.role === 'dialog')
    )
      return this;
    return this.parent?.closest(selector) ?? null;
  }
  querySelectorAll(selector: string): Element[] {
    return this.children.flatMap((child) => [
      ...(selector.startsWith('button') && child.type === 'button' && !child.disabled
        ? [child]
        : []),
      ...child.querySelectorAll(selector),
    ]);
  }
  getContext(): null {
    return null;
  }
}
export class TextInput extends Element {}
export class TextArea extends Element {}
export class Select extends Element {}

export function installDom() {
  const elements = new Map<string, Element>();
  const el = (id: string) => {
    if (!elements.has(id)) {
      const node =
        id === 'menu-mode' ||
        id === 'menu-arena-size' ||
        id === 'menu-shape-density' ||
        id === 'settings-quality'
          ? new Select()
          : ['menu-name', 'menu-code', 'menu-max-players', 'settings-grid'].includes(id)
            ? new TextInput()
            : new Element();
      if (id.endsWith('-modal')) node.role = 'dialog';
      elements.set(id, node);
    }
    return elements.get(id)!;
  };
  const win = new EventTarget();
  vi.stubGlobal('window', win);
  vi.stubGlobal('document', {
    activeElement: null,
    getElementById: el,
    createElement: (tag: string) =>
      tag === 'input' ? new TextInput() : tag === 'select' ? new Select() : new Element(),
  });
  vi.stubGlobal('HTMLElement', Element);
  vi.stubGlobal('HTMLInputElement', TextInput);
  vi.stubGlobal('HTMLTextAreaElement', TextArea);
  vi.stubGlobal('HTMLSelectElement', Select);
  vi.stubGlobal('location', { search: '', href: 'http://test/', host: 'test', protocol: 'http:' });
  vi.stubGlobal('history', { replaceState: vi.fn() });
  return { el, win };
}
