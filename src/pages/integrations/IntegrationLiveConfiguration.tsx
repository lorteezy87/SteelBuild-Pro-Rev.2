import DocumentStorageSettings from "@/components/dms/DocumentStorageSettings";
import EmailAccountSettings from "@/components/email/EmailAccountSettings";
import { resolveIntegrationConfiguration } from "./integrationPageModel";

interface IntegrationLiveConfigurationProps {
  integrationKey: string;
  projectId: string | null | undefined;
}

export function IntegrationLiveConfiguration({
  integrationKey,
  projectId,
}: IntegrationLiveConfigurationProps) {
  const configuration = resolveIntegrationConfiguration(projectId, integrationKey);
  if (!configuration || !projectId) return null;

  return (
    <div className="integrations-detail-section" style={{ marginTop: 20 }}>
      <h3>Live Configuration</h3>
      {configuration === "email" ? (
        <EmailAccountSettings projectId={projectId} />
      ) : (
        <DocumentStorageSettings projectId={projectId} />
      )}
    </div>
  );
}
