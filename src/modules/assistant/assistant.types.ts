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
  settingsJson?: Record<string, unknown>;
}
