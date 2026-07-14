declare module 'signalsmith-stretch' {
  export interface StretchScheduleOptions {
    /** Audio context time for this change, in seconds. */
    output?: number
    active?: boolean
    /** Position in the input buffer, in seconds (buffer mode only). */
    input?: number
    rate?: number
    semitones?: number
    tonalityHz?: number
    formantSemitones?: number
    formantCompensation?: boolean
    formantBaseHz?: number
    loopStart?: number
    loopEnd?: number
  }

  export interface StretchConfigureOptions {
    blockMs?: number | null
    intervalMs?: number
    splitComputation?: boolean
    preset?: 'default' | 'cheaper'
  }

  export interface StretchNode extends AudioWorkletNode {
    inputTime: number
    schedule(options: StretchScheduleOptions): Promise<unknown>
    start(when?: number): Promise<unknown>
    stop(when?: number): Promise<unknown>
    addBuffers(buffers: Float32Array[]): Promise<number>
    dropBuffers(toSeconds?: number): Promise<{ start: number; end: number }>
    latency(): Promise<number>
    configure(options: StretchConfigureOptions): Promise<unknown>
    setUpdateInterval(
      seconds: number,
      callback?: (time: number) => void,
    ): Promise<unknown>
  }

  const SignalsmithStretch: (
    audioContext: BaseAudioContext,
    channelOptions?: AudioWorkletNodeOptions,
  ) => Promise<StretchNode>

  export default SignalsmithStretch
}
