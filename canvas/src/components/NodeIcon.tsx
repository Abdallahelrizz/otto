import {
  // triggers
  Lightning,
  CursorClick,
  ClipboardText,
  ChatCircleText,
  ClockClockwise,
  // core
  Globe,
  GitBranch,
  GitMerge,
  Sliders,
  Code,
  Hourglass,
  HandPalm,
  Timer,
  XCircle,
  Funnel,
  Repeat,
  FlowArrow,
  EnvelopeSimple,
  Calendar,
  Fingerprint,
  Key,
  Table,
  FileCsv,
  BracketsAngle,
  Browser,
  BracketsCurly,
  FileZip,
  FileArrowDown,
  FileArrowUp,
  ArrowsLeftRight,
  FolderOpen,
  Info,
  // ai
  Sparkle,
  CirclesThree,
  Robot,
  BookOpen,
  NotePencil,
  MagnifyingGlass,
  // integrations
  Database,
  HardDrives,
  PencilSimple,
  CloudArrowUp,
  SlackLogo,
  DiscordLogo,
  TelegramLogo,
  GithubLogo,
  NotionLogo,
  Graph,
  CreditCard,
  PaperPlaneTilt,
  Phone,
  Kanban,
  AddressBook,
  // fallback
  WarningCircle,
  type Icon as PhosphorIcon,
  type IconWeight,
} from '@phosphor-icons/react';
import { getNodeDef, CATEGORY_ICON_WEIGHT } from './nodes/nodeConfig';

const ICON_MAP: Record<string, PhosphorIcon> = {
  // ── Triggers ──────────────────────────────────────────────
  webhook_trigger:  Lightning,
  manual_trigger:   CursorClick,
  form_trigger:     ClipboardText,
  chat_trigger:     ChatCircleText,
  schedule_trigger: ClockClockwise,

  // ── Core ──────────────────────────────────────────────────
  http_request:     Globe,
  if:               GitBranch,
  merge:            GitMerge,
  set:              Sliders,
  code:             Code,
  code_js:          Code,
  wait:             Hourglass,
  human_approval:   HandPalm,
  delay:            Timer,
  stop_error:       XCircle,
  filter:           Funnel,
  loop:             Repeat,
  sub_workflow:     FlowArrow,
  send_email:       EnvelopeSimple,
  datetime:         Calendar,
  crypto:           Fingerprint,
  jwt:              Key,
  csv_parse:        Table,
  csv_stringify:    FileCsv,
  xml_parse:        BracketsAngle,
  xml_stringify:    BracketsAngle,
  html_extract:     Browser,
  json_transform:   BracketsCurly,
  compression:      FileZip,
  read_file:        FileArrowDown,
  write_file:       FileArrowUp,
  move_binary_data: ArrowsLeftRight,
  list_files:       FolderOpen,
  binary_metadata:  Info,

  // ── AI ────────────────────────────────────────────────────
  llm_call:         Sparkle,
  parallel_ai:      CirclesThree,
  ai_agent:         Robot,
  memory_read:      BookOpen,
  memory_write:     NotePencil,
  vector_search:    MagnifyingGlass,

  // ── Integrations ──────────────────────────────────────────
  slack_send_message:    SlackLogo,
  discord_send_message:  DiscordLogo,
  telegram_send_message: TelegramLogo,
  stripe_api:            CreditCard,
  sendgrid_email:        PaperPlaneTilt,
  twilio_sms:            Phone,
  github_api:            GithubLogo,
  notion_api:            NotionLogo,
  airtable_records:      Table,
  graphql_request:       Graph,
  postgres_query:        Database,
  redis_get:             HardDrives,
  redis_set:             PencilSimple,
  s3_object:             CloudArrowUp,
  salesforce_api:        AddressBook,
  hubspot_api:           Funnel,
  linear_api:            Kanban,

  // ── Fallback ──────────────────────────────────────────────
  placeholder:      WarningCircle,
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
