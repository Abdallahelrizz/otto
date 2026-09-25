import type { Edge, Node } from 'reactflow';

/** The part of the editor that undo/redo tracks: the graph, not the view. */
export interface GraphDoc {
  nodes: Node[];
  edges: Edge[];
}

/**
 * The fields that make up the workflow itself. Selection, drag state, measured sizes and
 * edge styling change constantly while nothing about the workflow does, so they are left
 * out of the comparison; otherwise every click would become an undo step.
 */
export function graphFingerprint(doc: GraphDoc): string {
  return JSON.stringify({
    nodes: doc.nodes.map((n) => ({
      id: n.id,
      type: n.type,
      x: Math.round(n.position.x),
      y: Math.round(n.position.y),
      data: n.data,
    })),
    edges: doc.edges.map((e) => ({
      id: e.id,
      source: e.source,
      target: e.target,
      sourceHandle: e.sourceHandle ?? null,
      targetHandle: e.targetHandle ?? null,
    })),
  });
}

export function isDragging(doc: GraphDoc): boolean {
  return doc.nodes.some((n) => n.dragging);
}

interface Entry {
  doc: GraphDoc;
  fingerprint: string;
}

export interface HistoryOptions {
  /** Steps kept in each direction. */
  limit?: number;
  /** Changes closer together than this merge into one step (typing a word, nudging). */
  coalesceMs?: number;
  now?: () => number;
}

function strip(doc: GraphDoc): GraphDoc {
  return {
    nodes: doc.nodes.map(({ selected: _s, dragging: _d, ...rest }) => rest as Node),
    edges: doc.edges.map(({ selected: _s, ...rest }) => rest as Edge),
  };
}

/**
 * Snapshot history for the canvas. `observe` is fed every graph the store produces and
 * decides whether it is a new step; `undo`/`redo` return the graph to restore.
 */
export class GraphHistory {
  private past: Entry[] = [];
  private future: Entry[] = [];
  private current: Entry | null = null;
  private lastChangeAt = -Infinity;
  private forceBoundary = false;
  private readonly limit: number;
  private readonly coalesceMs: number;
  private readonly now: () => number;

  constructor(options: HistoryOptions = {}) {
    this.limit = options.limit ?? 100;
    this.coalesceMs = options.coalesceMs ?? 600;
    this.now = options.now ?? (() => Date.now());
  }

  /** Start over from this graph, e.g. after loading a different workflow. */
  reset(doc: GraphDoc): void {
    this.past = [];
    this.future = [];
    this.current = { doc: strip(doc), fingerprint: graphFingerprint(doc) };
    this.lastChangeAt = -Infinity;
    this.forceBoundary = false;
  }

  /** The next change starts a new step even if it follows the previous one closely. */
  checkpoint(): void {
    this.forceBoundary = true;
  }

  observe(doc: GraphDoc): void {
    // A drag is recorded once, when it ends, not at every intermediate position.
    if (isDragging(doc)) return;
    const fingerprint = graphFingerprint(doc);
    if (!this.current) {
      this.current = { doc: strip(doc), fingerprint };
      return;
    }
    if (fingerprint === this.current.fingerprint) return;

    const at = this.now();
    const coalesce = !this.forceBoundary && at - this.lastChangeAt < this.coalesceMs && this.past.length > 0;
    if (!coalesce) {
      this.past.push(this.current);
      if (this.past.length > this.limit) this.past.shift();
    }
    this.current = { doc: strip(doc), fingerprint };
    this.future = [];
    this.lastChangeAt = at;
    this.forceBoundary = false;
  }

  get canUndo(): boolean {
    return this.past.length > 0;
  }

  get canRedo(): boolean {
    return this.future.length > 0;
  }

  undo(): GraphDoc | null {
    const previous = this.past.pop();
    if (!previous || !this.current) return null;
    this.future.push(this.current);
    this.current = previous;
    this.forceBoundary = true;
    return previous.doc;
  }

  redo(): GraphDoc | null {
    const next = this.future.pop();
    if (!next || !this.current) return null;
    this.past.push(this.current);
    this.current = next;
    this.forceBoundary = true;
    return next.doc;
  }
}
