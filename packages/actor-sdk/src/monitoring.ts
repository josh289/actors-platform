/**
 * Built-in monitoring capabilities for actors
 */
export class MonitoringCapabilities {
  private actorName: string;
  private counters: Map<string, Counter> = new Map();
  private histograms: Map<string, Histogram> = new Map();
  private gauges: Map<string, Gauge> = new Map();
  private testMode: boolean = false;

  constructor(actorName: string) {
    this.actorName = actorName;
  }

  async initialize(): Promise<void> {
    // Initialize monitoring system if needed
  }

  enableTestMode(): void {
    this.testMode = true;
  }

  // Counter operations
  createCounter(name: string, help: string): Counter {
    const counter = new Counter(name, help, this.actorName);
    this.counters.set(name, counter);
    return counter;
  }

  incrementCounter(name: string, labels?: Record<string, string>): void {
    let counter = this.counters.get(name);
    if (!counter) {
      counter = this.createCounter(name, `Counter for ${name}`);
    }
    counter.inc(labels);
  }

  // Histogram operations
  createHistogram(name: string, help: string, buckets?: number[]): Histogram {
    const histogram = new Histogram(name, help, this.actorName, buckets);
    this.histograms.set(name, histogram);
    return histogram;
  }

  startTimer(name: string): () => void {
    let histogram = this.histograms.get(name);
    if (!histogram) {
      histogram = this.createHistogram(name, `Timer for ${name}`);
    }
    const start = Date.now();
    return () => {
      const duration = (Date.now() - start) / 1000; // Convert to seconds
      histogram!.observe(duration);
    };
  }

  // Gauge operations
  createGauge(name: string, help: string): Gauge {
    const gauge = new Gauge(name, help, this.actorName);
    this.gauges.set(name, gauge);
    return gauge;
  }

  setGauge(name: string, value: number, labels?: Record<string, string>): void {
    let gauge = this.gauges.get(name);
    if (!gauge) {
      gauge = this.createGauge(name, `Gauge for ${name}`);
    }
    gauge.set(value, labels);
  }

  // Get metrics in Prometheus format
  async getMetrics(): Promise<string> {
    const lines: string[] = [];

    // Export counters
    this.counters.forEach((counter, name) => {
      lines.push(...counter.toPrometheus());
    });

    // Export histograms
    this.histograms.forEach((histogram, name) => {
      lines.push(...histogram.toPrometheus());
    });

    // Export gauges
    this.gauges.forEach((gauge, name) => {
      lines.push(...gauge.toPrometheus());
    });

    return lines.join('\n');
  }

  // Get metrics as JSON
  async getMetricsJSON(): Promise<any[]> {
    const metrics: any[] = [];

    this.counters.forEach((counter, name) => {
      metrics.push(counter.toJSON());
    });

    this.histograms.forEach((histogram, name) => {
      metrics.push(histogram.toJSON());
    });

    this.gauges.forEach((gauge, name) => {
      metrics.push(gauge.toJSON());
    });

    return metrics;
  }
}

// Metric implementations
class Counter {
  private name: string;
  private help: string;
  private actorName: string;
  private values: Map<string, number> = new Map();

  constructor(name: string, help: string, actorName: string) {
    this.name = name;
    this.help = help;
    this.actorName = actorName;
  }

  inc(labels?: Record<string, string>): void {
    const key = this.labelsToKey(labels);
    const current = this.values.get(key) || 0;
    this.values.set(key, current + 1);
  }

  toPrometheus(): string[] {
    const lines: string[] = [];
    lines.push(`# HELP ${this.name} ${this.help}`);
    lines.push(`# TYPE ${this.name} counter`);
    
    this.values.forEach((value, key) => {
      const labels = this.keyToLabels(key);
      const labelStr = this.formatLabels({ ...labels, actor: this.actorName });
      lines.push(`${this.name}${labelStr} ${value}`);
    });

    return lines;
  }

  toJSON(): any {
    return {
      name: this.name,
      help: this.help,
      type: 'counter',
      values: Array.from(this.values.entries()).map(([key, value]) => ({
        labels: { ...this.keyToLabels(key), actor: this.actorName },
        value,
      })),
    };
  }

  private labelsToKey(labels?: Record<string, string>): string {
    if (!labels) return '';
    return Object.entries(labels)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${k}="${v}"`)
      .join(',');
  }

  private keyToLabels(key: string): Record<string, string> {
    if (!key) return {};
    const labels: Record<string, string> = {};
    const pairs = key.split(',');
    pairs.forEach(pair => {
      const [k, v] = pair.split('=');
      if (k && v) {
        labels[k] = v.replace(/"/g, '');
      }
    });
    return labels;
  }

  private formatLabels(labels: Record<string, string>): string {
    const pairs = Object.entries(labels)
      .map(([k, v]) => `${k}="${v}"`)
      .join(',');
    return pairs ? `{${pairs}}` : '';
  }
}

class Histogram {
  private name: string;
  private help: string;
  private actorName: string;
  private buckets: number[];
  private observations: Map<string, number[]> = new Map();
  private sums: Map<string, number> = new Map();
  private counts: Map<string, number> = new Map();

  constructor(name: string, help: string, actorName: string, buckets?: number[]) {
    this.name = name;
    this.help = help;
    this.actorName = actorName;
    this.buckets = buckets || [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10];
  }

  observe(value: number, labels?: Record<string, string>): void {
    const key = this.labelsToKey(labels);
    
    const observations = this.observations.get(key) || [];
    observations.push(value);
    this.observations.set(key, observations);
    
    const sum = this.sums.get(key) || 0;
    this.sums.set(key, sum + value);
    
    const count = this.counts.get(key) || 0;
    this.counts.set(key, count + 1);
  }

  toPrometheus(): string[] {
    const lines: string[] = [];
    lines.push(`# HELP ${this.name} ${this.help}`);
    lines.push(`# TYPE ${this.name} histogram`);
    
    this.observations.forEach((observations, key) => {
      const labels = this.keyToLabels(key);
      const baseLabels = { ...labels, actor: this.actorName };
      
      // Bucket counts
      this.buckets.forEach(bucket => {
        const count = observations.filter(v => v <= bucket).length;
        const bucketLabels = { ...baseLabels, le: bucket.toString() };
        const labelStr = this.formatLabels(bucketLabels);
        lines.push(`${this.name}_bucket${labelStr} ${count}`);
      });
      
      // +Inf bucket
      const infLabels = { ...baseLabels, le: '+Inf' };
      const infLabelStr = this.formatLabels(infLabels);
      lines.push(`${this.name}_bucket${infLabelStr} ${observations.length}`);
      
      // Sum and count
      const labelStr = this.formatLabels(baseLabels);
      lines.push(`${this.name}_sum${labelStr} ${this.sums.get(key) || 0}`);
      lines.push(`${this.name}_count${labelStr} ${this.counts.get(key) || 0}`);
    });

    return lines;
  }

  toJSON(): any {
    const values: any[] = [];
    
    this.observations.forEach((observations, key) => {
      const labels = { ...this.keyToLabels(key), actor: this.actorName };
      
      // Calculate percentiles
      const sorted = observations.sort((a, b) => a - b);
      const p50 = sorted[Math.floor(sorted.length * 0.5)] || 0;
      const p95 = sorted[Math.floor(sorted.length * 0.95)] || 0;
      const p99 = sorted[Math.floor(sorted.length * 0.99)] || 0;
      
      values.push({
        labels,
        count: this.counts.get(key) || 0,
        sum: this.sums.get(key) || 0,
        percentiles: { p50, p95, p99 },
      });
    });
    
    return {
      name: this.name,
      help: this.help,
      type: 'histogram',
      values,
    };
  }

  private labelsToKey(labels?: Record<string, string>): string {
    if (!labels) return '';
    return Object.entries(labels)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${k}="${v}"`)
      .join(',');
  }

  private keyToLabels(key: string): Record<string, string> {
    if (!key) return {};
    const labels: Record<string, string> = {};
    const pairs = key.split(',');
    pairs.forEach(pair => {
      const [k, v] = pair.split('=');
      if (k && v) {
        labels[k] = v.replace(/"/g, '');
      }
    });
    return labels;
  }

  private formatLabels(labels: Record<string, string>): string {
    const pairs = Object.entries(labels)
      .map(([k, v]) => `${k}="${v}"`)
      .join(',');
    return pairs ? `{${pairs}}` : '';
  }
}

class Gauge {
  private name: string;
  private help: string;
  private actorName: string;
  private values: Map<string, number> = new Map();

  constructor(name: string, help: string, actorName: string) {
    this.name = name;
    this.help = help;
    this.actorName = actorName;
  }

  set(value: number, labels?: Record<string, string>): void {
    const key = this.labelsToKey(labels);
    this.values.set(key, value);
  }

  inc(labels?: Record<string, string>): void {
    const key = this.labelsToKey(labels);
    const current = this.values.get(key) || 0;
    this.values.set(key, current + 1);
  }

  dec(labels?: Record<string, string>): void {
    const key = this.labelsToKey(labels);
    const current = this.values.get(key) || 0;
    this.values.set(key, current - 1);
  }

  toPrometheus(): string[] {
    const lines: string[] = [];
    lines.push(`# HELP ${this.name} ${this.help}`);
    lines.push(`# TYPE ${this.name} gauge`);
    
    this.values.forEach((value, key) => {
      const labels = this.keyToLabels(key);
      const labelStr = this.formatLabels({ ...labels, actor: this.actorName });
      lines.push(`${this.name}${labelStr} ${value}`);
    });

    return lines;
  }

  toJSON(): any {
    return {
      name: this.name,
      help: this.help,
      type: 'gauge',
      values: Array.from(this.values.entries()).map(([key, value]) => ({
        labels: { ...this.keyToLabels(key), actor: this.actorName },
        value,
      })),
    };
  }

  private labelsToKey(labels?: Record<string, string>): string {
    if (!labels) return '';
    return Object.entries(labels)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${k}="${v}"`)
      .join(',');
  }

  private keyToLabels(key: string): Record<string, string> {
    if (!key) return {};
    const labels: Record<string, string> = {};
    const pairs = key.split(',');
    pairs.forEach(pair => {
      const [k, v] = pair.split('=');
      if (k && v) {
        labels[k] = v.replace(/"/g, '');
      }
    });
    return labels;
  }

  private formatLabels(labels: Record<string, string>): string {
    const pairs = Object.entries(labels)
      .map(([k, v]) => `${k}="${v}"`)
      .join(',');
    return pairs ? `{${pairs}}` : '';
  }
}