import { DataExchangeSections } from "@/pages/dataExchange/DataExchangeSections";
import { dataExchangeStyles } from "@/pages/dataExchange/dataExchangeStyles";
import { useDataExchangeController } from "@/pages/dataExchange/useDataExchangeController";

export { readDataExchangeFile } from "@/pages/dataExchange/dataExchangeLogic";

export default function DataExchange() {
  const controller = useDataExchangeController();

  return (
    <div className="sb-dashboard-reference-page data-exchange-page">
      <style>{dataExchangeStyles}</style>
      <DataExchangeSections controller={controller} />
    </div>
  );
}
