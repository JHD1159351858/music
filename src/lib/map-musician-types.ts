import type { Composer } from './composers'

export type MapKind = 'china' | 'europe'

export interface MapMusician extends Composer {
  origin: 'builtin' | 'custom'
  map_kind: MapKind
  teacher_id: string | null
  avatar_file_id: string | null
}

export type MapMusicianInput = Omit<Composer, 'id' | 'avatar'> & {
  map_kind: MapKind
  avatar_file_id: string | null
  avatar_receipt?: string
}
