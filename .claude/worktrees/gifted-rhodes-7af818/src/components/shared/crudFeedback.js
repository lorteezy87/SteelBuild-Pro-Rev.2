import { toast } from "sonner";

export function getCrudErrorMessage(error, fallback = "Request failed") {
  if (!error) return fallback;
  if (typeof error === "string") return error;
  if (error?.message) return error.message;
  if (error?.response?.data?.message) return error.response.data.message;
  return fallback;
}

function normalizedKeys(queryKeys = []) {
  return queryKeys.filter((key) => Array.isArray(key) && key.length);
}

export function appendRecordToCaches(queryClient, queryKeys, record, include = () => true) {
  normalizedKeys(queryKeys).forEach((key) => {
    queryClient.setQueryData(key, (current) => {
      if (!Array.isArray(current) || !include(record, key)) return current;
      const withoutExisting = current.filter((item) => item?.id !== record?.id);
      return [record, ...withoutExisting];
    });
  });
}

export function replaceRecordInCaches(queryClient, queryKeys, record) {
  normalizedKeys(queryKeys).forEach((key) => {
    queryClient.setQueryData(key, (current) => {
      if (!Array.isArray(current)) return current;
      return current.map((item) => (item?.id === record?.id ? { ...item, ...record } : item));
    });
  });
}

export function removeRecordFromCaches(queryClient, queryKeys, recordId) {
  normalizedKeys(queryKeys).forEach((key) => {
    queryClient.setQueryData(key, (current) => {
      if (!Array.isArray(current)) return current;
      return current.filter((item) => item?.id !== recordId);
    });
  });
}

export async function invalidateCrudQueries(queryClient, queryKeys) {
  await Promise.all(
    normalizedKeys(queryKeys).map((key) =>
      queryClient.invalidateQueries({ queryKey: key })
    )
  );
}

export function toastCrudError(error, fallback) {
  toast.error(getCrudErrorMessage(error, fallback));
}
