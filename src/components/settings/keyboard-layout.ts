export interface KeyDef {
  code: string
  w: number
  h?: number
  row: number
  col: number
}

type LayoutRows = KeyDef[][]

const FN_ROW: KeyDef[] = [
  { code: 'Escape', w: 1, row: 0, col: 0 }, { code: 'F1', w: 1, row: 0, col: 1 }, { code: 'F2', w: 1, row: 0, col: 2 },
  { code: 'F3', w: 1, row: 0, col: 3 }, { code: 'F4', w: 1, row: 0, col: 4 }, { code: 'F5', w: 1, row: 0, col: 5 },
  { code: 'F6', w: 1, row: 0, col: 6 }, { code: 'F7', w: 1, row: 0, col: 7 }, { code: 'F8', w: 1, row: 0, col: 8 },
  { code: 'F9', w: 1, row: 0, col: 9 }, { code: 'F10', w: 1, row: 0, col: 10 }, { code: 'F11', w: 1, row: 0, col: 11 },
  { code: 'F12', w: 1, row: 0, col: 12 },
]

const NUM_ROW: KeyDef[] = [
  { code: 'Backquote', w: 1, row: 1, col: 0 }, { code: 'Digit1', w: 1, row: 1, col: 1 }, { code: 'Digit2', w: 1, row: 1, col: 2 },
  { code: 'Digit3', w: 1, row: 1, col: 3 }, { code: 'Digit4', w: 1, row: 1, col: 4 }, { code: 'Digit5', w: 1, row: 1, col: 5 },
  { code: 'Digit6', w: 1, row: 1, col: 6 }, { code: 'Digit7', w: 1, row: 1, col: 7 }, { code: 'Digit8', w: 1, row: 1, col: 8 },
  { code: 'Digit9', w: 1, row: 1, col: 9 }, { code: 'Digit0', w: 1, row: 1, col: 10 }, { code: 'Minus', w: 1, row: 1, col: 11 },
  { code: 'Equal', w: 1, row: 1, col: 12 }, { code: 'Backspace', w: 2, row: 1, col: 13 },
]

const QWERTY_ROW: KeyDef[] = [
  { code: 'Tab', w: 1.5, row: 2, col: 0 }, { code: 'KeyQ', w: 1, row: 2, col: 1 }, { code: 'KeyW', w: 1, row: 2, col: 2 },
  { code: 'KeyE', w: 1, row: 2, col: 3 }, { code: 'KeyR', w: 1, row: 2, col: 4 }, { code: 'KeyT', w: 1, row: 2, col: 5 },
  { code: 'KeyY', w: 1, row: 2, col: 6 }, { code: 'KeyU', w: 1, row: 2, col: 7 }, { code: 'KeyI', w: 1, row: 2, col: 8 },
  { code: 'KeyO', w: 1, row: 2, col: 9 }, { code: 'KeyP', w: 1, row: 2, col: 10 }, { code: 'BracketLeft', w: 1, row: 2, col: 11 },
  { code: 'BracketRight', w: 1, row: 2, col: 12 }, { code: 'Backslash', w: 1.5, row: 2, col: 13 },
]

const HOME_ROW: KeyDef[] = [
  { code: 'CapsLock', w: 1.75, row: 3, col: 0 }, { code: 'KeyA', w: 1, row: 3, col: 1 }, { code: 'KeyS', w: 1, row: 3, col: 2 },
  { code: 'KeyD', w: 1, row: 3, col: 3 }, { code: 'KeyF', w: 1, row: 3, col: 4 }, { code: 'KeyG', w: 1, row: 3, col: 5 },
  { code: 'KeyH', w: 1, row: 3, col: 6 }, { code: 'KeyJ', w: 1, row: 3, col: 7 }, { code: 'KeyK', w: 1, row: 3, col: 8 },
  { code: 'KeyL', w: 1, row: 3, col: 9 }, { code: 'Semicolon', w: 1, row: 3, col: 10 }, { code: 'Quote', w: 1, row: 3, col: 11 },
  { code: 'Enter', w: 2.25, row: 3, col: 12 },
]

const BOTTOM_ROW: KeyDef[] = [
  { code: 'ShiftLeft', w: 2.25, row: 4, col: 0 }, { code: 'KeyZ', w: 1, row: 4, col: 1 }, { code: 'KeyX', w: 1, row: 4, col: 2 },
  { code: 'KeyC', w: 1, row: 4, col: 3 }, { code: 'KeyV', w: 1, row: 4, col: 4 }, { code: 'KeyB', w: 1, row: 4, col: 5 },
  { code: 'KeyN', w: 1, row: 4, col: 6 }, { code: 'KeyM', w: 1, row: 4, col: 7 }, { code: 'Comma', w: 1, row: 4, col: 8 },
  { code: 'Period', w: 1, row: 4, col: 9 }, { code: 'Slash', w: 1, row: 4, col: 10 }, { code: 'ShiftRight', w: 2.75, row: 4, col: 11 },
]

const SPACE_ROW: KeyDef[] = [
  { code: 'ControlLeft', w: 1.25, row: 5, col: 0 }, { code: 'MetaLeft', w: 1.25, row: 5, col: 1 },
  { code: 'AltLeft', w: 1.25, row: 5, col: 2 }, { code: 'Space', w: 6.25, row: 5, col: 3 },
  { code: 'AltRight', w: 1.25, row: 5, col: 4 }, { code: 'MetaRight', w: 1.25, row: 5, col: 5 },
  { code: 'ContextMenu', w: 1.25, row: 5, col: 6 }, { code: 'ControlRight', w: 1.25, row: 5, col: 7 },
]

const NAV_CLUSTER: KeyDef[] = [
  { code: 'PrintScreen', w: 1, row: 0, col: 14 }, { code: 'ScrollLock', w: 1, row: 0, col: 15}, { code: 'Pause', w: 1, row: 0, col: 16 },
  { code: 'Insert', w: 1, row: 1, col: 14 }, { code: 'Home', w: 1, row: 1, col: 15 }, { code: 'PageUp', w: 1, row: 1, col: 16 },
  { code: 'Delete', w: 1, row: 2, col: 14 }, { code: 'End', w: 1, row: 2, col: 15 }, { code: 'PageDown', w: 1, row: 2, col: 16 },
]

const ARROW_KEYS: KeyDef[] = [
  { code: 'ArrowUp', w: 1, row: 4, col: 15 },
  { code: 'ArrowLeft', w: 1, row: 5, col: 14 }, 
  { code: 'ArrowDown', w: 1, row: 5, col: 15 }, 
  { code: 'ArrowRight', w: 1, row: 5, col: 16 },
]

export function getLayout(): { main: LayoutRows; nav: KeyDef[] } {
  return { main: [FN_ROW, NUM_ROW, QWERTY_ROW, HOME_ROW, BOTTOM_ROW, SPACE_ROW], nav: [...NAV_CLUSTER, ...ARROW_KEYS] }
}

const KEY_LABELS: Record<string, string> = {
  Escape: 'Esc', Backspace: '←', Tab: 'Tab', CapsLock: 'Caps', Enter: 'Enter',
  ShiftLeft: 'Shift', ShiftRight: 'Shift',
  ControlLeft: 'Ctrl', ControlRight: 'Ctrl',
  AltLeft: 'Alt', AltRight: 'Alt',
  MetaLeft: 'Win', MetaRight: 'Win', ContextMenu: 'Menu', Space: '',
  PrintScreen: 'PrtSc', ScrollLock: 'ScrLk', Pause: 'Pause',
  Insert: 'Ins', Delete: 'Del', Home: 'Home', End: 'End',
  PageUp: 'PgUp', PageDown: 'PgDn',
  ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→',
  Backquote: '`', Digit1: '1', Digit2: '2', Digit3: '3', Digit4: '4',
  Digit5: '5', Digit6: '6', Digit7: '7', Digit8: '8', Digit9: '9', Digit0: '0',
  Minus: '-', Equal: '=', BracketLeft: '[', BracketRight: ']', Backslash: '\\',
  Semicolon: ';', Quote: "'", Comma: ',', Period: '.', Slash: '/',
  F1: 'F1', F2: 'F2', F3: 'F3', F4: 'F4', F5: 'F5', F6: 'F6',
  F7: 'F7', F8: 'F8', F9: 'F9', F10: 'F10', F11: 'F11', F12: 'F12',
}

export function getKeyLabel(code: string): string {
  const label = KEY_LABELS[code]
  if (label !== undefined) return label
  if (code.startsWith('Key')) return code[3]
  if (code.startsWith('Digit')) return code[5]
  return code
}

const KEY_CODE_TO_SHORTCUT: Record<string, string> = {
  Backquote: '`', Digit1: '1', Digit2: '2', Digit3: '3', Digit4: '4',
  Digit5: '5', Digit6: '6', Digit7: '7', Digit8: '8', Digit9: '9', Digit0: '0',
  Minus: '-', Equal: '=', BracketLeft: '[', BracketRight: ']', Backslash: '\\',
  Semicolon: ';', Quote: "'", Comma: ',', Period: '.', Slash: '/',
  KeyA: 'a', KeyB: 'b', KeyC: 'c', KeyD: 'd', KeyE: 'e', KeyF: 'f',
  KeyG: 'g', KeyH: 'h', KeyI: 'i', KeyJ: 'j', KeyK: 'k', KeyL: 'l',
  KeyM: 'm', KeyN: 'n', KeyO: 'o', KeyP: 'p', KeyQ: 'q', KeyR: 'r',
  KeyS: 's', KeyT: 't', KeyU: 'u', KeyV: 'v', KeyW: 'w', KeyX: 'x',
  KeyY: 'y', KeyZ: 'z',
}

export function keyCodeToShortcutPart(code: string): string {
  if (KEY_CODE_TO_SHORTCUT[code]) return KEY_CODE_TO_SHORTCUT[code]
  if (code.startsWith('Key')) return code[3]
  if (code.startsWith('Digit')) return code[5]
  return code
}

