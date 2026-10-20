import type { CSSProperties } from 'react'

const RIVER_PATH = 'M 810 269 C 940 282 730 307 790 326 C 880 351 920 352 879 380 C 840 405 741 426 771 455 C 803 485 878 499 825 540 C 780 577 802 584 801 601'

/** 与原画金色乐径对齐的光流，以及错峰循环的前后景粒子。 */
export function JourneyAtmosphere() {
  return (
    <div className="journey-atmosphere" aria-hidden="true">
      <div className="journey-haze" />
      <div className="journey-haze" />
      <div className="journey-rays" />
      <svg className="journey-river" viewBox="0 0 1600 900" preserveAspectRatio="none">
        <path className="journey-river-glow" d={RIVER_PATH} pathLength={100} />
        <path className="journey-river-trail" d={RIVER_PATH} pathLength={100} />
      </svg>
      <div className="journey-sparks">
        {Array.from({ length: 52 }, (_, index) => (
          <i key={index} style={{
            '--x': `${(index * 37 + 7) % 100}%`,
            '--y': `${(index * 29 + 17) % 100}%`,
            '--delay': `${-index * 0.83}s`,
            '--duration': `${9 + index % 9}s`,
            '--drift': `${(index % 2 ? 1 : -1) * (25 + index % 40)}px`,
            '--size': `${2 + index % 4}px`,
          } as CSSProperties} />
        ))}
      </div>
      <div className="journey-notes">
        {Array.from({ length: 12 }, (_, index) => (
          <i key={index} style={{
            '--x': `${31 + index * 7 % 42}%`,
            '--y': `${46 + index * 11 % 30}%`,
            '--delay': `${-index * 1.7}s`,
            '--duration': `${10 + index % 5}s`,
            '--drift': `${(index % 2 ? 1 : -1) * (25 + index * 3)}px`,
            '--size': `${18 + index % 4 * 5}px`,
          } as CSSProperties}>{index % 3 === 0 ? '♫' : '♪'}</i>
        ))}
      </div>
      <div className="journey-orbit" />
    </div>
  )
}
