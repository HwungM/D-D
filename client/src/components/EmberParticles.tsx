import { useMemo } from 'react'

interface Particle {
  id: number
  left: number
  delay: number
  duration: number
  size: number
  color: string
}

export default function EmberParticles() {
  const particles = useMemo<Particle[]>(() => {
    const colors = ['#f97316', '#c0392b', '#e55c2d', '#f5a623', '#d4541a']
    return Array.from({ length: 20 }, (_, i) => ({
      id: i,
      left: Math.random() * 100,
      delay: Math.random() * 10,
      duration: 6 + Math.random() * 8,
      size: 2 + Math.random() * 3,
      color: colors[Math.floor(Math.random() * colors.length)],
    }))
  }, [])

  return (
    <div className="fixed inset-0 pointer-events-none overflow-hidden z-0" aria-hidden="true">
      {particles.map((p) => (
        <div
          key={p.id}
          className="absolute rounded-full ember-particle"
          style={{
            left: `${p.left}%`,
            bottom: '-10px',
            width: `${p.size}px`,
            height: `${p.size}px`,
            background: `radial-gradient(circle, ${p.color}, ${p.color}88)`,
            boxShadow: `0 0 ${p.size * 2}px ${p.color}`,
            '--delay': `${p.delay}s`,
            '--duration': `${p.duration}s`,
          } as React.CSSProperties}
        />
      ))}
    </div>
  )
}
