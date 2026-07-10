class PcmStreamPlayerProcessor extends AudioWorkletProcessor {
  constructor(options) {
    super();
    const requestedCapacity = Number(options.processorOptions?.capacityFrames);
    this.capacity = Number.isFinite(requestedCapacity) && requestedCapacity > 0
      ? Math.floor(requestedCapacity)
      : Math.floor(sampleRate * 120);
    this.buffer = new Float32Array(this.capacity);
    this.readIndex = 0;
    this.writeIndex = 0;
    this.queuedFrames = 0;
    this.receivedFrames = 0;
    this.playedFrames = 0;
    this.droppedFrames = 0;
    this.underflowCount = 0;
    this.underflowFrames = 0;
    this.started = false;
    this.ended = false;
    this.startedNotified = false;
    this.drainedNotified = false;
    this.lastMetricsFrame = 0;

    this.port.onmessage = (event) => {
      const message = event.data;
      if (!message || typeof message.type !== "string") return;

      if (message.type === "push") {
        this.push(new Float32Array(message.samples));
      } else if (message.type === "start") {
        this.started = true;
        this.startTime = typeof message.startTime === "number" ? message.startTime : 0;
        this.ended = false;
        this.drainedNotified = false;
      } else if (message.type === "end") {
        this.ended = true;
      } else if (message.type === "reset") {
        this.reset();
      }
    };
  }

  push(samples) {
    this.receivedFrames += samples.length;
    let sourceIndex = 0;
    while (sourceIndex < samples.length && this.queuedFrames < this.capacity) {
      this.buffer[this.writeIndex] = samples[sourceIndex];
      this.writeIndex = (this.writeIndex + 1) % this.capacity;
      this.queuedFrames += 1;
      sourceIndex += 1;
    }
    if (sourceIndex < samples.length) {
      this.droppedFrames += samples.length - sourceIndex;
    }
  }

  reset() {
    this.readIndex = 0;
    this.writeIndex = 0;
    this.queuedFrames = 0;
    this.receivedFrames = 0;
    this.playedFrames = 0;
    this.droppedFrames = 0;
    this.underflowCount = 0;
    this.underflowFrames = 0;
    this.started = false;
    this.ended = false;
    this.startedNotified = false;
    this.drainedNotified = false;
    this.lastMetricsFrame = 0;
  }

  process(_, outputs) {
    const output = outputs[0][0];

    if (!this.started) {
      output.fill(0);
      this.postMetrics(false);
      return true;
    }

    if (typeof this.startTime === "number" && currentTime < this.startTime) {
      output.fill(0);
      this.postMetrics(false);
      return true;
    }

    let hadAudio = false;
    let underflowFramesThisBlock = 0;
    for (let index = 0; index < output.length; index += 1) {
      if (this.queuedFrames > 0) {
        const sample = this.buffer[this.readIndex];
        output[index] = sample;
        this.readIndex = (this.readIndex + 1) % this.capacity;
        this.queuedFrames -= 1;
        this.playedFrames += 1;
        hadAudio = true;
      } else {
        output[index] = 0;
        if (!this.ended) {
          underflowFramesThisBlock += 1;
        }
      }
    }

    if (hadAudio && !this.startedNotified) {
      this.startedNotified = true;
      this.port.postMessage({ type: "started", metrics: this.metrics() });
    }

    if (underflowFramesThisBlock > 0) {
      this.underflowCount += 1;
      this.underflowFrames += underflowFramesThisBlock;
      this.port.postMessage({ type: "underflow", metrics: this.metrics() });
    }

    if (this.ended && this.queuedFrames === 0 && !this.drainedNotified) {
      this.drainedNotified = true;
      this.port.postMessage({ type: "drained", metrics: this.metrics() });
    }

    this.postMetrics(false);
    return true;
  }

  postMetrics(force) {
    if (!force && this.playedFrames - this.lastMetricsFrame < sampleRate / 2) return;
    this.lastMetricsFrame = this.playedFrames;
    this.port.postMessage({ type: "metrics", metrics: this.metrics() });
  }

  metrics() {
    return {
      queuedFrames: this.queuedFrames,
      receivedFrames: this.receivedFrames,
      playedFrames: this.playedFrames,
      droppedFrames: this.droppedFrames,
      duplicatedFrames: 0,
      underflowCount: this.underflowCount,
      underflowDurationMs: (this.underflowFrames / sampleRate) * 1000
    };
  }
}

registerProcessor("pcm-stream-player", PcmStreamPlayerProcessor);
