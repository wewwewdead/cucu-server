// Shared shape for a Space payload returned by the spaces routes. Mirrors the client's `SpaceDTO`.

export interface SpaceRow {
  id: string
  name: string
  icon: string | null
  hashtags: string[] | null
  accent: string | null
  created_at: string
}

export function toSpaceResponse(row: SpaceRow) {
  return {
    id: row.id,
    name: row.name,
    icon: row.icon ?? '',
    hashtags: row.hashtags ?? [],
    accent: row.accent ?? 'pink',
    createdAt: new Date(row.created_at).toISOString(),
  }
}
