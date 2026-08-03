import { createContext } from "react";

export type PlannerSessionValue = {
  userLabel: string;
  signOut: () => Promise<void>;
};

export const PlannerSessionContext = createContext<PlannerSessionValue>({
  userLabel: "SteelBuild user",
  signOut: async () => undefined,
});
