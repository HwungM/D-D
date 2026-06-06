import { useEffect, useState } from 'react'

interface Props {
  epilogue: string
  characterName: string
  victory: boolean
  onClose: () => void
}

export default function EpilogueScreen({ epilogue, characterName, victory, onClose }: Props) {
  const [visible, setVisible] = useState(false)
  const [textVisible, setTextVisible] = useState(false)
  const [buttonsVisible, setButtonsVisible] = useState(false)

  useEffect(() => {
    setTimeout(() => setVisible(true), 50)
    setTimeout(() => setTextVisible(true), 1200)
    setTimeout(() => setButtonsVisible(true), epilogue.length * 18 + 3000)
  }, [epilogue.length])

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col items-center justify-center"
      style={{
        background: victory
          ? 'radial-gradient(ellipse at center, rgba(180,130,40,0.12) 0%, #040608 70%)'
          : 'radial-gradient(ellipse at center, rgba(80,10,10,0.15) 0%, #020304 70%)',
        opacity: visible ? 1 : 0,
        transition: 'opacity 1.5s ease',
      }}
    >
      {/* Particle-like stars for victory */}
      {victory && (
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          {Array.from({ length: 30 }).map((_, i) => (
            <div
              key={i}
              className="absolute rounded-full"
              style={{
                width: Math.random() * 2 + 1,
                height: Math.random() * 2 + 1,
                background: `rgba(200,146,42,${Math.random() * 0.4 + 0.1})`,
                left: `${Math.random() * 100}%`,
                top: `${Math.random() * 100}%`,
                animation: `pulse ${Math.random() * 3 + 2}s ease-in-out ${Math.random() * 2}s infinite`,
              }}
            />
          ))}
        </div>
      )}

      <div className="relative z-10 max-w-2xl w-full px-8 text-center">
        {/* Crown or skull */}
        <div
          className="text-5xl mb-6"
          style={{
            opacity: textVisible ? 1 : 0,
            transition: 'opacity 2s ease',
            filter: victory ? 'drop-shadow(0 0 20px rgba(200,146,42,0.5))' : 'drop-shadow(0 0 20px rgba(180,30,30,0.5))',
          }}
        >
          {victory ? '♛' : '✦'}
        </div>

        {/* Title */}
        <h1
          className="font-fantasy mb-2"
          style={{
            fontSize: '2.8rem',
            color: victory ? '#d4a843' : '#c05030',
            opacity: textVisible ? 1 : 0,
            transition: 'opacity 2s ease 0.3s',
            textShadow: victory
              ? '0 0 60px rgba(200,146,42,0.4)'
              : '0 0 60px rgba(180,30,30,0.4)',
          }}
        >
          {victory ? 'The Age Turns' : 'The Darkness Prevails'}
        </h1>

        {/* Character name */}
        <p
          className="font-serif text-sm uppercase tracking-widest mb-10"
          style={{
            color: 'rgba(180,160,120,0.5)',
            letterSpacing: '0.2em',
            opacity: textVisible ? 1 : 0,
            transition: 'opacity 2s ease 0.6s',
          }}
        >
          {characterName}
        </p>

        {/* Divider */}
        <div
          className="mx-auto mb-10"
          style={{
            width: 80,
            height: 1,
            background: victory
              ? 'linear-gradient(90deg, transparent, rgba(200,146,42,0.4), transparent)'
              : 'linear-gradient(90deg, transparent, rgba(180,30,30,0.4), transparent)',
            opacity: textVisible ? 1 : 0,
            transition: 'opacity 2s ease 0.8s',
          }}
        />

        {/* Epilogue text */}
        <div
          className="mb-12"
          style={{
            opacity: textVisible ? 1 : 0,
            transition: 'opacity 3s ease 1s',
          }}
        >
          {epilogue.split('\n\n').map((para, i) => (
            <p
              key={i}
              className="font-serif leading-loose mb-5 text-left"
              style={{ color: 'rgba(200,180,140,0.8)', fontSize: '0.95rem', lineHeight: '1.9' }}
            >
              {para}
            </p>
          ))}
        </div>

        {/* Buttons */}
        <div
          className="flex flex-col items-center gap-3"
          style={{
            opacity: buttonsVisible ? 1 : 0,
            transition: 'opacity 1.5s ease',
          }}
        >
          <button
            onClick={onClose}
            className="font-serif text-sm px-12 py-3 transition-all"
            style={{
              background: victory
                ? 'linear-gradient(135deg, rgba(200,146,42,0.15), rgba(140,90,20,0.3))'
                : 'linear-gradient(135deg, rgba(180,30,30,0.15), rgba(100,10,10,0.3))',
              border: `1px solid ${victory ? 'rgba(200,146,42,0.35)' : 'rgba(180,30,30,0.35)'}`,
              color: victory ? '#d4a843' : '#c05030',
              letterSpacing: '0.08em',
            }}
          >
            Return to the Hall
          </button>
          <p className="font-serif text-xs italic" style={{ color: 'rgba(160,140,100,0.3)' }}>
            The story lives on.
          </p>
        </div>
      </div>
    </div>
  )
}
