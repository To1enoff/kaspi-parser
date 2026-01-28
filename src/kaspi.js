export function extractProductId(input) {
  if (!input) return null;

  // 1) если юзер уже ввёл id
  if (/^\d{6,}$/.test(input.trim())) return input.trim();

  const s = input.trim();

  // Kaspi: ...-100984093/ или ...-145440732/ и т.п.
  const m = s.match(/-(\d{6,})\/?/);
  if (m?.[1]) return m[1];

  // иногда: /p/...-ID?c=
  const m2 = s.match(/\/p\/.*-(\d{6,})(?:\/|\?|$)/);
  if (m2?.[1]) return m2[1];

  return null;
}
