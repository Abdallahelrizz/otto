import {
  Lightning,
  Globe,
  GitBranch,
  GitMerge,
  Sliders,
  Code,
  Timer,
  Funnel,
  ArrowsClockwise,
  TreeStructure,
  EnvelopeSimple,
  Brain,
  Robot,
  MagnifyingGlass,
  Database,
  PencilSimple,
  type Icon as PhosphorIcon,
  type IconWeight,
} from '@phosphor-icons/react';
import { getNodeDef, CATEGORY_ICON_WEIGHT } from './nodes/nodeConfig';

const ICON_MAP: Record<string, PhosphorIcon> = {
  webhook_trigger: Lightning,
  manual_trigger:  Lightning,
  http_request:    Globe,
  if:              GitBranch,
  merge:           GitMerge,
  set:             Sliders,
  code:            Code,
  code_js:         Code,
  delay:           Timer,
  filter:          Funnel,
  loop:            ArrowsClockwise,
  sub_workflow:    TreeStructure,
  send_email:      EnvelopeSimple,
  llm_call:        Brain,
  ai_agent:        Robot,
  vector_search:   MagnifyingGlass,
  postgres_query:  Database,
  redis_get:       Lightning,
  redis_set:       PencilSimple,
  memory_read:     Brain,
  memory_write:    Brain,
};

export interface NodeIconProps {
  type: string;
  size?: number;
  color?: string;
}

export function NodeIcon({ type, size = 16, color }: NodeIconProps) {
  const Icon = ICON_MAP[type] ?? MagnifyingGlass;
  const category = getNodeDef(type).category;
  const weight = (CATEGORY_ICON_WEIGHT[category] ?? 'regular') as IconWeight;
  return <Icon size={size} color={color} weight={weight} />;
}
