// ANALYSIS PANEL (T10). Stub. Pure view-model + DOM hooks; no game state here. Input = Analysis from analyzeJunction().
import type { Analysis, Weights, Assumptions } from '../Analysis';

export type Lang = 'bn' | 'en';
export interface PanelState {
  lang: Lang;
  weights: Partial<Weights>;
  assumptions: Partial<Assumptions>;
  selected: string | null;
}
/** T10: render the ranking table + lesson for the selected solution (docs/j6/04_TASKS_BN.md). */
export function renderAnalysisPanel(_root: unknown, _analysis: Analysis, _state: PanelState): void {
  throw new Error('T10 not implemented');
}
