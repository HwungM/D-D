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
    const t1 = window.setTimeout(() => setVisible(true), 50)
    const t2 = window.setTimeout(() => setTextVisible(true), 900)
    const t3 = window.setTimeout(() => setButtonsVisible(true), epilogue.length * 14 + 2400)
    return () => { window.clearTimeout(t1); window.clearTimeout(t2); window.clearTimeout(t3) }
  }, [epilogue.length])

  return (
    <div
      className="fixed inset-0 z-50 overflow-y-auto bg-[#050607] text-parchment-100"
      style={{
        opacity: visible ? 1 : 0,
        transition: 'opacity 1.2s ease',
      }}
    >
      <div className="absolute inset-0">
        <img
          src={victory ? '/media/loading/everrealm-eclipse-citadel.png' : '/media/loading/everrealm-storm-party.png'}
          alt=""
          className="h-full w-full object-cover opacity-[0.48]"
        />
        <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(0,0,0,0.94)_0%,rgba(0,0,0,0.62)_52%,rgba(0,0,0,0.92)_100%)]" />
        <div
          className="absolute inset-0"
          style={{
            background: victory
              ? 'radial-gradient(ellipse at center, rgba(245,158,11,0.16) 0%, transparent 60%)'
              : 'radial-gradient(ellipse at center, rgba(127,29,29,0.22) 0%, transparent 60%)',
          }}
        />
      </div>

      <main className="relative z-10 mx-auto flex min-h-screen max-w-4xl items-center px-5 py-8">
        <section className="w-full border border-parchment-100/34 bg-black/72 p-5 shadow-[0_30px_130px_rgba(0,0,0,0.82)] backdrop-blur-md sm:p-8">
          <div
            className="text-center"
            style={{
              opacity: textVisible ? 1 : 0,
              transition: 'opacity 1.4s ease',
            }}
          >
            <p className={`font-fantasy text-[10px] uppercase tracking-[0.34em] ${victory ? 'text-amber-200/68' : 'text-red-200/62'}`}>
              {victory ? 'Campaign Epilogue' : 'Fallen Epilogue'}
            </p>
            <h1 className={`mt-3 font-fantasy text-5xl uppercase tracking-[0.08em] sm:text-6xl ${victory ? 'text-amber-100' : 'text-red-100'}`}>
              {victory ? 'The Age Turns' : 'The Darkness Prevails'}
            </h1>
            <p className="mt-4 font-serif text-xs uppercase tracking-[0.24em] text-parchment-200/48">
              {characterName}
            </p>
          </div>

          <div
            className={`mx-auto my-8 h-px w-40 ${victory ? 'bg-[linear-gradient(90deg,transparent,rgba(245,158,11,0.58),transparent)]' : 'bg-[linear-gradient(90deg,transparent,rgba(248,113,113,0.5),transparent)]'}`}
            style={{
              opacity: textVisible ? 1 : 0,
              transition: 'opacity 1.4s ease 0.3s',
            }}
          />

          <div
            className="max-h-[48vh] overflow-y-auto border border-white/10 bg-white/[0.025] p-5"
            style={{
              opacity: textVisible ? 1 : 0,
              transition: 'opacity 1.8s ease 0.45s',
              scrollbarWidth: 'thin',
              scrollbarColor: 'rgba(200,146,42,0.35) transparent',
            }}
          >
            {epilogue.split('\n\n').map((para, i) => (
              <p
                key={i}
                className="mb-5 text-left font-serif text-base leading-loose text-parchment-200/78 last:mb-0"
              >
                {para}
              </p>
            ))}
          </div>

          <div
            className="mt-6 flex flex-col items-center gap-3"
            style={{
              opacity: buttonsVisible ? 1 : 0,
              transition: 'opacity 1.2s ease',
            }}
          >
            <button
              onClick={onClose}
              className={`border px-7 py-3 font-fantasy text-xs uppercase tracking-[0.22em] transition-all ${
                victory
                  ? 'border-amber-300/46 bg-amber-300/12 text-amber-100 hover:border-amber-200'
                  : 'border-red-300/42 bg-red-500/12 text-red-100 hover:border-red-200'
              }`}
            >
              Return to the Hall
            </button>
            <p className="font-serif text-xs italic text-parchment-200/34">The story lives on.</p>
          </div>
        </section>
      </main>
    </div>
  )
}
