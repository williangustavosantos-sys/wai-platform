export type CommunicationTone = 'formal' | 'cordial_empathic' | 'direct';
export type DigitalEmployeeStatus = 'active' | 'inactive' | 'archived';

export interface DigitalEmployeeConfig {
  id: string;
  organizationId: string;
  name: string;
  personalitySummary: string;
  language: string;
  communicationTone: CommunicationTone;
  avatarPlaceholderUrl: string;
  enableAiHumanization: boolean;
  isDefault: boolean;
  status: DigitalEmployeeStatus;
  settingsJson: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface UpdateAssistantConfigInput {
  name?: string;
  personalitySummary?: string;
  language?: string;
  communicationTone?: CommunicationTone;
  avatarPlaceholderUrl?: string;
  status?: DigitalEmployeeStatus;
  /**
   * Arbitrary tenant settings stored in digital_employees.settings_json.
   * Top-level keys are MERGED into the existing settings_json (never replaced
   * wholesale), so different modules (e.g. mascot) can coexist safely.
   */
  settingsJson?: Record<string, unknown>;
}
