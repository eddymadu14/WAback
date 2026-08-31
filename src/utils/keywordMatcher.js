
export function matchKeywords(text, keywords) {
  return keywords
    .split(",")
    .some(k => text.includes(k.trim().toLowerCase()));
}
