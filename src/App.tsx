import { useEffect, useRef, useState } from 'react'
import type { ChangeEvent, DragEvent } from 'react'
import { AudioEngine } from './audio/engine'
import Fader from './components/Fader'
import Waveform from './components/Waveform'
import './App.css'

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${m}:${String(s).padStart(2, '0')}`
}

function App() {
  const engineRef = useRef<AudioEngine | null>(null)
  const [buffer, setBuffer] = useState<AudioBuffer | null>(null)
  const [trackName, setTrackName] = useState('')
  const [playing, setPlaying] = useState(false)
  const [position, setPosition] = useState(0)
  const [speed, setSpeed] = useState(1)
  const [pitch, setPitch] = useState(0)
  const [reverb, setReverb] = useState(0)
  const [error, setError] = useState('')
  const [dragOver, setDragOver] = useState(false)
  const [exporting, setExporting] = useState(false)

  const getEngine = (): AudioEngine => {
    if (!engineRef.current) {
      const engine = new AudioEngine()
      engine.onTrackEnd = () => {
        setPlaying(false)
        setPosition(engine.duration)
      }
      engineRef.current = engine
    }
    return engineRef.current
  }

  const loadFile = async (file: File) => {
    const engine = getEngine()
    try {
      const decoded = await engine.load(file)
      engine.setRate(speed)
      engine.setPitch(pitch)
      engine.setReverb(reverb)
      setBuffer(decoded)
      setTrackName(file.name.replace(/\.[^.]+$/, ''))
      setPlaying(false)
      setPosition(0)
      setError('')
    } catch {
      setError('Не вдалося прочитати цей файл — спробуй mp3, wav або m4a.')
    }
  }

  const togglePlay = async () => {
    const engine = engineRef.current
    if (!engine || !buffer) return
    if (engine.isPlaying) {
      engine.pause()
      setPosition(engine.position())
      setPlaying(false)
    } else {
      await engine.play()
      setPlaying(true)
    }
  }

  const handleSeek = (time: number) => {
    engineRef.current?.seek(time)
    setPosition(engineRef.current?.position() ?? time)
  }

  const handleSpeed = (value: number) => {
    setSpeed(value)
    engineRef.current?.setRate(value)
  }

  const handlePitch = (value: number) => {
    setPitch(value)
    engineRef.current?.setPitch(value)
  }

  const handleReverb = (value: number) => {
    setReverb(value)
    engineRef.current?.setReverb(value)
  }

  const handleExport = async () => {
    const engine = engineRef.current
    if (!engine || !buffer || exporting) return
    setExporting(true)
    try {
      const blob = await engine.renderToWav()
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = `${trackName} (slowed-reverb).wav`
      link.click()
      setTimeout(() => URL.revokeObjectURL(url), 10_000)
      setError('')
    } catch {
      setError('Не вдалося відрендерити файл — спробуй ще раз.')
    } finally {
      setExporting(false)
    }
  }

  const handleFileInput = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) void loadFile(file)
    e.target.value = ''
  }

  const handleDrop = (e: DragEvent) => {
    e.preventDefault()
    setDragOver(false)
    const file = e.dataTransfer.files[0]
    if (file) void loadFile(file)
  }

  // Playhead follows the engine while playing.
  useEffect(() => {
    if (!playing) return
    let raf = 0
    const tick = () => {
      const engine = engineRef.current
      if (engine) setPosition(engine.position())
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [playing])

  // Space toggles playback unless focus is on a control.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.code !== 'Space') return
      const target = e.target as HTMLElement | null
      if (target?.closest('[role="slider"], button, input, a')) return
      e.preventDefault()
      void togglePlay()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  })

  return (
    <main
      className="deck"
      onDragOver={(e) => {
        e.preventDefault()
        setDragOver(true)
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={handleDrop}
    >
      <header className="masthead">
        <div>
          <h1 className="wordmark">
            slowed <span aria-hidden="true">&amp;</span> reverb
          </h1>
          <p className="tagline">Швидкість і реверб наживо, прямо в браузері</p>
        </div>
        <div className="masthead-actions">
          <label className="load-button">
            <input type="file" accept="audio/*" onChange={handleFileInput} />
            Відкрити трек
          </label>
          <button
            className="load-button"
            onClick={() => void handleExport()}
            disabled={!buffer || exporting}
          >
            {exporting ? 'Рендерю…' : 'Скачати WAV'}
          </button>
        </div>
      </header>

      <section className={`wave-panel${dragOver ? ' drag' : ''}`}>
        {buffer ? (
          <>
            <div className="track-bar">
              <span className="track-name">{trackName}</span>
              <span className="track-time">
                <b>{formatTime(position)}</b> / {formatTime(buffer.duration)}
              </span>
            </div>
            <Waveform buffer={buffer} position={position} onSeek={handleSeek} />
          </>
        ) : (
          <label className="drop-zone">
            <input type="file" accept="audio/*" onChange={handleFileInput} />
            <span className="drop-title">Кинь трек сюди</span>
            <span className="drop-sub">
              або натисни, щоб вибрати файл — mp3, wav, m4a, flac
            </span>
          </label>
        )}
        {error && <p className="load-error">{error}</p>}
      </section>

      <section className="console">
        <div className="transport-module">
          <button
            className="transport"
            onClick={() => void togglePlay()}
            disabled={!buffer}
            aria-label={playing ? 'Пауза' : 'Пуск'}
          >
            {playing ? (
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <rect x="6" y="5" width="4" height="14" />
                <rect x="14" y="5" width="4" height="14" />
              </svg>
            ) : (
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M8 5l12 7-12 7z" />
              </svg>
            )}
          </button>
          <span className="transport-label">{playing ? 'Пауза' : 'Пуск'}</span>
        </div>

        <Fader
          label="Speed"
          value={speed}
          min={0.5}
          max={1.5}
          step={0.01}
          detent={1}
          ticks={[0.5, 0.75, 1, 1.25, 1.5]}
          accent="var(--amber)"
          format={(v) => `×${v.toFixed(2)}`}
          onChange={handleSpeed}
        />
        <Fader
          label="Pitch"
          value={pitch}
          min={-12}
          max={12}
          step={1}
          detent={0}
          ticks={[-12, -6, 0, 6, 12]}
          accent="var(--violet)"
          format={(v) => `${v > 0 ? '+' : ''}${v} st`}
          onChange={handlePitch}
        />
        <Fader
          label="Reverb"
          value={reverb}
          min={0}
          max={1}
          step={0.01}
          ticks={[0, 0.25, 0.5, 0.75, 1]}
          accent="var(--ice)"
          format={(v) => `${Math.round(v * 100)}%`}
          onChange={handleReverb}
        />
      </section>

      <footer className="hints">
        Пробіл — пуск/пауза&ensp;·&ensp;клік по хвилі — перемотка&ensp;·&ensp;
        повзунки працюють під час гри
      </footer>
    </main>
  )
}

export default App