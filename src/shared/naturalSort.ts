function splitIntoTokens(value: string): string[] {
  return value.match(/(\d+|\D+)/g) ?? [value]
}

function compareToken(a: string, b: string): number {
  const aIsNum = /^\d+$/.test(a)
  const bIsNum = /^\d+$/.test(b)
  if (aIsNum && bIsNum) {
    const aNum = Number(a)
    const bNum = Number(b)
    if (aNum !== bNum) return aNum - bNum
    return a.length - b.length
  }
  return a.localeCompare(b, undefined, { sensitivity: 'base' })
}

export function compareNaturalPathBaseName(aPath: string, bPath: string): number {
  const a = aPath.split(/[/\\]/).pop() ?? aPath
  const b = bPath.split(/[/\\]/).pop() ?? bPath
  const aTokens = splitIntoTokens(a)
  const bTokens = splitIntoTokens(b)
  const max = Math.max(aTokens.length, bTokens.length)
  for (let i = 0; i < max; i++) {
    const aTok = aTokens[i]
    const bTok = bTokens[i]
    if (aTok == null) return -1
    if (bTok == null) return 1
    const cmp = compareToken(aTok, bTok)
    if (cmp !== 0) return cmp
  }
  return a.localeCompare(b, undefined, { sensitivity: 'base' })
}

