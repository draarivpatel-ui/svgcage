export type SvgCageSeverity = 'critical' | 'high' | 'medium' | 'low';
export type SvgCageInput = string | Uint8Array | ArrayBuffer | ArrayBufferView;

export interface SvgCagePolicyOptions {
  allowDataImages?: boolean;
  allowStyleElements?: boolean;
  allowProcessingInstructions?: boolean;
  requireSvgNamespace?: boolean;
  maxBytes?: number;
  maxOutputBytes?: number;
  maxDepth?: number;
  maxElements?: number;
  maxAttributesPerElement?: number;
  maxTotalAttributes?: number;
  maxAttributeLength?: number;
  maxTextLength?: number;
  maxNameLength?: number;
  maxComments?: number;
  maxEntityReferences?: number;
  maxExpandedTextBytes?: number;
  maxProcessingInstructions?: number;
  maxUseExpansions?: number;
  maxPathCommands?: number;
  maxCoordinateValue?: number;
  maxDataImageBytes?: number;
  maxFindings?: number;
}

export interface SvgCagePolicy extends Required<Readonly<SvgCagePolicyOptions>> {}

export interface SvgCageFinding {
  code: string;
  severity: SvgCageSeverity;
  message: string;
  position?: number;
  line?: number;
  column?: number;
  element?: string;
  attribute?: string;
  property?: string;
  limit?: number;
  actual?: number;
  depth?: number;
  key?: string;
  expected?: string;
  svgName?: string;
  scheme?: string;
  fragment?: string;
}

export interface SvgCageStats {
  bytes: number;
  outputBytes: number;
  elements: number;
  maxDepthObserved: number;
  attributes: number;
  textCharacters: number;
  comments: number;
  cdataSections: number;
  processingInstructions: number;
  entityReferences: number;
  expandedTextBytes: number;
  strippedElements: number;
  strippedAttributes: number;
  useReferences: number;
  useExpansions: number;
  pathCommands: number;
  cssDeclarations: number;
}

export interface SvgCageStrippedElement {
  name: string;
  code: string;
  reason: string;
}

export interface SvgCageStrippedAttribute {
  element: string;
  name: string;
  code: string;
  reason: string;
}

export interface SvgCageSanitizeResult {
  svg: string;
  changed: boolean;
  strippedElements: readonly SvgCageStrippedElement[];
  strippedAttributes: readonly SvgCageStrippedAttribute[];
  findings: readonly SvgCageFinding[];
  stats: Readonly<SvgCageStats>;
}

export interface SvgCageAuditReport {
  safe: boolean;
  findings: readonly SvgCageFinding[];
  stats: Readonly<SvgCageStats>;
}

export class SvgCageError extends Error {
  readonly name: 'SvgCageError';
  readonly code: string;
  readonly reason: string;
  readonly severity: SvgCageSeverity;
  findings?: readonly SvgCageFinding[];
  stats?: Readonly<SvgCageStats>;
}

export const SVGCAGE_VERSION: '1.0.0';
export const SVGCAGE_ERROR_CODES: Readonly<Record<string, string>>;
export const SVGCAGE_FINDING_CODES: Readonly<Record<string, string>>;
export const CODE: Readonly<Record<string, string>>;
export const SEVERITY: Readonly<{
  CRITICAL: 'critical';
  HIGH: 'high';
  MEDIUM: 'medium';
  LOW: 'low';
}>;

export function createSvgPolicy(options?: SvgCagePolicyOptions): SvgCagePolicy;
export function sanitizeSvg(input: SvgCageInput, options?: SvgCagePolicyOptions): SvgCageSanitizeResult;
export function auditSvg(input: SvgCageInput, options?: SvgCagePolicyOptions): SvgCageAuditReport;
export function validateSvg(input: SvgCageInput, options?: SvgCagePolicyOptions): boolean;
export function isSafeSvg(input: SvgCageInput, options?: SvgCagePolicyOptions): boolean;
export function assertSafeSvg(input: SvgCageInput, options?: SvgCagePolicyOptions): SvgCageAuditReport;

declare const svgcage: Readonly<{
  SVGCAGE_VERSION: typeof SVGCAGE_VERSION;
  SVGCAGE_ERROR_CODES: typeof SVGCAGE_ERROR_CODES;
  SVGCAGE_FINDING_CODES: typeof SVGCAGE_FINDING_CODES;
  CODE: typeof CODE;
  SEVERITY: typeof SEVERITY;
  SvgCageError: typeof SvgCageError;
  createSvgPolicy: typeof createSvgPolicy;
  sanitizeSvg: typeof sanitizeSvg;
  auditSvg: typeof auditSvg;
  validateSvg: typeof validateSvg;
  isSafeSvg: typeof isSafeSvg;
  assertSafeSvg: typeof assertSafeSvg;
}>;

export default svgcage;
