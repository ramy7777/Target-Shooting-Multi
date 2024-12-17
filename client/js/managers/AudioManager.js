class AudioManager {
    constructor() {
        this.audioContext = null;
        this.initAudioContext();
    }

    initAudioContext() {
        // Initialize on first user interaction to comply with browser policies
        if (!this.audioContext) {
            this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
            if (this.audioContext.state === 'suspended') {
                this.audioContext.resume();
            }
        }
    }

    playRifleShot() {
        if (!this.audioContext) return;

        // Create audio nodes
        const oscillator = this.audioContext.createOscillator();
        const gainNode = this.audioContext.createGain();
        const filterNode = this.audioContext.createBiquadFilter();

        // Configure rifle shot sound
        oscillator.type = 'square';
        oscillator.frequency.setValueAtTime(150, this.audioContext.currentTime);
        oscillator.frequency.exponentialRampToValueAtTime(40, this.audioContext.currentTime + 0.1);

        // Configure filter for more realistic gunshot sound
        filterNode.type = 'lowpass';
        filterNode.frequency.setValueAtTime(1000, this.audioContext.currentTime);
        filterNode.Q.setValueAtTime(10, this.audioContext.currentTime);

        // Configure volume envelope
        gainNode.gain.setValueAtTime(0.8, this.audioContext.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.01, this.audioContext.currentTime + 0.15);

        // Connect nodes
        oscillator.connect(filterNode);
        filterNode.connect(gainNode);
        gainNode.connect(this.audioContext.destination);

        // Play sound
        oscillator.start();
        oscillator.stop(this.audioContext.currentTime + 0.15);
    }

    playBirdDestruction() {
        if (!this.audioContext) return;

        // Create audio nodes
        const oscillator = this.audioContext.createOscillator();
        const gainNode = this.audioContext.createGain();
        const filterNode = this.audioContext.createBiquadFilter();

        // Configure scratching sound
        oscillator.type = 'sawtooth';
        oscillator.frequency.setValueAtTime(2000, this.audioContext.currentTime);
        oscillator.frequency.exponentialRampToValueAtTime(100, this.audioContext.currentTime + 0.3);

        // Configure filter for scratchy effect
        filterNode.type = 'bandpass';
        filterNode.frequency.setValueAtTime(2000, this.audioContext.currentTime);
        filterNode.Q.setValueAtTime(5, this.audioContext.currentTime);

        // Configure volume envelope
        gainNode.gain.setValueAtTime(0.3, this.audioContext.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.01, this.audioContext.currentTime + 0.3);

        // Connect nodes
        oscillator.connect(filterNode);
        filterNode.connect(gainNode);
        gainNode.connect(this.audioContext.destination);

        // Play sound
        oscillator.start();
        oscillator.stop(this.audioContext.currentTime + 0.3);
    }

    playBirdSpawn() {
        if (!this.audioContext) return;

        // Create audio nodes
        const oscillator1 = this.audioContext.createOscillator();
        const oscillator2 = this.audioContext.createOscillator();
        const gainNode = this.audioContext.createGain();
        const filterNode = this.audioContext.createBiquadFilter();

        // Configure main tone
        oscillator1.type = 'sine';
        oscillator1.frequency.setValueAtTime(440, this.audioContext.currentTime);
        oscillator1.frequency.exponentialRampToValueAtTime(880, this.audioContext.currentTime + 0.2);

        // Configure harmonic tone
        oscillator2.type = 'sine';
        oscillator2.frequency.setValueAtTime(660, this.audioContext.currentTime);
        oscillator2.frequency.exponentialRampToValueAtTime(1320, this.audioContext.currentTime + 0.2);

        // Configure filter for sci-fi effect
        filterNode.type = 'highpass';
        filterNode.frequency.setValueAtTime(200, this.audioContext.currentTime);
        filterNode.Q.setValueAtTime(8, this.audioContext.currentTime);

        // Configure volume envelope for a gentle fade in/out
        gainNode.gain.setValueAtTime(0, this.audioContext.currentTime);
        gainNode.gain.linearRampToValueAtTime(0.3, this.audioContext.currentTime + 0.1);
        gainNode.gain.exponentialRampToValueAtTime(0.01, this.audioContext.currentTime + 0.4);

        // Connect nodes
        oscillator1.connect(filterNode);
        oscillator2.connect(filterNode);
        filterNode.connect(gainNode);
        gainNode.connect(this.audioContext.destination);

        // Play sound
        oscillator1.start();
        oscillator2.start();
        oscillator1.stop(this.audioContext.currentTime + 0.4);
        oscillator2.stop(this.audioContext.currentTime + 0.4);
    }
}

export default AudioManager;
