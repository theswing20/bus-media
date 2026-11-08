/**
 * Очередь объявлений. Играет файлы строго по одному: kk, затем ru.
 * На время объявления вызывающий код приглушает рекламу (duck).
 */
export class AudioQueue {
  private queue: { url: string }[] = [];
  private playing = false;
  private current: HTMLAudioElement | null = null;
  volume = 1;
  onIdle?: () => void;
  onBusy?: () => void;

  enqueue(urls: (string | undefined)[], opts: { replace?: boolean } = {}) {
    if (opts.replace) { this.queue = []; this.current?.pause(); this.current = null; this.playing = false; }
    for (const u of urls) if (u) this.queue.push({ url: u });
    this.next();
  }

  private next() {
    if (this.playing) return;
    const item = this.queue.shift();
    if (!item) { this.onIdle?.(); return; }
    this.playing = true;
    this.onBusy?.();
    const a = new Audio(item.url);
    a.volume = this.volume;
    this.current = a;
    const done = () => { this.playing = false; this.current = null; setTimeout(() => this.next(), 300); };
    a.onended = done;
    a.onerror = done;
    a.play().catch(done);
  }
}
