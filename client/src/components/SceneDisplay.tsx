interface SceneDisplayProps {
  imageUrl: string | null
}

export default function SceneDisplay({ imageUrl }: SceneDisplayProps) {
  if (!imageUrl) {
    return (
      <div className="h-48 bg-slate-900 border-b border-slate-800 flex items-center justify-center shrink-0">
        <div className="text-center text-slate-700">
          <div className="text-4xl mb-2">🕯</div>
          <p className="text-xs font-serif italic">The scene materializes in darkness...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="h-48 relative overflow-hidden shrink-0 border-b border-slate-800">
      <img
        src={imageUrl}
        alt="Current scene"
        className="w-full h-full object-cover animate-fade-in"
      />
      {/* Vignette overlay */}
      <div className="absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-slate-950/80" />
    </div>
  )
}
