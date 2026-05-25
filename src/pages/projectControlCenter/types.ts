export interface PCCSeverity {
  label: string;
  color: string;
  bg?: string;
  border?: string;
}

export interface PCCItem {
  id: string;
  type: string;
  severity: PCCSeverity;
  severityKey: string;
  score: number;
  title: string;
  subtitle?: string;
  overdueDays?: number;
  dueSoonDays?: number | null;
  due_date?: string | null;
  assigned_to?: string | null;
  reasons: string[];
  nextAction: string;
  tags?: string[];
  project_name?: string;
  waiting_on?: string;
  status?: string;
  daysOut?: number | null;
  waitingParty?: string;
  [key: string]: any;
}
