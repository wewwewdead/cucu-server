// Shared shape for the profile/identity payload returned by /me and POST /profile.

export interface ProfileRow {
  id: string
  username: string | null
  display_name: string | null
  bio: string | null
  avatar_url: string | null
  onboarded: boolean | null
}

export function toProfileResponse(id: string, email: string | null, row: ProfileRow | null) {
  return {
    id,
    email,
    hasProfile: row?.onboarded ?? false,
    username: row?.username ?? null,
    displayName: row?.display_name ?? null,
    bio: row?.bio ?? null,
    avatarUrl: row?.avatar_url ?? null,
  }
}
