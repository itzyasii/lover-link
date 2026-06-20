// Sound utility for playing call and message notifications
// Uses Web Audio API to generate simple tones

let audioContext: AudioContext | null = null;

function getAudioContext(): AudioContext {
  if (!audioContext) {
    audioContext = new (
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext })
        .webkitAudioContext
    )();
  }
  return audioContext;
}

export function playMessageSound(): void {
  try {
    const ctx = getAudioContext();
    if (ctx.state === "suspended") {
      void ctx.resume();
    }

    // Play a short, pleasant "ding" for new messages
    const oscillator = ctx.createOscillator();
    const gainNode = ctx.createGain();

    oscillator.connect(gainNode);
    gainNode.connect(ctx.destination);

    // Frequency sweep for nice message tone
    oscillator.frequency.setValueAtTime(800, ctx.currentTime);
    oscillator.frequency.exponentialRampToValueAtTime(
      1200,
      ctx.currentTime + 0.1,
    );

    // Volume envelope
    gainNode.gain.setValueAtTime(0.3, ctx.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.3);

    oscillator.start(ctx.currentTime);
    oscillator.stop(ctx.currentTime + 0.3);
  } catch (err) {
    console.log("Could not play message sound:", err);
  }
}

export function playIncomingCallSound(): void {
  try {
    const ctx = getAudioContext();
    if (ctx.state === "suspended") {
      void ctx.resume();
    }

    // Create a repeating ringtone for incoming calls
    const playRing = () => {
      const oscillator = ctx.createOscillator();
      const gainNode = ctx.createGain();

      oscillator.connect(gainNode);
      gainNode.connect(ctx.destination);

      // Classic phone ring tone frequencies
      oscillator.frequency.setValueAtTime(880, ctx.currentTime);
      oscillator.frequency.setValueAtTime(660, ctx.currentTime + 0.2);

      gainNode.gain.setValueAtTime(0.4, ctx.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.5);

      oscillator.start(ctx.currentTime);
      oscillator.stop(ctx.currentTime + 0.5);
    };

    // Play ring 3 times with interval
    playRing();
    const interval1 = setTimeout(playRing, 1000);
    const interval2 = setTimeout(playRing, 2000);

    // Store these IDs to stop if call is answered/declined
    (
      window as unknown as { callRingIntervals?: NodeJS.Timeout[] }
    ).callRingIntervals = [interval1, interval2];
  } catch (err) {
    console.log("Could not play call sound:", err);
  }
}

export function stopCallSound(): void {
  // Clear any pending ringtones
  const intervals = (
    window as unknown as { callRingIntervals?: NodeJS.Timeout[] }
  ).callRingIntervals;
  if (intervals) {
    intervals.forEach((id) => clearTimeout(id));
  }
}

export function playCallEndSound(): void {
  try {
    const ctx = getAudioContext();
    if (ctx.state === "suspended") {
      void ctx.resume();
    }

    // Play a short descending tone for call end
    const oscillator = ctx.createOscillator();
    const gainNode = ctx.createGain();

    oscillator.connect(gainNode);
    gainNode.connect(ctx.destination);

    oscillator.frequency.setValueAtTime(600, ctx.currentTime);
    oscillator.frequency.exponentialRampToValueAtTime(
      200,
      ctx.currentTime + 0.3,
    );

    gainNode.gain.setValueAtTime(0.3, ctx.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.4);

    oscillator.start(ctx.currentTime);
    oscillator.stop(ctx.currentTime + 0.4);
  } catch (err) {
    console.log("Could not play call end sound:", err);
  }
}
