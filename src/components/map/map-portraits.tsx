import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import type { MapMusician } from '@/lib/map-musician-types'
import { cn } from '@/lib/utils'
import { placeMapPortraits, type MapSize } from './map-viewport-math'

interface Props {
  people: MapMusician[]
  fitted: MapSize
  zoom: number
  selectedId: string | null
  disabled: boolean
  onSelect: (id: string) => void
}

export function MapPortraits({ people, fitted, zoom, selectedId, disabled, onSelect }: Props) {
  const offsets = placeMapPortraits(people, fitted, zoom)
  return people.map((person, index) => {
    const { x, y } = offsets[index]
    const selected = person.id === selectedId
    return (
      <div key={person.id} className={cn('absolute origin-top-left focus-within:z-30 hover:z-30', selected ? 'z-20' : 'z-10')}
        style={{ left: `${person.x}%`, top: `${person.y}%`, transform: `scale(${1 / zoom})` }}>
        {(x !== 0 || y !== 0) && <svg aria-hidden="true" width="1" height="1" className="pointer-events-none absolute overflow-visible text-primary">
          <line x1="0" y1="0" x2={x} y2={y} stroke="currentColor" strokeWidth="1.5" />
          <circle cx="0" cy="0" r="3" fill="currentColor" className="stroke-background" />
        </svg>}
        <button type="button" disabled={disabled} aria-label={`选择${person.name}`} aria-pressed={selected}
          onClick={() => onSelect(person.id)} style={{ left: x, top: y }}
          className="group absolute -translate-x-1/2 -translate-y-1/2 rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring">
          <Avatar className={cn('size-11 border border-primary bg-card shadow-md shadow-background/70', selected && 'ring-2 ring-primary ring-offset-2 ring-offset-background')}>
            {person.avatar && <AvatarImage src={person.avatar} alt="" draggable={false} className="object-cover" />}
            <AvatarFallback className="bg-card font-serif text-sm text-primary">{person.name.slice(0, 1)}</AvatarFallback>
          </Avatar>
          <span aria-hidden="true" className={cn('pointer-events-none absolute left-1/2 top-full mt-1.5 -translate-x-1/2 whitespace-nowrap rounded border border-border bg-card px-2 py-0.5 text-xs font-medium text-foreground shadow-sm', !selected && 'hidden group-hover:block group-focus-visible:block')}>
            {person.name}
          </span>
        </button>
      </div>
    )
  })
}
